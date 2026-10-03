// Shows the owner's numbers. Uses the session from the main page.
(async () => {
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  let token = '';
  try { token = localStorage.getItem('siteready.session') || ''; } catch { /* none */ }
  const response = await fetch('/api/admin/stats', { headers: token ? { Authorization: `Bearer ${token}`, 'X-Session-Token': token } : {} });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    document.getElementById('error').textContent = response.status === 401 ? 'Sign in on the main page first.' : (data.message || 'Not available.');
    return;
  }
  const tile = (n, label) => `<div class="tile"><div class="n">${esc(n)}</div><div class="l">${esc(label)}</div></div>`;
  document.getElementById('tiles').innerHTML = [
    tile(data.companies, 'Companies'),
    tile(data.newCompanies.days7, 'New in 7 days'),
    tile(data.plans.trial, 'On free trial'),
    tile(data.plans.trialEnded, 'Trial ended, not paying'),
    tile(data.plans.active + data.plans.past_due, 'Paying'),
    tile(data.plans.canceled, 'Cancelled'),
    tile(`A$${data.monthlyRevenue.toLocaleString('en-AU')}`, 'Monthly revenue (estimate)'),
  ].join('');
  const LABELS = {
    preview: 'Previews (not signed in)', preview_signed_in: 'Previews (signed in)', trial_started: 'Trials started',
    download_word: 'Word downloads', download_pdf: 'PDF downloads', swms_saved: 'SWMS saved', worker_signon: 'Worker sign-ons',
  };
  const types = [...new Set([...Object.keys(data.actions.days30), ...Object.keys(data.actions.days7)])].sort();
  document.getElementById('actions').innerHTML = `<tr><th>Action</th><th class="n">7 days</th><th class="n">30 days</th></tr>` +
    (types.map((type) => `<tr><td>${esc(LABELS[type] || type)}</td><td class="n">${data.actions.days7[type] || 0}</td><td class="n">${data.actions.days30[type] || 0}</td></tr>`).join('') || '<tr><td colspan="3">Nothing yet.</td></tr>');
  document.getElementById('signins').innerHTML = `<tr><th>Person</th><th>Company</th><th class="n">Devices (30 days)</th><th class="n">Networks (7 days)</th><th class="n">Sign-ins (30 days)</th><th>Last</th></tr>` +
    ((data.unusualSignins || []).map((item) => `<tr><td>${esc(item.email)}</td><td>${esc(item.company)}</td><td class="n">${esc(item.devices30)}</td><td class="n">${esc(item.networks7)}</td><td class="n">${esc(item.signins30)}</td><td>${esc(item.last ? new Date(item.last).toLocaleString('en-AU') : '')}</td></tr>`).join('') || '<tr><td colspan="6">Nothing unusual.</td></tr>');
  document.getElementById('errors').innerHTML = `<tr><th>When</th><th>Where</th><th>Message</th></tr>` +
    (data.errors.map((item) => `<tr><td>${esc(new Date(item.created_at).toLocaleString('en-AU'))}</td><td>${esc(item.route)}</td><td>${esc(item.message)}</td></tr>`).join('') || '<tr><td colspan="3">No errors.</td></tr>');
})();
