/**
 * Modern E-Commerce Platform - Database Layer
 * Built with Node.js built-in DatabaseSync (node:sqlite)
 * Zero external dependencies, blazing fast, WAL mode enabled
 */

const { root } = require('./config');
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const DB_FILE = path.resolve(root, process.env.DB_PATH || 'data/ecommerce.db');

// Ensure database directory exists
const dbDir = path.dirname(DB_FILE);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new DatabaseSync(DB_FILE);

// Enable WAL mode & foreign keys for concurrency and integrity
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
`);

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  let actual;
  let expected;
  if (stored.startsWith('scrypt$')) {
    const [, salt, hash] = stored.split('$');
    expected = Buffer.from(hash || '', 'hex');
    actual = crypto.scryptSync(password, salt, 64);
  } else {
    // Existing databases retain their passwords; migrate the hash after a successful login.
    expected = Buffer.from(stored, 'hex');
    actual = crypto.createHash('sha256').update(password + ':apex_store_salt_2026').digest();
  }
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/**
 * Initialize Tables Schema
 */
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      icon TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      compare_at_price REAL,
      cost_price REAL,
      stock INTEGER NOT NULL DEFAULT 0,
      description TEXT NOT NULL,
      features_json TEXT DEFAULT '[]',
      specs_json TEXT DEFAULT '{}',
      image_url TEXT NOT NULL,
      gallery_json TEXT DEFAULT '[]',
      rating REAL DEFAULT 5.0,
      review_count INTEGER DEFAULT 0,
      is_featured INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      discount_type TEXT NOT NULL, -- 'percent' or 'fixed'
      value REAL NOT NULL,
      min_subtotal REAL DEFAULT 0,
      max_uses INTEGER DEFAULT 1000,
      used_count INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT,
      shipping_address TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      postal_code TEXT NOT NULL,
      country TEXT NOT NULL,
      items_json TEXT NOT NULL,
      subtotal REAL NOT NULL,
      discount REAL DEFAULT 0,
      shipping_fee REAL DEFAULT 0,
      tax REAL NOT NULL,
      total REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, shipped, delivered, cancelled
      payment_status TEXT NOT NULL DEFAULT 'paid', -- paid, pending, refunded
      tracking_number TEXT,
      carrier TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      author_name TEXT NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS system_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL DEFAULT 'info',
      event TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
    CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
    CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  `);

  const columns = new Set(db.prepare('PRAGMA table_info(orders)').all().map(column => column.name));
  for (const name of ['lookup_token', 'checkout_key', 'request_hash']) {
    if (!columns.has(name)) db.exec(`ALTER TABLE orders ADD COLUMN ${name} TEXT`);
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_checkout_key ON orders(checkout_key)');

  // ADMIN_PASSWORD only initializes a new database; it never resets a changed password.
  const adminUser = db.prepare('SELECT id FROM admin_users WHERE username = ?').get('admin');
  const initialPassword = process.env.ADMIN_PASSWORD || '123';
  if (!adminUser) {
    if (process.env.NODE_ENV === 'production' && (initialPassword === '123' || initialPassword.length < 12)) {
      throw new Error('Set ADMIN_PASSWORD to at least 12 characters before initializing a production database');
    }
    db.prepare('INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, ?)')
      .run('admin', hashPassword(initialPassword), 'superadmin');
    console.log('[Database] Initial admin user created.');
  }
}

initSchema();

module.exports = {
  db,
  dbPath: DB_FILE,
  initSchema,
  hashPassword,
  verifyPassword,
  queryAll(sql, params = []) {
    const stmt = db.prepare(sql);
    return stmt.all(...params);
  },
  queryOne(sql, params = []) {
    const stmt = db.prepare(sql);
    return stmt.get(...params);
  },
  run(sql, params = []) {
    const stmt = db.prepare(sql);
    return stmt.run(...params);
  }
};
