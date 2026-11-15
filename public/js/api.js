/**
 * Apex Goods Co. - API Client & Notification Engine
 * Same-origin requests use the browser's admin session cookie.
 */

const API = {
  baseUrl: '',

  async get(endpoint) {
    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`);
      if (res.status === 401 && endpoint.startsWith('/api/admin/') && !endpoint.includes('/api/admin/login')) {
        window.dispatchEvent(new CustomEvent('admin-auth-required'));
      }
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      console.error(`API GET error at ${endpoint}:`, err);
      throw err;
    }
  },

  async post(endpoint, data) {
    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.status === 401 && endpoint.startsWith('/api/admin/') && !endpoint.includes('/api/admin/login')) {
        window.dispatchEvent(new CustomEvent('admin-auth-required'));
      }
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(result.error || `HTTP ${res.status}`);
      }
      return result;
    } catch (err) {
      console.error(`API POST error at ${endpoint}:`, err);
      throw err;
    }
  },

  async put(endpoint, data) {
    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.status === 401 && endpoint.startsWith('/api/admin/')) {
        window.dispatchEvent(new CustomEvent('admin-auth-required'));
      }
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(result.error || `HTTP ${res.status}`);
      }
      return result;
    } catch (err) {
      console.error(`API PUT error at ${endpoint}:`, err);
      throw err;
    }
  },

  async patch(endpoint, data) {
    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.status === 401 && endpoint.startsWith('/api/admin/')) {
        window.dispatchEvent(new CustomEvent('admin-auth-required'));
      }
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(result.error || `HTTP ${res.status}`);
      }
      return result;
    } catch (err) {
      console.error(`API PATCH error at ${endpoint}:`, err);
      throw err;
    }
  },

  async delete(endpoint) {
    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'DELETE'
      });
      if (res.status === 401 && endpoint.startsWith('/api/admin/')) {
        window.dispatchEvent(new CustomEvent('admin-auth-required'));
      }
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(result.error || `HTTP ${res.status}`);
      }
      return result;
    } catch (err) {
      console.error(`API DELETE error at ${endpoint}:`, err);
      throw err;
    }
  }
};

// Global Toast Notifications
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icon = type === 'success' ? '✓' : type === 'error' ? '⚠' : 'ℹ';
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.textContent = `${icon} ${message}`;
  
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Format currency
function formatMoney(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount || 0);
}

// Use for every database/customer value interpolated into HTML.
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function imageAssetURL(value) {
  const url = String(value || '');
  return /^https?:\/\/[^\s]+$/i.test(url) || /^\/(?!\/)[^\s]*$/.test(url) ? url : '/images/product-placeholder.svg';
}
function safeImageURL(value) { return escapeHTML(imageAssetURL(value)); }
document.addEventListener('error', event => {
  if (event.target instanceof HTMLImageElement && !event.target.src.endsWith('/images/product-placeholder.svg')) {
    event.target.src = '/images/product-placeholder.svg';
  }
}, true);
