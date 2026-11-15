const inquiryList = document.getElementById('inbox-list');
const inquiryFeedback = document.getElementById('inbox-feedback');
const refreshInboxButton = document.getElementById('inbox-refresh');
const previousInboxButton = document.getElementById('inbox-prev');
const nextInboxButton = document.getElementById('inbox-next');
const emailState = document.getElementById('inbox-email-state');
const inboxEmailLabels = {
  pending: 'Email pending', sending: 'Email sending', sent: 'Accepted by mail server',
  failed: 'Email failed', not_configured: 'Email unconfigured'
};
const inboxDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
let inboxCursors = [null];
let inquiryRequest = 0;

function resetInquiryInbox() {
  inquiryRequest++;
  inboxCursors = [null];
  inquiryList.replaceChildren();
  inquiryFeedback.textContent = '';
  emailState.hidden = true;
  previousInboxButton.hidden = true;
  nextInboxButton.hidden = true;
}

async function loadInquiryInbox({ cursors = inboxCursors, openId } = {}) {
  const request = ++inquiryRequest;
  const cursor = cursors.at(-1);
  inquiryFeedback.textContent = 'Loading inquiries…';
  refreshInboxButton.disabled = previousInboxButton.disabled = nextInboxButton.disabled = true;
  try {
    const data = await API.get(`/api/admin/inquiries${cursor ? `?before=${cursor}` : ''}`);
    if (request !== inquiryRequest) return;
    inboxCursors = cursors;
    emailState.hidden = data.emailConfigured;
    inquiryList.innerHTML = data.inquiries.map(inquiry => {
      const id = inquiry.id;
      const time = new Date(inquiry.created_at.replace(' ', 'T') + 'Z');
      const received = Number.isNaN(time.valueOf()) ? '' : inboxDate.format(time);
      const handled = inquiry.status === 'handled';
      const emailLabel = inboxEmailLabels[inquiry.email_status] || 'Email pending';
      const replyTo = encodeURIComponent(inquiry.email).replace('%40', '@');
      return `<details class="inbox-entry" ${id === openId ? 'open' : ''}>
        <summary>
          <div><strong>${escapeHTML(inquiry.name)}</strong><span class="inbox-topic">${escapeHTML(inquiry.product_name || 'General inquiry')}</span></div>
          <div class="inbox-meta"><span class="stock-status ${handled ? 'stock-in' : 'stock-low'}">${handled ? 'Handled' : 'New'}</span><small>${escapeHTML(received)}</small></div>
        </summary>
        <div class="inbox-body">
          <dl class="inbox-details"><div><dt>Reference</dt><dd>INQ-${id}</dd></div><div><dt>Email</dt><dd>${escapeHTML(inquiry.email)}</dd></div>
            ${inquiry.company ? `<div><dt>Company</dt><dd>${escapeHTML(inquiry.company)}</dd></div>` : ''}
            <div><dt>Email notification</dt><dd>${emailLabel}</dd></div></dl>
          <p class="inbox-message">${escapeHTML(inquiry.message)}</p>
          <div class="inbox-actions">
            <a class="btn btn-primary btn-sm" href="mailto:${replyTo}?subject=Apex%20Goods%20inquiry%20INQ-${id}">Reply by email</a>
            <button class="btn btn-secondary btn-sm" type="button" data-inquiry-id="${id}" data-inquiry-status="${handled ? 'new' : 'handled'}">${handled ? 'Mark as new' : 'Mark as handled'}</button>
            ${data.emailConfigured && inquiry.can_retry ? `<button class="btn btn-secondary btn-sm" type="button" data-inquiry-id="${id}" data-retry-email>Retry notification</button>` : ''}
          </div>
        </div>
      </details>`;
    }).join('');
    inquiryFeedback.textContent = data.inquiries.length ? '' : 'No inquiries yet.';
    previousInboxButton.hidden = cursors.length < 2;
    nextInboxButton.hidden = !data.nextBefore;
    nextInboxButton.dataset.before = data.nextBefore || '';
  } catch (error) {
    if (request === inquiryRequest) inquiryFeedback.textContent = error.message || 'Unable to load inquiries.';
  } finally {
    if (request === inquiryRequest) refreshInboxButton.disabled = previousInboxButton.disabled = nextInboxButton.disabled = false;
  }
}

refreshInboxButton.addEventListener('click', () => loadInquiryInbox({ cursors: [null] }));
previousInboxButton.addEventListener('click', () => loadInquiryInbox({ cursors: inboxCursors.slice(0, -1) }));
nextInboxButton.addEventListener('click', () => loadInquiryInbox({ cursors: [...inboxCursors, Number(nextInboxButton.dataset.before)] }));
inquiryList.addEventListener('click', async event => {
  const button = event.target.closest('button[data-inquiry-id]');
  if (!button) return;
  button.disabled = true;
  const id = Number(button.dataset.inquiryId);
  const endpoint = `/api/admin/inquiries/${id}`;
  try {
    if (button.hasAttribute('data-retry-email')) {
      const { emailStatus } = await API.post(`${endpoint}/retry-email`, {});
      showToast(inboxEmailLabels[emailStatus], emailStatus === 'failed' ? 'error' : 'info');
    } else {
      await API.patch(endpoint, { status: button.dataset.inquiryStatus });
    }
    await loadInquiryInbox({ openId: id });
  } catch (error) {
    showToast(error.message || 'Unable to update the inquiry.', 'error');
  } finally {
    button.disabled = false;
  }
});
