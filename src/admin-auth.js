const { createHash, randomBytes } = require('node:crypto');
const { queryOne, run, hashPassword, verifyPassword, validAdminPassword, setAdminPassword } = require('./db');
const { assert } = require('./commerce');

const production = process.env.NODE_ENV === 'production';
const cookieName = production ? '__Host-apex_admin' : 'apex_admin';
const lifetime = 8 * 60 * 60;
const dummyHash = hashPassword(randomBytes(24).toString('hex'));

function sessionKey(token) {
  return `sha256:${createHash('sha256').update(token).digest('hex')}`;
}

function getAdminSession(req) {
  const prefix = `${cookieName}=`;
  const token = req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(prefix))?.slice(prefix.length);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return queryOne(`SELECT s.token, u.username FROM admin_sessions s
    JOIN admin_users u ON u.username = s.username WHERE s.token = ? AND s.expires_at > ?`,
  [sessionKey(token), Date.now()]) || null;
}

function sessionCookie(token = '', maxAge = 0) {
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${production ? '; Secure' : ''}`;
}

function signIn(username, password) {
  assert(typeof password === 'string' && password.length > 0 && password.length <= 1024, 'Password is required');
  const user = queryOne('SELECT username, password_hash, role FROM admin_users WHERE username = ?', [username]);
  const valid = verifyPassword(password, user?.password_hash || dummyHash);
  assert(user && valid && !(production && password === '123'), 'Invalid username or password', 401);
  if (!user.password_hash.startsWith('scrypt$')) {
    run('UPDATE admin_users SET password_hash = ? WHERE username = ?', [hashPassword(password), username]);
  }
  run('DELETE FROM admin_sessions WHERE expires_at <= ?', [Date.now()]);
  const token = randomBytes(32).toString('hex');
  run('INSERT INTO admin_sessions (token, username, expires_at) VALUES (?, ?, ?)', [sessionKey(token), username, Date.now() + lifetime * 1000]);
  return { username, role: user.role, cookie: sessionCookie(token, lifetime) };
}

function changeAdminPassword(username, currentPassword, newPassword) {
  assert(typeof currentPassword === 'string' && currentPassword.length > 0 && currentPassword.length <= 1024, 'Enter your current password');
  assert(validAdminPassword(newPassword), 'Use a single-line password with 12–1024 characters');
  const user = queryOne('SELECT password_hash FROM admin_users WHERE username = ?', [username]);
  assert(user && verifyPassword(currentPassword, user.password_hash), 'Current password is incorrect', 403);
  assert(currentPassword !== newPassword, 'Choose a new password that differs from the current one');
  setAdminPassword(username, newPassword);
}

module.exports = { getAdminSession, sessionCookie, signIn, changeAdminPassword };
