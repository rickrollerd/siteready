// The QuantityForge tab in the tabs at the top (quantityforge.js). It is always there, beside SiteLink,
// and says "Coming soon" until the server has QuantityForge switched on; then it says what it does.
(() => {
  const tab = document.getElementById('qf-tab');
  const note = document.getElementById('qf-tab-note');
  if (!tab || !note || typeof fetch !== 'function') return;
  // The web page calls the server it was loaded from; the phone app's copy names the server in
  // <meta name="sitewrite-api">, as on the main page.
  const API_BASE = (document.querySelector('meta[name="sitewrite-api"]')?.content || '').replace(/\/+$/, '');
  const apiUrl = (route) => `${API_BASE}${route}`;
  fetch(apiUrl('/api/qf/status')).then((r) => (r.ok ? r.json() : {})).then((s) => { if (s && s.enabled) note.textContent = 'Quantities from drawings'; }).catch(() => {});
})();
