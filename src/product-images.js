const { createHash } = require('node:crypto');
const sharp = require('sharp');
const { queryOne, run } = require('./db');
const { HttpError, assert } = require('./commerce');

const WIDTH = 1000;
const HEIGHT = 800;
// Leave room for base64 and the product fields under a 1 MB proxy body limit.
const MAX_IMAGE_BYTES = 700 * 1024;
const MAX_ENCODED_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
const PRODUCT_BODY_LIMIT = MAX_ENCODED_LENGTH + 64 * 1024;
const IMAGE_PATH = /^\/product-images\/([a-f0-9]{64})\.webp$/;
const PLACEHOLDER = '/images/product-placeholder.svg';

async function prepareProductImage(encoded) {
  assert(typeof encoded === 'string', 'Choose a valid product image');
  assert(encoded.length <= MAX_ENCODED_LENGTH, 'Cropped image must be at most 700 KB', 413);
  const jpeg = Buffer.from(encoded, 'base64');
  assert(jpeg.length <= MAX_IMAGE_BYTES, 'Cropped image must be at most 700 KB', 413);
  assert(jpeg[0] === 0xff && jpeg[1] === 0xd8 && jpeg[2] === 0xff && jpeg.toString('base64') === encoded,
    'Cropped image must be a valid JPEG');

  let content;
  try {
    const image = sharp(jpeg, { limitInputPixels: WIDTH * HEIGHT, failOn: 'warning' });
    const { format, width, height, orientation } = await image.metadata();
    assert(format === 'jpeg' && width === WIDTH && height === HEIGHT && (!orientation || orientation === 1),
      `Crop the image to ${WIDTH} × ${HEIGHT} pixels in the product editor`);
    // Decode the file and write a new image without embedded metadata.
    content = await image.webp({ quality: 84 }).toBuffer();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, `Cropped image must be a valid ${WIDTH} × ${HEIGHT} JPEG`);
  }
  const hash = createHash('sha256').update(content).digest('hex');
  return { hash, content, url: `/product-images/${hash}.webp` };
}

function saveProductImage(url, image) {
  if (image) {
    run('INSERT INTO product_images (hash, content) VALUES (?, ?) ON CONFLICT(hash) DO NOTHING', [image.hash, image.content]);
  } else if (url?.startsWith('/product-images/')) {
    const hash = url.match(IMAGE_PATH)?.[1];
    assert(hash && queryOne('SELECT 1 FROM product_images WHERE hash = ?', [hash]), 'Product image does not exist');
  }
}

function releaseProductImage(url) {
  const hash = url.match(IMAGE_PATH)?.[1];
  if (!hash) return;
  // Order receipts and galleries can still display an image after a cover is replaced.
  run(`DELETE FROM product_images WHERE hash = ?
    AND NOT EXISTS (SELECT 1 FROM products WHERE image_url = ? OR instr(gallery_json, ?) > 0)
    AND NOT EXISTS (SELECT 1 FROM orders WHERE instr(items_json, ?) > 0)`, [hash, url, url, url]);
}

module.exports = { PRODUCT_BODY_LIMIT, IMAGE_PATH, PLACEHOLDER, prepareProductImage, saveProductImage, releaseProductImage };
