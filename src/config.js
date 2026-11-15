const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const configuredOrigin = process.env.APP_ORIGIN?.trim();
let appOrigin = null;
if (configuredOrigin) {
  const url = new URL(configuredOrigin);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')) {
    throw new Error('APP_ORIGIN must be a site origin, using HTTPS in production');
  }
  appOrigin = url.origin;
}

function numberSetting(name, fallback, max = 1_000_000) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value < 0 || value > max) {
    throw new Error(`Invalid ${name} configuration`);
  }
  return value;
}

module.exports = {
  root,
  appOrigin,
  trustProxy: process.env.TRUST_PROXY === 'true',
  store: {
    currency: 'USD',
    taxRate: numberSetting('TAX_RATE', 0.08, 1),
    freeShippingThreshold: numberSetting('FREE_SHIPPING_THRESHOLD', 75),
    standardShippingFee: numberSetting('STANDARD_SHIPPING_FEE', 7.99),
    paymentMode: process.env.PAYMENT_MODE || 'mock',
    salesEnabled: process.env.ENABLE_DEMO_CHECKOUT === 'true'
  }
};
