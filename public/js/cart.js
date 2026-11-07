const Cart = {
  storageKey: 'apex_cart_v1', couponKey: 'apex_applied_coupon',
  config: { taxRate: 0.08, freeShippingThreshold: 75, standardShippingFee: 7.99, paymentMode: 'mock' },
  getItems() {
    try {
      const items = JSON.parse(localStorage.getItem(this.storageKey));
      if (!Array.isArray(items)) return [];
      const seen = new Set();
      return items.filter(item => {
        if (!item || !Number.isSafeInteger(item.id) || item.id <= 0 || seen.has(item.id) || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 99 || typeof item.price !== 'number' || !Number.isFinite(item.price) || item.price < 0) return false;
        seen.add(item.id); return true;
      }).map(item => ({ ...item, stock: Number.isSafeInteger(item.stock) && item.stock >= 0 ? item.stock : 99 }));
    } catch { return []; }
  },
  saveItems(items) {
    try { localStorage.setItem(this.storageKey, JSON.stringify(items)); }
    catch { showToast('Your browser could not save the cart. Enable site storage and try again.', 'error'); return false; }
    this.broadcastChange(); return true;
  },
  addItem(product, quantity = 1) {
    if (!Number.isSafeInteger(quantity) || quantity < 1 || product.stock < 1 || product.is_active === 0) return false;
    const items = this.getItems();
    const existing = items.find(item => item.id === product.id);
    const next = (existing?.quantity || 0) + quantity;
    if (next > Math.min(product.stock, 99)) { showToast(`Only ${Math.min(product.stock, 99)} can be added for this item.`, 'error'); return false; }
    if (existing) Object.assign(existing, { price: product.price, stock: product.stock, quantity: next, available: true });
    else items.push({ id: product.id, name: product.name, slug: product.slug, price: product.price, image_url: product.image_url, stock: product.stock, quantity, available: true });
    if (!this.saveItems(items)) return false;
    showToast(`Added "${product.name}" to cart`, 'success'); return true;
  },
  updateQuantity(id, quantity) {
    if (!Number.isSafeInteger(quantity) || quantity < 0) return;
    let items = this.getItems();
    const item = items.find(item => item.id === id);
    if (quantity === 0) items = items.filter(item => item.id !== id);
    else if (item) {
      if (quantity > Math.min(item.stock, 99)) { showToast(`Only ${Math.min(item.stock, 99)} available.`, 'error'); return; }
      item.quantity = quantity;
    }
    this.saveItems(items);
  },
  removeItem(id) { this.saveItems(this.getItems().filter(item => item.id !== id)); },
  clear() { localStorage.removeItem(this.storageKey); localStorage.removeItem(this.couponKey); this.broadcastChange(); },
  getCount() { return this.getItems().reduce((sum, item) => sum + item.quantity, 0); },
  getSubtotal() { return this.getItems().reduce((sum, item) => sum + Math.round(item.price * 100) * item.quantity, 0) / 100; },
  getCoupon() {
    try { const coupon = JSON.parse(localStorage.getItem(this.couponKey)); return coupon && typeof coupon.code === 'string' && ['percent', 'fixed', 'shipping'].includes(coupon.discount_type) && Number.isFinite(coupon.value) ? coupon : null; }
    catch { return null; }
  },
  setCoupon(coupon) {
    if (coupon) localStorage.setItem(this.couponKey, JSON.stringify(coupon));
    else localStorage.removeItem(this.couponKey);
    this.broadcastChange();
  },
  calculateTotals() {
    const subtotal = Math.round(this.getSubtotal() * 100);
    const coupon = this.getCoupon();
    const eligible = coupon && subtotal >= Math.round((coupon.min_subtotal || 0) * 100);
    const freeShipping = eligible && (coupon.discount_type === 'shipping' || coupon.code.toUpperCase() === 'FREESHIP');
    let discount = !eligible || freeShipping ? 0 : coupon.discount_type === 'percent' ? Math.round(subtotal * coupon.value / 100) : Math.round(coupon.value * 100);
    discount = Math.min(subtotal, Math.max(0, discount));
    const shipping = freeShipping || subtotal === 0 || subtotal >= Math.round(this.config.freeShippingThreshold * 100) ? 0 : Math.round(this.config.standardShippingFee * 100);
    const tax = Math.round((subtotal - discount) * this.config.taxRate);
    return { subtotal: subtotal / 100, discount: discount / 100, shipping: shipping / 100, tax: tax / 100, total: (subtotal - discount + shipping + tax) / 100, freeShippingThreshold: this.config.freeShippingThreshold, remainingForFreeShipping: Math.max(0, this.config.freeShippingThreshold - subtotal / 100) };
  },
  broadcastChange() { window.dispatchEvent(new CustomEvent('cart-updated')); this.updateCartBadge(); },
  updateCartBadge() {
    const count = this.getCount();
    document.querySelectorAll('.cart-count').forEach(badge => { badge.textContent = count; badge.style.display = count ? 'inline-block' : 'none'; });
  }
};
Cart.ready = API.get('/api/store-config').then(config => {
  Object.assign(Cart.config, config);
  document.querySelectorAll('.announcement-bar > span:first-child').forEach(element => {
    element.textContent = `Free shipping on orders ${formatMoney(config.freeShippingThreshold)}+`;
  });
  window.dispatchEvent(new CustomEvent('store-config-ready'));
  return config;
});
// Keep the rejection available to checkout, while avoiding an unhandled promise on other pages.
Cart.ready.catch(() => {});
document.addEventListener('DOMContentLoaded', () => Cart.updateCartBadge());
window.addEventListener('storage', event => { if ([Cart.storageKey, Cart.couponKey, null].includes(event.key)) Cart.broadcastChange(); });
