// The QuantityForge tab in the tabs at the top (quantityforge.js): shown only when the server has it
// switched on, so the SiteWrite and SiteLink pages look as before until it is.
(() => {
  const tab = document.getElementById('qf-tab');
  if (!tab || typeof fetch !== 'function') return;
  // The web page calls the server it was loaded from; the phone app's copy names the server in
  // <meta name="sitewrite-api">, as on the main page.
  const API_BASE = (document.querySelector('meta[name="sitewrite-api"]')?.content || '').replace(/\/+$/, '');
  const apiUrl = (route) => `${API_BASE}${route}`;
  fetch(apiUrl('/api/qf/status')).then((r) => (r.ok ? r.json() : {})).then((s) => { if (s && s.enabled) tab.hidden = false; }).catch(() => {});
})();
