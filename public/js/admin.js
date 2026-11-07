/**
 * Apex Goods Co. - Merchant Operations & Admin Dashboard Logic
 * Easy store maintenance: Password Protection (initial: 123), Catalog, Orders, Database Info
 */

let adminMetrics = {};
let allOrders = [];
let allCatalogProducts = [];
let catalogFilter = 'all'; // 'all', 'active', 'inactive'
let isAuthenticated = false;

async function checkAuthAndInit() {
  const token = sessionStorage.getItem('apex_admin_token') || localStorage.getItem('apex_admin_token');

  if (!token) {
    showLoginView();
    return;
  }

  try {
    const res = await API.get('/api/admin/verify');
    if (res && res.authenticated) {
      isAuthenticated = true;
      showDashboardView(res.username);
      try {
        await initDashboardData();
      } catch (dashErr) {
        console.error('Dashboard data load error:', dashErr);
      }
    } else {
      showLoginView();
    }
  } catch (err) {
    sessionStorage.removeItem('apex_admin_token');
    localStorage.removeItem('apex_admin_token');
    showLoginView();
  }
}

function showLoginView() {
  isAuthenticated = false;
  const loginView = document.getElementById('admin-login-view');
  const dashView = document.getElementById('admin-dashboard-view');
  const logoutBtn = document.getElementById('nav-logout-btn');
  if (loginView) loginView.style.display = 'flex';
  if (dashView) dashView.style.display = 'none';
  if (logoutBtn) logoutBtn.style.display = 'none';
}

function showDashboardView(username = 'Admin') {
  isAuthenticated = true;
  const loginView = document.getElementById('admin-login-view');
  const dashView = document.getElementById('admin-dashboard-view');
  const logoutBtn = document.getElementById('nav-logout-btn');
  const userDisplay = document.getElementById('admin-user-display');
  if (loginView) loginView.style.display = 'none';
  if (dashView) dashView.style.display = 'block';
  if (logoutBtn) logoutBtn.style.display = 'inline-flex';
  if (userDisplay) userDisplay.textContent = username;
}

async function handleLogin(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const passwordInput = document.getElementById('admin-password-input');
  const errorMsg = document.getElementById('login-error-msg');
  const submitBtn = document.getElementById('login-submit-btn');
  if (submitBtn?.disabled) return false;

  const password = passwordInput ? passwordInput.value : '';
  if (!password) {
    if (errorMsg) {
      errorMsg.style.display = 'block';
      errorMsg.textContent = 'Please enter the admin password.';
    }
    return false;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verifying...';
  }
  if (errorMsg) errorMsg.style.display = 'none';

  try {
    const res = await API.post('/api/admin/login', { username: 'admin', password });
    if (res && res.token) {
      sessionStorage.setItem('apex_admin_token', res.token);
      localStorage.removeItem('apex_admin_token');
      showToast('Welcome back, Admin!', 'success');
      showDashboardView(res.username);
      try {
        await initDashboardData();
      } catch (dashErr) {
        console.error('Error loading dashboard data:', dashErr);
      }
    }
  } catch (err) {
    if (errorMsg) {
      errorMsg.style.display = 'block';
      errorMsg.textContent = err.message || 'Invalid username or password.';
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Unlock Store Manager →';
    }
  }
  return false;
}

async function handleLogout() {
  try {
    await API.post('/api/admin/logout', {});
  } catch (e) {}

  sessionStorage.removeItem('apex_admin_token');
  localStorage.removeItem('apex_admin_token');
  showToast('You have been logged out.', 'info');
  showLoginView();
}

async function initDashboardData() {
  await loadMetrics();
  await loadOrders();
  await loadAdminProducts();
  await loadDatabaseInfo();
  await loadHealth();
  setupAdminTabs();
}

function setupAdminTabs() {
  const tabs = document.querySelectorAll('.admin-tab-btn');
  tabs.forEach(btn => {
    btn.onclick = () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.admin-tab-content').forEach(c => c.style.display = 'none');

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      const target = document.getElementById(targetId);
      if (target) target.style.display = 'block';
    };
  });
}

// -------------------------------------------------------------
// METRICS & LOW STOCK
// -------------------------------------------------------------

async function loadMetrics() {
  try {
    const data = await API.get('/api/admin/metrics');
    adminMetrics = data.metrics || {};

    const elRev = document.getElementById('metric-revenue');
    const elOrd = document.getElementById('metric-orders');
    const elPen = document.getElementById('metric-pending');
    const elLow = document.getElementById('metric-lowstock');

    if (elRev) elRev.textContent = formatMoney(adminMetrics.total_revenue);
    if (elOrd) elOrd.textContent = adminMetrics.total_orders;
    if (elPen) elPen.textContent = adminMetrics.pending_orders;
    if (elLow) elLow.textContent = adminMetrics.low_stock_count;

    const lowStockContainer = document.getElementById('low-stock-table-body');
    if (lowStockContainer) {
      const items = data.low_stock_products || [];
      if (items.length === 0) {
        lowStockContainer.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--accent); padding: 1.25rem;">✓ All products are adequately stocked!</td></tr>`;
      } else {
        lowStockContainer.innerHTML = items.map(p => `
          <tr>
            <td style="color: var(--text-main); font-weight: 700;">${escapeHTML(p.name)}</td>
            <td>${formatMoney(p.price)}</td>
            <td><span class="stock-status stock-low">⚠️ ${p.stock} units left</span></td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="quickRestock(${p.id}, ${p.stock})">
                + Restock (+20)
              </button>
            </td>
          </tr>
        `).join('');
      }
    }
  } catch (err) {
    console.error('Failed to load admin metrics:', err);
  }
}

// -------------------------------------------------------------
// ORDERS MANAGEMENT
// -------------------------------------------------------------

async function loadOrders() {
  const tableBody = document.getElementById('orders-table-body');
  if (!tableBody) return;

  try {
    const data = await API.get('/api/admin/orders');
    allOrders = data.orders || [];

    if (allOrders.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">No orders recorded yet.</td></tr>`;
      return;
    }

    tableBody.innerHTML = allOrders.map(o => {
      const statusColors = {
        pending: 'background: var(--warning-light); color: var(--warning); border-color: rgba(217, 119, 6, 0.4);',
        processing: 'background: var(--primary-light); color: var(--primary); border-color: rgba(217, 83, 40, 0.4);',
        shipped: 'background: #eff6ff; color: #2563eb; border-color: #bfdbfe;',
        delivered: 'background: var(--accent-light); color: var(--accent); border-color: rgba(46, 133, 85, 0.4);',
        cancelled: 'background: var(--danger-light); color: var(--danger); border-color: #fecaca;'
      };

      const dateStr = new Date(o.created_at || Date.now()).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      return `
        <tr>
          <td><strong style="color: var(--text-main); font-weight: 800;">${escapeHTML(o.order_number)}</strong></td>
          <td>
            <div style="color: var(--text-main); font-weight: 600;">${escapeHTML(o.customer_name)}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">${escapeHTML(o.customer_email)}</div>
          </td>
          <td style="font-size: 0.85rem; color: var(--text-muted);">${dateStr}</td>
          <td><strong style="color: var(--text-main); font-weight: 700;">${formatMoney(o.total)}</strong></td>
          <td>
            <select class="form-control" style="padding: 0.35rem 0.65rem; font-size: 0.825rem; font-weight: 700; width: auto; ${statusColors[o.status] || ''}" onchange="changeOrderStatus(${o.id}, this.value)">
              <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>Pending</option>
              <option value="processing" ${o.status === 'processing' ? 'selected' : ''}>Processing</option>
              <option value="shipped" ${o.status === 'shipped' ? 'selected' : ''}>Shipped</option>
              <option value="delivered" ${o.status === 'delivered' ? 'selected' : ''}>Delivered</option>
              <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
            </select>
          </td>
          <td>
            ${o.tracking_number ? `<code style="color: var(--primary); font-weight: 700;">${escapeHTML(o.tracking_number)}</code>` : `<button class="btn btn-secondary btn-sm" onclick="promptAddTracking(${o.id})">+ Add Tracking</button>`}
          </td>
          <td>
            <a href="/order-confirmation.html?order=${escapeHTML(o.order_number)}" target="_blank" class="btn btn-secondary btn-sm">Receipt ↗</a>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load orders:', err);
  }
}

async function changeOrderStatus(orderId, newStatus) {
  try {
    await API.patch(`/api/admin/orders/${orderId}`, { status: newStatus });
    showToast(`Order status updated to "${newStatus}"`, 'success');
    await loadOrders();
    await loadMetrics();
  } catch (err) {
    await loadOrders();
    showToast(err.message || 'Failed to update order status', 'error');
  }
}

async function promptAddTracking(orderId) {
  const carrier = prompt('Enter Carrier (e.g. FedEx, USPS, DHL, UPS):', 'FedEx Express');
  if (!carrier) return;
  const trackingNumber = prompt('Enter Tracking Number (e.g. TRK-981240192):', `TRK-${Math.floor(100000000 + Math.random() * 900000000)}`);
  if (!trackingNumber) return;

  try {
    await API.patch(`/api/admin/orders/${orderId}`, {
      status: 'shipped',
      carrier,
      tracking_number: trackingNumber
    });
    showToast('Tracking number added and status set to Shipped!', 'success');
    loadOrders();
    loadMetrics();
  } catch (err) {
    showToast(err.message || 'Failed to update tracking', 'error');
  }
}

// -------------------------------------------------------------
// CATALOG & SHELF MANAGEMENT (ON-SHELF / OFF-SHELF)
// -------------------------------------------------------------

async function loadAdminProducts() {
  try {
    const data = await API.get('/api/admin/products');
    allCatalogProducts = data.products || [];
    renderCatalogTable();
  } catch (err) {
    console.error('Failed to load admin products:', err);
  }
}

function setCatalogFilter(filter) {
  catalogFilter = filter;
  document.querySelectorAll('.catalog-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-filter') === filter);
  });
  renderCatalogTable();
}

function renderCatalogTable() {
  const tableBody = document.getElementById('products-table-body');
  if (!tableBody) return;

  let filtered = [...allCatalogProducts];
  if (catalogFilter === 'active') {
    filtered = filtered.filter(p => p.is_active === 1);
  } else if (catalogFilter === 'inactive') {
    filtered = filtered.filter(p => p.is_active === 0);
  }

  // Count badges
  const totalCount = allCatalogProducts.length;
  const activeCount = allCatalogProducts.filter(p => p.is_active === 1).length;
  const inactiveCount = allCatalogProducts.filter(p => p.is_active === 0).length;

  const countBadgeTotal = document.getElementById('count-badge-total');
  const countBadgeActive = document.getElementById('count-badge-active');
  const countBadgeInactive = document.getElementById('count-badge-inactive');
  if (countBadgeTotal) countBadgeTotal.textContent = totalCount;
  if (countBadgeActive) countBadgeActive.textContent = activeCount;
  if (countBadgeInactive) countBadgeInactive.textContent = inactiveCount;

  if (filtered.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">No products found in this filter.</td></tr>`;
    return;
  }

  tableBody.innerHTML = filtered.map(p => {
    const isOnShelf = p.is_active === 1;

    return `
      <tr style="${!isOnShelf ? 'opacity: 0.65; background: rgba(0,0,0,0.015);' : ''}">
        <td>
          <img src="${safeImageURL(p.image_url)}" style="width: 48px; height: 48px; border-radius: var(--radius-sm); object-fit: cover; border: 1px solid var(--border-color);" alt="${escapeHTML(p.name)}" />
        </td>
        <td>
          <div style="color: var(--text-main); font-weight: 700; font-size: 0.95rem;">${escapeHTML(p.name)}</div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">${escapeHTML(p.slug)}</div>
        </td>
        <td>
          <span style="font-size: 0.8rem; background: var(--bg-secondary); color: var(--text-main); font-weight: 600; padding: 0.25rem 0.6rem; border-radius: var(--radius-full);">${escapeHTML(p.category)}</span>
        </td>
        <td>
          <strong style="color: var(--text-main);">${formatMoney(p.price)}</strong>
          ${p.compare_at_price ? `<div style="font-size: 0.75rem; text-decoration: line-through; color: var(--text-subtle);">${formatMoney(p.compare_at_price)}</div>` : ''}
        </td>
        <td>
          <input type="number" value="${p.stock}" style="width: 75px; padding: 0.3rem 0.5rem; background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-main); border-radius: var(--radius-sm); font-weight: 700;" onchange="updateProductStock(${p.id}, this.value)" />
        </td>
        <td>
          ${isOnShelf
            ? `<span class="stock-status stock-in" style="font-size: 0.75rem;">● On Shelf</span>`
            : `<span class="stock-status stock-off" style="font-size: 0.75rem;">○ Off Shelf (Hidden)</span>`
          }
        </td>
        <td>
          <div style="display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap;">
            <!-- 1-Click Toggle On/Off Shelf -->
            <button class="btn ${isOnShelf ? 'btn-secondary' : 'btn-accent'} btn-sm" onclick="toggleShelfStatus(${p.id})" title="${isOnShelf ? 'Hide from storefront' : 'Make visible in store'}">
              ${isOnShelf ? '🛑 Take Off Shelf' : '✅ Put On Shelf'}
            </button>

            <!-- Edit Details Button -->
            <button class="btn btn-secondary btn-sm" onclick="openEditProductModal(${p.id})">
              ✏️ Edit
            </button>

            <!-- Delete Button -->
            <button class="btn btn-secondary btn-sm" style="color: var(--danger);" onclick="deleteProduct(${p.id})" title="Delete Product">
              🗑
            </button>

            ${isOnShelf ? `<a href="/product.html?slug=${escapeHTML(p.slug)}" target="_blank" class="btn btn-secondary btn-sm" title="View product page">↗</a>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function toggleShelfStatus(productId) {
  try {
    const res = await API.post(`/api/admin/products/${productId}/toggle-shelf`, {});
    showToast(res.message, res.is_active === 1 ? 'success' : 'info');
    await loadAdminProducts();
    await loadDatabaseInfo();
  } catch (err) {
    showToast(err.message || 'Failed to toggle product status', 'error');
  }
}

async function updateProductStock(productId, newStock) {
  try {
    await API.put(`/api/admin/products/${productId}`, { stock: Number(newStock) });
    showToast('Inventory stock updated in database!', 'success');
    await loadMetrics();
    await loadAdminProducts();
  } catch (err) {
    await loadAdminProducts();
    showToast(err.message || 'Failed to update stock', 'error');
  }
}

async function quickRestock(productId, currentStock) {
  const newStock = currentStock + 20;
  await updateProductStock(productId, newStock);
  await loadAdminProducts();
}

async function deleteProduct(productId) {
  const productName = allCatalogProducts.find(p => p.id === productId)?.name || "this product";
  const confirmed = confirm(`Are you sure you want to permanently delete "${productName}" from the database?`);
  if (!confirmed) return;

  try {
    const result = await API.delete(`/api/admin/products/${productId}`);
    showToast(result.message || 'Product deleted from database', 'success');
    await loadAdminProducts();
    await loadMetrics();
    await loadDatabaseInfo();
  } catch (err) {
    showToast(err.message || 'Error deleting product', 'error');
  }
}

// -------------------------------------------------------------
// LIVE DATABASE INSPECTION & FACTS
// -------------------------------------------------------------

async function loadDatabaseInfo() {
  try {
    const data = await API.get('/api/admin/database-info');
    const elEngine = document.getElementById('db-engine-val');
    const elMode = document.getElementById('db-mode-val');
    const elFile = document.getElementById('db-file-val');
    const elSize = document.getElementById('db-size-val');
    const elCounts = document.getElementById('db-counts-val');

    if (elEngine) elEngine.textContent = data.engine;
    if (elMode) elMode.textContent = data.journal_mode;
    if (elFile) elFile.textContent = data.database_file;
    if (elSize) elSize.textContent = `${data.file_size_kb} KB`;
    if (elCounts) elCounts.textContent = `Products: ${data.tables.products_total} (${data.tables.products_on_shelf} on-shelf) • Orders: ${data.tables.orders} • Categories: ${data.tables.categories} • Coupons: ${data.tables.coupons}`;
  } catch (err) {
    console.error('Failed to load database stats:', err);
  }
}

// -------------------------------------------------------------
// CHANGE PASSWORD
// -------------------------------------------------------------

function openChangePasswordModal() {
  const modal = document.getElementById('change-password-modal');
  if (modal) modal.classList.add('active');
}

function closeChangePasswordModal() {
  const modal = document.getElementById('change-password-modal');
  if (modal) modal.classList.remove('active');
}

async function handleChangePassword(e) {
  if (e) e.preventDefault();
  const passEl = document.getElementById('new-admin-password');
  const newPass = passEl ? passEl.value : '';
  try {
    const res = await API.post('/api/admin/change-password', { newPassword: newPass });
    showToast(res.message || 'Admin password updated!', 'success');
    closeChangePasswordModal();
    if (e && e.target) e.target.reset();
  } catch (err) {
    showToast(err.message || 'Failed to update password', 'error');
  }
}

// -------------------------------------------------------------
// PRODUCT MODALS
// -------------------------------------------------------------

function openEditProductModal(productId) {
  const product = allCatalogProducts.find(p => p.id === productId);
  if (!product) return;

  const form = document.getElementById('edit-product-form');
  if (!form) return;
  form.elements.namedItem('productId').value = product.id;
  form.elements.namedItem('name').value = product.name;
  form.elements.namedItem('category').value = product.category;
  form.elements.namedItem('price').value = product.price;
  form.elements.namedItem('compare_at_price').value = product.compare_at_price || '';
  form.elements.namedItem('stock').value = product.stock;
  form.elements.namedItem('image_url').value = product.image_url;
  form.elements.namedItem('description').value = product.description;
  form.elements.namedItem('is_featured').checked = Boolean(product.is_featured);

  const modal = document.getElementById('edit-product-modal');
  if (modal) modal.classList.add('active');
}

function closeEditProductModal() {
  const modal = document.getElementById('edit-product-modal');
  if (modal) modal.classList.remove('active');
}

async function handleEditProduct(e) {
  if (e) e.preventDefault();
  const form = e.target;
  const prodId = form.elements.namedItem('productId').value;

  const payload = {
    name: form.elements.namedItem('name').value,
    category: form.elements.namedItem('category').value,
    price: parseFloat(form.elements.namedItem('price').value),
    compare_at_price: form.elements.namedItem('compare_at_price').value ? parseFloat(form.elements.namedItem('compare_at_price').value) : null,
    stock: parseInt(form.elements.namedItem('stock').value, 10),
    description: form.elements.namedItem('description').value,
    image_url: form.elements.namedItem('image_url').value,
    is_featured: form.elements.namedItem('is_featured').checked
  };

  try {
    await API.put(`/api/admin/products/${prodId}`, payload);
    showToast(`Product "${payload.name}" updated successfully!`, 'success');
    closeEditProductModal();
    await loadAdminProducts();
    await loadMetrics();
  } catch (err) {
    showToast(err.message || 'Failed to update product', 'error');
  }
}

function openAddProductModal() {
  const modal = document.getElementById('add-product-modal');
  if (modal) modal.classList.add('active');
}

function closeAddProductModal() {
  const modal = document.getElementById('add-product-modal');
  if (modal) modal.classList.remove('active');
}

async function handleAddProduct(e) {
  if (e) e.preventDefault();
  const form = e.target;
  const payload = {
    name: form.elements.namedItem('name').value,
    category: form.elements.namedItem('category').value,
    price: parseFloat(form.elements.namedItem('price').value),
    compare_at_price: form.elements.namedItem('compare_at_price').value ? parseFloat(form.elements.namedItem('compare_at_price').value) : null,
    stock: parseInt(form.elements.namedItem('stock').value, 10),
    description: form.elements.namedItem('description').value,
    image_url: form.elements.namedItem('image_url').value,
    is_featured: form.elements.namedItem('is_featured').checked
  };

  try {
    await API.post('/api/admin/products', payload);
    showToast(`Product "${payload.name}" added to database!`, 'success');
    closeAddProductModal();
    form.reset();
    await loadAdminProducts();
    await loadMetrics();
    await loadDatabaseInfo();
  } catch (err) {
    showToast(err.message || 'Failed to add product', 'error');
  }
}

async function loadHealth() {
  try {
    const data = await API.get('/api/health');
    const elBadge = document.getElementById('health-status-badge');
    const elUptime = document.getElementById('health-uptime');
    const elDb = document.getElementById('health-db');
    const elEnv = document.getElementById('health-env');
    const elMem = document.getElementById('health-mem');

    if (elBadge) elBadge.textContent = data.status.toUpperCase();
    if (elUptime) elUptime.textContent = `${data.uptime_seconds}s`;
    if (elDb) elDb.textContent = data.database;
    if (elEnv) elEnv.textContent = data.environment;
    if (elMem) elMem.textContent = `${data.memory_mb.heapUsed} MB (Heap) / ${data.memory_mb.rss} MB (RSS)`;
  } catch (err) {
    const elBadge = document.getElementById('health-status-badge');
    if (elBadge) {
      elBadge.textContent = 'UNREACHABLE';
      elBadge.style.background = 'var(--danger)';
    }
  }
}

window.addEventListener('admin-auth-required', () => {
  showLoginView();
});

document.addEventListener('DOMContentLoaded', checkAuthAndInit);
