const { store } = require('./config');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, dbPath, hashPassword, verifyPassword, queryAll, queryOne, run } = require('./db');
const { HttpError, assert, text, getCoupon, priceTotals, calculateQuote, createOrder, validateProduct } = require('./commerce');
const { seedData } = require('./seed');

if (process.env.SEED_DEMO_DATA === 'true' || (process.env.NODE_ENV !== 'production' && process.env.SEED_DEMO_DATA !== 'false')) seedData();
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const securityHeaders = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'same-origin' };
function sendJson(res, status, data) {
  res.writeHead(status, { ...securityHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) {
      req.resume(); reject(new HttpError(415, 'Content-Type must be application/json')); return;
    }
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 64 * 1024) { reject(new HttpError(413, 'Request body too large')); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > 64 * 1024) return;
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        assert(body && typeof body === 'object' && !Array.isArray(body), 'JSON body must be an object');
        resolve(body);
      } catch (error) { reject(error instanceof HttpError ? error : new HttpError(400, 'Invalid JSON')); }
    });
    req.on('error', reject);
  });
}
function authToken(req) {
  return req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.headers['x-admin-token'];
}
function verifyAdminAuth(req) {
  const token = authToken(req);
  if (!token) return null;
  return queryOne('SELECT username FROM admin_sessions WHERE token = ? AND expires_at > ?', [token, Date.now()])?.username || null;
}
const attempts = new Map();
function rateLimit(req, group, max) {
  const now = Date.now();
  for (const [key, entry] of attempts) if (entry.reset <= now) attempts.delete(key);
  const key = group + ':' + req.socket.remoteAddress;
  const entry = attempts.get(key) || { count: 0, reset: now + 60_000 };
  entry.count += 1;
  attempts.set(key, entry);
  assert(entry.count <= max, 'Too many attempts. Please try again in a minute.', 429);
}
function productView(p, admin = false) {
  const { cost_price, features_json, specs_json, gallery_json, ...product } = p;
  return { ...product, ...(admin ? { cost_price } : {}), features: JSON.parse(features_json || '[]'), specs: JSON.parse(specs_json || '{}'), gallery: JSON.parse(gallery_json || '[]') };
}
function orderView(order) {
  const { items_json, lookup_token, checkout_key, request_hash, notes, ...receipt } = order;
  return { ...receipt, items: JSON.parse(items_json || '[]') };
}

const server = http.createServer(async (req, res) => {
  const method = req.method.toUpperCase();
  try {
    const parsed = new URL(req.url, 'http://localhost');
    const pathname = parsed.pathname;
    const query = parsed.searchParams;
    if (method === 'OPTIONS') { res.writeHead(204, securityHeaders); return res.end(); }
    if (!['GET', 'HEAD'].includes(method) && req.headers.origin) {
      let originHost;
      try { originHost = new URL(req.headers.origin).host; } catch { /* reject invalid origin */ }
      assert(originHost === req.headers.host, 'Cross-origin requests are not allowed', 403);
    }
    if (pathname === '/api/health' && method === 'GET') {
      return sendJson(res, 200, { status: 'healthy', database: queryOne('SELECT 1 AS alive').alive === 1 ? 'connected' : 'error', timestamp: new Date().toISOString(), uptime_seconds: Math.floor(process.uptime()), version: '1.1.0', environment: process.env.NODE_ENV || 'development', memory_mb: { rss: Math.round(process.memoryUsage().rss / 1024 / 1024), heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) } });
    }
    if (pathname === '/api/store-config' && method === 'GET') return sendJson(res, 200, store);
    if (pathname === '/api/categories' && method === 'GET') {
      return sendJson(res, 200, { categories: queryAll(`SELECT c.*, COUNT(p.id) AS product_count FROM categories c LEFT JOIN products p ON p.category = c.name AND p.is_active = 1 GROUP BY c.id ORDER BY c.id`) });
    }
    if (pathname === '/api/products' && method === 'GET') {
      let sql = 'SELECT * FROM products WHERE is_active = 1';
      const params = [];
      const category = query.get('category');
      if (category && category !== 'all') { sql += ' AND (category = ? OR category IN (SELECT name FROM categories WHERE slug = ?))'; params.push(category, category); }
      if (['1', 'true'].includes(query.get('featured'))) sql += ' AND is_featured = 1';
      for (const [key, operator] of [['minPrice', '>='], ['maxPrice', '<=']]) {
        if (!query.has(key)) continue;
        const raw = query.get(key);
        assert(raw.trim() !== '' && Number.isFinite(Number(raw)) && Number(raw) >= 0, 'Invalid price filter');
        sql += ` AND price ${operator} ?`; params.push(Number(raw));
      }
      const search = query.get('search')?.trim();
      if (search) { sql += ' AND (name LIKE ? OR description LIKE ? OR category LIKE ?)'; params.push(...Array(3).fill(`%${search}%`)); }
      const sort = new Map([['price_asc', 'price ASC'], ['price_desc', 'price DESC'], ['rating', 'rating DESC']]).get(query.get('sortBy')) || 'is_featured DESC, id DESC';
      sql += ` ORDER BY ${sort}`;
      if (query.has('limit')) {
        const limit = query.get('limit');
        assert(/^\d+$/.test(limit) && Number(limit) > 0 && Number(limit) <= 1000, 'Invalid product limit');
        sql += ' LIMIT ?'; params.push(Number(limit));
      }
      const products = queryAll(sql, params).map(p => productView(p));
      return sendJson(res, 200, { products, total: products.length });
    }
    const productMatch = pathname.match(/^\/api\/products\/([a-zA-Z0-9_-]+)$/);
    if (productMatch && method === 'GET') {
      const id = productMatch[1];
      const product = queryOne(`SELECT * FROM products WHERE ${/^\d+$/.test(id) ? 'id' : 'slug'} = ? AND is_active = 1`, [id]);
      assert(product, 'Product not found', 404);
      return sendJson(res, 200, { product: { ...productView(product), reviews: queryAll('SELECT * FROM reviews WHERE product_id = ? ORDER BY id DESC', [product.id]), related: queryAll('SELECT * FROM products WHERE category = ? AND id != ? AND is_active = 1 LIMIT 4', [product.category, product.id]).map(p => productView(p)) } });
    }
    if (pathname === '/api/coupons/validate' && method === 'POST') {
      const { code, subtotal } = await parseJsonBody(req);
      assert(typeof subtotal === 'number' && Number.isFinite(subtotal) && subtotal >= 0, 'Invalid subtotal');
      assert(code, 'Coupon code is required');
      const coupon = getCoupon(code, subtotal);
      return sendJson(res, 200, { valid: true, code: coupon.code, discount_type: coupon.code.toUpperCase() === 'FREESHIP' ? 'shipping' : coupon.discount_type, value: coupon.value, min_subtotal: coupon.min_subtotal, discount_amount: priceTotals(Math.round(subtotal * 100), coupon).discount });
    }
    if (pathname === '/api/checkout/quote' && method === 'POST') {
      const body = await parseJsonBody(req);
      return sendJson(res, 200, calculateQuote(body.items, body.couponCode));
    }
    if (pathname === '/api/orders' && method === 'POST') {
      rateLimit(req, 'checkout', 30);
      return sendJson(res, 201, createOrder(await parseJsonBody(req), req.headers['idempotency-key']));
    }
    if (pathname === '/api/orders/lookup' && method === 'POST') {
      rateLimit(req, 'lookup', 20);
      const body = await parseJsonBody(req);
      const order = queryOne('SELECT * FROM orders WHERE order_number = ? AND LOWER(customer_email) = ?', [text(body.order_number, 'Order reference', 64).toUpperCase(), text(body.email, 'Email address', 254).toLowerCase()]);
      assert(order, 'No order matches that reference and email address', 404);
      return sendJson(res, 200, { order: orderView(order) });
    }
    const orderMatch = pathname.match(/^\/api\/orders\/([a-zA-Z0-9_-]+)$/);
    if (orderMatch && method === 'GET') {
      rateLimit(req, 'lookup', 20);
      const order = queryOne('SELECT * FROM orders WHERE order_number = ?', [orderMatch[1]]);
      assert(order && (verifyAdminAuth(req) || (order.lookup_token && req.headers['x-order-token'] === order.lookup_token)), 'Verify your order reference and email to view this order', 404);
      return sendJson(res, 200, { order: orderView(order) });
    }
    if (pathname === '/api/payments/config' && method === 'GET') {
      return sendJson(res, 200, { mode: store.paymentMode, checkoutEnabled: store.paymentMode === 'mock', stripe: { enabled: false, publicKey: null }, paypal: { enabled: false, clientId: null }, supportedMethods: store.paymentMode === 'mock' ? ['mock'] : [] });
    }
    if (pathname === '/api/payments/create-intent' && method === 'POST') throw new HttpError(501, 'Live payment processing is not implemented. No payment has been taken.');

    if (pathname === '/api/admin/login' && method === 'POST') {
      rateLimit(req, 'login', 10);
      const body = await parseJsonBody(req);
      const username = text(body.username || 'admin', 'Username', 100);
      assert(typeof body.password === 'string' && body.password.length > 0 && body.password.length <= 1024, 'Password is required');
      const user = queryOne('SELECT * FROM admin_users WHERE username = ?', [username]);
      const valid = verifyPassword(body.password, user?.password_hash || hashPassword('invalid-account'));
      assert(user && valid, 'Invalid username or password', 401);
      if (!user.password_hash.startsWith('scrypt$')) run('UPDATE admin_users SET password_hash = ? WHERE id = ?', [hashPassword(body.password), user.id]);
      run('DELETE FROM admin_sessions WHERE expires_at <= ?', [Date.now()]);
      const token = crypto.randomBytes(32).toString('hex');
      run('INSERT INTO admin_sessions (token, username, expires_at) VALUES (?, ?, ?)', [token, username, Date.now() + 7 * 24 * 3600 * 1000]);
      return sendJson(res, 200, { success: true, token, username, role: user.role });
    }
    if (pathname.startsWith('/api/admin/')) {
      const username = verifyAdminAuth(req);
      assert(username, 'Authentication required. Please sign in.', 401);
      if (pathname === '/api/admin/verify' && method === 'GET') return sendJson(res, 200, { authenticated: true, username });
      if (pathname === '/api/admin/logout' && method === 'POST') {
        run('DELETE FROM admin_sessions WHERE token = ?', [authToken(req)]);
        return sendJson(res, 200, { success: true });
      }
      if (pathname === '/api/admin/change-password' && method === 'POST') {
        const { newPassword } = await parseJsonBody(req);
        assert(typeof newPassword === 'string' && newPassword.length >= 12 && newPassword.length <= 1024, 'New password must be between 12 and 1024 characters');
        db.exec('BEGIN IMMEDIATE');
        try {
          run('UPDATE admin_users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?', [hashPassword(newPassword), username]);
          run('DELETE FROM admin_sessions WHERE username = ? AND token != ?', [username, authToken(req)]);
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
        return sendJson(res, 200, { success: true, message: 'Password updated. Other sessions have been signed out.' });
      }
      if (pathname === '/api/admin/metrics' && method === 'GET') {
        const lowStock = queryAll('SELECT id, name, stock, price FROM products WHERE stock <= 15 AND is_active = 1 ORDER BY stock');
        return sendJson(res, 200, { metrics: { total_revenue: queryOne("SELECT SUM(total) AS n FROM orders WHERE status != 'cancelled' AND payment_status = 'paid'").n || 0, total_orders: queryOne('SELECT COUNT(*) AS n FROM orders').n, pending_orders: queryOne("SELECT COUNT(*) AS n FROM orders WHERE status IN ('pending', 'processing')").n, low_stock_count: lowStock.length }, low_stock_products: lowStock, recent_orders: queryAll('SELECT * FROM orders ORDER BY id DESC LIMIT 5').map(orderView) });
      }
      if (pathname === '/api/admin/database-info' && method === 'GET') {
        const count = (table, where = '') => queryOne(`SELECT COUNT(*) AS n FROM ${table} ${where}`).n;
        return sendJson(res, 200, { engine: 'SQLite 3', driver: 'Node.js node:sqlite DatabaseSync', journal_mode: 'WAL', database_file: dbPath, file_size_kb: Math.round(fs.statSync(dbPath).size / 1024), status: 'Online & Active', tables: { products_total: count('products'), products_on_shelf: count('products', 'WHERE is_active = 1'), products_off_shelf: count('products', 'WHERE is_active = 0'), orders: count('orders'), categories: count('categories'), coupons: count('coupons') } });
      }
      if (pathname === '/api/admin/orders' && method === 'GET') return sendJson(res, 200, { orders: queryAll('SELECT * FROM orders ORDER BY id DESC LIMIT 50').map(orderView) });
      if (pathname === '/api/admin/products' && method === 'GET') {
        const products = queryAll('SELECT * FROM products ORDER BY id DESC').map(p => productView(p, true));
        return sendJson(res, 200, { products, total: products.length });
      }
      const toggleMatch = pathname.match(/^\/api\/admin\/products\/(\d+)\/toggle-shelf$/);
      if (toggleMatch && method === 'POST') {
        const product = queryOne('SELECT * FROM products WHERE id = ?', [Number(toggleMatch[1])]);
        assert(product, 'Product not found', 404);
        const active = product.is_active ? 0 : 1;
        run('UPDATE products SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [active, product.id]);
        return sendJson(res, 200, { success: true, id: product.id, is_active: active, message: active ? 'Product is now visible in the store.' : 'Product is now hidden from the store.' });
      }
      const adminProductMatch = pathname.match(/^\/api\/admin\/products\/(\d+)$/);
      if (adminProductMatch && method === 'DELETE') {
        const result = run('DELETE FROM products WHERE id = ?', [Number(adminProductMatch[1])]);
        assert(result.changes, 'Product not found', 404);
        return sendJson(res, 200, { success: true, message: 'Product deleted from catalog.' });
      }
      if (pathname === '/api/admin/products' && method === 'POST') {
        const product = validateProduct(await parseJsonBody(req));
        const slug = (product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'product') + '-' + crypto.randomBytes(4).toString('hex');
        const result = run(`INSERT INTO products (name, slug, category, price, compare_at_price, stock, description, image_url, gallery_json, is_featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [product.name, slug, product.category, product.price, product.compare_at_price, product.stock, product.description, product.image_url, JSON.stringify([product.image_url]), product.is_featured || 0]);
        return sendJson(res, 201, { success: true, id: Number(result.lastInsertRowid), slug });
      }
      if (adminProductMatch && method === 'PUT') {
        const id = Number(adminProductMatch[1]);
        const current = queryOne('SELECT * FROM products WHERE id = ?', [id]);
        assert(current, 'Product not found', 404);
        const product = validateProduct(await parseJsonBody(req), true);
        if (product.image_url !== undefined && product.image_url !== current.image_url) product.gallery_json = JSON.stringify([product.image_url, ...JSON.parse(current.gallery_json || '[]').filter(image => image !== current.image_url && image !== product.image_url)]);
        const keys = Object.keys(product);
        run(`UPDATE products SET ${keys.map(key => key + ' = ?').join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [...Object.values(product), id]);
        return sendJson(res, 200, { product: productView(queryOne('SELECT * FROM products WHERE id = ?', [id]), true) });
      }
      const updateOrderMatch = pathname.match(/^\/api\/admin\/orders\/(\d+)$/);
      if (updateOrderMatch && method === 'PATCH') {
        const orderId = Number(updateOrderMatch[1]);
        const body = await parseJsonBody(req);
        const order = queryOne('SELECT * FROM orders WHERE id = ?', [orderId]);
        assert(order, 'Order not found', 404);
        if (body.status !== undefined) {
          assert(['pending', 'processing', 'shipped', 'delivered', 'cancelled'].includes(body.status), 'Invalid order status');
          assert(order.status !== 'cancelled' || body.status === 'cancelled', 'A cancelled order cannot be reopened');
          assert(order.status !== 'delivered' || body.status === 'delivered', 'A delivered order cannot be reopened');
          assert(order.status !== 'shipped' || ['shipped', 'delivered'].includes(body.status), 'A shipped order can only advance to delivered');
          assert(!(body.status === 'cancelled' && ['shipped', 'delivered'].includes(order.status)), 'A dispatched order cannot be cancelled here');
        }
        const updates = {};
        if (body.status !== undefined) updates.status = body.status;
        for (const field of ['tracking_number', 'carrier']) if (body[field] !== undefined) updates[field] = text(body[field], field, 200, false);
        assert(Object.keys(updates).length > 0, 'No fields to update');
        db.exec('BEGIN IMMEDIATE');
        try {
          if (updates.status === 'cancelled' && order.status !== 'cancelled') for (const item of JSON.parse(order.items_json)) run('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity, item.id]);
          const keys = Object.keys(updates);
          run(`UPDATE orders SET ${keys.map(key => key + ' = ?').join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [...Object.values(updates), orderId]);
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
        return sendJson(res, 200, { order: orderView(queryOne('SELECT * FROM orders WHERE id = ?', [orderId])) });
      }
    }
    if (pathname.startsWith('/api/')) throw new HttpError(404, 'API endpoint not found');
    assert(method === 'GET' || method === 'HEAD', 'Method not allowed', 405);
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { throw new HttpError(400, 'Invalid URL'); }
    assert(!decoded.includes('\0') && !decoded.includes('\\'), 'Invalid path');
    let file = path.resolve(PUBLIC_DIR, decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, ''));
    assert(file.startsWith(PUBLIC_DIR + path.sep), 'Access denied', 403);
    if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, { ...securityHeaders, 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ['.html', '.css', '.js'].includes(ext) ? 'no-cache' : 'public, max-age=3600' });
      if (method === 'HEAD') return res.end();
      const stream = fs.createReadStream(file);
      stream.on('error', () => res.destroy());
      return stream.pipe(res);
    }
    res.writeHead(404, { ...securityHeaders, 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>Page not found</h1><a href="/">Return to Apex Goods</a>');
  } catch (error) {
    if (error instanceof HttpError) return sendJson(res, error.status, { error: error.message });
    console.error('Request failed:', error);
    sendJson(res, 500, { error: 'An unexpected error occurred. Please try again.' });
  }
});
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  server.listen(port, process.env.HOST || '0.0.0.0', () => console.log(`Apex Goods: http://localhost:${server.address().port}`));
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Stop the existing server or set PORT to another port.` : error.message); process.exitCode = 1; db.close(); });
  const shutdown = () => {
    server.close(() => { db.close(); process.exit(0); });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
module.exports = { server };
