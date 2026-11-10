// The QuantityForge tab in the tabs at the top (quantityforge.js): shown only when the server has it
// switched on, so the SiteWrite and SiteLink pages look as before until it is.
(() => {
  const tab = document.getElementById('qf-tab');
  if (!tab || typeof fetch !== 'function') return;
  fetch('/api/qf/status').then((r) => (r.ok ? r.json() : {})).then((s) => { if (s && s.enabled) tab.hidden = false; }).catch(() => {});
})();
