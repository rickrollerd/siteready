// Shows the owner's numbers, reference lookup, accounts, warning signs and the access log, and
// lets the owner delete a business on request and see which are due for removal.
// Uses the session from the main page.
(async () => {
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  let token = '';
  try { token = localStorage.getItem('sitewrite.session') || ''; } catch { /* none */ }
  const api = async (path, body) => {
    const headers = { ...(token ? { Authorization: `Bearer ${token}`, 'X-Session-Token': token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) };
    const response = await fetch(path, body ? { method: 'POST', headers, body: JSON.stringify(body) } : { headers });
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
  const ACTIONS = {
    ref_lookup: 'Reference lookup', account_view: 'Opened account', account_search: 'Searched accounts', business_deleted: 'Deleted a business', removal_list: 'Listed businesses due for removal',
    checked_swms_list: 'Listed kept SWMS', checked_swms_view: 'Opened a kept SWMS', checked_swms_original: 'Downloaded a kept SWMS original', checked_swms_deleted: 'Deleted a kept SWMS',
  };
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
    else if (trialAbn && trialAbn.holderDeleted) trial = `ABN ${esc(trialAbn.abn)} had its free trial on an account since deleted.`;
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
        refs.map((item) => `<tr><td>${esc(item.ref)}</td><td>${esc(item.title)}</td><td>${esc(place(item.state, item.postcode))}</td><td>${esc(when(item.createdAt))}</td></tr>`), 'No SWMS downloaded yet.')}</table>
      <div class="danger">
        <h3>Delete this business</h3>
        <p class="note">Only when the business asks, or when it is due for removal. Everything kept for it goes: its people, sites, saved SWMS with every revision, worker sign-ons, references and counts. Its ABN is kept, with no name, so it cannot have a second free trial. This cannot be undone.${paying(plan) ? ' <strong>It still has a Stripe subscription: cancel it in Stripe first.</strong>' : ''}</p>
        <form id="delete-form">
          <input type="text" id="delete-confirm" autocomplete="off" aria-label="${company.name ? 'Type the business name to confirm' : 'Type the account id to confirm'}" placeholder="${esc(company.name ? `Type ${company.name}` : `Type ${company.id}`)}">
          <button type="submit" class="danger-button">Delete this business</button>
        </form>
        <p id="delete-result"></p>
      </div>`;
    $('delete-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const typed = $('delete-confirm').value.trim();
      if (!typed) { $('delete-result').innerHTML = `<span class="error">Type the ${company.name ? 'business name' : 'account id'} to confirm.</span>`; return; }
      const done = await api(`/api/admin/companies/${encodeURIComponent(company.id)}/delete`, { confirm: typed });
      loadAccessLog();
      if (!done.ok) { $('delete-result').innerHTML = `<span class="error">${esc(done.data.message || 'Not deleted.')}</span>`; return; }
      const stripe = done.data.stripeCustomer ? ` Its Stripe customer record (${esc(done.data.stripeCustomer)}) is still in Stripe: delete it there too if the request covers it.` : '';
      box.innerHTML = `<p class="done">The business was deleted on ${esc(day(done.data.deletedAt))} (account id ${esc(done.data.id)}).${stripe}</p>`;
      history.replaceState(null, '', location.pathname);
    });
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  // A Stripe subscription still running (active, overdue or otherwise not ended).
  const paying = (plan) => plan && !['trial', 'canceled', 'incomplete_expired'].includes(plan.status);

  // Businesses due for removal under the 12 month rule. Listed when asked, as the list is logged.
  $('removal-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const result = await api('/api/admin/removal-due');
    loadAccessLog();
    if (!result.ok) { $('removal').innerHTML = `<tr><td class="error">${esc(result.data.message || 'Not available.')}</td></tr>`; return; }
    $('removal').innerHTML = rows('<tr><th>Business</th><th>Ended</th><th>Last signed in</th></tr>',
      result.data.companies.map((item) => `<tr><td><a href="${esc(accountHref(item.id))}">${esc(item.name || '(no name)')}</a></td><td>${esc(item.reason)} ${esc(item.endedAt ? day(item.endedAt) : '(date not recorded: check Stripe)')}</td><td>${esc(day(item.lastSeenAt) || 'Never')}</td></tr>`),
      `No business stopped paying, or ended its trial, more than ${result.data.months} months ago.`);
  });
  // SWMS kept from builder checks (KEEP_CHECKED_SWMS). The panel shows only while keeping is on or
  // something is kept. Listing, opening, downloading and deleting are each logged.
  const size = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
  const STORED = { bucket: 'Storage bucket', database: 'Database', none: 'Text only' };
  const checkedStatus = await api('/api/admin/checked-swms/status');
  if (checkedStatus.ok && (checkedStatus.data.keeping || checkedStatus.data.total)) {
    const s = checkedStatus.data;
    $('checked-panel').classList.remove('hidden');
    $('checked-status').textContent = `${s.keeping ? 'Keeping is on' : 'Keeping is off: nothing new is kept'}. ${s.total} kept, each for ${s.years} years after it was last checked. Originals are stored in ${s.bucket ? 'the storage bucket' : 'the database (no storage bucket is set up)'}.`;
  }
  async function listChecked() {
    const result = await api('/api/admin/checked-swms');
    loadAccessLog();
    if (!result.ok) { $('checked').innerHTML = `<tr><td class="error">${esc(result.data.message || 'Not available.')}</td></tr>`; return; }
    $('checked').innerHTML = rows('<tr><th>Kept</th><th>Document</th><th>Place and trade</th><th>Score</th><th class="n">Checks</th><th class="n">Businesses</th><th>Stored</th></tr>',
      result.data.documents.map((item) => `<tr><td class="nowrap">${esc(day(item.keptAt))}</td><td><a href="#" data-checked="${esc(item.id)}">${esc(item.fileName)}</a><br><span class="note">${esc(size(item.bytes))}</span></td><td>${esc([STATES[item.state] || item.state, item.trade].filter(Boolean).join(', ') || 'Not known')}</td><td>${esc(item.score ?? '')} ${esc(item.band)}</td><td class="n">${esc(item.checks)}</td><td class="n">${esc(item.businesses)}</td><td>${esc(STORED[item.storage] || item.storage)}</td></tr>`),
      'Nothing kept yet.');
  }
  async function downloadOriginal(id) {
    const response = await fetch(`/api/admin/checked-swms/${encodeURIComponent(id)}/original`, { headers: token ? { Authorization: `Bearer ${token}`, 'X-Session-Token': token } : {} });
    loadAccessLog();
    if (!response.ok) { $('checked-result').innerHTML = `<span class="error">${esc((await response.json().catch(() => ({}))).message || 'Not available.')}</span>`; return; }
    const name = (/filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '') || [])[1] || 'swms';
    const link = document.createElement('a');
    link.href = URL.createObjectURL(await response.blob());
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  async function openChecked(id) {
    const box = $('checked-detail');
    const result = await api(`/api/admin/checked-swms/${encodeURIComponent(id)}`);
    loadAccessLog();
    if (!result.ok) { box.innerHTML = `<p class="error">${esc(result.data.message || 'Not available.')}</p>`; return; }
    const item = result.data;
    const fails = (item.result.findings || []).filter((finding) => !finding.pass);
    const missing = item.lines.filter((line) => !line.inLibrary);
    box.innerHTML = `<h3>${esc(item.fileName)}</h3>
      <dl>
        <dt>Kept</dt><dd>${esc(when(item.keptAt))}, last checked ${esc(when(item.lastCheckedAt))}, ${esc(item.checks)} check${item.checks === 1 ? '' : 's'}</dd>
        <dt>Score</dt><dd>${esc(item.score ?? '')} ${esc(item.band)}</dd>
        <dt>Place and trade</dt><dd>${esc([STATES[item.state] || item.state, item.trade].filter(Boolean).join(', ') || 'Not known')}</dd>
        <dt>Stored</dt><dd>${esc(STORED[item.storage] || item.storage)}, ${esc(size(item.bytes))}${item.storageNote ? ` <span class="note">${esc(item.storageNote)}</span>` : ''}</dd>
        <dt>Uploaded by</dt><dd>${item.uploaders.map((up) => `<a href="${esc(accountHref(up.companyId))}">${esc(up.companyName)}</a> ${esc(up.email)} ${esc(day(up.uploadedAt))}`).join('<br>') || 'No account left'}</dd>
        <dt>Organisation</dt><dd>${item.learning.organisationKnown ? 'Read from the document (kept as a fingerprint for learning)' : 'Not found in the document'}</dd>
      </dl>
      <p><button type="button" id="checked-original">Download the original</button></p>
      <p id="checked-result"></p>
      <h3>Not passed in the check</h3>
      <ul class="plain">${fails.map((finding) => `<li>${esc(finding.rule)} ${esc(finding.title)}: ${esc(finding.message)}</li>`).join('') || '<li>Everything passed.</li>'}</ul>
      <h3>Lines the library does not have (${esc(missing.length)} of ${esc(item.lines.length)}), de-identified</h3>
      <table>${rows('<tr><th>Kind</th><th>Line</th><th>Most like the library step</th></tr>', missing.map((line) => `<tr><td>${esc(line.kind)}</td><td>${esc(line.line)}</td><td>${esc(line.libraryStep || 'None close')}</td></tr>`), 'None.')}</table>
      <details><summary>The text as read (names kept)</summary><pre class="text">${esc(item.text)}</pre></details>
      <details><summary>The de-identified learning copy</summary><pre class="text">${esc(item.learning.text)}</pre></details>
      <div class="danger">
        <h3>Delete this SWMS</h3>
        <p class="note">When its business asks, or by your choice. The original, its text and result, who uploaded it and its learning copy all go. This cannot be undone.</p>
        <form id="checked-delete"><button type="submit" class="danger-button">Delete this SWMS</button></form>
      </div>`;
    $('checked-original').addEventListener('click', () => downloadOriginal(item.id));
    $('checked-delete').addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!window.confirm('Delete this kept SWMS and everything kept for it?')) return;
      const done = await api(`/api/admin/checked-swms/${encodeURIComponent(item.id)}/delete`, {});
      loadAccessLog();
      box.innerHTML = done.ok ? '<p class="done">The kept SWMS was deleted.</p>' : `<p class="error">${esc(done.data.message || 'Not deleted.')}</p>`;
      if (done.ok) listChecked();
    });
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('checked-form').addEventListener('submit', (event) => {
    event.preventDefault();
    listChecked();
  });
  $('checked').addEventListener('click', (event) => {
    const link = event.target.closest('a[data-checked]');
    if (!link) return;
    event.preventDefault();
    openChecked(link.dataset.checked);
  });

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
    ['removed', 'SiteWrite lines most often removed', 'Line'],
    ['added', 'Lines users keep adding', 'Line added'],
    ['notApplicable', 'Hazards marked "does not apply"', 'Hazard'],
    ['reverted', 'Changes undone in the next revision', 'Change'],
  ];
  const KINDS = { removed: 'Removed', changed: 'Changed', added: 'Added', hazardChanged: 'Hazard changed', hazardAdded: 'Hazard added', hazardNotApplicable: 'Hazard does not apply', whoChanged: 'Who changed' };
  // Real SWMS kept from builder checks: how many this month, and the lines the library does not have,
  // by the library step each is most like, with how many organisations' documents each is in.
  const checkedSection = (section) => `<h3>Real SWMS checked</h3>
      <p class="learning-status${section.recording ? '' : ' off'}">${esc(section.recordingNote)}</p>
      <p>Real SWMS checked this month: <strong>${esc(section.checkedThisMonth)}</strong> (from ${esc(section.organisationsThisMonth)} organisation${section.organisationsThisMonth === 1 ? '' : 's'}). Lines that SiteWrite's library does not have: <strong>${esc(section.newLines)}</strong>, ${esc(section.twoOrganisationLines)} of them in two or more organisations' documents.</p>
      ${section.groups.map((group) => `<h3>${esc(group.step)} <span class="note">(${esc(group.total)})</span></h3>
        <table>${rows('<tr><th>Kind</th><th>Line</th><th class="n">Documents</th><th class="n">Organisations</th></tr>',
    group.lines.map((line) => `<tr><td>${esc(line.kind)}</td><td>${esc(line.line)}${line.twoOrganisations ? ' <span class="note">(two organisations)</span>' : ''}</td><td class="n">${esc(line.documents)}</td><td class="n">${esc(line.organisations)}</td></tr>`), 'None.')}</table>
        ${group.total > group.lines.length ? `<p class="note">${esc(group.total - group.lines.length)} more not shown.</p>` : ''}`).join('')}
      <details><summary>How the real SWMS lines are worked out</summary><ul class="plain">${section.method.map((line) => `<li>${esc(line)}</li>`).join('')}</ul></details>`;
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
      <h3>Steps users wrote for work SiteWrite does not cover</h3>
      <p class="note">The library's gaps users fill themselves, by the different saved SWMS a step was written in, most first: ${esc(report.ownSteps.total)} piece${report.ownSteps.total === 1 ? '' : 's'} of work in all. A step becomes library steps only with a source we hold, the goal 5 evidence test and a person's sign-off.</p>
      <table>${rows('<tr><th>Work SiteWrite does not cover</th><th>Step users wrote</th><th class="n">SWMS</th><th class="n">This month</th><th class="n">Different steps</th><th>Before the library</th></tr>',
        report.ownSteps.items.map((item) => `<tr><td>${esc(item.part)}</td><td>${esc(item.step)}</td><td class="n">${esc(item.swms)}</td><td class="n">${esc(item.swmsThisMonth)}</td><td class="n">${esc(item.versions)}</td><td>Goal 5 check needed</td></tr>`), 'No steps written by users recorded.')}</table>
      ${report.checkedSwms ? checkedSection(report.checkedSwms) : ''}
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
    const name = (/filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '') || [])[1] || 'sitewrite-learning.md';
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
