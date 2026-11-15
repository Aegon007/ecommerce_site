const { createHash } = require('node:crypto');
const { queryAll, queryOne, run } = require('./db');
const { assert, text } = require('./commerce');

const mailbox = /^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;
const mailTimeout = 12_000;
// Allow a later manual retry if the process stopped during delivery.
const sendingCutoff = () => Date.now() - 60_000;

function mailConfig() {
  const { INQUIRY_TO, INQUIRY_FROM, SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  const port = Number(process.env.SMTP_PORT || 587);
  if (!mailbox.test(INQUIRY_TO || '') || !mailbox.test(INQUIRY_FROM || '') || !SMTP_HOST ||
      !Number.isInteger(port) || port < 1 || port > 65535 || Boolean(SMTP_USER) !== Boolean(SMTP_PASS)) return null;

  const secure = process.env.SMTP_SECURE === undefined ? port === 465 : process.env.SMTP_SECURE === 'true';
  return { from: INQUIRY_FROM, to: INQUIRY_TO, host: SMTP_HOST, port, secure,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined };
}

function saveInquiry(body, submissionKey) {
  const name = text(body.name, 'Name', 100);
  const email = text(body.email, 'Email address', 254);
  const company = text(body.company, 'Company', 150, false);
  const message = text(body.message, 'Message', 4000);
  const productSlug = text(body.productSlug, 'Product', 150, false);
  assert(mailbox.test(email), 'Enter a valid email address');
  assert(submissionKey === undefined || /^[a-z0-9_-]{16,128}$/i.test(submissionKey), 'Invalid submission reference');

  const requestHash = createHash('sha256').update(JSON.stringify([name, email, company, message, productSlug])).digest('hex');
  if (submissionKey) {
    const existing = queryOne('SELECT id, request_hash FROM inquiries WHERE submission_key = ?', [submissionKey]);
    if (existing) {
      assert(existing.request_hash === requestHash, 'This submission reference has already been used', 409);
      return { id: existing.id, created: false };
    }
  }

  const product = productSlug ? queryOne('SELECT slug, name FROM products WHERE slug = ? AND is_active = 1', [productSlug]) : null;
  assert(!productSlug || product, 'This product is no longer listed. You can send a general inquiry instead.', 404);
  const result = run(`INSERT INTO inquiries (submission_key, request_hash, name, email, company, message, product_slug, product_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(submission_key) DO NOTHING`,
  [submissionKey || null, requestHash, name, email, company, message, product?.slug ?? null, product?.name ?? null]);
  if (result.changes) return { id: Number(result.lastInsertRowid), created: true };

  const existing = queryOne('SELECT id, request_hash FROM inquiries WHERE submission_key = ?', [submissionKey]);
  assert(existing.request_hash === requestHash, 'This submission reference has already been used', 409);
  return { id: existing.id, created: false };
}

async function sendInquiryNotification(id) {
  const inquiry = queryOne('SELECT * FROM inquiries WHERE id = ?', [id]);
  assert(inquiry, 'Inquiry not found', 404);
  const config = mailConfig();
  if (!config) {
    run(`UPDATE inquiries SET email_status = 'not_configured' WHERE id = ?
      AND (email_status IN ('pending', 'failed', 'not_configured') OR (email_status = 'sending' AND last_email_attempt < ?))`, [id, sendingCutoff()]);
    return queryOne('SELECT email_status FROM inquiries WHERE id = ?', [id]).email_status;
  }

  const claimed = run(`UPDATE inquiries SET email_status = 'sending', last_email_attempt = ? WHERE id = ?
    AND (email_status IN ('pending', 'failed', 'not_configured') OR (email_status = 'sending' AND last_email_attempt < ?))`,
  [Date.now(), id, sendingCutoff()]);
  if (!claimed.changes) return queryOne('SELECT email_status FROM inquiries WHERE id = ?', [id]).email_status;

  let status = 'failed';
  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: config.host, port: config.port, secure: config.secure, requireTLS: !config.secure,
      auth: config.auth, connectionTimeout: mailTimeout, greetingTimeout: mailTimeout, socketTimeout: mailTimeout,
      disableFileAccess: true, disableUrlAccess: true
    });
    const delivery = await transporter.sendMail({
      from: config.from, to: config.to, replyTo: { address: inquiry.email, name: '' },
      subject: `Apex Goods inquiry #${inquiry.id}`,
      text: [
        `Name: ${inquiry.name}`, `Email: ${inquiry.email}`,
        `Company: ${inquiry.company || '—'}`, `Product: ${inquiry.product_name || 'General inquiry'}`,
        '', inquiry.message
      ].join('\n'),
      signal: AbortSignal.timeout(mailTimeout)
    });
    if (delivery.accepted.length > 0 && delivery.rejected.length === 0) status = 'sent';
  } catch (error) {
    const code = error.code;
    console.error(`Inquiry #${id} email failed`, typeof code === 'string' && /^[A-Z_]{1,40}$/.test(code) ? code : 'SMTP_ERROR');
  }
  run('UPDATE inquiries SET email_status = ? WHERE id = ?', [status, id]);
  return status;
}

function listInquiries(before) {
  assert(before == null || (/^\d+$/.test(before) && Number.isSafeInteger(Number(before)) && Number(before) > 0), 'Invalid page cursor');
  const limit = 25;
  const fields = `id, name, email, company, product_slug, product_name, message, status, email_status, created_at,
    email_status IN ('pending', 'failed', 'not_configured') OR (email_status = 'sending' AND last_email_attempt < ?) AS can_retry`;
  const rows = before == null
    ? queryAll(`SELECT ${fields} FROM inquiries ORDER BY id DESC LIMIT ?`, [sendingCutoff(), limit + 1])
    : queryAll(`SELECT ${fields} FROM inquiries WHERE id < ? ORDER BY id DESC LIMIT ?`, [sendingCutoff(), Number(before), limit + 1]);
  const inquiries = rows.slice(0, limit);
  return { inquiries, nextBefore: rows.length > limit ? inquiries.at(-1).id : null, emailConfigured: Boolean(mailConfig()) };
}

function updateInquiryStatus(id, status) {
  assert(status === 'new' || status === 'handled', 'Invalid inquiry status');
  const result = run('UPDATE inquiries SET status = ? WHERE id = ?', [status, id]);
  assert(result.changes, 'Inquiry not found', 404);
}

module.exports = { saveInquiry, sendInquiryNotification, listInquiries, updateInquiryStatus };
