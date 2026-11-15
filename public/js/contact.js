const form = document.getElementById('inquiry-form');
const submitButton = document.getElementById('inquiry-submit');
const feedback = document.getElementById('inquiry-feedback');
const contextStatus = document.getElementById('inquiry-context-status');
const productCard = document.getElementById('inquiry-product');
const productParam = new URLSearchParams(location.search).get('product');
let productSlug;
let lastSubmission;

function clearInquiryProduct() {
  productSlug = undefined;
  productCard.hidden = true;
  const url = new URL(location.href);
  url.searchParams.delete('product');
  history.replaceState({}, '', url);
}

async function loadInquiryProduct() {
  if (!productParam) return;
  submitButton.disabled = true;
  contextStatus.textContent = 'Loading product…';
  try {
    const { product } = await API.get(`/api/products/${encodeURIComponent(productParam)}`);
    productSlug = product.slug;
    const productLink = document.getElementById('inquiry-product-name');
    productLink.textContent = product.name;
    productLink.href = `/product.html?slug=${encodeURIComponent(product.slug)}`;
    document.getElementById('inquiry-product-image').src = product.image_url;
    productCard.hidden = false;
    contextStatus.textContent = '';
  } catch {
    clearInquiryProduct();
    contextStatus.textContent = 'This product could not be loaded. You can still send a general inquiry.';
  } finally {
    submitButton.disabled = false;
  }
}

document.getElementById('clear-inquiry-product').addEventListener('click', () => {
  clearInquiryProduct();
  contextStatus.textContent = 'Sending a general inquiry.';
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submitButton.disabled) return;
  const fields = Object.fromEntries(new FormData(form));
  const body = JSON.stringify({ ...fields, productSlug });
  if (lastSubmission?.body !== body) {
    const key = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
    lastSubmission = { body, key };
  }

  submitButton.disabled = true;
  feedback.textContent = 'Sending your message…';
  feedback.classList.remove('contact-error');
  try {
    const response = await fetch('/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': lastSubmission.key },
      body
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Your message could not be sent. Please try again.');
    document.getElementById('inquiry-reference').textContent = `We’ve received your inquiry. Your reference is ${result.reference}.`;
    form.hidden = true;
    form.reset();
    lastSubmission = undefined;
    const success = document.getElementById('inquiry-success');
    success.hidden = false;
    success.focus();
  } catch (error) {
    feedback.textContent = error.message === 'Failed to fetch' ? 'Check your connection and try again.' : error.message;
    feedback.classList.add('contact-error');
  } finally {
    submitButton.disabled = false;
  }
});

loadInquiryProduct();
