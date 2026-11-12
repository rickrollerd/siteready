// First-time visitors need the company profile open (app.js sets open when there is no saved name).
// Opening it from the HTML means the largest paint is not delayed until app.js, and the job details
// below do not jump down. Visitors who already have a name get it closed here, before the rest of
// the page is parsed.
(() => {
  const el = document.getElementById('profile');
  if (!el) return;
  try {
    const saved = JSON.parse(localStorage.getItem('sitewrite.profile') || '{}');
    if (saved && typeof saved === 'object' && saved.name) el.open = false;
  } catch { /* leave it open */ }
})();
