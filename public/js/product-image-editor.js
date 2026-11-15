const PRODUCT_IMAGE_WIDTH = 1000;
const PRODUCT_IMAGE_HEIGHT = 800;
const PRODUCT_IMAGE_UPLOAD_BYTES = 700 * 1024;

async function isSupportedPhoto(file) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, i) => bytes[i] === byte);
  const webp = String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP';
  return jpeg || png || webp;
}

function createProductImageEditor(form) {
  const container = form.querySelector('[data-product-image]');
  container.append(document.getElementById('product-image-template').content.cloneNode(true));
  const fieldset = container.querySelector('fieldset');
  const fileInput = container.querySelector('input[type=file]');
  const requirements = container.querySelector('[data-requirements]');
  requirements.id = `${form.id}-image-requirements`;
  fileInput.setAttribute('aria-describedby', requirements.id);
  const current = container.querySelector('[data-current]');
  const currentImage = current.querySelector('img');
  const crop = container.querySelector('[data-crop]');
  const preview = crop.querySelector('canvas');
  const zoom = crop.querySelector('[data-zoom]');
  const horizontal = crop.querySelector('[data-horizontal]');
  const vertical = crop.querySelector('[data-vertical]');
  const status = container.querySelector('[data-image-status]');
  const clear = container.querySelector('[data-clear]');

  let photo;
  let currentUrl;
  let pending = false;
  let selection = 0;

  function clearCrop() {
    selection += 1;
    photo?.close();
    photo = null;
    pending = false;
    crop.hidden = true;
    clear.hidden = true;
    status.textContent = '';
    delete status.dataset.error;
    current.hidden = !currentUrl;
  }

  function reset(url = currentUrl) {
    currentUrl = url;
    fileInput.value = '';
    clearCrop();
    if (url) currentImage.src = imageAssetURL(url);
    else currentImage.removeAttribute('src');
  }

  function paint(canvas) {
    const aspect = PRODUCT_IMAGE_WIDTH / PRODUCT_IMAGE_HEIGHT;
    const width = Math.min(photo.width, photo.height * aspect) / Number(zoom.value);
    const height = width / aspect;
    const x = (photo.width - width) * Number(horizontal.value) / 100;
    const y = (photo.height - height) * Number(vertical.value) / 100;
    const context = canvas.getContext('2d', { alpha: false });
    context.imageSmoothingQuality = 'high';
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(photo, x, y, width, height, 0, 0, canvas.width, canvas.height);
  }

  async function readPhoto() {
    const file = fileInput.files[0];
    clearCrop();
    if (!file) return;
    const request = selection;
    clear.hidden = false;
    pending = true;
    status.textContent = 'Reading photo…';
    let bitmap;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Choose a photo no larger than 10 MB.');
      if (!await isSupportedPhoto(file)) throw new Error('Choose a JPG, PNG or WebP photo.');
      if (request !== selection) return;
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
        throw new Error('This photo could not be opened. Try another image.');
      });
      if (request !== selection) return;
      if (bitmap.width < 400 || bitmap.height < 320) throw new Error('Choose a photo at least 400 × 320 pixels.');
      if (bitmap.width > 6000 || bitmap.height > 6000 || bitmap.width * bitmap.height > 24_000_000) {
        throw new Error('Choose a photo within 6,000 pixels per side and 24 megapixels.');
      }
      zoom.max = Math.min(3, Math.floor(Math.min(bitmap.width / 400, bitmap.height / 320) * 100) / 100);
      zoom.value = 1;
      horizontal.value = vertical.value = 50;
      photo = bitmap;
      bitmap = null;
      paint(preview);
      crop.hidden = false;
      current.hidden = true;
      status.textContent = '';
    } catch (error) {
      if (request !== selection) return;
      status.dataset.error = '';
      status.textContent = error.message;
    } finally {
      bitmap?.close();
      if (request === selection) pending = false;
    }
  }

  async function encode() {
    if (pending) throw new Error('Wait for the photo preview to load.');
    if (status.hasAttribute('data-error')) throw new Error('Choose a valid photo or clear the selection.');
    if (!photo) return null;
    const canvas = document.createElement('canvas');
    canvas.width = PRODUCT_IMAGE_WIDTH;
    canvas.height = PRODUCT_IMAGE_HEIGHT;
    paint(canvas);
    const jpeg = quality => new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    let image = await jpeg(0.88);
    if (image?.size > PRODUCT_IMAGE_UPLOAD_BYTES) image = await jpeg(0.72);
    if (!image || image.type !== 'image/jpeg' || image.size > PRODUCT_IMAGE_UPLOAD_BYTES) {
      throw new Error('This crop could not be saved. Try a different photo.');
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = () => reject(new Error('This crop could not be saved. Try again.'));
      reader.readAsDataURL(image);
    });
  }

  fileInput.addEventListener('change', readPhoto);
  clear.addEventListener('click', () => reset());
  for (const slider of [zoom, horizontal, vertical]) slider.addEventListener('input', () => paint(preview));
  return { fieldset, reset, encode };
}
