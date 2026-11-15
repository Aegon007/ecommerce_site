const fs = require('node:fs');

function resetPassword() {
  if (process.stdin.isTTY) throw new Error('Supply the new password through standard input. See README.md.');
  const input = fs.readFileSync(0, 'utf8');
  const password = input.replace(/\r?\n$/, '');
  if (password.trim().length < 12 || password.length > 1024 || /[\r\n]/.test(password)) {
    throw new Error('Supply a single password with 12–1024 characters.');
  }

  const { db, setAdminPassword } = require('./db');
  try {
    setAdminPassword('admin', password);
    console.log('Admin password reset. All admin sessions have been revoked.');
  } finally {
    db.close();
  }
}

try {
  resetPassword();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
