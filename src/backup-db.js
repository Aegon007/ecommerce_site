const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { root } = require('./config');

function backupDatabase(outputPath) {
  if (!outputPath) throw new Error('Usage: node src/backup-db.js <new-snapshot-file>');
  const source = path.resolve(root, process.env.DB_PATH || 'data/ecommerce.db');
  const destination = path.resolve(outputPath);
  if (!fs.existsSync(source)) throw new Error('Source database does not exist');
  if (fs.existsSync(destination)) throw new Error('Choose a new snapshot file');

  const database = new DatabaseSync(source, { readOnly: true });
  try {
    database.exec('PRAGMA busy_timeout = 5000');
    database.prepare('VACUUM INTO ?').run(destination);
  } finally {
    database.close();
  }
  console.log(`Created SQLite snapshot at ${destination}`);
}

try {
  backupDatabase(process.argv[2]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
