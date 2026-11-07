let quoteVersion = 0;
let quoteTimer;
let latestQuote = null;
let checkoutBusy = false;
let previousFocus;

function renderCart() {
  const items = Cart.getItems();
  const empty = items.length === 0;
  document.getElementById('cart-content-wrapper').style.display = empty ? 'none' : 'grid';
  document.getElementById('free-shipping-banner').style.display = empty ? 'none' : 'block';
  document.getElementById('cart-empty-state').style.display = empty ? 'block' : 'none';
  if (empty) { quoteVersion++; latestQuote = null; closeCheckoutModal(); return; }
  document.getElementById('cart-items-container').innerHTML = items.map(item => `
    <div class="cart-item">
      <img src="${safeImageURL(item.image_url)}" alt="${escapeHTML(item.name)}" class="cart-item-img" />
      <div class="cart-item-info"><a href="/product.html?slug=${encodeURIComponent(item.slug)}" class="cart-item-title">${escapeHTML(item.name)}</a>
        <div class="cart-item-price">${formatMoney(item.price)} each</div>
        ${item.available === false || item.stock === 0 ? '<span class="checkout-error">Currently unavailable. Please remove this item.</span>' : item.quantity > item.stock ? `<span class="checkout-error">Only ${item.stock} available. Reduce the quantity.</span>` : ''}
      </div>
      <div class="qty-control">
        <button class="qty-btn" aria-label="Decrease quantity of ${escapeHTML(item.name)}" onclick="Cart.updateQuantity(${item.id}, ${item.quantity - 1})">−</button>
        <span class="qty-num">${item.quantity}</span>
        <button class="qty-btn" aria-label="Increase quantity of ${escapeHTML(item.name)}" ${item.quantity >= Math.min(item.stock, 99) ? 'disabled' : ''} onclick="Cart.updateQuantity(${item.id}, ${item.quantity + 1})">+</button>
      </div>
      <div class="cart-line-total">${formatMoney(item.price * item.quantity)}</div>
      <button class="remove-item" aria-label="Remove ${escapeHTML(item.name)}" onclick="Cart.removeItem(${item.id})">×</button>
    </div>`).join('');
  latestQuote = null;
  document.getElementById('btn-open-checkout').disabled = true;
  updateSummary();
  quoteVersion++;
  clearTimeout(quoteTimer);
  quoteTimer = setTimeout(refreshQuote, 150);
}
function updateSummary() {
  const totals = Cart.calculateTotals();
  const quote = latestQuote;
  const values = quote ? { ...quote, shipping: quote.shipping_fee } : totals;
  for (const key of ['subtotal', 'shipping', 'tax', 'total']) {
    document.getElementById(`summary-${key}`).textContent = key === 'shipping' && values[key] === 0 ? 'FREE' : formatMoney(values[key]);
  }
  document.getElementById('modal-checkout-total').textContent = formatMoney(values.total);
  document.getElementById('tax-rate-label').textContent = Number((Cart.config.taxRate * 100).toFixed(2));
  const coupon = quote ? quote.coupon : Cart.getCoupon();
  document.getElementById('row-discount').style.display = coupon && values.discount > 0 ? 'flex' : 'none';
  document.getElementById('discount-code-label').textContent = coupon?.code || '';
  document.getElementById('summary-discount').textContent = `-${formatMoney(values.discount)}`;
  document.getElementById('remove-coupon').hidden = !Cart.getCoupon();
  if (!Cart.getCoupon()) document.getElementById('coupon-alert').style.display = 'none';
  const free = values.shipping === 0;
  document.getElementById('free-shipping-bar').style.width = `${free ? 100 : Math.min(100, totals.subtotal / (totals.freeShippingThreshold || 1) * 100)}%`;
  document.getElementById('free-shipping-text').textContent = free ? 'Your order qualifies for free shipping.' : `Add ${formatMoney(totals.remainingForFreeShipping)} more for free shipping.`;
}
async function refreshQuote() {
  const version = quoteVersion;
  const button = document.getElementById('btn-open-checkout');
  const error = document.getElementById('checkout-error');
  button.disabled = true;
  error.textContent = 'Checking prices and availability…';
  try {
    await Cart.ready;
    const items = Cart.getItems();
    if (!items.length) return false;
    const quote = await API.post('/api/checkout/quote', { items: items.map(({ id, quantity }) => ({ id, quantity })), couponCode: Cart.getCoupon()?.code });
    if (version !== quoteVersion) return false;
    latestQuote = quote;
    updateSummary();
    if (Cart.config.paymentMode !== 'mock') throw new Error('Online payments are not connected yet. Checkout is currently unavailable.');
    error.textContent = '';
    button.disabled = false;
    return true;
  } catch (err) {
    if (version !== quoteVersion) return false;
    error.textContent = err.message || 'Unable to check your cart. Please refresh and try again.';
    return false;
  }
}
async function applyCouponCode() {
  const button = document.getElementById('apply-coupon');
  const alert = document.getElementById('coupon-alert');
  button.disabled = true;
  try {
    const code = document.getElementById('coupon-input').value.trim().toUpperCase();
    if (!code) throw new Error('Enter a promo code.');
    const coupon = await API.post('/api/coupons/validate', { code, subtotal: Cart.getSubtotal() });
    Cart.setCoupon(coupon);
    alert.textContent = `Promo ${coupon.code} applied${coupon.discount_type === 'shipping' ? ' · free shipping' : ''}.`;
    alert.style.color = 'var(--accent)';
  } catch (err) { alert.textContent = err.message; alert.style.color = 'var(--danger)'; }
  finally { alert.style.display = 'block'; button.disabled = false; }
}
async function openCheckoutModal() {
  if (!await refreshQuote()) return;
  previousFocus = document.activeElement;
  const modal = document.getElementById('checkout-modal');
  modal.classList.add('active'); modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  document.getElementById('cust-name').focus();
}
function closeCheckoutModal() {
  if (checkoutBusy) return;
  const modal = document.getElementById('checkout-modal');
  if (!modal.classList.contains('active')) return;
  modal.classList.remove('active'); modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  previousFocus?.focus();
}
async function submitOrder(event) {
  event.preventDefault();
  if (checkoutBusy) return;
  checkoutBusy = true;
  const button = document.getElementById('btn-submit-order');
  button.disabled = true; button.textContent = 'Creating order…';
  try {
    if (!await refreshQuote()) throw new Error(document.getElementById('checkout-error').textContent);
    const value = id => document.getElementById(id).value.trim();
    const payload = { customer: { name: value('cust-name'), email: value('cust-email') }, shipping: { address: value('ship-address'), city: value('ship-city'), state: value('ship-state'), postal_code: value('ship-zip'), country: value('ship-country') }, items: Cart.getItems().map(({ id, quantity }) => ({ id, quantity })), couponCode: Cart.getCoupon()?.code || null };
    const serialized = JSON.stringify(payload);
    let attempt;
    try { attempt = JSON.parse(sessionStorage.getItem('apex_checkout_attempt')); } catch { /* discard malformed state */ }
    if (!attempt || attempt.payload !== serialized) attempt = { key: crypto.randomUUID(), payload: serialized };
    sessionStorage.setItem('apex_checkout_attempt', JSON.stringify(attempt));
    const res = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': attempt.key }, body: serialized });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Unable to create order');
    sessionStorage.setItem(`apex_order_${result.order_number}`, result.lookup_token);
    sessionStorage.removeItem('apex_checkout_attempt');
    Cart.clear();
    window.location.href = `/order-confirmation.html?order=${encodeURIComponent(result.order_number)}`;
  } catch (error) { showToast(error.message || 'Could not complete your order. Try again.', 'error'); }
  finally { checkoutBusy = false; button.disabled = false; button.textContent = 'Place Demo Order'; }
}
document.addEventListener('DOMContentLoaded', async () => {
  renderCart();
  document.getElementById('coupon-input').value = Cart.getCoupon()?.code || '';
  document.getElementById('checkout-modal').addEventListener('click', event => { if (event.target.id === 'checkout-modal') closeCheckoutModal(); });
  document.addEventListener('keydown', event => {
    const modal = document.getElementById('checkout-modal');
    if (!modal.classList.contains('active')) return;
    if (event.key === 'Escape') closeCheckoutModal();
    if (event.key !== 'Tab') return;
    const focusable = [...modal.querySelectorAll('button:not(:disabled), input, select')];
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  try {
    const [data] = await Promise.all([API.get('/api/products'), Cart.ready]);
    const items = Cart.getItems().map(item => {
      const product = data.products.find(p => p.id === item.id);
      return product ? { ...item, name: product.name, slug: product.slug, image_url: product.image_url, price: product.price, stock: product.stock, available: true } : { ...item, stock: 0, available: false };
    });
    if (items.length) Cart.saveItems(items);
  } catch { document.getElementById('checkout-error').textContent = 'Unable to refresh prices. Please reload the page before checking out.'; }
});
window.addEventListener('cart-updated', renderCart);
