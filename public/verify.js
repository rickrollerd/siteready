// Checks a SiteReady reference. The reference can also come in the address: /verify.html?ref=SR-ABCD-2345
(() => {
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const input = document.getElementById('ref');
  const result = document.getElementById('result');
  async function check(ref) {
    result.innerHTML = '';
    try {
      const response = await fetch(`/api/verify/${encodeURIComponent(ref.trim().toUpperCase())}`);
      const data = await response.json();
      if (!data.found) {
        result.innerHTML = `<div class="bad"><strong>Not found.</strong> ${esc(data.message || '')}</div>`;
        return;
      }
      result.innerHTML = `<div class="ok"><strong>Genuine SiteReady reference.</strong><dl>
        <dt>Prepared for</dt><dd>${esc(data.business)}${data.abn ? ` (ABN ${esc(data.abn)})` : ''}</dd>
        <dt>Task</dt><dd>${esc(data.title || '')}</dd>
        <dt>Prepared on</dt><dd>${esc(new Date(data.preparedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }))}</dd>
        <dt>Reference</dt><dd>${esc(data.ref)}</dd></dl></div>`;
    } catch {
      result.innerHTML = '<div class="bad">The reference could not be checked just now. Try again shortly.</div>';
    }
  }
  document.getElementById('verify').addEventListener('submit', (event) => {
    event.preventDefault();
    check(input.value);
  });
  const fromAddress = new URLSearchParams(location.search).get('ref');
  if (fromAddress) { input.value = fromAddress; check(fromAddress); }
})();
