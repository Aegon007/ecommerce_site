const { test, after, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const sharp = require('sharp');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-regression-'));
process.env.DB_PATH = path.join(directory, 'test.db');
process.env.NODE_ENV = 'test';
process.env.APP_ORIGIN = '';
process.env.TRUST_PROXY = 'false';
process.env.ADMIN_PASSWORD = 'test-bootstrap-password';
process.env.PAYMENT_MODE = 'mock';
process.env.ENABLE_DEMO_CHECKOUT = 'true';
process.env.SEED_DEMO_DATA = 'true';
// Deliberately differ from the frontend's old hard-coded defaults.
process.env.TAX_RATE = '0.075';
process.env.FREE_SHIPPING_THRESHOLD = '100';
process.env.STANDARD_SHIPPING_FEE = '4.95';
const { server } = require('../src/server');
const { db, queryOne, run, initSchema, hashPassword } = require('../src/db');
let base, adminCookie, product;
before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const login = await request('/api/admin/login', 'POST', { password: process.env.ADMIN_PASSWORD });
  adminCookie = login.headers.get('set-cookie').split(';')[0];
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
  const response = await fetch(base + endpoint, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { Origin: base } : {}), ...(admin ? { Cookie: adminCookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json(), headers: response.headers };
}
const order = items => ({ customer: { name: '<img src=x onerror=alert(1)>', email: 'buyer@example.com' }, shipping: { address: '1 Test Street', city: 'Testville', state: 'IL', postal_code: '60000', country: 'United States' }, items });

test('uploaded product images are validated, persisted and replaced with the product', async () => {
  const jpeg = async (background, width = 1000) => (await sharp({ create: { width, height: 800, channels: 3, background } })
    .jpeg().toBuffer()).toString('base64');
  const fields = { name: 'Product with a photo', category: 'Audio & Sound', price: 30, stock: 2 };
  const image_jpeg = await jpeg('#da6028');
  assert.equal((await request('/api/admin/products', 'POST', { ...fields, image_jpeg })).status, 401);
  assert.equal((await request('/api/admin/products', 'POST', { ...fields, image_jpeg }, true, { Origin: 'https://other.example' })).status, 403);
  const created = await request('/api/admin/products', 'POST', { ...fields, image_jpeg }, true);
  assert.equal(created.status, 201);
  const route = `/api/admin/products/${created.data.id}`;
  const publicRoute = `/api/products/${created.data.slug}`;
  const oldImage = (await request(publicRoute)).data.product.image_url;
  assert.match(oldImage, /^\/product-images\/[a-f0-9]{64}\.webp$/);
  const response = await fetch(base + oldImage);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  const normalized = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
  assert.deepEqual([normalized.format, normalized.width, normalized.height], ['webp', 1000, 800]);
  const head = await fetch(base + oldImage, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal((await head.arrayBuffer()).byteLength, 0);

  for (const invalid of [Buffer.from('<svg/>').toString('base64'), await jpeg('#da6028', 999), image_jpeg.slice(0, 1000)]) {
    assert.equal((await request(route, 'PUT', { image_jpeg: invalid }, true)).status, 400);
  }
  assert.equal((await request(route, 'PUT', { image_jpeg: Buffer.alloc(700 * 1024 + 1).toString('base64') }, true)).status, 413);
  assert.equal((await request(route, 'PUT', { name: 'Edited product' }, true)).data.product.image_url, oldImage);

  const shared = await request('/api/admin/products', 'POST', { ...fields, image_url: oldImage }, true);
  assert.equal(shared.status, 201);
  const replacement = await request(route, 'PUT', { image_jpeg: await jpeg('#486538') }, true);
  assert.equal(replacement.status, 200);
  const newImage = replacement.data.product.image_url;
  assert.notEqual(newImage, oldImage);
  assert.deepEqual(replacement.data.product.gallery, [newImage]);
  assert.equal((await fetch(base + oldImage)).status, 200);
  assert.equal((await request(`/api/admin/products/${shared.data.id}`, 'DELETE', undefined, true)).status, 200);
  assert.equal((await fetch(base + oldImage)).status, 404);
  assert.equal((await fetch(base + newImage)).status, 200);
  assert.equal((await request(route, 'DELETE', undefined, true)).status, 200);
  assert.equal((await fetch(base + newImage)).status, 404);
});

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
test('changing password requires current credentials, revokes all sessions and survives initialization', async () => {
  const login = await request('/api/admin/login', 'POST', { password: process.env.ADMIN_PASSWORD });
  const setCookie = login.headers.get('set-cookie');
  const other = setCookie.split(';')[0];
  assert.match(setCookie, /HttpOnly; SameSite=Strict; Max-Age=28800/);
  assert.equal(login.data.token, undefined);
  assert(queryOne('SELECT token FROM admin_sessions LIMIT 1').token.startsWith('sha256:'));
  assert.equal((await request('/api/admin/verify', 'GET', undefined, false, { Cookie: other })).status, 200);
  const changes = { currentPassword: process.env.ADMIN_PASSWORD, newPassword: 'a-new-secure-test-password' };
  assert.equal((await request('/api/admin/change-password', 'POST', changes)).status, 401);
  assert.equal((await request('/api/admin/change-password', 'POST', { newPassword: changes.newPassword }, true)).status, 400);
  assert.equal((await request('/api/admin/change-password', 'POST', { ...changes, newPassword: '123' }, true)).status, 400);
  assert.equal((await request('/api/admin/change-password', 'POST', { ...changes, currentPassword: 'incorrect' }, true)).status, 403);
  assert.equal((await request('/api/admin/change-password', 'POST', changes, true, { Origin: base.replace('http:', 'https:') })).status, 403);
  const changed = await request('/api/admin/change-password', 'POST', changes, true);
  assert.equal(changed.status, 200);
  assert.match(changed.headers.get('set-cookie'), /Max-Age=0/);
  initSchema();
  for (const password of ['123', process.env.ADMIN_PASSWORD]) assert.equal((await request('/api/admin/login', 'POST', { password })).status, 401);
  const current = await request('/api/admin/login', 'POST', { password: changes.newPassword });
  assert.equal(current.status, 200);
  for (const Cookie of [adminCookie, other]) assert.equal((await request('/api/admin/verify', 'GET', undefined, false, { Cookie })).status, 401);
  adminCookie = current.headers.get('set-cookie').split(';')[0];
  assert.notEqual(hashPassword('same-password'), hashPassword('same-password'));
});
test('SQL metacharacters are treated as data and admin mutations require the site origin', async () => {
  const attack = "' OR 1=1 --";
  const params = new URLSearchParams({ category: attack, search: attack, sortBy: 'price; DROP TABLE products' });
  const products = await request(`/api/products?${params}`);
  assert.equal(products.status, 200);
  assert.equal(products.data.total, 0);
  assert.equal((await request('/api/products?search=%25')).data.products.some(item => !`${item.name} ${item.description} ${item.category}`.includes('%')), false);
  const login = await request('/api/admin/login', 'POST', { username: `admin${attack}`, password: 'a-new-secure-test-password' });
  assert.equal(login.status, 401);
  assert.equal(login.headers.get('set-cookie'), null);
  const changed = await request(`/api/admin/products/${product.id}`, 'PUT', {
    description: attack, 'stock = 0; --': 99
  }, true);
  assert.equal(changed.status, 200);
  assert.equal(changed.data.product.description, attack);
  assert.equal(changed.data.product.stock, 20);
  const crossOrigin = await fetch(`${base}/api/admin/products/${product.id}`, {
    method: 'DELETE', headers: { Cookie: adminCookie }
  });
  assert.equal(crossOrigin.status, 403);
  assert.equal((await request(`/api/products/${product.id}`)).status, 200);
});
test('static routes, filters, and unsupported payment intent respond honestly', async () => {
  for (const url of ['/', '/cart.html', '/product.html', '/order-confirmation.html', '/admin.html', '/js/checkout.js']) assert.equal((await fetch(base + url)).status, 200);
  for (const url of ['/api/products?limit=oops', '/api/products?minPrice=NaN']) assert.equal((await request(url)).status, 400);
  assert.equal((await request('/api/products?sortBy=__proto__')).status, 200);
  assert.equal((await request('/api/payments/create-intent', 'POST', { amount: 10 })).status, 501);
  assert.equal((await request('/api/orders', 'POST', order([{ id: product.id, quantity: 1 }]), false, { Origin: 'https://untrusted.example' })).status, 403);
  const admin = await fetch(base + '/admin.html');
  assert.match(admin.headers.get('content-security-policy'), /script-src 'self';/);
  assert.equal(admin.headers.get('x-frame-options'), 'DENY');
  assert.equal((await fetch(base + '/%2e%2e%2fpackage.json')).status, 403);
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
