function renderOrder(order) {
  const root = document.getElementById('confirmation-content');
  const statusLabels = { pending: 'Order placed', processing: 'Processing', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled' };
  const mock = order.payment_status === 'mock';
  const status = statusLabels[order.status] || 'Order received';
  const steps = ['pending','processing','shipped','delivered'];
  const index = steps.indexOf(order.status);
  root.innerHTML = `<div style="margin-bottom:1.5rem"><p class="eyebrow">${mock ? 'DEMO ORDER · NO PAYMENT TAKEN' : 'ORDER DETAILS'}</p><h2 style="margin:.5rem 0">${escapeHTML(status)}</h2><p style="font-size:.9rem;color:var(--text-muted)">Reference <strong>${escapeHTML(order.order_number)}</strong></p><p style="font-size:.85rem;color:var(--text-muted);margin-top:.5rem">${mock ? 'This is a test order. No charge was made and no confirmation email was sent.' : 'Save your order reference to check for updates here.'}</p></div>
    ${index >= 0 ? `<div class="order-stepper">${steps.map((step,i) => `<div class="step-item ${i < index ? 'completed' : i === index ? 'active' : ''}"><div class="step-circle">${i < index ? '✓' : i + 1}</div><span class="step-label">${statusLabels[step]}</span></div>`).join('')}</div>` : '<div class="demo-notice">This order has been cancelled.</div>'}
    ${order.tracking_number ? `<div class="demo-notice" style="margin-bottom:1.5rem"><strong>Shipment tracking</strong><p>${escapeHTML(order.carrier || 'Carrier')}: ${escapeHTML(order.tracking_number)}</p></div>` : ''}
    <div class="receipt-grid" style="border-block:1px solid var(--border-color);padding:1.5rem 0;margin-bottom:1.5rem"><div><h3 style="font-size:.8rem;color:var(--text-muted);margin-bottom:.6rem">SHIP TO</h3><p>${escapeHTML(order.customer_name)}</p><p style="font-size:.9rem;color:var(--text-muted)">${escapeHTML(order.shipping_address)}<br/>${escapeHTML(order.city)}, ${escapeHTML(order.state)} ${escapeHTML(order.postal_code)}<br/>${escapeHTML(order.country)}</p></div><div><h3 style="font-size:.8rem;color:var(--text-muted);margin-bottom:.6rem">CONTACT</h3><p style="font-size:.9rem;overflow-wrap:anywhere">${escapeHTML(order.customer_email)}</p><p style="font-size:.8rem;color:var(--text-muted);margin-top:.5rem">${mock ? 'Test order details' : 'Shipping updates appear on this page.'}</p></div></div>
    <h3 style="font-size:1rem;margin-bottom:.5rem">Your items</h3>${order.items.map(item => `<div class="summary-row" style="padding:.6rem 0;border-bottom:1px solid var(--border-subtle);gap:1rem"><div><strong style="font-size:.9rem">${escapeHTML(item.name)}</strong><p style="font-size:.8rem;color:var(--text-muted)">Qty ${item.quantity} × ${formatMoney(item.price)}</p></div><strong>${formatMoney(item.line_total ?? item.price * item.quantity)}</strong></div>`).join('')}
    <div style="background:var(--bg-secondary);border-radius:8px;padding:1.2rem;margin-top:1.5rem"><div class="summary-row"><span>Subtotal</span><span>${formatMoney(order.subtotal)}</span></div>${order.discount > 0 ? `<div class="summary-row"><span>Discount</span><span>−${formatMoney(order.discount)}</span></div>` : ''}<div class="summary-row"><span>Shipping</span><span>${order.shipping_fee === 0 ? 'FREE' : formatMoney(order.shipping_fee)}</span></div><div class="summary-row"><span>Tax</span><span>${formatMoney(order.tax)}</span></div><div class="summary-row summary-total"><span>${mock ? 'Demo total' : 'Order total'}</span><span>${formatMoney(order.total)}</span></div></div>`;
  root.hidden = false;
  document.title = `${order.order_number} | Apex Goods Co.`;
}
document.addEventListener('DOMContentLoaded', async () => {
  const input = document.getElementById('track-order-input');
  const number = new URLSearchParams(location.search).get('order');
  const message = document.getElementById('tracking-message');
  if (number) {
    input.value = number;
    const token = sessionStorage.getItem(`apex_order_${number}`);
    const admin = sessionStorage.getItem('apex_admin_token') || localStorage.getItem('apex_admin_token');
    if (token || admin) {
      try {
        const response = await fetch(`/api/orders/${encodeURIComponent(number)}`, { headers: token ? { 'X-Order-Token': token } : API.getAuthHeaders() });
        const result = await response.json();
        if (response.ok) renderOrder(result.order);
        else message.textContent = 'Enter your checkout email to view this order.';
      } catch { message.textContent = 'Could not load this order. Please try the lookup form.'; }
    } else message.textContent = 'Enter your checkout email to view this order.';
  }
  document.getElementById('tracking-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = document.getElementById('track-button');
    button.disabled = true; button.textContent = 'Finding…';
    document.getElementById('confirmation-content').hidden = true;
    message.textContent = '';
    try {
      const result = await API.post('/api/orders/lookup', { order_number: input.value.trim(), email: document.getElementById('track-email-input').value.trim() });
      renderOrder(result.order);
      const url = new URL(location.href); url.searchParams.set('order', result.order.order_number); history.replaceState({},'',url);
    } catch (error) { message.textContent = error.message; }
    finally { button.disabled = false; button.textContent = 'Find order'; }
  });
});
