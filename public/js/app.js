let allProducts = [];
let categories = [];
let currentCategory = 'all';
let currentSort = 'featured';
let searchQuery = '';
let loaded = false;

function readFilters() {
  const params = new URLSearchParams(location.search);
  const category = params.get('cat') || 'all';
  currentCategory = categories.find(c => c.slug === category || c.name === category)?.name || 'all';
  currentSort = ['price_asc', 'price_desc', 'rating'].includes(params.get('sort')) ? params.get('sort') : 'featured';
  searchQuery = params.get('q') || '';
  document.getElementById('search-input').value = searchQuery;
  document.getElementById('sort-select').value = currentSort;
}
function writeFilters() {
  const url = new URL(location.href);
  for (const [key, value] of [['cat', currentCategory === 'all' ? '' : categories.find(c => c.name === currentCategory)?.slug || currentCategory], ['q', searchQuery.trim()], ['sort', currentSort === 'featured' ? '' : currentSort]]) {
    if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
  }
  history.replaceState({}, '', url);
}
function renderCategories() {
  document.getElementById('category-tabs').innerHTML = [{ name: 'All essentials', value: 'all' }, ...categories.map(c => ({ name: c.name, value: c.name }))].map(c => `<button class="cat-tab ${currentCategory === c.value ? 'active' : ''}" aria-pressed="${currentCategory === c.value}" data-category="${escapeHTML(c.value)}">${escapeHTML(c.name)}</button>`).join('');
}
async function loadProducts() {
  const grid = document.getElementById('product-grid');
  grid.setAttribute('aria-busy', 'true');
  grid.innerHTML = Array(6).fill('<div class="product-skeleton" aria-hidden="true"><div></div><span></span><span></span></div>').join('');
  try {
    const [productData, categoryData] = await Promise.all([API.get('/api/products'), API.get('/api/categories')]);
    allProducts = productData.products;
    categories = categoryData.categories;
    loaded = true;
    readFilters(); renderCategories(); renderProducts();
  } catch {
    document.getElementById('product-count-display').textContent = 'Collection unavailable';
    grid.innerHTML = '<div class="catalog-empty"><h3>We couldn’t load the collection.</h3><p>Check your connection and try again.</p><button class="btn btn-primary" onclick="loadProducts()">Try again</button></div>';
  } finally { grid.setAttribute('aria-busy', 'false'); }
}
function renderProducts() {
  if (!loaded) return;
  let filtered = allProducts.filter(p => currentCategory === 'all' || p.category === currentCategory);
  const term = searchQuery.toLowerCase().trim();
  if (term) filtered = filtered.filter(p => `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(term));
  if (currentSort === 'price_asc') filtered.sort((a, b) => a.price - b.price);
  else if (currentSort === 'price_desc') filtered.sort((a, b) => b.price - a.price);
  else if (currentSort === 'rating') filtered.sort((a, b) => b.rating - a.rating);
  else filtered.sort((a, b) => b.is_featured - a.is_featured);
  document.getElementById('product-count-display').textContent = `${filtered.length} ${filtered.length === 1 ? 'essential' : 'essentials'}${term ? ` for “${searchQuery.trim()}”` : ' to make your own'}`;
  document.getElementById('clear-filters').hidden = currentCategory === 'all' && !term && currentSort === 'featured';
  const grid = document.getElementById('product-grid');
  grid.innerHTML = filtered.length ? filtered.map(p => {
    const saving = p.compare_at_price > p.price ? Math.round((1 - p.price / p.compare_at_price) * 100) : 0;
    const href = `/product.html?slug=${encodeURIComponent(p.slug)}`;
    return `<article class="product-card"><div class="product-card-img-wrap"><a href="${href}" tabindex="-1" aria-hidden="true"><img src="${safeImageURL(p.image_url)}" alt="" loading="lazy" width="600" height="480" /></a>${p.stock === 0 ? '<span class="badge-featured">Sold out</span>' : p.is_featured ? '<span class="badge-featured">Apex pick</span>' : ''}${saving ? `<span class="badge-discount">−${saving}%</span>` : ''}</div><div class="product-card-body"><div class="product-card-category">${escapeHTML(p.category)}</div><a href="${href}"><h3 class="product-card-title">${escapeHTML(p.name)}</h3></a><p class="product-card-desc">${escapeHTML(p.description)}</p><div class="product-card-rating"><span aria-label="Rating">★</span><strong>${Number(p.rating).toFixed(1)}</strong><span>(${p.review_count})</span>${p.stock > 0 && p.stock < 10 ? `<span class="low-stock-note">Only ${p.stock} left</span>` : ''}</div><div class="product-card-footer"><div class="product-price-box"><span class="product-price">${formatMoney(p.price)}</span>${saving ? `<s class="product-compare-price">${formatMoney(p.compare_at_price)}</s>` : ''}</div><button class="btn btn-primary btn-sm" ${p.stock <= 0 ? 'disabled' : ''} onclick="quickAddToCart(${p.id})" aria-label="Add ${escapeHTML(p.name)} to bag">${p.stock <= 0 ? 'Sold out' : 'Add to bag +'}</button></div></div></article>`;
  }).join('') : '<div class="catalog-empty"><span class="empty-symbol">⌕</span><h3>No essentials found.</h3><p>Try another search or explore the full collection.</p><button class="btn btn-secondary" onclick="resetFilters()">Clear filters</button></div>';
}
function quickAddToCart(id) { const p = allProducts.find(p => p.id === id); if (p) Cart.addItem(p); }
function resetFilters() { currentCategory = 'all'; currentSort = 'featured'; searchQuery = ''; document.getElementById('search-input').value = ''; document.getElementById('sort-select').value = 'featured'; writeFilters(); renderCategories(); renderProducts(); }
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('category-tabs').addEventListener('click', event => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    currentCategory = button.dataset.category; writeFilters(); renderCategories(); renderProducts();
  });
  document.getElementById('search-input').addEventListener('input', event => { searchQuery = event.target.value; writeFilters(); renderProducts(); });
  document.getElementById('sort-select').addEventListener('change', event => { currentSort = event.target.value; writeFilters(); renderProducts(); });
  document.getElementById('clear-filters').addEventListener('click', resetFilters);
  loadProducts();
});
window.addEventListener('popstate', () => { readFilters(); renderCategories(); renderProducts(); });
window.addEventListener('store-config-ready', () => {
  const text = `Free shipping on orders ${formatMoney(Cart.config.freeShippingThreshold)}+`;
  document.getElementById('shipping-announcement').textContent = text;
  document.getElementById('shipping-service').textContent = text;
});
