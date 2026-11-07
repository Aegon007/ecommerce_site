const { test, after, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-regression-'));
process.env.DB_PATH = path.join(directory, 'test.db');
process.env.NODE_ENV = 'test';
process.env.ADMIN_PASSWORD = 'test-bootstrap-password';
process.env.PAYMENT_MODE = 'mock';
process.env.SEED_DEMO_DATA = 'true';
// Deliberately differ from the frontend's old hard-coded defaults.
process.env.TAX_RATE = '0.075';
process.env.FREE_SHIPPING_THRESHOLD = '100';
process.env.STANDARD_SHIPPING_FEE = '4.95';
const { server } = require('../src/server');
const { db, queryOne, run, initSchema, hashPassword } = require('../src/db');
let base, token, product;
before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const login = await request('/api/admin/login', 'POST', { password: process.env.ADMIN_PASSWORD });
  token = login.data.token;
  const result = await request('/api/admin/products', 'POST', { name: 'Test "quoted" product', category: 'Audio & Sound', price: 19.99, compare_at_price: 30, stock: 4, description: '<script>alert(1)</script>', image_url: '/images/product-placeholder.svg' }, true);
  assert.equal(result.status, 201);
  product = result.data;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});
async function request(endpoint, method = 'GET', body, admin = false, headers = {}) {
  const response = await fetch(base + endpoint, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(admin ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}
const order = items => ({ customer: { name: '<img src=x onerror=alert(1)>', email: 'buyer@example.com' }, shipping: { address: '1 Test Street', city: 'Testville', state: 'IL', postal_code: '60000', country: 'United States' }, items });

test('public catalog hides off-shelf products in listings, details, and related items', async () => {
  await request(`/api/admin/products/${product.id}/toggle-shelf`, 'POST', {}, true);
  assert.equal((await request(`/api/products/${product.id}`)).status, 404);
  assert(!(await request('/api/products')).data.products.some(p => p.id === product.id));
  const related = (await request('/api/products/1')).data.product.related;
  assert(!related.some(p => p.id === product.id));
  assert.equal((await request('/api/checkout/quote', 'POST', { items: [{ id: product.id, quantity: 1 }] })).status, 409);
  await request(`/api/admin/products/${product.id}/toggle-shelf`, 'POST', {}, true);
});
test('malformed and oversized JSON receive client errors', async () => {
  for (const [body, expected] of [['{bad', 400], ['null', 400], ['[]', 400], [JSON.stringify({ text: 'a'.repeat(70000) }), 413]]) {
    const response = await fetch(base + '/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal(response.status, expected);
  }
});
test('invalid quantities never change stock or create orders', async () => {
  const before = queryOne('SELECT COUNT(*) AS n FROM orders').n;
  for (const quantity of [-1, 0, 1.5, '2', null, 100]) {
    const result = await request('/api/orders', 'POST', order([{ id: product.id, quantity }]));
    assert.equal(result.status, 400, JSON.stringify(result.data));
  }
  assert.equal(queryOne('SELECT stock FROM products WHERE id = ?', [product.id]).stock, 4);
  assert.equal(queryOne('SELECT COUNT(*) AS n FROM orders').n, before);
});
test('duplicate product lines are combined before the stock check', async () => {
  const result = await request('/api/orders', 'POST', order([{ id: product.id, quantity: 3 }, { id: product.id, quantity: 3 }]));
  assert.equal(result.status, 409);
  assert.equal(queryOne('SELECT stock FROM products WHERE id = ?', [product.id]).stock, 4);
});
test('blank contact fields and malformed email cannot create an order', async () => {
  const body = order([{ id: product.id, quantity: 1 }]);
  body.customer.name = '  ';
  assert.equal((await request('/api/orders', 'POST', body)).status, 400);
  body.customer.name = 'Test'; body.customer.email = 'invalid';
  assert.equal((await request('/api/orders', 'POST', body)).status, 400);
});
test('quotes honor configuration and round every monetary amount in cents', async () => {
  const { data, status } = await request('/api/checkout/quote', 'POST', { items: [{ id: product.id, quantity: 1 }] });
  assert.equal(status, 200);
  assert.deepEqual([data.subtotal, data.shipping_fee, data.tax, data.total], [19.99, 4.95, 1.5, 26.44]);
  assert.equal((await request('/api/store-config')).data.taxRate, .075);
});
test('coupons enforce minimum, usage limit and shipping-only discounts', async () => {
  assert.equal((await request('/api/coupons/validate', 'POST', { code: 'WELCOME10', subtotal: 0 })).status, 400);
  run("UPDATE coupons SET used_count = max_uses WHERE code = 'VIP25'");
  assert.equal((await request('/api/coupons/validate', 'POST', { code: 'VIP25', subtotal: 300 })).status, 400);
  const quote = (await request('/api/checkout/quote', 'POST', { items: [{ id: product.id, quantity: 2 }], couponCode: 'FREESHIP' })).data;
  assert.equal(quote.discount, 0); assert.equal(quote.shipping_fee, 0); assert.equal(quote.tax, 3);
});
test('invalid coupon fails checkout without consuming inventory', async () => {
  const result = await request('/api/orders', 'POST', { ...order([{ id: product.id, quantity: 1 }]), couponCode: 'BAD-CODE' });
  assert.equal(result.status, 400);
  assert.equal(queryOne('SELECT stock FROM products WHERE id = ?', [product.id]).stock, 4);
});
test('a retried checkout creates one order and decrements inventory once', async () => {
  const body = order([{ id: product.id, quantity: 1 }]);
  const headers = { 'Idempotency-Key': 'test-checkout-reference-001' };
  const first = await request('/api/orders', 'POST', body, false, headers);
  const retry = await request('/api/orders', 'POST', body, false, headers);
  assert.equal(first.status, 201); assert.equal(retry.data.order_number, first.data.order_number);
  assert.equal(first.data.payment_status, 'mock');
  assert.equal(queryOne('SELECT stock FROM products WHERE id = ?', [product.id]).stock, 3);
  assert.equal(queryOne('SELECT COUNT(*) AS n FROM orders WHERE checkout_key = ?', [headers['Idempotency-Key']]).n, 1);
  const changed = structuredClone(body); changed.items[0].quantity = 2;
  assert.equal((await request('/api/orders', 'POST', changed, false, headers)).status, 409);
  assert.equal((await request(`/api/orders/${first.data.order_number}`)).status, 404);
  const receipt = await request(`/api/orders/${first.data.order_number}`, 'GET', undefined, false, { 'X-Order-Token': first.data.lookup_token });
  assert.equal(receipt.status, 200); assert.equal(receipt.data.order.total, 26.44);
  for (const field of ['lookup_token', 'checkout_key', 'request_hash', 'items_json']) assert.equal(receipt.data.order[field], undefined);
});
test('order lookup requires the matching email', async () => {
  assert.equal((await request('/api/orders/lookup', 'POST', { order_number: 'ORD-98214', email: 'wrong@example.com' })).status, 404);
  assert.equal((await request('/api/orders/lookup', 'POST', { order_number: 'ORD-98214', email: 'SOPHIA.REYNOLDS@example.com' })).status, 200);
});
test('cancelling an unshipped order restores inventory only once', async () => {
  const row = queryOne('SELECT id FROM orders WHERE checkout_key = ?', ['test-checkout-reference-001']);
  const endpoint = `/api/admin/orders/${row.id}`;
  assert.equal((await request(endpoint, 'PATCH', { status: 'cancelled' }, true)).status, 200);
  await request(endpoint, 'PATCH', { status: 'cancelled' }, true);
  assert.equal(queryOne('SELECT stock FROM products WHERE id = ?', [product.id]).stock, 4);
  assert.equal((await request(endpoint, 'PATCH', { status: 'processing' }, true)).status, 400);
  const shipped = queryOne("SELECT id FROM orders WHERE status = 'shipped' LIMIT 1");
  assert.equal((await request(`/api/admin/orders/${shipped.id}`, 'PATCH', { status: 'pending' }, true)).status, 400);
});
test('partial restock preserves price and rejects invalid product fields', async () => {
  assert.equal((await request(`/api/admin/products/${product.id}`, 'PUT', { stock: 20 }, true)).status, 200);
  assert.equal(queryOne('SELECT compare_at_price FROM products WHERE id = ?', [product.id]).compare_at_price, 30);
  for (const body of [{ stock: -1 }, { stock: 1.2 }, { price: '10' }, { price: -1 }, { image_url: 'javascript:alert(1)' }]) assert.equal((await request(`/api/admin/products/${product.id}`, 'PUT', body, true)).status, 400);
  assert.equal((await request('/api/admin/products/999999', 'PUT', { stock: 1 }, true)).status, 404);
});
test('admin metrics execute valid SQLite SQL and omit mock revenue', async () => {
  const result = await request('/api/admin/metrics', 'GET', undefined, true);
  assert.equal(result.status, 200); assert.equal(result.data.metrics.total_revenue, 0);
});
test('changing password disables old passwords, revokes other sessions and survives initialization', async () => {
  const other = (await request('/api/admin/login', 'POST', { password: process.env.ADMIN_PASSWORD })).data.token;
  assert.equal((await request('/api/admin/change-password', 'POST', { newPassword: '123' }, true)).status, 400);
  assert.equal((await request('/api/admin/change-password', 'POST', { newPassword: 'a-new-secure-test-password' }, true)).status, 200);
  initSchema();
  for (const password of ['123', process.env.ADMIN_PASSWORD]) assert.equal((await request('/api/admin/login', 'POST', { password })).status, 401);
  assert.equal((await request('/api/admin/login', 'POST', { password: 'a-new-secure-test-password' })).status, 200);
  assert.equal((await request('/api/admin/verify', 'GET', undefined, false, { Authorization: `Bearer ${other}` })).status, 401);
  assert.notEqual(hashPassword('same-password'), hashPassword('same-password'));
});
test('static routes, filters, and unsupported payment intent respond honestly', async () => {
  for (const url of ['/', '/cart.html', '/product.html', '/order-confirmation.html', '/admin.html', '/js/checkout.js']) assert.equal((await fetch(base + url)).status, 200);
  for (const url of ['/api/products?limit=oops', '/api/products?minPrice=NaN']) assert.equal((await request(url)).status, 400);
  assert.equal((await request('/api/products?sortBy=__proto__')).status, 200);
  assert.equal((await request('/api/payments/create-intent', 'POST', { amount: 10 })).status, 501);
  assert.equal((await request('/api/orders', 'POST', order([{ id: product.id, quantity: 1 }]), false, { Origin: 'https://untrusted.example' })).status, 403);
});
test('browser cart handles corrupted storage, stock limits, cents and cross-tab changes', () => {
  const values = new Map(); const listeners = {}; const events = [];
  const context = vm.createContext({ localStorage: { getItem: k => values.get(k) || null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) }, document: { addEventListener() {}, querySelectorAll: () => [] }, window: { addEventListener: (key, fn) => { listeners[key] = fn; }, dispatchEvent: e => events.push(e.type) }, CustomEvent: class { constructor(type) { this.type = type; } }, showToast() {}, API: { get: async () => ({}) } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/cart.js'), 'utf8') + '\n globalThis.cart = Cart;', context);
  const cart = context.cart;
  for (const corrupt of ['broken', '{}', '[{"id":1,"quantity":-2,"price":10}]']) { values.set(cart.storageKey, corrupt); assert.equal(cart.getCount(), 0); }
  values.clear();
  assert.equal(cart.addItem({ id: 1, name: 'Test', price: 19.99, stock: 2, slug: 'test' }, 2), true);
  assert.equal(cart.addItem({ id: 1, stock: 2 }, 1), false);
  assert.equal(cart.getSubtotal(), 39.98); assert.equal(cart.calculateTotals().tax, 3.2);
  listeners.storage({ key: cart.storageKey }); assert(events.includes('cart-updated'));
});
