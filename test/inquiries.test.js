const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const nodemailer = require('nodemailer');

test('catalog inquiries are private, survive mail failure and can be handled or retried', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-inquiries-'));
  Object.assign(process.env, {
    NODE_ENV: 'test', DB_PATH: path.join(directory, 'test.db'), SEED_DEMO_DATA: 'true',
    ADMIN_PASSWORD: 'test-inquiry-password', ENABLE_DEMO_CHECKOUT: 'false', APP_ORIGIN: '', TRUST_PROXY: 'false',
    INQUIRY_TO: '', INQUIRY_FROM: '', SMTP_HOST: '', SMTP_PORT: '587', SMTP_USER: '', SMTP_PASS: '', SMTP_SECURE: 'false'
  });
  const { server } = require('../src/server');
  const { db, queryOne, run } = require('../src/db');
  t.after(async () => {
    if (server.listening) await new Promise(resolve => server.close(resolve));
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  const root = `http://127.0.0.1:${server.address().port}`;
  const request = async (route, method = 'GET', body, headers = {}) => {
    const response = await fetch(root + route, {
      method, headers: { 'Content-Type': 'application/json', ...(method !== 'GET' ? { Origin: root } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, body: await response.json(), headers: response.headers };
  };

  assert.equal((await request('/api/store-config')).body.salesEnabled, false);
  assert.equal((await request('/api/orders', 'POST', {})).status, 404);
  for (const route of ['/cart', '/cart.html', '/order-confirmation.html']) {
    const response = await fetch(root + route, { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/contact.html');
  }

  const inquiry = { name: 'Sample Customer', email: 'client@example.com', company: 'Test Company', message: 'Could you tell us about your product?' };
  const product = queryOne('SELECT slug, name FROM products WHERE is_active = 1 LIMIT 1');
  assert.equal((await request('/api/inquiries', 'POST', { ...inquiry, website: 'spam' })).status, 400);
  assert.equal((await request('/api/inquiries', 'POST', { ...inquiry, email: 'client@example.com\r\nBcc: other@example.com' })).status, 400);
  assert.equal((await request('/api/inquiries', 'POST', { ...inquiry, productSlug: 'invalid-product' })).status, 404);
  assert.equal(queryOne('SELECT COUNT(*) AS n FROM inquiries').n, 0);

  const login = await request('/api/admin/login', 'POST', { password: process.env.ADMIN_PASSWORD });
  const admin = { Cookie: login.headers.get('set-cookie').split(';')[0] };
  const generic = await request('/api/inquiries', 'POST', inquiry);
  assert.equal(generic.status, 201);
  assert.deepEqual(generic.body, { success: true, reference: 'INQ-1' });
  assert.equal((await request('/api/admin/inquiries')).status, 401);
  assert.equal((await request('/api/admin/inquiries/1/retry-email', 'POST', {})).status, 401);
  let inbox = (await request('/api/admin/inquiries', 'GET', undefined, admin)).body;
  assert.equal(inbox.emailConfigured, false);
  assert.equal(inbox.inquiries[0].email_status, 'not_configured');
  assert.equal(inbox.inquiries[0].product_name, null);

  Object.assign(process.env, { INQUIRY_TO: 'team@example.com', INQUIRY_FROM: 'web@example.com', SMTP_HOST: 'smtp.example.com' });
  let offline = true;
  const messages = [];
  t.mock.method(nodemailer, 'createTransport', options => ({
    async sendMail(message) {
      assert.equal(options.requireTLS, true);
      messages.push(message);
      if (offline) throw Object.assign(new Error('SMTP unavailable'), { code: 'ECONNECTION' });
      return { accepted: [message.to], rejected: [] };
    }
  }));
  const submission = { ...inquiry, productSlug: product.slug };
  const key = { 'Idempotency-Key': 'test-submission-12345' };
  const submitted = await request('/api/inquiries', 'POST', submission, key);
  assert.equal(submitted.status, 201);
  assert.deepEqual((await request('/api/inquiries', 'POST', submission, key)).body, submitted.body);
  assert.equal((await request('/api/inquiries', 'POST', { ...submission, message: 'Changed text' }, key)).status, 409);
  assert.equal(messages.length, 1);
  assert.equal(queryOne('SELECT email_status FROM inquiries WHERE id = 2').email_status, 'failed');

  offline = false;
  const retries = await Promise.all([
    request('/api/admin/inquiries/2/retry-email', 'POST', {}, admin),
    request('/api/admin/inquiries/2/retry-email', 'POST', {}, admin)
  ]);
  assert(retries.some(response => response.body.emailStatus === 'sent'));
  assert.equal(messages.length, 2);
  assert.equal(messages[1].to, 'team@example.com');
  assert.equal(messages[1].from, 'web@example.com');
  assert.equal(messages[1].replyTo.address, inquiry.email);
  assert(messages[1].text.includes(product.name));
  assert(messages[1].text.includes(inquiry.message));

  assert.equal((await request('/api/admin/inquiries/2', 'PATCH', { status: 'handled' }, admin)).status, 200);
  inbox = (await request('/api/admin/inquiries', 'GET', undefined, admin)).body;
  assert.equal(inbox.inquiries[0].status, 'handled');
  assert.equal(inbox.inquiries[0].email_status, 'sent');
  assert.equal(inbox.inquiries[0].product_name, product.name);
  assert.equal(inbox.inquiries[0].request_hash, undefined);

  for (let index = 0; index < 24; index++) {
    run('INSERT INTO inquiries (request_hash, name, email, company, message) VALUES (?, ?, ?, ?, ?)', ['test', 'Demo', 'demo@example.com', '', 'Test']);
  }
  const latest = (await request('/api/admin/inquiries', 'GET', undefined, admin)).body;
  assert.equal(latest.inquiries.length, 25);
  const older = (await request(`/api/admin/inquiries?before=${latest.nextBefore}`, 'GET', undefined, admin)).body;
  assert.deepEqual(older.inquiries.map(item => item.id), [1]);
  assert.equal(older.nextBefore, null);
});
