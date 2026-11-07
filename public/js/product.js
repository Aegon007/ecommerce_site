let currentProduct = null;
    let selectedQty = 1;

    async function loadProductDetails() {
      const params = new URLSearchParams(window.location.search);
      const slug = params.get('slug') || params.get('id');

      if (!slug) {
        window.location.href = '/';
        return;
      }

      try {
        const data = await API.get(`/api/products/${encodeURIComponent(slug)}`);
        currentProduct = data.product;
        renderProduct(currentProduct);
        renderRelated(currentProduct.related || []);
      } catch (err) {
        document.getElementById('product-detail-container').innerHTML = `
          <div style="text-align: center; padding: 4rem 0;">
            <h2 style="color: var(--text-main); margin-bottom: 1rem;">Product Not Found</h2>
            <p style="color: var(--text-muted); margin-bottom: 1.5rem;">The product you're looking for does not exist or has been taken off the shelf.</p>
            <a href="/" class="btn btn-primary">Browse Catalog</a>
          </div>
        `;
      }
    }

    function renderProduct(p) {
      document.title = `${p.name} | Apex Goods Co.`;
      document.getElementById('breadcrumb-category').textContent = p.category;
      document.getElementById('breadcrumb-title').textContent = p.name;

      const gallery = p.gallery && p.gallery.length ? p.gallery : [p.image_url];
      const stockBadge = p.stock > 10
        ? `<span class="stock-status stock-in">● In Stock (${p.stock} units ready)</span>`
        : p.stock > 0
        ? `<span class="stock-status stock-low">⚠️ Only ${p.stock} left in stock</span>`
        : `<span class="stock-status" style="background: var(--danger-light); color: var(--danger);">✕ Currently Out of Stock</span>`;

      const featuresHtml = (p.features || []).map(f => `<li>${escapeHTML(f)}</li>`).join('');

      let specsHtml = '';
      if (p.specs && Object.keys(p.specs).length > 0) {
        specsHtml = `
          <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--text-main); margin-top: 2rem;">Technical Specifications</h3>
          <table class="specs-table">
            <tbody>
              ${Object.entries(p.specs).map(([k, v]) => `<tr><th>${escapeHTML(k)}</th><td>${escapeHTML(v)}</td></tr>`).join('')}
            </tbody>
          </table>
        `;
      }

      const reviewsHtml = (p.reviews || []).map(r => `
        <div style="padding: 1rem 0; border-bottom: 1px solid var(--border-subtle);">
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem;">
            <strong style="color: var(--text-main);">${escapeHTML(r.author_name)}</strong>
            <span style="color: var(--warning);">${'★'.repeat(r.rating)}</span>
          </div>
          <p style="color: var(--text-muted); font-size: 0.9rem;">${escapeHTML(r.comment)}</p>
        </div>
      `).join('');

      const container = document.getElementById('product-detail-container');
      container.innerHTML = `
        <div class="product-detail-layout">
          <!-- Gallery -->
          <div>
            <div class="gallery-main">
              <img id="main-product-img" src="${safeImageURL(gallery[0])}" alt="${escapeHTML(p.name)}" />
            </div>
            ${gallery.length > 1 ? `
              <div class="gallery-thumbs">
                ${gallery.map((img, idx) => `
                  <button class="gallery-thumb ${idx === 0 ? 'active' : ''}" type="button" aria-label="View image ${idx + 1}" onclick="changeGalleryImage(${idx}, this)">
                    <img src="${safeImageURL(img)}" alt="" />
                  </button>
                `).join('')}
              </div>
            ` : ''}
          </div>

          <!-- Product Info & Actions -->
          <div>
            <div class="detail-header">
              <div style="font-size: 0.85rem; font-weight: 800; text-transform: uppercase; color: var(--primary); letter-spacing: 0.5px;">${escapeHTML(p.category)}</div>
              <h1 class="detail-title">${escapeHTML(p.name)}</h1>
              <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
                <div style="color: var(--warning); font-size: 0.95rem;">★ <strong>${p.rating.toFixed(1)}</strong></div>
                <span style="color: var(--text-muted); font-size: 0.85rem;">(${p.review_count} reviews)</span>
                ${stockBadge}
              </div>
            </div>

            <div class="detail-price-wrap">
              <span class="detail-price">${formatMoney(p.price)}</span>
              ${p.compare_at_price > p.price ? `
                <span style="font-size: 1.25rem; color: var(--text-subtle); text-decoration: line-through;">${formatMoney(p.compare_at_price)}</span>
                <span class="badge-discount" style="position: static;">Save ${formatMoney(p.compare_at_price - p.price)}</span>
              ` : ''}
            </div>

            <p style="color: var(--text-main); font-size: 1.05rem; line-height: 1.6; margin-bottom: 1.5rem;">
              ${escapeHTML(p.description)}
            </p>

            <ul class="features-list">
              ${featuresHtml}
            </ul>

            <!-- Quantity & Actions -->
            <div class="product-actions" style="display: flex; gap: 1rem; align-items: center; margin: 2rem 0; padding: 1.5rem; background: var(--bg-surface); border-radius: var(--radius-lg); border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);">
              <div class="qty-control" style="height: 48px;">
                <button class="qty-btn" aria-label="Decrease quantity" onclick="adjustQty(-1)">−</button>
                <span class="qty-num" id="selected-qty" style="min-width: 2.5rem;">1</span>
                <button class="qty-btn" aria-label="Increase quantity" onclick="adjustQty(1)">+</button>
              </div>

              <button class="btn btn-primary" style="flex: 1; height: 48px; font-size: 1rem;" onclick="addToCartCurrent()" ${p.stock <= 0 ? 'disabled' : ''}>
                🛒 Add to Cart
              </button>

              <button class="btn btn-accent" style="height: 48px; padding: 0 1.5rem;" onclick="buyNowCurrent()" ${p.stock <= 0 ? 'disabled' : ''}>
                ⚡ Buy Now
              </button>
            </div>

            ${specsHtml}

            <!-- Verified Reviews Section -->
            <div style="margin-top: 2.5rem; background: var(--bg-surface); border-radius: var(--radius-lg); padding: 1.75rem; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);">
              <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--text-main); margin-bottom: 1rem;">Customer Reviews</h3>
              ${reviewsHtml || '<p style="color: var(--text-muted); font-size: 0.9rem;">No reviews yet. Be the first to review this product!</p>'}
            </div>
          </div>
        </div>
      `;
    }

    function changeGalleryImage(index, element) {
      document.getElementById('main-product-img').src = (currentProduct.gallery.length ? currentProduct.gallery : [currentProduct.image_url])[index];
      document.querySelectorAll('.gallery-thumb').forEach(t => t.classList.remove('active'));
      element.classList.add('active');
    }

    function adjustQty(delta) {
      if (!currentProduct) return;
      const next = selectedQty + delta;
      if (next >= 1 && next <= currentProduct.stock) {
        selectedQty = next;
        document.getElementById('selected-qty').textContent = selectedQty;
      }
    }

    function addToCartCurrent() {
      if (!currentProduct) return;
      Cart.addItem(currentProduct, selectedQty);
    }

    function buyNowCurrent() {
      if (!currentProduct) return;
      if (Cart.addItem(currentProduct, selectedQty)) window.location.href = '/cart.html';
    }

    function renderRelated(relatedList) {
      const grid = document.getElementById('related-grid');
      if (!grid) return;

      if (!relatedList || relatedList.length === 0) {
        grid.innerHTML = '<p style="color: var(--text-muted);">No related items found.</p>';
        return;
      }

      grid.innerHTML = relatedList.map(item => `
        <div class="product-card">
          <div class="product-card-img-wrap">
            <a href="/product.html?slug=${encodeURIComponent(item.slug)}">
              <img src="${safeImageURL(item.image_url)}" alt="${escapeHTML(item.name)}" loading="lazy" />
            </a>
          </div>
          <div class="product-card-body">
            <div class="product-card-category">${escapeHTML(item.category)}</div>
            <a href="/product.html?slug=${encodeURIComponent(item.slug)}">
              <h3 class="product-card-title">${escapeHTML(item.name)}</h3>
            </a>
            <div class="product-card-footer">
              <span class="product-price">${formatMoney(item.price)}</span>
              <a href="/product.html?slug=${encodeURIComponent(item.slug)}" class="btn btn-secondary btn-sm">View Item</a>
            </div>
          </div>
        </div>
      `).join('');
    }

    document.addEventListener('DOMContentLoaded', loadProductDetails);
