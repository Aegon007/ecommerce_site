const { db, queryOne, run } = require('./db');
const { store } = require('./config');
const crypto = require('node:crypto');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function assert(condition, message, status = 400) {
  if (!condition) throw new HttpError(status, message);
}
function text(value, label, max = 200, required = true) {
  assert(typeof value === 'string' || (!required && value == null), `${label} must be text`);
  const result = (value || '').trim();
  assert((!required || result.length > 0) && result.length <= max, `Enter a valid ${label.toLowerCase()}`);
  return result;
}
const cents = value => Math.round(value * 100);
const dollars = value => value / 100;

function getCoupon(code, subtotal) {
  if (!code) return null;
  const normalized = text(code, 'Promo code', 64).toUpperCase();
  const coupon = queryOne('SELECT * FROM coupons WHERE UPPER(code) = ? AND is_active = 1', [normalized]);
  assert(coupon && (coupon.max_uses == null || coupon.used_count < coupon.max_uses), 'Invalid or expired promotional code');
  assert(cents(subtotal) >= cents(coupon.min_subtotal), `This coupon requires a minimum subtotal of $${coupon.min_subtotal.toFixed(2)}`);
  return coupon;
}

function priceTotals(subtotalCents, coupon) {
  const shippingCoupon = coupon?.discount_type === 'shipping' || coupon?.code.toUpperCase() === 'FREESHIP';
  const discount = !coupon || shippingCoupon ? 0 : Math.min(subtotalCents, Math.max(0,
    coupon.discount_type === 'percent' ? Math.round(subtotalCents * coupon.value / 100) : cents(coupon.value)));
  const shipping = shippingCoupon || subtotalCents === 0 || subtotalCents >= cents(store.freeShippingThreshold)
    ? 0 : cents(store.standardShippingFee);
  const tax = Math.round((subtotalCents - discount) * store.taxRate);
  return { subtotal: dollars(subtotalCents), discount: dollars(discount), shipping_fee: dollars(shipping), tax: dollars(tax), total: dollars(subtotalCents - discount + shipping + tax) };
}

function calculateQuote(items, couponCode) {
  assert(Array.isArray(items) && items.length > 0 && items.length <= 100, 'Order must contain between 1 and 100 items');
  const quantities = new Map();
  for (const item of items) {
    assert(item && Number.isSafeInteger(item.id) && item.id > 0, 'Invalid product ID');
    assert(Number.isSafeInteger(item.quantity) && item.quantity > 0 && item.quantity <= 99, 'Quantity must be a whole number between 1 and 99');
    const quantity = (quantities.get(item.id) || 0) + item.quantity;
    assert(quantity <= 99, 'Maximum quantity is 99 per product');
    quantities.set(item.id, quantity);
  }
  let subtotal = 0;
  const orderItems = [];
  for (const [id, quantity] of quantities) {
    const product = queryOne('SELECT * FROM products WHERE id = ? AND is_active = 1', [id]);
    assert(product, `Product ${id} is no longer available`, 409);
    assert(product.stock >= quantity, `Only ${product.stock} available for "${product.name}". Update your cart.`, 409);
    const lineCents = cents(product.price) * quantity;
    subtotal += lineCents;
    orderItems.push({ id, name: product.name, slug: product.slug, price: product.price, quantity,
      stock: product.stock, image_url: product.image_url, line_total: dollars(lineCents) });
  }
  const coupon = getCoupon(couponCode, dollars(subtotal));
  return { items: orderItems, ...priceTotals(subtotal, coupon), coupon: coupon ? {
    code: coupon.code, discount_type: coupon.code.toUpperCase() === 'FREESHIP' ? 'shipping' : coupon.discount_type,
    value: coupon.value, min_subtotal: coupon.min_subtotal
  } : null };
}

function createOrder(body, idempotencyKey) {
  assert(store.paymentMode === 'mock', 'Live payments are not connected. Checkout is currently unavailable.', 503);
  assert(body && typeof body === 'object', 'Invalid order');
  const customer = body.customer || {};
  const shipping = body.shipping || {};
  const name = text(customer.name, 'Full name');
  const email = text(customer.email, 'Email address', 254).toLowerCase();
  assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Enter a valid email address');
  const address = text(shipping.address, 'Street address', 500);
  const city = text(shipping.city, 'City');
  const state = text(shipping.state, 'State / province', 100, false);
  const postalCode = text(shipping.postal_code, 'Postal code', 32);
  const country = text(shipping.country || 'United States', 'Country', 100);
  const phone = text(customer.phone, 'Phone number', 50, false);
  assert(idempotencyKey == null || (typeof idempotencyKey === 'string' && /^[a-zA-Z0-9_-]{16,128}$/.test(idempotencyKey)), 'Invalid checkout reference');
  const requestHash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const receipt = order => ({ success: true, order_number: order.order_number, total: order.total,
    status: order.status, payment_status: order.payment_status, lookup_token: order.lookup_token, mode: 'mock' });

  db.exec('BEGIN IMMEDIATE');
  try {
    if (idempotencyKey) {
      const existing = queryOne('SELECT * FROM orders WHERE checkout_key = ?', [idempotencyKey]);
      if (existing) {
        assert(existing.request_hash === requestHash, 'This checkout reference has already been used for another order', 409);
        db.exec('COMMIT');
        return receipt(existing);
      }
    }
    const quote = calculateQuote(body.items, body.couponCode);
    const orderNumber = `ORD-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    const lookupToken = crypto.randomBytes(24).toString('hex');
    run(`INSERT INTO orders (order_number, customer_name, customer_email, customer_phone, shipping_address,
      city, state, postal_code, country, items_json, subtotal, discount, shipping_fee, tax, total,
      status, payment_status, lookup_token, checkout_key, request_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'mock', ?, ?, ?)`,
    [orderNumber, name, email, phone, address, city, state, postalCode, country, JSON.stringify(quote.items),
      quote.subtotal, quote.discount, quote.shipping_fee, quote.tax, quote.total, lookupToken, idempotencyKey || null, requestHash]);
    for (const item of quote.items) {
      const result = run('UPDATE products SET stock = stock - ? WHERE id = ? AND is_active = 1 AND stock >= ?', [item.quantity, item.id, item.quantity]);
      assert(result.changes === 1, 'Inventory changed. Please review your cart.', 409);
    }
    if (quote.coupon) run('UPDATE coupons SET used_count = used_count + 1 WHERE code = ?', [quote.coupon.code]);
    const order = queryOne('SELECT * FROM orders WHERE order_number = ?', [orderNumber]);
    db.exec('COMMIT');
    return receipt(order);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function validateProduct(body, partial = false) {
  assert(body && typeof body === 'object' && !Array.isArray(body), 'Invalid product');
  const result = {};
  for (const field of ['name', 'category', 'description', 'image_url']) {
    if (body[field] !== undefined || !partial) result[field] = text(body[field] ?? (field === 'description' ? '' : undefined), field, field === 'description' ? 10000 : 2000, field !== 'description');
  }
  if (result.image_url !== undefined) {
    assert(/^https?:\/\/[^\s]+$/i.test(result.image_url) || /^\/(?!\/)[^\s]*$/.test(result.image_url), 'Image URL must be an http(s) URL or a local asset path');
  }
  for (const field of ['price', 'compare_at_price', 'stock']) {
    if (body[field] === undefined && partial) continue;
    if (field === 'compare_at_price' && (body[field] == null || body[field] === '')) { result[field] = null; continue; }
    const value = body[field] ?? (field === 'stock' ? 0 : undefined);
    assert(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1_000_000 && (field !== 'stock' || Number.isInteger(value)), `Invalid ${field}`);
    result[field] = field === 'stock' ? value : dollars(cents(value));
  }
  if (body.is_featured !== undefined) {
    assert([true, false, 0, 1].includes(body.is_featured), 'Invalid featured status');
    result.is_featured = body.is_featured ? 1 : 0;
  }
  assert(Object.keys(result).length > 0, 'No product fields to update');
  return result;
}

module.exports = { HttpError, assert, text, cents, getCoupon, priceTotals, calculateQuote, createOrder, validateProduct };
