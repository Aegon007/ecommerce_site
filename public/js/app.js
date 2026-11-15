let allProducts = [];
let categories = [];
let currentCategory = 'all';
let searchQuery = '';
let loaded = false;

function readFilters() {
  const params = new URLSearchParams(location.search);
  const category = params.get('cat') || 'all';
  currentCategory = categories.find(c => c.slug === category || c.name === category)?.name || 'all';
  searchQuery = params.get('q') || '';
  document.getElementById('search-input').value = searchQuery;
}
function writeFilters() {
  const url = new URL(location.href);
  for (const [key, value] of [['cat', currentCategory === 'all' ? '' : categories.find(c => c.name === currentCategory)?.slug || currentCategory], ['q', searchQuery.trim()]]) {
    if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
  }
  history.replaceState({}, '', url);
}
function renderCategories() {
  document.getElementById('category-tabs').innerHTML = [{ name: 'All products', value: 'all' }, ...categories.map(c => ({ name: c.name, value: c.name }))].map(c => `<button class="cat-tab ${currentCategory === c.value ? 'active' : ''}" aria-pressed="${currentCategory === c.value}" data-category="${escapeHTML(c.value)}">${escapeHTML(c.name)}</button>`).join('');
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
    grid.innerHTML = '<div class="catalog-empty"><h3>We couldn’t load the collection.</h3><p>Check your connection and try again.</p><button class="btn btn-primary" data-retry-catalog>Try again</button></div>';
  } finally { grid.setAttribute('aria-busy', 'false'); }
}
function renderProducts() {
  if (!loaded) return;
  let filtered = allProducts.filter(p => currentCategory === 'all' || p.category === currentCategory);
  const term = searchQuery.toLowerCase().trim();
  if (term) filtered = filtered.filter(p => `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(term));
  document.getElementById('product-count-display').textContent = `${filtered.length} ${filtered.length === 1 ? 'product' : 'products'}${term ? ` for “${searchQuery.trim()}”` : ''}`;
  document.getElementById('clear-filters').hidden = currentCategory === 'all' && !term;
  const grid = document.getElementById('product-grid');
  grid.innerHTML = filtered.length ? filtered.map(p => {
    const href = `/product.html?slug=${encodeURIComponent(p.slug)}`;
    return `<article class="product-card">
      <div class="product-card-img-wrap"><a href="${href}" tabindex="-1" aria-hidden="true"><img src="${safeImageURL(p.image_url)}" alt="" loading="lazy" width="600" height="480" /></a></div>
      <div class="product-card-body">
        <div class="product-card-category">${escapeHTML(p.category)}</div>
        <h3 class="product-card-title"><a href="${href}">${escapeHTML(p.name)}</a></h3>
        <p class="product-card-desc">${escapeHTML(p.description)}</p>
        <div class="product-card-footer"><a class="text-button" href="${href}" aria-label="View details for ${escapeHTML(p.name)}">View details <span aria-hidden="true">↗</span></a></div>
      </div>
    </article>`;
  }).join('') : '<div class="catalog-empty"><h3>No products found.</h3><p>Try another search or explore the full collection.</p><button class="btn btn-secondary" data-clear-catalog>Clear filters</button></div>';
}
function resetFilters() { currentCategory = 'all'; searchQuery = ''; document.getElementById('search-input').value = ''; writeFilters(); renderCategories(); renderProducts(); }
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('category-tabs').addEventListener('click', event => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    currentCategory = button.dataset.category; writeFilters(); renderCategories(); renderProducts();
  });
  document.getElementById('search-input').addEventListener('input', event => { searchQuery = event.target.value; writeFilters(); renderProducts(); });
  document.getElementById('clear-filters').addEventListener('click', resetFilters);
  document.getElementById('product-grid').addEventListener('click', event => {
    if (event.target.closest('[data-retry-catalog]')) loadProducts();
    if (event.target.closest('[data-clear-catalog]')) resetFilters();
  });
  loadProducts();
});
window.addEventListener('popstate', () => { readFilters(); renderCategories(); renderProducts(); });
