async function loadProductDetails() {
  const params = new URLSearchParams(location.search);
  const slug = params.get('slug') || params.get('id');

  try {
    if (!slug) throw new Error('No product selected');
    const { product } = await API.get(`/api/products/${encodeURIComponent(slug)}`);
    renderProduct(product);
    renderRelated(product.related);
  } catch {
    document.getElementById('breadcrumb').hidden = true;
    document.getElementById('product-detail-container').innerHTML = `
      <div class="catalog-empty">
        <h2>Product not available</h2>
        <p>Explore the collection or contact us about the product you’re looking for.</p>
        <a href="/#catalog" class="btn btn-secondary">View products</a>
        <a href="/contact.html" class="btn btn-primary">Contact us</a>
      </div>`;
  }
}

function renderProduct(product) {
  document.title = `${product.name} | Apex Goods Co.`;
  document.getElementById('breadcrumb-category').textContent = product.category;
  document.getElementById('breadcrumb-title').textContent = product.name;

  const gallery = product.gallery?.length ? product.gallery : [product.image_url];
  const features = (product.features || []).map(feature => `<li>${escapeHTML(feature)}</li>`).join('');
  const specs = Object.entries(product.specs || {}).map(([key, value]) =>
    `<tr><th>${escapeHTML(key)}</th><td>${escapeHTML(value)}</td></tr>`
  ).join('');
  const container = document.getElementById('product-detail-container');

  container.innerHTML = `
    <div class="product-detail-layout">
      <div>
        <div class="gallery-main"><img id="main-product-img" src="${safeImageURL(gallery[0])}" alt="${escapeHTML(product.name)}" /></div>
        ${gallery.length > 1 ? `<div class="gallery-thumbs" aria-label="Product photos">
          ${gallery.map((url, index) => `<button class="gallery-thumb ${index === 0 ? 'active' : ''}" type="button"
            aria-label="View image ${index + 1}" aria-pressed="${index === 0}" data-image="${index}">
            <img src="${safeImageURL(url)}" alt="" />
          </button>`).join('')}
        </div>` : ''}
      </div>
      <div>
        <div class="detail-header">
          <div class="product-card-category">${escapeHTML(product.category)}</div>
          <h1 class="detail-title">${escapeHTML(product.name)}</h1>
        </div>
        <p class="product-intro">${escapeHTML(product.description)}</p>
        ${features ? `<ul class="features-list">${features}</ul>` : ''}
        <div class="product-inquiry">
          <div><strong>Interested in this product?</strong><p>Ask about availability, specifications, or bulk quantities.</p></div>
          <a class="btn btn-primary" href="/contact.html?product=${encodeURIComponent(product.slug)}">Inquire about this product <span aria-hidden="true">↗</span></a>
        </div>
        ${specs ? `<h2 class="product-spec-heading">Technical specifications</h2><table class="specs-table"><tbody>${specs}</tbody></table>` : ''}
      </div>
    </div>`;

  const image = document.getElementById('main-product-img');
  const thumbnails = container.querySelectorAll('.gallery-thumb');
  thumbnails.forEach(button => button.addEventListener('click', () => {
    image.src = gallery[Number(button.dataset.image)];
    thumbnails.forEach(thumb => {
      thumb.classList.toggle('active', thumb === button);
      thumb.setAttribute('aria-pressed', thumb === button);
    });
  }));
}

function renderRelated(products) {
  if (!products?.length) return;
  document.getElementById('related-products').hidden = false;
  document.getElementById('related-grid').innerHTML = products.map(product => {
    const href = `/product.html?slug=${encodeURIComponent(product.slug)}`;
    return `<article class="product-card">
      <div class="product-card-img-wrap"><a href="${href}" tabindex="-1" aria-hidden="true"><img src="${safeImageURL(product.image_url)}" alt="" loading="lazy" /></a></div>
      <div class="product-card-body">
        <div class="product-card-category">${escapeHTML(product.category)}</div>
        <h3 class="product-card-title"><a href="${href}">${escapeHTML(product.name)}</a></h3>
      </div>
    </article>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', loadProductDetails);
