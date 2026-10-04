// Shows the owner's numbers, reference lookup, accounts, warning signs and the access log.
// Uses the session from the main page.
(async () => {
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  let token = '';
  try { token = localStorage.getItem('siteready.session') || ''; } catch { /* none */ }
  const api = async (path) => {
    const response = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}`, 'X-Session-Token': token } : {} });
    return { ok: response.ok, status: response.status, data: await response.json().catch(() => ({})) };
  };
  const $ = (id) => document.getElementById(id);
  const when = (value) => (value ? new Date(value).toLocaleString('en-AU') : '');
  const day = (value) => (value ? new Date(value).toLocaleDateString('en-AU') : '');
  const STATES = { qld: 'Qld', nsw: 'NSW', vic: 'Vic', act: 'ACT', tas: 'Tas', sa: 'SA', wa: 'WA', nt: 'NT' };
  const place = (state, postcode) => [STATES[state] || state, postcode].filter(Boolean).join(' ') || 'Not recorded';
  const accountHref = (id) => `#account=${encodeURIComponent(id)}`;
  const planLabel = (plan) => {
    if (!plan) return '';
    if (plan.status === 'trial') return plan.onTrial ? 'Free trial' : 'Trial ended';
    return { active: 'Paying', trialing: 'Paying (in trial)', past_due: 'Payment overdue', canceled: 'Cancelled' }[plan.status] || plan.status;
  };
  const rows = (head, items, empty) => head + (items.join('') || `<tr><td colspan="${(head.match(/<th/g) || []).length}">${esc(empty)}</td></tr>`);

  const { ok, status, data } = await api('/api/admin/stats');
  if (!ok) {
    $('error').textContent = status === 401 ? 'Sign in on the main page first.' : (data.message || 'Not available.');
    return;
  }
  const tile = (n, label) => `<div class="tile"><div class="n">${esc(n)}</div><div class="l">${esc(label)}</div></div>`;
  $('tiles').innerHTML = [
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
  $('actions').innerHTML = `<tr><th>Action</th><th class="n">7 days</th><th class="n">30 days</th></tr>` +
    (types.map((type) => `<tr><td>${esc(LABELS[type] || type)}</td><td class="n">${esc(data.actions.days7[type] || 0)}</td><td class="n">${esc(data.actions.days30[type] || 0)}</td></tr>`).join('') || '<tr><td colspan="3">Nothing yet.</td></tr>');
  $('signins').innerHTML = `<tr><th>Person</th><th>Company</th><th class="n">Devices (30 days)</th><th class="n">Networks (7 days)</th><th class="n">Sign-ins (30 days)</th><th>Last</th></tr>` +
    ((data.unusualSignins || []).map((item) => `<tr><td>${esc(item.email)}</td><td>${esc(item.company)}</td><td class="n">${esc(item.devices30)}</td><td class="n">${esc(item.networks7)}</td><td class="n">${esc(item.signins30)}</td><td>${esc(when(item.last))}</td></tr>`).join('') || '<tr><td colspan="6">Nothing unusual.</td></tr>');
  $('errors').innerHTML = `<tr><th>When</th><th>Where</th><th>Message</th></tr>` +
    (data.errors.map((item) => `<tr><td>${esc(when(item.created_at))}</td><td>${esc(item.route)}</td><td>${esc(item.message)}</td></tr>`).join('') || '<tr><td colspan="3">No errors.</td></tr>');

  // Every look at a reference or account is logged, so the log is shown again after each one.
  const ACTIONS = { ref_lookup: 'Reference lookup', account_view: 'Opened account', account_search: 'Searched accounts' };
  async function loadAccessLog() {
    const result = await api('/api/admin/access-log');
    if (!result.ok) { $('access-log').innerHTML = `<tr><td class="error">${esc(result.data.message || 'Not available.')}</td></tr>`; return; }
    $('access-log').innerHTML = rows('<tr><th>When</th><th>Who</th><th>What</th><th>Of</th></tr>',
      result.data.entries.map((item) => `<tr><td>${esc(when(item.createdAt))}</td><td>${esc(item.adminEmail)}</td><td>${esc(ACTIONS[item.action] || item.action)}</td><td>${esc(item.target)}</td></tr>`), 'Nothing yet.');
  }

  // Reference lookup.
  $('ref-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const ref = $('ref-input').value.trim();
    if (!ref) return;
    const result = await api(`/api/admin/refs/${encodeURIComponent(ref)}`);
    const item = result.data;
    if (!result.ok) $('ref-result').innerHTML = `<p class="error">${esc(item.message || 'Not available.')}</p>`;
    else {
      const renamed = item.accountExists && item.currentName && item.currentName !== item.companyName ? ` (now ${esc(item.currentName)})` : '';
      $('ref-result').innerHTML = `<dl>
        <dt>Reference</dt><dd>${esc(item.ref)}</dd>
        <dt>Account</dt><dd>${esc(item.companyName)}${renamed}</dd>
        <dt>ABN</dt><dd>${esc(item.abn)}</dd>
        <dt>Account id</dt><dd>${esc(item.companyId || 'None')}</dd>
        <dt>Task</dt><dd>${esc(item.title)}</dd>
        <dt>Job place</dt><dd>${esc(place(item.state, item.postcode))}</dd>
        <dt>Downloaded</dt><dd>${esc(when(item.createdAt))}</dd>
        <dt></dt><dd>${item.accountExists ? `<a href="${esc(accountHref(item.companyId))}">Open the account</a>` : 'The account has since been deleted.'}</dd>
      </dl>`;
    }
    loadAccessLog();
  });

  // Accounts: search, then open one.
  async function searchAccounts(q) {
    const result = await api(`/api/admin/companies?q=${encodeURIComponent(q)}`);
    if (!result.ok) { $('accounts').innerHTML = `<tr><td class="error">${esc(result.data.message || 'Not available.')}</td></tr>`; return; }
    $('accounts').innerHTML = rows('<tr><th>Business</th><th>ABN</th><th>Plan</th><th>Trial ends</th><th class="n">Users</th><th class="n">Downloads (30 days)</th><th class="n">References (30 days)</th></tr>',
      result.data.companies.map((item) => `<tr><td><a href="${esc(accountHref(item.id))}">${esc(item.name || '(no name)')}</a></td><td>${esc(item.abn)}</td><td>${esc(planLabel(item.plan))}</td><td>${esc(day(item.plan.trialEndsAt))}</td><td class="n">${esc(item.users)}</td><td class="n">${esc(item.downloads30)}</td><td class="n">${esc(item.refs30)}</td></tr>`),
      'No accounts found.');
    loadAccessLog();
  }
  $('account-form').addEventListener('submit', (event) => {
    event.preventDefault();
    searchAccounts($('account-q').value.trim());
  });

  async function openAccount(id) {
    const box = $('account-detail');
    const result = await api(`/api/admin/companies/${encodeURIComponent(id)}`);
    loadAccessLog();
    if (!result.ok) { box.innerHTML = `<p class="error">${esc(result.data.message || 'Not available.')}</p>`; return; }
    const { company, plan, users, trialAbn, downloadsByMonth, refs, signins } = result.data;
    let trial = 'No trial is recorded against this ABN.';
    if (trialAbn && trialAbn.heldByThisAccount) trial = `ABN ${esc(trialAbn.abn)} had its free trial on this account, from ${esc(day(trialAbn.createdAt))}.`;
    else if (trialAbn) trial = `ABN ${esc(trialAbn.abn)} had its free trial on another account: <a href="${esc(accountHref(trialAbn.holderId))}">${esc(trialAbn.holderName || trialAbn.holderId)}</a>.`;
    box.innerHTML = `<h3>${esc(company.name || '(no name)')}</h3>
      <dl>
        <dt>ABN</dt><dd>${esc(company.abn)}</dd>
        <dt>Account id</dt><dd>${esc(company.id)}</dd>
        <dt>Address</dt><dd>${esc(company.address)}</dd>
        <dt>Phone</dt><dd>${esc(company.phone)}</dd>
        <dt>Email</dt><dd>${esc(company.email)}</dd>
        <dt>Joined</dt><dd>${esc(day(company.createdAt))}</dd>
        <dt>Plan</dt><dd>${esc(planLabel(plan))}${plan.status === 'trial' ? `, trial ends ${esc(day(plan.trialEndsAt))}` : ''}</dd>
        <dt>Trial ABN</dt><dd>${trial}</dd>
      </dl>
      <h3>Users</h3>
      <table>${rows('<tr><th>Email</th><th>Name</th><th>Role</th><th>Joined</th><th>Last seen</th></tr>',
        users.map((user) => `<tr><td>${esc(user.email)}</td><td>${esc(user.name)}</td><td>${user.isAdmin ? 'Administrator' : 'User'}</td><td>${esc(day(user.createdAt))}</td><td>${esc(when(user.lastSeenAt) || 'Never')}</td></tr>`), 'No users.')}</table>
      <h3>Downloads by month</h3>
      <table><tr>${downloadsByMonth.map((item) => `<th class="n">${esc(item.month)}</th>`).join('')}</tr><tr>${downloadsByMonth.map((item) => `<td class="n">${esc(item.downloads)}</td>`).join('')}</tr></table>
      <h3>Sign-ins in the last ${esc(signins.days)} days</h3>
      <p class="note">${esc(signins.total)} sign-ins from ${esc(signins.devices)} devices on ${esc(signins.networks)} networks.</p>
      <table>${rows('<tr><th>Email</th><th class="n">Sign-ins</th><th class="n">Devices</th><th class="n">Networks</th><th>Last</th></tr>',
        signins.users.map((item) => `<tr><td>${esc(item.email)}</td><td class="n">${esc(item.signins)}</td><td class="n">${esc(item.devices)}</td><td class="n">${esc(item.networks)}</td><td>${esc(when(item.last))}</td></tr>`), 'No users.')}</table>
      <h3>Last ${esc(refs.length)} references</h3>
      <table>${rows('<tr><th>Reference</th><th>Task</th><th>Job place</th><th>Downloaded</th></tr>',
        refs.map((item) => `<tr><td>${esc(item.ref)}</td><td>${esc(item.title)}</td><td>${esc(place(item.state, item.postcode))}</td><td>${esc(when(item.createdAt))}</td></tr>`), 'No SWMS downloaded yet.')}</table>`;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  const fromHash = () => {
    const match = /^#account=(.+)$/.exec(location.hash);
    if (!match) return;
    try { openAccount(decodeURIComponent(match[1])); } catch { /* a broken link */ }
  };
  window.addEventListener('hashchange', fromHash);

  // Warning signs.
  const RULES = { volume: 'High download volume', places: 'Many places', domain: 'Shared email domain', trials: 'Related trials', signins: 'Unusual sign-ins' };
  const warnings = await api('/api/admin/warnings');
  $('warnings').innerHTML = warnings.ok
    ? rows('<tr><th>Sign</th><th>Why</th><th>Accounts</th></tr>',
      warnings.data.warnings.map((item) => `<tr><td>${esc(RULES[item.rule] || item.rule)}</td><td>${esc(item.reason)}</td><td>${item.companies.map((company) => `<a href="${esc(accountHref(company.id))}">${esc(company.name || '(no name)')}</a>`).join('<br>')}</td></tr>`),
      'Nothing to look at.')
    : `<tr><td class="error">${esc(warnings.data.message || 'Not available.')}</td></tr>`;

  await loadAccessLog();
  fromHash();
})();
