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
    check_signon_removed: 'Builder checks with sign-on pages removed', check_signon_refused: 'Builder checks refused (sign-on mixed in)',
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

  // AI readings checked against the brief.
  const ai = await api('/api/admin/ai-readings');
  $('ai-readings').innerHTML = ai.ok
    ? rows('<tr><th>When</th><th>Account</th><th>Status</th><th>Check</th><th>Activities</th><th>Quotes not found / shortened</th><th>Other package names</th><th>Minutes</th><th>Cost (US$)</th></tr>',
      ai.data.readings.map((item) => `<tr><td>${esc(new Date(item.createdAt).toLocaleString('en-NZ'))}</td><td>${esc(item.company)}</td><td>${esc(item.status)}${item.error ? `: ${esc(item.error)}` : ''}</td><td>${item.checks ? (item.checks.passed ? 'Passed' : '<strong>Failed</strong>') : ''}</td><td>${item.checks ? item.checks.activities : ''}</td><td>${item.checks ? `${item.checks.quotesNotFound} / ${item.checks.quotesShortened} of ${item.checks.quotes}` : ''}</td><td>${item.checks ? esc(item.checks.otherPackages.join('; ')) : ''}</td><td>${item.minutes ?? ''}</td><td>${item.costUsd.toFixed(2)}</td></tr>`),
      'No AI readings yet.')
    : `<tr><td class="error">${esc(ai.data.message || 'Not available.')}</td></tr>`;

  // The monthly learning report (goal 11): rates by month, failed check questions, the last three
  // months, and candidate library changes for a person to check.
  const figure = (value, why) => (value === null || value === undefined ? `<span class="note">None (${esc(why || 'not computed')})</span>` : esc(value));
  const GROUPS = [
    ['removed', 'SiteReady lines most often removed', 'Line'],
    ['added', 'Lines users keep adding', 'Line added'],
    ['notApplicable', 'Hazards marked "does not apply"', 'Hazard'],
    ['reverted', 'Changes undone in the next revision', 'Change'],
  ];
  const KINDS = { removed: 'Removed', changed: 'Changed', added: 'Added', hazardChanged: 'Hazard changed', hazardAdded: 'Hazard added', hazardNotApplicable: 'Hazard does not apply', whoChanged: 'Who changed' };
  async function loadLearning(month) {
    const box = $('learning');
    const result = await api(`/api/admin/control-learning/report${month ? `?month=${encodeURIComponent(month)}` : ''}`);
    if (!result.ok) { box.innerHTML = `<p class="error">${esc(result.data.message || 'Not available.')}</p>`; return; }
    const report = result.data;
    if (!$('learning-month').value) $('learning-month').value = report.month;
    const trend = (name, item) => `<li>${esc(name)}: ${item.values.map((value) => `${esc(value.month)} ${value.value === null ? 'none' : esc(value.value)}`).join(', ')}. ${esc(item.says)}</li>`;
    const candidates = GROUPS.map(([group, title, what]) => {
      const { shown, below } = report.candidates[group];
      const body = shown.map((item) => {
        const line = group === 'added' ? esc(item.newLine)
          : group === 'reverted' ? `${esc(KINDS[item.kind] || item.kind)}: ${esc(item.line)}${item.newLine ? ` <span class="note">to</span> ${esc(item.newLine)}` : ''}`
            : `${esc(item.line)}${item.legalRequirement ? ` <span class="note">(legal requirement: ${esc(item.legalRequirement)})</span>` : ''}`;
        return `<tr><td>${esc(item.step)}</td><td>${line}</td><td class="n">${esc(item.swms)}</td><td class="n">${esc(item.swmsThisMonth)}</td><td>Goal 5 check needed</td></tr>`;
      });
      return `<h3>${esc(title)}</h3><table>${rows(`<tr><th>Step</th><th>${esc(what)}</th><th class="n">SWMS</th><th class="n">This month</th><th>Before the library</th></tr>`, body, 'None at or above the threshold.')}</table>
        <p class="note">Below the threshold: ${esc(below)} pattern${below === 1 ? '' : 's'}.</p>`;
    }).join('');
    box.innerHTML = `<p class="learning-status${report.recording ? '' : ' off'}">${esc(report.recordingNote)}</p>
      <p class="note">Report for ${esc(report.month)}: ${report.whole ? 'a whole month' : 'this month so far, the month is not over'}.</p>
      <h3>Edit rate by month</h3>
      <p class="note">Edit rate: changes on new SWMS for each new SWMS saved. Lower is better.</p>
      <table>${rows('<tr><th>Month</th><th class="n">SWMS saved</th><th class="n">New SWMS changed</th><th class="n">Changes on new SWMS</th><th class="n">Edit rate</th><th class="n">Revisions saved</th><th class="n">Changes new in a revision</th><th class="n">Per saved revision</th></tr>',
        report.months.map((item) => `<tr><td class="nowrap">${esc(item.month)}</td><td class="n">${esc(item.swmsSaved)}</td><td class="n">${esc(item.newSwmsChanged)}</td><td class="n">${esc(item.newSwmsChanges)}</td><td class="n">${figure(item.editRate, item.editRateWhy)}</td><td class="n">${esc(item.revisionsSaved)}</td><td class="n">${esc(item.newChanges)}</td><td class="n">${figure(item.revisionRate, item.recorded ? 'no revisions saved' : 'nothing recorded yet')}</td></tr>`), 'No months.')}</table>
      <h3>Failed check questions by month</h3>
      <table>${rows('<tr><th>Month</th><th class="n">Worker sign-ons</th><th class="n">Wrong answers</th><th class="n">PPE</th><th class="n">Step</th><th class="n">Control</th><th class="n">Per sign-on</th></tr>',
        report.months.map((item) => `<tr><td class="nowrap">${esc(item.month)}</td><td class="n">${esc(item.signons)}</td><td class="n">${esc(item.wrongAnswers)}</td><td class="n">${esc(item.wrongByKind.ppe)}</td><td class="n">${esc(item.wrongByKind.step)}</td><td class="n">${esc(item.wrongByKind.control)}</td><td class="n">${figure(item.wrongRate, item.wrongRateWhy)}</td></tr>`), 'No months.')}</table>
      <h3>Most often wrong in ${esc(report.month)}</h3>
      <table>${rows('<tr><th>Kind</th><th>Step</th><th>Right answer</th><th class="n">Wrong answers</th></tr>',
        report.failedQuestions.items.map((item) => `<tr><td>${esc(item.kind)}</td><td>${esc(item.step)}</td><td>${esc(item.item)}</td><td class="n">${esc(item.wrong)}</td></tr>`), 'No wrong answers recorded this month.')}</table>
      <h3>The last three months</h3>
      <ul class="plain">${trend('Edit rate', report.trend.editRate)}${trend('Wrong answers per sign-on', report.trend.wrongRate)}<li>${esc(report.trend.acceptance.says)}</li></ul>
      <h3>Candidate library changes</h3>
      <p class="note">${esc(report.candidates.thresholdNote)} ${esc(report.candidates.rule)}</p>
      ${candidates}
      <details><summary>How these are worked out</summary><ul class="plain">${report.method.map((line) => `<li>${esc(line)}</li>`).join('')}</ul></details>`;
  }
  $('learning-form').addEventListener('submit', (event) => {
    event.preventDefault();
    loadLearning($('learning-month').value.trim());
  });
  // The month's report as a text file to keep.
  $('learning-download').addEventListener('click', async () => {
    const month = $('learning-month').value.trim();
    const response = await fetch(`/api/admin/control-learning/report.md${month ? `?month=${encodeURIComponent(month)}` : ''}`, { headers: token ? { Authorization: `Bearer ${token}`, 'X-Session-Token': token } : {} });
    if (!response.ok) { $('learning').insertAdjacentHTML('afterbegin', `<p class="error">${esc((await response.json().catch(() => ({}))).message || 'Not available.')}</p>`); return; }
    const name = (/filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '') || [])[1] || 'siteready-learning.md';
    const link = document.createElement('a');
    link.href = URL.createObjectURL(await response.blob());
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  });
  await loadLearning('');

  await loadAccessLog();
  fromHash();
})();
