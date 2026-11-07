const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

function numberSetting(name, fallback, max = 1_000_000) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value < 0 || value > max) {
    throw new Error(`Invalid ${name} configuration`);
  }
  return value;
}

module.exports = {
  root,
  store: {
    currency: 'USD',
    taxRate: numberSetting('TAX_RATE', 0.08, 1),
    freeShippingThreshold: numberSetting('FREE_SHIPPING_THRESHOLD', 75),
    standardShippingFee: numberSetting('STANDARD_SHIPPING_FEE', 7.99),
    paymentMode: process.env.PAYMENT_MODE || 'mock'
  }
};
