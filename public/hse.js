// SiteLink, the main contractor's page (Goal 12 stage 3, D303): /sitelink, also /hse.html. The HSE lead and team sign in free by
// email link, as reviewers (the review page shares the same sign-in on this device), set up the
// account, add and remove people, hand over the lead, make projects and set each project's site details. Each saved
// change to the site details is a new version. Pages are reached by the address after #, so Back
// and reload work. Site details typed but not saved are kept on this device until saved or cancelled.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  // The same key as the review page, so one sign-in serves both.
  const KEY = 'sitewrite.reviewer';
  const DRAFT_PREFIX = 'sitewrite.hse.details.';
  // Other words typed but not saved, kept on this device like the site details (messy round 6): a
  // rewording, a SWMS being added, an answer to a point, and your details. Sign out clears them all.
  const TYPED_PREFIX = 'sitewrite.hse.typed.';
  const typedKey = (...parts) => `${TYPED_PREFIX}${parts.join('.')}`;
  const readTyped = (key) => { try { return JSON.parse(store.get(key) || 'null'); } catch { return null; } };
  const keepTyped = (key, value) => store.set(key, value === null || value === undefined ? '' : JSON.stringify(value));
  const store = {
    get: (key) => { try { return localStorage.getItem(key) || ''; } catch { return ''; } },
    set: (key, value) => { try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch { /* not kept */ } },
  };
  // An ABN as people write it: "51 824 753 556".
  const formatAbn = (abn) => { const d = String(abn || '').replace(/\D/g, ''); return d.length === 11 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : String(abn || ''); };
  const STATE_NAME = { act: 'Australian Capital Territory', nsw: 'New South Wales', nt: 'Northern Territory', qld: 'Queensland', sa: 'South Australia', tas: 'Tasmania', vic: 'Victoria', wa: 'Western Australia' };
  // What each site detail asks for, under its name.
  const HINTS = {
    musterPoint: 'Where everyone meets in an emergency.',
    firstAider: 'Name and phone of the first aider on site.',
    firstAidLocation: 'Where the first aid kit or first aid room is, for example Site office, ground floor.',
    hospital: 'The hospital or medical centre with an emergency department arranged for the project.',
    scaffoldSupervisor: 'Who hands over and tags the scaffold. Leave it empty if there is no scaffold.',
    siteManager: 'Your site manager for this project, with their phone.',
    siteRules: 'One rule per line, for example Sign in at the site office before starting.',
  };

  let token = store.get(KEY);
  let me = null;
  let orgs = [];
  let page = null;
  let edit = null;
  let pendingFlash = null;
  let autoState = true;

  // A host's error (502, 503, 504), a reply that is not SiteLink's own, or no connection says so plainly
  // and by this page's name (messy round 8, stuck point 5: a 502 said "Something went wrong"). Only a
  // read is sent once more by itself; anything that changes something waits for the person to press again,
  // and the server keeps a repeat once.
  const SERVER_DOWN = 'SiteLink could not reach the server. Try again.';
  async function call(method, route, body) {
    const tries = method === 'GET' ? 2 : 1;
    let response;
    for (let attempt = 1; ; attempt += 1) {
      try {
        response = await fetch(route, {
          method,
          headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { 'X-Reviewer-Token': token } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch {
        if (attempt < tries) { await new Promise((resolve) => { setTimeout(resolve, 900); }); continue; }
        throw Object.assign(new Error(SERVER_DOWN), { status: 0, serverDown: true });
      }
      const type = (response.headers && response.headers.get && response.headers.get('content-type')) || '';
      const ours = /json/i.test(type);
      if (!ours || [502, 503, 504].includes(response.status)) {
        if (attempt < tries) { await new Promise((resolve) => { setTimeout(resolve, 900); }); continue; }
        if (!ours || response.status >= 500) throw Object.assign(new Error(SERVER_DOWN), { status: response.status, serverDown: true });
      }
      break;
    }
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && token) signedOut('You have been signed out. Sign in again to carry on.');
    if (!response.ok) throw Object.assign(new Error(data.message || 'Something went wrong. Try again.'), { status: response.status, field: data.field, fields: data.fields, conflict: data.conflict, register: data.register, taken: data.taken, support: data.support, unverified: data.unverified, limit: data.limit, replace: data.replace, tradeMismatch: data.tradeMismatch, preview: data.preview, noSteps: data.noSteps });
    return data;
  }

  const VIEWS = ['signin', 'you', 'setup', 'home', 'account', 'team', 'project-form', 'project', 'details', 'versions', 'sub-form', 'sub', 'preview'];
  function view(name) {
    for (const id of VIEWS) $(`view-${id}`).classList.toggle('hidden', id !== name);
  }
  // A green "saved" note left from before is taken away when something is refused, so it never sits
  // beside a red error (messy round 6).
  function clearOk(except = '') {
    for (const id of ['flash', 's-flash', 'acct-status', 'invite-status']) {
      const el = $(id);
      if (el && id !== except && el.querySelector(':scope > .ok')) el.innerHTML = '';
    }
  }
  function box(id, html, kind = '') {
    if (html && kind === 'bad') clearOk(id);
    $(id).innerHTML = html ? `<div class="${kind}">${html}</div>` : '';
  }
  // The support address in a message, as a link to write to it.
  const withMail = (text, email) => (email ? esc(text).split(esc(email)).join(`<a href="mailto:${esc(email)}">${esc(email)}</a>`) : esc(text));
  function flash(html, kind = 'ok') { box('flash', html, kind); }
  // replace: the page goes in place of the form just used, so Back does not open the form again
  // (messy round 9: Back after adding a subcontract showed the empty "Add a subcontract" form).
  function go(hash, message = null, kind = 'ok', { replace = false } = {}) {
    pendingFlash = message ? { message, kind } : null;
    if (location.hash === hash) route();
    else if (replace && history.replaceState) { history.replaceState(null, '', hash); route(); }
    else location.hash = hash;
  }

  function clearErrors(form) {
    form.querySelectorAll('.has-error').forEach((el) => el.classList.remove('has-error'));
    form.querySelectorAll('.field-error').forEach((el) => { el.classList.add('hidden'); el.textContent = ''; });
  }
  function fieldError(id, message, { quiet = false } = {}) {
    const input = $(id);
    const note = $(`${id}-error`);
    clearOk();
    if (input) input.classList.add('has-error');
    if (note) { note.textContent = message; note.classList.remove('hidden'); }
    if (input && !quiet) { input.scrollIntoView({ behavior: 'smooth', block: 'center' }); input.focus({ preventScroll: true }); }
  }
  // A box's red note goes once the person types in it (messy round 9: "Enter the project name." stayed
  // red under the box after the name was typed). The server says again on Save if it is still wrong.
  document.addEventListener('input', (event) => {
    const input = event.target;
    if (!input || !input.id || !input.classList || !input.classList.contains('has-error')) return;
    input.classList.remove('has-error');
    const note = $(`${input.id}-error`);
    if (note) { note.classList.add('hidden'); note.textContent = ''; }
  });
  // Every box's problem at once (messy round 6: five saves for five problems), with the first in view.
  function fieldErrors(prefix, fields) {
    const keys = Object.keys(fields || {}).filter((key) => $(`${prefix}${key}`));
    keys.forEach((key, i) => fieldError(`${prefix}${key}`, fields[key], { quiet: i > 0 }));
    return keys.length;
  }
  async function busy(button, text, fn) {
    const before = button.textContent;
    button.disabled = true;
    button.textContent = text;
    try { return await fn(); } finally { button.disabled = false; button.textContent = before; }
  }

  // ---- Signing in and out ----

  function signedOut(message = '') {
    token = '';
    me = null;
    store.set(KEY, '');
    $('who-line').classList.add('hidden');
    view('signin');
    box('signin-note', message ? esc(message) : '', 'warn');
  }

  $('signin').addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors($('signin'));
    const email = $('signin-email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { fieldError('signin-email', 'Enter a valid email address.'); return; }
    box('signin-status', '');
    await busy($('send-link'), 'Sending...', async () => {
      try {
        const data = await call('POST', '/api/hse/email', { email });
        box('signin-status', `<strong>${esc(data.message)}</strong><p>Open the email on the device you want to use, and press the link.</p>`, 'ok');
      } catch (error) {
        if (error.field === 'email') fieldError('signin-email', error.message);
        else box('signin-status', esc(error.message), 'bad');
      }
    });
    $('send-link').textContent = 'Email me another link';
  });

  $('sign-out').addEventListener('click', async () => {
    await call('POST', '/api/hse/logout').catch(() => {});
    // Unsaved site details and other typing are not left on a shared device.
    try { Object.keys(localStorage).filter((key) => key.startsWith(DRAFT_PREFIX) || key.startsWith(TYPED_PREFIX)).forEach((key) => localStorage.removeItem(key)); } catch { /* none kept */ }
    signedOut('You have signed out.');
    history.replaceState(null, '', location.pathname);
  });

  $('you-link').addEventListener('click', () => go('#/you'));

  async function loadMe() {
    const data = await call('GET', '/api/hse/me');
    me = data.me;
    orgs = data.orgs || [];
    $('who').textContent = me.name ? `${me.name} (${me.email})` : me.email;
    $('who-line').classList.remove('hidden');
  }

  // ---- Your details ----

  // Your details as typed are kept on this device until saved, so a reload loses nothing.
  const youKey = () => typedKey('you', me.email);
  function showYou() {
    view('you');
    clearErrors($('you'));
    const kept = readTyped(youKey());
    $('you-name').value = kept ? kept.name : me.name || '';
    $('you-position').value = kept ? kept.position : me.position || '';
    $('you-phone').value = kept ? kept.phone : me.phone || '';
    box('you-status', kept ? '<strong>Your changes from before are back.</strong> They are not saved yet.' : '', 'warn');
    if (!me.name) $('you-name').focus();
  }
  $('you').addEventListener('input', () => keepTyped(youKey(), { name: $('you-name').value, position: $('you-position').value, phone: $('you-phone').value }));
  $('you').addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors($('you'));
    box('you-status', '');
    if (!$('you-name').value.trim()) { fieldError('you-name', 'Enter your name.'); return; }
    try {
      const data = await call('PUT', '/api/hse/me', { name: $('you-name').value, position: $('you-position').value, phone: $('you-phone').value });
      keepTyped(youKey(), null);
      me = { ...me, ...data.me };
      $('who').textContent = `${me.name} (${me.email})`;
      go('#/', 'Your details are saved.');
    } catch (error) {
      if (error.fields && fieldErrors('you-', error.fields)) return;
      if (error.field && $(`you-${error.field}`)) fieldError(`you-${error.field}`, error.message);
      else box('you-status', esc(error.message), 'bad');
    }
  });

  // ---- Setting up the account ----

  function showSetup() {
    view('setup');
    box('setup-status', '');
  }
  // The ABN register can list another name for the ABN. The ABN cannot be changed later, so the
  // person checks it, then uses the register's name or keeps their own (the account shows Unverified).
  async function setUp(keepName = false) {
    clearErrors($('setup'));
    box('setup-status', '');
    if (!$('setup-name').value.trim()) { fieldError('setup-name', 'Enter your company name, as contractors know it.'); return; }
    if (!$('setup-abn').value.trim()) { fieldError('setup-abn', 'Enter the company\'s ABN. It links this account to your company.'); return; }
    await busy($('setup-go'), 'Checking the ABN...', async () => {
      try {
        const data = await call('POST', '/api/hse/orgs', { name: $('setup-name').value, abn: $('setup-abn').value, keepName });
        // The form goes at once: set up, it is not shown while the account loads (messy round 9: it stayed
        // about 2 seconds under "Your account is set up").
        $('view-setup').classList.add('hidden');
        await loadMe();
        go('#/', esc(data.message));
      } catch (error) {
        if (error.register && error.register.name) {
          // The register's name is said, not offered as a one-click rename (D307): the company itself
          // writes to SiteWrite to have the account checked.
          fieldError('setup-abn', 'Check this ABN.');
          box('setup-status', `<strong>${withMail(error.message, error.support)}</strong>
            <div class="actions"><button type="button" class="light" id="setup-keep">Keep ${esc($('setup-name').value.trim())} and set up</button></div>
            <p>If you keep your own name, the account shows Unverified until its name matches the ABN register. An Unverified account cannot send SWMS lists to subcontractors.</p>`, 'warn');
        } else if (error.taken) {
          // Ask the lead for me, or tell SiteWrite when no one at the company set that account up (D307).
          fieldError('setup-abn', 'This ABN already has an account.');
          const tell = error.support ? `mailto:${error.support}?subject=${encodeURIComponent(`SiteLink account with our ABN ${formatAbn($('setup-abn').value)}`)}&body=${encodeURIComponent(`Someone has already set up a SiteLink account with our company's ABN, ${formatAbn($('setup-abn').value)}. No one at our company set it up.\n\nCompany name: ${$('setup-name').value.trim()}\nMy name: ${(me && me.name) || ''}\n`)}` : '';
          box('setup-status', `<strong>${esc(error.message)}</strong>
            <div class="actions"><button type="button" class="light" id="setup-ask" data-abn="${esc($('setup-abn').value)}">Ask the lead for me</button></div>
            <div id="setup-ask-status" role="status"></div>
            <p class="meta">SiteLink emails that account's lead your name and email, and asks them to add you. It does not tell you who they are.</p>
            ${tell ? `<p>If no one at your company set up that account, <a href="${esc(tell)}" id="setup-tell">tell SiteWrite</a>. SiteWrite checks and moves the account to your company.</p>` : ''}`, 'warn');
        } else if (error.field === 'abn' && /contact SiteWrite at/.test(error.message)) {
          // Not on the register: said in full under the box, with the address as a link.
          fieldError('setup-abn', 'The ABN register does not list this ABN.');
          box('setup-status', withMail(error.message, (/at (\S+@\S+?)\.?$/.exec(error.message) || [])[1]), 'warn');
        } else if (error.field === 'name' || error.field === 'abn') fieldError(`setup-${error.field}`, error.message);
        else box('setup-status', esc(error.message), 'bad');
      }
    });
  }
  $('setup').addEventListener('submit', (event) => { event.preventDefault(); setUp(false); });
  $('setup-status').addEventListener('click', async (event) => {
    if (event.target.closest('#setup-keep')) setUp(true);
    const ask = event.target.closest('#setup-ask');
    if (!ask) return;
    await busy(ask, 'Asking...', async () => {
      try {
        const data = await call('POST', '/api/hse/ask-lead', { abn: ask.dataset.abn });
        box('setup-ask-status', esc(data.message), 'ok');
        // Asked: the reply takes the button's place, so it is seen on a phone and not asked twice.
        ask.closest('.actions').style.display = 'none';
      } catch (error) {
        box('setup-ask-status', esc(error.message), 'bad');
      }
    });
    $('setup-ask-status').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  // ---- Your projects ----

  function roleTag(role) {
    return role === 'lead' ? '<span class="tag">Lead</span>' : '<span class="tag grey">Member</span>';
  }
  // Beside the account's name: Unverified until its ABN matches the ABN register (D303).
  function checkTag(org) {
    return org.verified ? '<span class="tag" title="The ABN matches the ABN register.">Verified</span>' : '<span class="tag unverified" title="The ABN does not match the ABN register yet.">Unverified</span>';
  }

  async function showHome() {
    await loadMe();
    view('home');
    $('home').innerHTML = orgs.map((org) => `<div class="panel">
      <div class="row-line"><h2 style="margin:0">${esc(org.name)} ${checkTag(org)}</h2>${org.role === 'lead' ? '<span class="tag">You are the lead</span>' : '<span class="tag grey">You are in the team</span>'}</div>
      ${org.projects.length ? org.projects.map((project) => `<a class="project-link" href="#/project/${esc(project.id)}"><strong>${esc(project.name)}</strong><span class="meta" style="display:block">${esc(project.workplace)}</span></a>`).join('')
    : '<p class="meta">No projects yet. Make your first project, then set its site details.</p>'}
      <div class="actions"><a class="button" href="#/new/${esc(org.id)}">New project</a><a class="button light" href="#/team/${esc(org.id)}">Team</a><a class="button light" href="#/account/${esc(org.id)}">Account settings</a></div>
    </div>`).join('');
  }

  // ---- Account settings: the name, the ABN and handing over the lead (D303) ----

  let account = null;
  function renderAccount(org, team) {
    account = { org, team };
    const lead = org.role === 'lead';
    const leadPerson = team.find((person) => person.role === 'lead');
    const leadName = leadPerson ? leadPerson.name || leadPerson.email : 'the lead';
    // The register's name is shown, never offered as a one-click rename (messy round 6): an account
    // that is not that company must not take its name. The company writes to SiteWrite.
    const check = org.verified ? '' : `<div class="warn"><strong>Unverified.</strong> ${withMail(org.abnNote, org.support)}${lead && org.abn && (org.abnCheck === 'unavailable' || !org.abnCheck) ? '<div class="actions"><button type="button" class="light" id="acct-recheck">Check the ABN register again</button></div>' : ''}</div>`;
    const abnBlock = org.abn
      ? `<label>ABN</label><p class="abn-shown" id="acct-abn-shown">${esc(org.abnShown)}</p><p class="meta">The ABN links this account and cannot be changed. If it is wrong, contact SiteWrite${org.support ? ` at <a href="mailto:${esc(org.support)}">${esc(org.support)}</a>` : ''}.</p>`
      : lead ? `<label for="acct-abn">ABN <span class="hint">The company's 11 digit ABN. It links this account to your company and cannot be changed once saved.</span></label><input id="acct-abn" type="text" inputmode="numeric" maxlength="20"><p class="field-error hidden" id="acct-abn-error"></p>`
        : '<label>ABN</label><p class="meta">Not given yet.</p>';
    const others = team.filter((person) => person.role !== 'lead');
    const people = others.map((person) => {
      const who = person.name ? `<strong>${esc(person.name)}</strong><div class="meta">${esc(person.email)}</div>` : `<strong>${esc(person.email)}</strong>`;
      const action = !lead ? '' : person.joined
        ? `<button type="button" class="light" data-make-lead="${esc(person.id)}" data-who="${esc(person.name || person.email)}">Make lead</button>`
        : '<span class="meta">Invited. They can be made lead once they have signed in.</span>';
      return `<li><div class="row-line"><div>${who}</div>${action ? `<div>${action}</div>` : ''}</div></li>`;
    }).join('');
    $('account').innerHTML = `
      <h1>${esc(org.name)} ${checkTag(org)}</h1>
      <p class="meta short">Account settings. ${lead ? 'You are the lead.' : `${esc(leadName)} is the lead. Only the lead can change these settings or hand the lead role to someone else.`}</p>
      <form class="panel short" id="acct-form" novalidate>
        <h2>Company</h2>
        ${lead ? `<label for="acct-name">Company name <span class="hint">As contractors know it. Contractors see it on the site details you set.</span></label>
        <input id="acct-name" type="text" autocomplete="organization" maxlength="200" value="${esc(org.name)}">
        <p class="field-error hidden" id="acct-name-error"></p>` : `<label>Company name</label><p class="abn-shown">${esc(org.name)}</p>`}
        ${abnBlock}
        ${check}
        ${lead ? '<div class="actions"><button type="submit" id="acct-save">Save</button></div>' : ''}
        <div id="acct-status" role="status"></div>
      </form>
      <div class="panel short">
        <h2>Lead</h2>
        <p class="meta">There is always one lead. The lead adds and removes people, changes these settings and can hand the lead role to someone else in the team.</p>
        <p><strong>${esc(leadName)}</strong> ${roleTag('lead')}${leadPerson && leadPerson.email === me.email ? ' <span class="meta">(you)</span>' : ''}</p>
        ${others.length ? `<ul class="plain" id="acct-people">${people}</ul>` : `<p class="meta">No one else is in the team yet. <a href="#/team/${esc(org.id)}">Add people on the team page</a>.</p>`}
        ${lead && others.length && !others.some((person) => person.joined) ? '<p class="meta">You can make someone lead once they have signed in.</p>' : ''}
        <div id="acct-lead-status" role="status"></div>
      </div>
      ${lead ? '' : `<div class="panel short"><h2>Leave this team</h2><p class="meta">You will no longer see ${esc(org.name)}'s projects. The lead can add you again.</p><div class="actions"><button type="button" class="danger" data-leave="${esc(org.id)}">Leave this team</button></div><div id="acct-leave-status" role="status"></div></div>`}`;
  }
  async function showAccount(orgId) {
    const data = await call('GET', `/api/hse/orgs/${encodeURIComponent(orgId)}`);
    view('account');
    document.title = `${data.org.name}: SiteLink`;
    renderAccount(data.org, data.team);
  }
  async function saveAccount(name) {
    const form = $('acct-form');
    clearErrors(form);
    box('acct-status', '');
    if (!name.trim()) { fieldError('acct-name', 'Enter your company name, as contractors know it.'); return; }
    const body = { name };
    if ($('acct-abn')) body.abn = $('acct-abn').value;
    await busy($('acct-save'), 'Saving...', async () => {
      try {
        const data = await call('PUT', `/api/hse/orgs/${encodeURIComponent(account.org.id)}`, body);
        renderAccount(data.org, data.team);
        box('acct-status', esc(data.message), data.org.verified ? 'ok' : 'warn');
      } catch (error) {
        if (error.field === 'name' && $('acct-name')) fieldError('acct-name', error.message);
        else if (error.field === 'abn' && $('acct-abn')) fieldError('acct-abn', error.message);
        else box('acct-status', esc(error.message), 'bad');
      }
    });
  }
  $('account').addEventListener('submit', (event) => {
    event.preventDefault();
    if (event.target.id === 'acct-form') saveAccount($('acct-name').value);
  });
  $('account').addEventListener('click', async (event) => {
    const recheck = event.target.closest('#acct-recheck');
    const makeLead = event.target.closest('[data-make-lead]');
    const leave = event.target.closest('[data-leave]');
    if (leave) {
      await leaveTeam(account.org, leave, 'acct-leave-status');
    } else if (recheck) {
      await busy(recheck, 'Checking...', async () => {
        try {
          const data = await call('POST', `/api/hse/orgs/${encodeURIComponent(account.org.id)}/abn-check`);
          renderAccount(data.org, account.team);
          box('acct-status', esc(data.message), data.org.verified ? 'ok' : 'warn');
        } catch (error) {
          box('acct-status', esc(error.message), 'bad');
        }
      });
    } else if (makeLead) {
      const who = makeLead.dataset.who;
      if (!window.confirm(`Make ${who} the lead of ${account.org.name}? You will become a member. Only ${who} will then be able to add or remove people, change the account name or hand the lead role on.`)) return;
      makeLead.disabled = true;
      try {
        const data = await call('POST', `/api/hse/orgs/${encodeURIComponent(account.org.id)}/members/${encodeURIComponent(makeLead.dataset.makeLead)}/lead`);
        renderAccount(data.org, data.team);
        orgs = orgs.map((org) => (org.id === data.org.id ? { ...org, role: 'member' } : org));
        box('acct-lead-status', esc(data.message), 'ok');
      } catch (error) {
        makeLead.disabled = false;
        box('acct-lead-status', esc(error.message), 'bad');
      }
    }
  });

  // A member leaves the team, after a confirm. The lead hands over the lead role first.
  async function leaveTeam(org, button, statusId) {
    if (!window.confirm(`Leave ${org.name}? You will no longer see its projects. The lead can add you again.`)) return;
    button.disabled = true;
    try {
      const data = await call('POST', `/api/hse/orgs/${encodeURIComponent(org.id)}/leave`);
      orgs = orgs.filter((one) => one.id !== org.id);
      go('#/', esc(data.message));
    } catch (error) {
      button.disabled = false;
      box(statusId, esc(error.message), 'bad');
    }
  }

  // ---- The team ----

  let teamOrg = null;
  function personLine(person, lead, mine) {
    const who = person.name ? `<strong>${esc(person.name)}</strong>${person.position ? `, ${esc(person.position)}` : ''}` : `<strong>${esc(person.email)}</strong>`;
    const status = person.joined ? '' : `<div class="meta">Invited on ${esc(person.invitedOn)}. Not signed in yet.</div>`;
    const buttons = !lead || person.role === 'lead' ? '' : person.joined
      ? `<button type="button" class="danger" data-remove="${esc(person.id)}" data-who="${esc(person.name || person.email)}">Remove</button>`
      : `<button type="button" class="light" data-resend="${esc(person.email)}">Send again</button> <button type="button" class="danger" data-cancel="${esc(person.id)}" data-who="${esc(person.email)}">Cancel invitation</button>`;
    return `<li><div class="row-line"><div>${who} ${person.role === 'lead' ? roleTag('lead') : person.joined ? roleTag('member') : '<span class="tag grey">Invited</span>'}${mine ? ' <span class="meta">(you)</span>' : ''}
      ${person.name ? `<div class="meta">${esc(person.email)}</div>` : ''}${status}</div>${buttons ? `<div>${buttons}</div>` : ''}</div></li>`;
  }
  function renderTeam(team) {
    const lead = teamOrg.role === 'lead';
    $('team-list').innerHTML = team.map((person) => personLine(person, lead, person.email === me.email)).join('');
    const leadPerson = team.find((person) => person.role === 'lead');
    $('team-intro').textContent = lead ? 'You are the lead. You add and remove people.' : `Only the lead${leadPerson ? `, ${leadPerson.name || leadPerson.email},` : ''} can add or remove people.`;
    $('invite').classList.toggle('hidden', !lead);
    $('team-leave').classList.toggle('hidden', lead);
    box('team-leave-status', '');
  }
  $('team-leave-go').addEventListener('click', () => leaveTeam(teamOrg, $('team-leave-go'), 'team-leave-status'));
  async function showTeam(orgId) {
    const data = await call('GET', `/api/hse/orgs/${encodeURIComponent(orgId)}`);
    teamOrg = data.org;
    view('team');
    $('team-title').innerHTML = `${esc(data.org.name)}: team ${checkTag(data.org)}`;
    $('team-settings').href = `#/account/${data.org.id}`;
    box('invite-status', '');
    box('invite-hint', '');
    renderTeam(data.team);
  }

  // A likely slip in an email address ("gmial.com", ".con", ".com.ua"), offered as a suggestion only.
  const DOMAIN_FIX = { 'gmial.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com', 'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'outlok.com': 'outlook.com', 'outloo.com': 'outlook.com', 'bigpond.con': 'bigpond.com', 'iclod.com': 'icloud.com' };
  function emailSlip(value) {
    const email = String(value || '').trim().toLowerCase();
    const at = email.lastIndexOf('@');
    if (at < 1) return '';
    const local = email.slice(0, at);
    let domain = email.slice(at + 1);
    if (DOMAIN_FIX[domain]) domain = DOMAIN_FIX[domain];
    domain = domain.replace(/\.(?:con|cmo|ocm|comm|vom|xom)(\.au)?$/, '.com$1').replace(/\.com\.(?:ua|u|aus)$/, '.com.au').replace(/\.(?:cpm|cim)\.au$/, '.com.au').replace(/\.au\.com$/, '.com.au');
    const fixed = `${local}@${domain}`;
    return fixed !== email ? fixed : '';
  }
  $('invite-email').addEventListener('input', () => {
    const slip = emailSlip($('invite-email').value);
    box('invite-hint', slip ? `Check the email. Did you mean <strong>${esc(slip)}</strong>? <button type="button" class="link" id="use-slip">Use it</button>` : '', 'warn');
  });
  $('invite-hint').addEventListener('click', (event) => {
    if (!event.target.closest('#use-slip')) return;
    $('invite-email').value = emailSlip($('invite-email').value);
    box('invite-hint', '');
  });
  async function sendInvite(email) {
    const data = await call('POST', `/api/hse/orgs/${encodeURIComponent(teamOrg.id)}/members`, { email });
    renderTeam(data.team);
    box('invite-status', `<strong>${esc(data.message)}</strong><p>Check the email above is right. If it is not, press Cancel invitation and add the right one.</p>`, 'ok');
  }
  $('invite').addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors($('invite'));
    box('invite-status', '');
    const email = $('invite-email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { fieldError('invite-email', 'Enter a valid email address.'); return; }
    await busy($('invite-send'), 'Sending...', async () => {
      try {
        await sendInvite(email);
        $('invite-email').value = '';
        box('invite-hint', '');
      } catch (error) {
        if (error.field === 'email') fieldError('invite-email', error.message);
        else box('invite-status', esc(error.message), 'bad');
      }
    });
  });
  $('team-list').addEventListener('click', async (event) => {
    const remove = event.target.closest('[data-remove], [data-cancel]');
    const resend = event.target.closest('[data-resend]');
    try {
      if (resend) {
        resend.disabled = true;
        await sendInvite(resend.dataset.resend);
      } else if (remove) {
        const id = remove.dataset.remove || remove.dataset.cancel;
        const ask = remove.dataset.remove ? `Remove ${remove.dataset.who} from the team? They will no longer see your projects.` : `Cancel the invitation to ${remove.dataset.who}?`;
        if (!window.confirm(ask)) return;
        remove.disabled = true;
        const data = await call('DELETE', `/api/hse/orgs/${encodeURIComponent(teamOrg.id)}/members/${encodeURIComponent(id)}`);
        renderTeam(data.team);
        box('invite-status', esc(data.message), 'ok');
      }
    } catch (error) {
      box('invite-status', esc(error.message), 'bad');
    }
  });

  // ---- A new project, or a project's own details ----

  let formProject = null;
  let formOrg = null;
  async function showProjectForm(orgId, projectId) {
    clearErrors($('project-form'));
    box('pf-status', '');
    autoState = true;
    if (projectId) {
      page = await call('GET', `/api/hse/projects/${encodeURIComponent(projectId)}`);
      formProject = page.project;
      formOrg = page.org;
      $('pf-title').textContent = 'Project details';
      $('pf-crumbs').innerHTML = `<a href="#/">Your projects</a> › <a href="#/project/${esc(formProject.id)}">${esc(formProject.name)}</a>`;
      $('pf-name').value = formProject.name;
      $('pf-workplace').value = formProject.workplace;
      $('pf-state').value = formProject.state;
      $('pf-pc').value = formProject.pcName;
      $('pf-save').textContent = 'Save';
      $('pf-cancel').href = `#/project/${formProject.id}`;
      autoState = false;
      $('pf-state-note').textContent = '';
    } else {
      await loadMe();
      formProject = null;
      formOrg = orgs.find((org) => org.id === orgId);
      if (!formOrg) throw Object.assign(new Error('That account was not found, or you are not in its team.'), { status: 404 });
      $('pf-title').textContent = `New project for ${formOrg.name}`;
      $('pf-crumbs').innerHTML = '<a href="#/">Your projects</a>';
      for (const id of ['pf-name', 'pf-workplace', 'pf-state']) $(id).value = '';
      $('pf-pc').value = formOrg.name;
      $('pf-save').textContent = 'Make the project';
      $('pf-cancel').href = '#/';
      $('pf-state-note').textContent = '';
    }
    view('project-form');
  }
  // The state is read from the address as the SWMS app reads a typed one: a state named in any case
  // ("hamilton qld", "qld"), a postcode, or a city (messy round 6: only a postcode set it). The note
  // under the box says what was read, so it can be checked.
  function readState() {
    const A = window.SiteWriteAddress;
    const note = $('pf-state-note');
    if (!A) return;
    const found = A.stateFromTyped($('pf-workplace').value);
    // A state read while the address was still being typed ("120 wa" for "120 wattle") is taken back
    // when the address no longer says it; a state the person chose is kept.
    if (autoState) $('pf-state').value = found.state || '';
    const chosen = $('pf-state').value;
    // A state read from the address answers "Choose the state or territory": its red note goes (messy round 15,
    // SiteLink: "The address does not say it." stayed in red after the state was read).
    if (chosen && $('pf-state').classList.contains('has-error')) {
      $('pf-state').classList.remove('has-error');
      const said = $('pf-state-error');
      if (said) { said.classList.add('hidden'); said.textContent = ''; }
    }
    if (!$('pf-workplace').value.trim()) note.textContent = '';
    else if (found.state && chosen === found.state) note.textContent = `State read from the address: ${STATE_NAME[found.state]}.${found.from === 'postcode' ? ' Read from the postcode: check it is right.' : ''}`;
    else if (found.state && chosen && chosen !== found.state) note.textContent = `The address reads as ${STATE_NAME[found.state]}, but ${STATE_NAME[chosen]} is chosen. The law where the work is done applies.`;
    else if (!chosen) note.textContent = 'The address does not say its state yet. Pick it from the list, add the state, or choose it below.';
    else note.textContent = '';
  }
  $('pf-state').addEventListener('change', () => { autoState = false; readState(); });

  // Address suggestions under the job address box, from the same lookup the SWMS app uses (places.js).
  function addressLookup(input, list, onPick) {
    let picks = [];
    let active = -1;
    let timer = null;
    let seq = 0;
    const close = () => { list.classList.add('hidden'); list.innerHTML = ''; input.setAttribute('aria-expanded', 'false'); picks = []; active = -1; };
    const show = () => {
      if (!picks.length || document.activeElement !== input) { close(); return; }
      list.innerHTML = picks.map((item, i) => `<li role="option" id="${list.id}-${i}" aria-selected="${i === active}" data-i="${i}">${esc(item.text)}</li>`).join('');
      list.classList.remove('hidden');
      input.setAttribute('aria-expanded', 'true');
    };
    const choose = (i) => {
      const item = picks[i];
      if (!item) return;
      input.value = item.text;
      close();
      autoState = true;
      onPick();
    };
    const lookUp = async (text) => {
      const mine = ++seq;
      try {
        const response = await fetch(`/api/address?q=${encodeURIComponent(text)}`);
        if (!response.ok) return;
        const data = await response.json();
        if (mine !== seq || input.value !== text) return;
        picks = (data.suggestions || []).slice(0, 6);
        active = -1;
        show();
      } catch {
        // Without suggestions the address is typed in full.
      }
    };
    input.addEventListener('input', () => {
      clearTimeout(timer);
      onPick();
      if (input.value.trim().length < 3) { close(); return; }
      timer = setTimeout(() => lookUp(input.value), 300);
    });
    input.addEventListener('keydown', (event) => {
      if (list.classList.contains('hidden')) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        active = (active + (event.key === 'ArrowDown' ? 1 : -1) + picks.length) % picks.length;
        show();
        input.setAttribute('aria-activedescendant', `${list.id}-${active}`);
      } else if (event.key === 'Enter' && active >= 0) {
        event.preventDefault();
        choose(active);
      } else if (event.key === 'Escape') close();
    });
    list.addEventListener('mousedown', (event) => {
      const li = event.target.closest('li[data-i]');
      if (!li) return;
      event.preventDefault();
      choose(Number(li.dataset.i));
    });
    input.addEventListener('blur', () => setTimeout(close, 150));
  }
  addressLookup($('pf-workplace'), $('pf-workplace-list'), readState);
  $('project-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors($('project-form'));
    box('pf-status', '');
    const body = { name: $('pf-name').value, workplace: $('pf-workplace').value, state: $('pf-state').value, pcName: $('pf-pc').value };
    if (!body.name.trim()) { fieldError('pf-name', 'Enter the project name.'); return; }
    if (!body.workplace.trim()) { fieldError('pf-workplace', 'Enter the job address.'); return; }
    if (!body.state && window.SiteWriteAddress) body.state = window.SiteWriteAddress.stateFromTyped(body.workplace).state || '';
    if (!body.state) { fieldError('pf-state', 'Choose the state or territory the work is in. The address does not say it.'); return; }
    await busy($('pf-save'), 'Saving...', async () => {
      try {
        if (formProject) {
          await call('PUT', `/api/hse/projects/${encodeURIComponent(formProject.id)}`, body);
          go(`#/project/${formProject.id}`, 'The project details are saved.');
        } else {
          const { project } = await call('POST', `/api/hse/orgs/${encodeURIComponent(formOrg.id)}/projects`, body);
          go(`#/project/${project.id}`, 'The project is made. Now set its site details.', 'ok', { replace: true });
        }
      } catch (error) {
        if (['name', 'workplace', 'state'].includes(error.field)) fieldError(`pf-${error.field}`, error.message);
        else box('pf-status', esc(error.message), 'bad');
      }
    });
  });

  // ---- The project screen ----

  const isList = (field) => Boolean(field.list);
  const valueOf = (details, field) => (details ? details[field.key] : isList(field) ? [] : '');
  const blank = (value) => (Array.isArray(value) ? !value.length : !String(value || '').trim());

  function detailsList(fields, details) {
    return fields.map((field) => {
      const value = valueOf(details, field);
      if (blank(value)) return `<dt>${esc(field.label)}</dt><dd class="unset">Not set</dd>`;
      return `<dt>${esc(field.label)}</dt><dd>${isList(field) ? `<ul>${value.map((rule) => `<li>${esc(rule)}</li>`).join('')}</ul>` : esc(value)}</dd>`;
    }).join('');
  }

  function readDraft(projectId) {
    try { return JSON.parse(store.get(`${DRAFT_PREFIX}${projectId}`) || 'null'); } catch { return null; }
  }

  async function showProject(projectId) {
    page = await call('GET', `/api/hse/projects/${encodeURIComponent(projectId)}`);
    const { project, siteDetails, versions, team, log, fields } = page;
    const id = project.id;
    view('project');
    document.title = `${project.name}: SiteLink`;
    $('p-name').textContent = project.name;
    $('p-meta').textContent = `${project.workplace} · ${STATE_NAME[project.state] || project.state} · Principal contractor: ${project.pcName}`;
    $('p-edit').href = `#/project/${id}/edit`;
    box('p-draft', readDraft(id) ? `<strong>Your changes to the site details are not saved yet.</strong> <a href="#/project/${esc(id)}/details">Carry on with them</a>` : '', 'warn');
    // A teammate's newer version changed a detail this person set (messy round 6).
    const replaced = page.replaced;
    box('p-replaced', replaced ? `<strong>${esc(replaced.by)} saved version ${esc(replaced.rev)} and changed ${esc(replaced.details.join(', '))}, which you had set.</strong> <a href="#/project/${esc(id)}/versions">See the versions</a>` : '', 'warn');
    const set = siteDetails.rev > 0;
    $('p-rev').textContent = set ? `Version ${siteDetails.rev}` : 'Not set yet';
    $('p-set').textContent = set ? `Set by ${siteDetails.setBy} on ${siteDetails.setOn}.` : 'Set them once here. Contractors on this project use them on their SWMS.';
    const missing = fields.filter((field) => field.key !== 'scaffoldSupervisor' && blank(valueOf(siteDetails.details, field)));
    box('p-missing', set && missing.length ? `Still to set: ${esc(missing.map((field) => field.label.toLowerCase()).join(', '))}.` : '', 'warn');
    $('p-details').innerHTML = detailsList(fields, siteDetails.details);
    $('p-change').href = `#/project/${id}/details`;
    $('p-change').textContent = set ? 'Change site details' : 'Set site details';
    $('p-versions').href = `#/project/${id}/versions`;
    $('p-versions').textContent = `All versions (${versions.length})`;
    $('p-versions').classList.toggle('hidden', !versions.length);
    $('p-team').innerHTML = team.filter((person) => person.joined).map((person) => `<li>${esc(person.name || person.email)}${person.position ? `, <span class="meta">${esc(person.position)}</span>` : ''} ${person.role === 'lead' ? roleTag('lead') : ''}</li>`).join('');
    $('p-team-link').href = `#/team/${page.org.id}`;
    $('p-team-link').textContent = page.org.role === 'lead' ? 'Manage the team' : 'See the team';
    $('p-log').innerHTML = log.map((entry) => `<li><span class="when">${esc(entry.when)}</span>${esc(entry.text)}</li>`).join('');
    renderSubs(page);
  }

  // ---- The project's subcontracts (stage 4) ----

  const SCOPE_STATE = { none: 'No scope yet', reading: 'Reading the scope', done: 'Scope read', failed: 'The reading stopped' };
  function readingsLine(readings) {
    if (!readings) return '';
    return readings.left ? `Free AI readings on this project: ${readings.used} of ${readings.limit} used. The same file again is free.` : `${readings.message} A file already read for your account can still be used, at no cost.`;
  }
  function renderSubs(data) {
    const id = data.project.id;
    $('p-add-sub').href = `#/project/${id}/subs/new`;
    const readings = data.readings;
    $('p-readings').textContent = readingsLine(readings);
    $('p-readings').className = readings && !readings.left ? 'limit-note' : 'meta';
    const subs = data.subcontracts || [];
    $('p-subs').innerHTML = subs.length ? subs.map((sub) => {
      const off = [sub.folded ? `${sub.folded} in another SWMS` : '', sub.removed ? `${sub.removed} removed` : '', sub.aside ? `${sub.aside} may not need one` : ''].filter(Boolean).join(', ');
      const list = !sub.swms && !sub.removed && !sub.aside && !sub.folded ? (sub.scope === 'reading' ? 'Not listed yet' : 'None yet') : `${sub.swms} SWMS${off ? ` (${off})` : ''}${sub.pointsOpen ? `<span class="scope-state">${sub.pointsOpen} ${sub.pointsOpen === 1 ? 'point' : 'points'} to answer</span>` : ''}`;
      // Stage 5: whether the list has gone, its due date, and whether it was opened or taken up.
      const sent = sub.sentOn ? `Sent ${esc(sub.sentOn)}, due ${esc(sub.due)}${sub.claimedName ? `. Taken up by ${esc(sub.claimedName)}${sub.claimedMismatch ? ` <span class="tag warn">Not the name on the subcontract: check it</span>` : ''}` : sub.opened ? '. Opened' : sub.openedUnknown ? '. Link opened by someone not signed in' : '. Not opened yet'}` : 'Not sent yet';
      // Stage 7: how many are in, their reviews and conditions (the one screen, below, lists each SWMS).
      const s7 = sub.stage7 || { in: 0, toReview: 0, approved: 0, notApproved: 0, conditionsOpen: 0, toConfirm: 0, off: 0, items: [] };
      const filesIn = sub.swms ? `${s7.in} of ${sub.swms} in${s7.uploaded ? `<span class="scope-state">${s7.uploaded === 1 ? 'One file' : `${s7.uploaded} files`} uploaded to record</span>` : ''}${s7.off ? `<span class="scope-state">${s7.off} taken off its list: not submitted</span>` : ''}` : 'None yet';
      const reviewed = [s7.toReview ? `${s7.toReview} to review` : '', s7.approved ? `${s7.approved} approved` : '', s7.notApproved ? `${s7.notApproved} not approved` : ''].filter(Boolean).join(', ') || (s7.in ? 'None reviewed yet' : 'None in yet');
      const conditions = [s7.conditionsOpen ? `${s7.conditionsOpen} open` : '', s7.toConfirm ? `${s7.toConfirm} to confirm` : ''].filter(Boolean).join(', ') || 'None';
      const last = sub.lastContact ? `${esc(sub.lastContact.text)}, ${esc(sub.lastContact.on)}` : 'None yet';
      return `<tr><td class="sub-name"><a href="#/sub/${esc(sub.id)}">${esc(sub.name)}</a><span class="scope-state">${esc(sub.trade)} · ${esc(SCOPE_STATE[sub.scope] || SCOPE_STATE.none)}</span></td>
        <td data-label="SWMS list">${list}<span class="scope-state">${sent}</span></td><td data-label="SWMS in">${filesIn}</td><td data-label="Review status">${esc(reviewed)}</td><td data-label="Conditions outstanding">${esc(conditions)}</td><td data-label="Updated after plan change">No plans yet</td><td data-label="Last contact">${last}</td></tr>`;
    }).join('') : '<tr><td class="empty" colspan="7">No subcontractors yet. Add each subcontract and upload its scope of works. SiteLink lists the SWMS each one needs.</td></tr>';
    renderSwms(data);
  }

  // ---- The one screen (stage 7): every SWMS on the project, with what to chase ----
  // Each SWMS on each subcontractor's list: whether it is in and how, its review, conditions open or to
  // confirm, the details it changed that you set, a SWMS the subcontractor took off its list, and the
  // workers signed on to the revision submitted. Filters narrow it, on a phone too.
  const FILTERS = [
    ['all', 'All'], ['none', 'Not in'], ['review', 'To review'], ['conditions', 'Conditions open'], ['confirm', 'To confirm'], ['changed', 'Changed your details'], ['changes', 'Not approved'],
  ];
  let swmsFilter = 'all';
  const tagsOf = (row) => [
    'all',
    ...(['none', 'off'].includes(row.state) ? ['none'] : []),
    ...(row.submissionId && !row.review ? ['review'] : []),
    ...(row.conditionsOpen ? ['conditions'] : []),
    ...(row.toConfirm ? ['confirm'] : []),
    ...(row.overrides.length ? ['changed'] : []),
    ...(row.review && row.review.response === 'changes' ? ['changes'] : []),
  ];
  const REVIEW_TAG = { approved: 'ok', conditions: 'ok', changes: 'bad' };
  function swmsRow(sub, row) {
    const pills = [];
    if (row.state === 'sitewrite') pills.push(`<span class="tag">In: revision ${esc(row.revision)}</span>`);
    else if (row.state === 'outside') pills.push('<span class="tag">In: received outside SiteWrite</span>');
    else if (row.state === 'uploaded') pills.push('<span class="tag warn">File uploaded: record it</span>');
    else if (row.state === 'off') pills.push('<span class="tag warn">Not submitted: taken off its list</span>');
    else pills.push('<span class="tag grey">Not in yet</span>');
    if (row.review) pills.push(`<span class="tag ${REVIEW_TAG[row.review.response] || ''}">${esc(row.review.label)}</span>`);
    else if (row.submissionId) pills.push('<span class="tag due">To review</span>');
    if (row.conditionsOpen) pills.push(`<span class="tag warn">${row.conditionsOpen} ${row.conditionsOpen === 1 ? 'condition' : 'conditions'} open</span>`);
    if (row.toConfirm) pills.push(`<span class="tag due">${row.toConfirm} to confirm</span>`);
    if (row.conditionsMet) pills.push('<span class="tag">Conditions met</span>');
    if (row.overrides.length) pills.push(`<span class="tag warn">Changed ${row.overrides.length === 1 ? 'a detail' : `${row.overrides.length} details`} you set</span>`);
    const lines = [];
    if (row.submissionId) lines.push(`${row.state === 'outside' ? 'Recorded' : 'Submitted'} ${esc(row.on)}${row.by ? ` by ${esc(row.by)}` : ''}.${row.review ? ` ${esc(row.review.label)} by ${esc(row.review.by)}, ${esc(row.review.on)}.` : row.reviewedBefore ? ` A later revision: the one before was ${esc(row.reviewedBefore)}.` : ''}`);
    if (row.overrides.length) lines.push(`Changed: ${row.overrides.map((item) => `${esc(item.label.toLowerCase())} ("${esc(item.now || 'empty')}", you set "${esc(item.set)}"${item.olderRev ? `, as in version ${esc(item.olderRev)}` : ''})`).join('; ')}.`);
    if (row.signOns !== null && row.signOns !== undefined) lines.push(`Workers signed on to this revision: ${esc(row.signOns)}.`);
    if (row.checkStatus === 'reading') lines.push('Builder check is reading the file.');
    const action = row.submissionId
      ? `<a class="button light small" href="/review.html?submission=${esc(row.submissionId)}" aria-label="${esc(`${row.review ? 'Open' : 'Review'} ${row.title} from ${sub.name}`)}">${row.review && !row.toConfirm ? 'Open' : 'Review'}</a>`
      // "Record it" is named so for a screen reader, and opens the subcontract at that SWMS's file (messy
      // round 8: it was named "Chase ..." and opened the top of the page).
      : row.state === 'uploaded'
        ? `<a class="button light small" href="#/sub/${esc(sub.id)}/item/${esc(row.id)}" aria-label="${esc(`Record the file uploaded for ${row.title} from ${sub.name}`)}">Record it</a>`
        // Nothing to chase before the list has gone (messy round 9: "Chase" showed on every SWMS of a
        // list not sent).
        : !sub.sentOn
          ? `<a class="button light small" href="#/sub/${esc(sub.id)}" aria-label="${esc(`Send the list to ${sub.name}`)}">Send the list</a>`
          : `<a class="button light small" href="#/sub/${esc(sub.id)}" aria-label="${esc(`Chase ${row.title} from ${sub.name}`)}">Chase</a>`;
    return `<li class="swms-row" data-tags="${esc(tagsOf(row).join(' '))}"><div class="swms-what"><strong>${esc(row.title)}</strong><span class="meta">${esc(sub.name)}</span></div>
      <div class="swms-tags">${pills.join(' ')}</div>${lines.length ? `<p class="meta">${lines.join(' ')}</p>` : ''}<div class="swms-go">${action}</div></li>`;
  }
  function renderSwms(data) {
    const subs = (data.subcontracts || []).filter((sub) => sub.stage7 && sub.stage7.items.length);
    const rows = subs.flatMap((sub) => sub.stage7.items.map((row) => ({ sub, row })));
    if (!rows.length) {
      $('p-swms-filters').innerHTML = '';
      $('p-swms').innerHTML = '<li class="meta">No SWMS lists yet. Each subcontractor\'s SWMS show here once its list is made: whether each is in, its review, and any conditions.</li>';
      return;
    }
    const count = (key) => rows.filter(({ row }) => tagsOf(row).includes(key)).length;
    if (!FILTERS.some(([key]) => key === swmsFilter)) swmsFilter = 'all';
    $('p-swms-filters').innerHTML = FILTERS.map(([key, label]) => `<button type="button" class="chip" data-swms-filter="${key}" aria-pressed="${key === swmsFilter}">${esc(label)} (${count(key)})</button>`).join('');
    const shown = rows.filter(({ row }) => tagsOf(row).includes(swmsFilter));
    $('p-swms').innerHTML = shown.length ? shown.map(({ sub, row }) => swmsRow(sub, row)).join('') : `<li class="meta">No SWMS ${esc((FILTERS.find(([key]) => key === swmsFilter) || [, ''])[1].toLowerCase())} just now.</li>`;
  }
  $('p-swms-filters').addEventListener('click', (event) => {
    const button = event.target.closest('[data-swms-filter]');
    if (!button || !page) return;
    swmsFilter = button.dataset.swmsFilter;
    renderSwms(page);
  });

  // ---- Adding a subcontract, or changing its details ----

  let subForm = null;
  async function showSubForm(projectId, subId) {
    clearErrors($('sub-form'));
    box('sf-status', '');
    if (subId) {
      const data = await call('GET', `/api/hse/subcontracts/${encodeURIComponent(subId)}`);
      subForm = { projectId: data.project.id, subId };
      $('sf-title').textContent = 'Subcontract details';
      $('sf-crumbs').innerHTML = `<a href="#/">Your projects</a> › <a href="#/project/${esc(data.project.id)}">${esc(data.project.name)}</a> › <a href="#/sub/${esc(subId)}">${esc(data.subcontract.name)}</a>`;
      $('sf-name').value = data.subcontract.name;
      $('sf-trade').value = data.subcontract.trade;
      $('sf-email').value = data.subcontract.email;
      $('sf-abn').value = formatAbn(data.subcontract.abn || '');
      $('sf-save').textContent = 'Save';
      $('sf-cancel').href = `#/sub/${subId}`;
    } else {
      const data = await call('GET', `/api/hse/projects/${encodeURIComponent(projectId)}`);
      subForm = { projectId: data.project.id, subId: null };
      $('sf-title').textContent = 'Add a subcontract';
      $('sf-crumbs').innerHTML = `<a href="#/">Your projects</a> › <a href="#/project/${esc(data.project.id)}">${esc(data.project.name)}</a>`;
      for (const id of ['sf-name', 'sf-trade', 'sf-email', 'sf-abn']) $(id).value = '';
      $('sf-save').textContent = 'Add the subcontract';
      $('sf-cancel').href = `#/project/${data.project.id}`;
    }
    view('sub-form');
  }
  $('sub-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors($('sub-form'));
    box('sf-status', '');
    const body = { name: $('sf-name').value, trade: $('sf-trade').value, email: $('sf-email').value, abn: $('sf-abn').value };
    if (!body.name.trim()) { fieldError('sf-name', 'Enter the subcontractor\'s company name.'); return; }
    if (!body.trade.trim()) { fieldError('sf-trade', 'Enter the trade, for example Formwork or Electrical.'); return; }
    await busy($('sf-save'), 'Saving...', async () => {
      try {
        if (subForm.subId) {
          await call('PUT', `/api/hse/subcontracts/${encodeURIComponent(subForm.subId)}`, body);
          go(`#/sub/${subForm.subId}`, 'The subcontract details are saved.');
        } else {
          const data = await call('POST', `/api/hse/projects/${encodeURIComponent(subForm.projectId)}/subcontracts`, body);
          go(`#/sub/${data.subcontract.id}`, `${esc(data.subcontract.name)} is added. Now upload its scope of works.`, 'ok', { replace: true });
        }
      } catch (error) {
        if (['name', 'trade', 'email', 'abn'].includes(error.field)) fieldError(`sf-${error.field}`, error.message);
        else box('sf-status', esc(error.message), 'bad');
      }
    });
  });

  // ---- A subcontract: its scope, its SWMS list and its points to confirm ----

  let sub = null;
  let poll = null;
  let tracker = null;
  let watching = false;
  function stopPoll() {
    if (poll) clearTimeout(poll);
    poll = null;
    if (tracker) tracker.stop();
    tracker = null;
  }
  const ACCEPTED = /\.(docx|pdf|txt)$/i;
  const NOT_A_SCOPE = 'SiteLink reads a scope from a Word file (.docx), a PDF or a text file. A photo or picture of a scope cannot be read.';
  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('The file could not be read.'));
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.readAsDataURL(file);
    });
  }
  // "clause 1.2", but "clauses 1.3, 1.4" when one entry names two.
  const clauseWord = (list) => (list.length === 1 && !/[,;&]|\band\b/.test(list[0]) ? 'clause' : 'clauses');
  // "Also covers: cells and secure areas, cast-in items and access equipment." The package names read as
  // a list: "Trade installation:" is taken off, and each starts in lower case (messy round 7).
  const coversList = (list) => { const names = list.map((name) => String(name).replace(/^trade installation:\s*/i, '').replace(/^./, (letter) => letter.toLowerCase())); return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || ''; };
  // Every line of the flag: "needs a SWMS by law" names only what is certain, and what may also be high
  // risk work follows with what it depends on (messy round 7).
  // The lead is the builder: "The builder may still ask for a SWMS" is never said to it, on the list either
  // (messy round 11, SiteLink wording 4: an item moved onto the list still said it).
  const hrcwLine = (flag) => (flag ? `<span class="hrcw hrcw-${esc(flag.status)}"><strong>${esc(flag.heading)}.</strong>${(flag.lines || []).filter((line) => line && !/^the builder may still ask\b/i.test(line)).map((line) => ` ${esc(line)}.`).join('')}</span>` : '');

  function uploadBlock(again) {
    return `<label for="s-file">${again ? 'A different scope for this subcontract' : 'The scope of works'} <span class="hint">A Word file (.docx) or a PDF with typed text.</span></label>
      <input id="s-file" type="file" accept=".docx,.pdf,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain">
      <p class="field-error hidden" id="s-file-error"></p>
      <div class="actions"><button type="button" id="s-read">Read the scope</button></div>
      <p class="${sub.readings && !sub.readings.left ? 'limit-note' : 'meta'}" id="s-readings">${esc(readingsLine(sub.readings))}</p>`;
  }

  function renderScope() {
    const { reading, subcontract } = sub;
    const same = sub.sameFile && sub.sameFile.length ? `<p class="meta">The same file is the scope for ${esc(sub.sameFile.join(', '))}. It was read once.</p>` : '';
    let html = '<h2>Scope of works</h2>';
    if (reading.status === 'none') {
      html += `<p class="meta">Upload the subcontract's scope of works. SiteLink reads it once and lists the SWMS this subcontract needs. Prices, rates and amounts in it are never passed on.</p>${uploadBlock(false)}`;
    } else if (reading.status === 'reading') {
      html += `<p class="meta">${esc(subcontract.docName)}, uploaded by ${esc(subcontract.scopeBy)} on ${esc(subcontract.scopeOn)}.</p><div id="s-progress"></div>`;
    } else if (reading.status === 'failed') {
      html += `<div class="bad">${esc(reading.error || 'The reading stopped.')} It did not count toward the project's free readings.</div>${uploadBlock(false)}`;
    } else {
      // The reading's own time: a file read before was read earlier than it was chosen here.
      const when = subcontract.readBefore
        ? `read on ${esc(subcontract.readOn)}. Chosen for this subcontract by ${esc(subcontract.scopeBy)} on ${esc(subcontract.scopeOn)}.`
        : `read on ${esc(subcontract.readOn || subcontract.scopeOn)}, uploaded by ${esc(subcontract.scopeBy)}.`;
      html += `<p>${esc(subcontract.docName)} <span class="meta">${when}</span></p>${same}
        ${reading.checksPassed ? '' : '<p class="warn">Some of the AI\'s quotes could not be matched word for word to the scope. Check the list against the scope.</p>'}
        <details><summary>Upload a different scope</summary>${uploadBlock(true)}</details>`;
    }
    $('s-scope').innerHTML = html;
    if (reading.status === 'reading') {
      const RP = window.SiteWriteProgress;
      if (!tracker && RP) tracker = RP.track({ what: 'scope', lead: 'The AI is reading every word of the scope, including tables and appendices.', steps: ['reading every word of the scope', 'matching each work package to SiteWrite\'s job steps'] });
      if (tracker) { tracker.update(reading.progress); $('s-progress').innerHTML = tracker.html(); }
    }
  }

  // Each SWMS's buttons name it, so a screen reader hears "Remove Controls", not "Remove" twelve times.
  function itemCard(item) {
    const clauses = item.clauses.length ? `<p class="meta">From scope ${clauseWord(item.clauses)} ${esc(item.clauses.join('; '))}.</p>` : item.source === 'added' ? '<p class="meta">Added by your team.</p>' : '';
    const named = (verb) => `aria-label="${esc(`${verb} ${item.title}`)}"`;
    if (item.removed) {
      const back = item.group === 'aside' ? 'Move to the list' : 'Put back';
      // Work that may not need a SWMS says so once, in its own words for the lead, who is the builder (messy
      // round 10, wording 4: the line said it twice and "The builder may still ask for a SWMS").
      const said = item.group === 'aside' && !(item.highRisk && item.highRisk.status === 'none');
      return `<div class="swms-item removed" id="item-${esc(item.id)}"><h3>${esc(item.title)}</h3>${said ? hrcwLine(item.highRisk) : ''}${item.task ? `<p class="work">${esc(item.task)}</p>` : ''}${item.removedWhy ? `<p class="meta">${esc(item.removedWhy)}</p>` : ''}
        <div class="actions"><button type="button" class="light" data-restore="${esc(item.id)}" ${named(back)}>${back}</button></div></div>`;
    }
    const also = item.alsoCovers && item.alsoCovers.length ? `<p class="also">Also covers: ${esc(coversList(item.alsoCovers))}.</p>` : '';
    // A SWMS SiteWrite has no job steps for is said before sending, and the list waits (messy round 7).
    const empty = item.noSteps ? `<p class="warn" id="item-${esc(item.id)}-nosteps"><strong>SiteWrite has no job steps for this work yet.</strong> The subcontractor would get this SWMS with none, so the list cannot be sent until it has them. Change the work so it says what is done, or remove it.</p>` : '';
    return `<div class="swms-item${item.noSteps ? ' no-steps' : ''}" id="item-${esc(item.id)}"><h3 id="item-${esc(item.id)}-title">${esc(item.title)}</h3>${hrcwLine(item.highRisk)}${empty}
      <p class="work" id="item-${esc(item.id)}-work">${esc(item.task)}</p>${also}${clauses}${uploadedLine(item)}${receivedLine(item)}
      <div class="actions" id="item-${esc(item.id)}-buttons">${itemButtons(item)}</div></div>`;
  }

  // Files the subcontractor uploaded for this SWMS on the list page (stage 5), to open, and to record as
  // received (stage 7) so they can be reviewed.
  function uploadedLine(item) {
    const files = ((sub && sub.sending && sub.sending.uploads) || []).filter((file) => file.itemId === item.id);
    if (!files.length) return '';
    const got = sub.received && sub.received.items[item.id];
    const recorded = new Set([got && got.latest, ...((got && got.earlier) || [])].filter((one) => one && one.channel === 'outside' && one.file).map((one) => one.file.name));
    return `<p class="uploaded">Uploaded from the list page: ${files.map((file) => `<button type="button" class="link" data-upload-open="${esc(file.id)}" data-upload-name="${esc(file.name)}">${esc(file.name)}</button> <span class="meta">(${esc(file.type)}, ${esc(file.on)})</span>${file.flag ? ` <span class="upload-flag"><strong>${esc(file.flag)}</strong> Open it to check before you record it.</span>` : ''}${recorded.has(file.name) ? ' <span class="meta">Recorded as received.</span>' : ` <button type="button" class="light small" data-upload-record="${esc(file.id)}" aria-label="${esc(`Record ${file.name} as received`)}">Record it as received</button>`}`).join('; ')}</p>`;
  }

  // What has come in for this SWMS (stage 7): submitted in SiteWrite or received outside it, its review
  // and conditions, with "Record a SWMS received outside SiteWrite".
  function receivedLine(item) {
    const got = sub.received && sub.received.items[item.id];
    const latest = got && got.latest;
    let html = '';
    if (latest) {
      const what = latest.channel === 'sitewrite'
        ? `Submitted in SiteWrite on ${esc(latest.on)}, revision ${esc(latest.revision)}, by ${esc(latest.by)}.`
        : `Received outside SiteWrite: ${esc(latest.file ? latest.file.name : 'a file')}, recorded on ${esc(latest.on)} by ${esc(latest.by)}.`;
      const review = latest.review ? ` <strong>${esc(latest.review.label)}</strong> by ${esc(latest.review.name)}, ${esc(latest.review.on)}.` : ' Not reviewed yet.';
      const open = got.conditions.filter((one) => one.status === 'outstanding').length;
      const confirm = got.conditions.filter((one) => one.status === 'done').length;
      const conditions = open || confirm ? ` Conditions: ${[open ? `${open} open` : '', confirm ? `${confirm} to confirm` : ''].filter(Boolean).join(', ')}.` : '';
      const changed = (latest.overrides || []).length ? ` It changes details you set: ${esc(latest.overrides.map((one) => one.label.toLowerCase()).join(', '))}.` : '';
      html += `<p class="received">${what}${review}${conditions}${changed}${got.earlier.length ? ` <span class="meta">Submitted ${got.earlier.length === 1 ? 'once' : `${got.earlier.length} times`} before.</span>` : ''} <a class="button light small" href="/review.html?submission=${esc(latest.id)}">${latest.review ? 'Open' : 'Review it'}</a></p>`;
    }
    // Only once the list has gone: before that there is nothing to receive (messy round 8).
    if (!sub.received || !sub.received.outsideOn || !(sub.sending && sub.sending.sent)) return html;
    const id = esc(item.id);
    return `${html}<details class="outside" id="outside-${id}"><summary>Record a SWMS received outside SiteWrite</summary>
      <p class="meta">A SWMS for this that came by email or on paper, as a PDF or Word file. It is then in, and you can review it here. Builder check on it is optional.</p>
      <label for="outside-file-${id}">The SWMS file <span class="hint">A PDF or a Word file (.docx), up to 10 MB.</span></label>
      <input id="outside-file-${id}" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document">
      <p class="field-error hidden" id="outside-file-${id}-error"></p>
      <label for="outside-note-${id}">How it came <span class="hint">Optional, for the record. For example Emailed by Tom Beck on 14 October.</span></label>
      <input id="outside-note-${id}" type="text" maxlength="500" autocomplete="off">
      <div class="actions"><button type="button" class="light" data-outside-record="${id}" aria-label="${esc(`Record a SWMS received for ${item.title}`)}">Record it</button></div></details>`;
  }

  // Where a SWMS just left the list: a note in its place, beside where the person was looking, with a
  // button to undo (messy round 6: the note showed at the top, out of view, and the page jumped).
  // Each SWMS removed in a row keeps its note (messy round 8: after three quick Removes only the last
  // note stayed in place).
  let gone = [];
  function goneCard(one) {
    const item = one && sub.items.find((other) => other.id === one.id);
    if (!item || !item.removed) return '';
    return `<div class="swms-gone" id="gone-${esc(item.id)}" role="status"><p><strong>${esc(one.message)}</strong></p>
      <div class="actions"><button type="button" class="light" data-restore="${esc(item.id)}" aria-label="${esc(`Put back ${item.title}`)}">Put back</button></div></div>`;
  }

  function renderList() {
    const kept = sub.items.filter((item) => item.group === 'list');
    const aside = sub.items.filter((item) => item.group === 'aside');
    const removed = sub.items.filter((item) => item.group === 'removed');
    $('s-list-title').textContent = `SWMS this subcontract needs (${kept.length})`;
    let html = '';
    if (sub.reading.status === 'none' && !sub.items.length) html += '<p class="meta">Upload the scope above, or add the SWMS yourself below.</p>';
    else if (sub.reading.status === 'reading' && !sub.items.length) html += '<p class="meta">The list shows here when the scope has been read.</p>';
    else if (!kept.length && aside.length && !removed.some((item) => !item.removedWhy)) html += '<div class="warn"><strong>No SWMS are on the list yet.</strong> SiteLink found no high risk construction work in this scope. Move any SWMS you need from "Work that may not need a SWMS" below, or add one.</div>';
    else if (!kept.length) html += '<div class="warn"><strong>Every SWMS is removed.</strong> The subcontractor would be told this subcontract needs no SWMS. Put one back or add one if it needs any.</div>';
    // The note for a SWMS just removed sits where it was in the list.
    const notesAt = (i) => gone.filter((one) => Math.min(one.at, kept.length) === i).map(goneCard).join('');
    html += kept.map((item, i) => `${notesAt(i)}${itemCard(item)}`).join('') + notesAt(kept.length);
    if (aside.length) {
      html += `<details class="aside-group" id="s-aside"${openGroups.aside ? ' open' : ''}><summary>Work that may not need a SWMS (${aside.length})</summary>
        <p class="meta">SiteLink found no high risk construction work in these, so the law may not need a SWMS for them. They are not on the list, and the subcontractor does not see them. Move any you need to the list.</p>${aside.map(itemCard).join('')}</details>`;
    }
    if (removed.length) html += `<details class="removed-group" id="s-removed"${kept.length && !openGroups.removed ? '' : ' open'}><summary>Removed (${removed.length})</summary>${removed.map(itemCard).join('')}</details>`;
    const duties = sub.reading.duties || [];
    if (duties.length) html += `<details><summary>${duties.length} ${duties.length === 1 ? 'duty' : 'duties'} in the scope ${duties.length === 1 ? 'needs' : 'need'} no SWMS</summary><ul>${duties.map((duty) => `<li>${esc(duty)}</li>`).join('')}</ul></details>`;
    // Testing and commissioning the crew does on site is work, said apart (messy round 11, SiteLink).
    const testing = sub.reading.testing || [];
    if (testing.length) html += `<details><summary>${testing.length === 1 ? 'Testing or commissioning work' : `${testing.length} pieces of testing or commissioning work`} the scope lists as ${testing.length === 1 ? 'a duty' : 'duties'}</summary><p class="meta">Testing and commissioning done on site needs a SWMS where it is high risk construction work. Check a SWMS on the list covers it, or add one.</p><ul>${testing.map((duty) => `<li>${esc(duty)}</li>`).join('')}</ul></details>`;
    // What is typed in an open box, and where the cursor is, before the list is drawn again.
    const active = document.activeElement;
    const focus = active && active.closest && active.closest('#s-list') && (active.dataset.work || active.dataset.titleEdit) ? { id: active.id, start: active.selectionStart, end: active.selectionEnd } : null;
    for (const box of document.querySelectorAll('#s-list [data-work]')) if (editing[box.dataset.work]) editing[box.dataset.work].work = box.value;
    for (const box of document.querySelectorAll('#s-list [data-title-edit]')) if (editing[box.dataset.titleEdit]) editing[box.dataset.titleEdit].title = box.value;
    $('s-list').innerHTML = html;
    for (const item of kept) {
      // A rewording typed before Back or a reload is back in its box; so is a box left open.
      const typed = readTyped(typedKey('work', sub.subcontract.id, item.id));
      const typedTitle = readTyped(typedKey('title', sub.subcontract.id, item.id));
      const open = editing[item.id] || {};
      if (open.title !== undefined) openRetitle(item.id, open.title);
      else if (typedTitle && typeof typedTitle.title === 'string' && typedTitle.title !== item.title) openRetitle(item.id, typedTitle.title, true);
      if (open.work !== undefined) openReword(item.id, open.work);
      else if (typed && typeof typed.task === 'string' && typed.task !== item.task) openReword(item.id, typed.task, true);
    }
    // Edits for a SWMS no longer on the list are dropped.
    for (const id of Object.keys(editing)) if (!kept.some((item) => item.id === id)) delete editing[id];
    if (focus && $(focus.id)) {
      const box = $(focus.id);
      box.focus({ preventScroll: true });
      try { box.setSelectionRange(focus.start, focus.end); } catch { /* not a text box */ }
    }
  }
  const openGroups = { aside: false, removed: false };

  // Answers typed on this page since it opened: one refused is not an answer "from before" (messy round
  // 9, wording 7: "Your answer from before is back" showed under "tbc" just refused, with no earlier answer).
  const typedHere = new Set();
  function renderPoints() {
    const points = sub.points;
    if (!points.length) {
      $('s-points-card').innerHTML = `<h2>Points to confirm</h2><p class="meta">${sub.reading.status === 'done' ? 'The scope leaves no points open about who does the work or what you provide.' : 'Points the scope leaves open show here when it has been read.'}</p>`;
      return;
    }
    // A point about a SWMS that is not on the list is not asked or sent (messy round 6).
    const live = points.filter((point) => point.inPlay !== false);
    const out = points.filter((point) => point.inPlay === false);
    const open = live.filter((point) => !point.answer).length;
    const card = (point) => {
      const typed = readTyped(typedKey('answer', sub.subcontract.id, point.id));
      const value = typed && typeof typed.answer === 'string' ? typed.answer : point.answer;
      return `<div class="point${point.inPlay === false ? ' out' : ''}" id="point-${esc(point.id)}">
        <p><strong>${esc(point.activity)}</strong>${point.clause ? ` <span class="meta">(${clauseWord([point.clause])} ${esc(point.clause)})</span>` : ''}</p>
        <p>${esc(point.question)}</p>
        <label for="answer-${esc(point.id)}">Your answer ${point.inPlay === false ? '' : point.answer ? '<span class="tag">Answered: goes to the subcontractor</span>' : '<span class="tag grey">Not answered: not sent</span>'}</label>
        <textarea id="answer-${esc(point.id)}" maxlength="1000" data-point="${esc(point.id)}">${esc(value)}</textarea>
        <p class="field-error hidden" id="answer-${esc(point.id)}-error"></p>
        ${typed && value !== point.answer && !typedHere.has(point.id) ? '<p class="meta">Your answer from before is back. It is not saved yet.</p>' : ''}
        ${point.answer ? `<p class="meta">Answered by ${esc(point.answeredBy)} on ${esc(point.answeredOn)}.</p>` : ''}
        <div class="actions"><button type="button" class="light" data-answer="${esc(point.id)}" aria-label="${esc(`Save the answer about ${point.activity}`)}">Save answer</button></div>
      </div>`;
    };
    $('s-points-card').innerHTML = `<h2>Points to confirm (${live.length})</h2>
      <p class="meta">The scope leaves these open. Answer the ones you can. Only answered points go to the subcontractor, with your answer. ${live.length ? (open ? `${open} not answered yet.` : 'All are answered.') : ''}</p>
      ${live.map(card).join('')}
      ${out.length ? `<details${openGroups.points ? ' open' : ''} id="s-points-out"><summary>Points about SWMS not on the list (${out.length})</summary><p class="meta">These are not asked or sent while their SWMS is not on the list.</p>${out.map(card).join('')}</details>` : ''}`;
  }

  function renderSub(data, message = '') {
    sub = data;
    const s = data.subcontract;
    document.title = `${s.name}: SiteLink`;
    $('s-crumbs').innerHTML = `<a href="#/">Your projects</a> › <a href="#/project/${esc(data.project.id)}">${esc(data.project.name)}</a>`;
    $('s-name').textContent = s.name;
    $('s-meta').textContent = [s.trade, s.email || 'No contact email yet', s.abn ? `ABN ${formatAbn(s.abn)}` : 'No ABN given'].filter(Boolean).join(' · ');
    box('s-trade', s.tradeWarning ? `<strong>${esc(s.tradeWarning)}</strong> <a href="#/sub/${esc(s.id)}/edit">Change the trade</a> or upload a different scope below.` : '', 'warn');
    $('s-edit').href = `#/sub/${s.id}/edit`;
    $('s-preview-link').href = `#/sub/${s.id}/preview`;
    $('s-preview-go').href = `#/sub/${s.id}/preview`;
    renderScope();
    renderList();
    renderPoints();
    renderSend();
    $('s-log').innerHTML = data.sending.log.length ? data.sending.log.map((entry) => `<li><span class="when">${esc(entry.when)}</span>${esc(entry.text)}</li>`).join('') : '<li class="meta">Nothing yet. Sending the list, reminders, the link being opened, files uploaded and the list being taken up show here.</li>';
    if (message) box('s-flash', esc(message), 'ok');
  }

  // While the scope is being read, the page asks how it is going every few seconds. When it is done,
  // a message with a chime says so (read-progress.js), as on the subcontractor's page.
  function watch() {
    if (poll) clearTimeout(poll);
    if (!sub || sub.reading.status !== 'reading') return;
    watching = true;
    const id = sub.subcontract.id;
    poll = setTimeout(async () => {
      poll = null;
      if (!sub || sub.subcontract.id !== id || !location.hash.startsWith(`#/sub/${id}`)) return;
      try {
        const data = await call('GET', `/api/hse/subcontracts/${encodeURIComponent(id)}`);
        if (!location.hash.startsWith(`#/sub/${id}`) || location.hash !== `#/sub/${id}`) return;
        const was = sub.reading.status;
        if (data.reading.status !== 'reading' && tracker) { if (data.reading.status === 'done') tracker.finish(); else tracker.fail(); tracker = null; }
        renderSub(data);
        if (was === 'reading' && data.reading.status !== 'reading') announceDone(data);
      } catch (error) {
        if (error.status === 404 || error.status === 401) return;
      }
      watch();
    }, 4000);
  }
  function announceDone(data) {
    const RP = window.SiteWriteProgress;
    if (!RP || !watching) return;
    watching = false;
    const done = data.reading.status === 'done';
    const kept = data.items.filter((item) => !item.removed).length;
    RP.announce({
      heading: done ? 'The scope has been read' : 'The reading stopped',
      text: done ? `SiteLink has listed ${kept} SWMS for ${data.subcontract.name}. Check the list, then answer any points to confirm.` : (data.reading.error || 'The reading stopped. Try again.'),
      button: done ? 'Check the list' : 'Close',
      tab: 'scope read',
      go: () => { const card = $('s-list-card'); if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    });
  }

  async function showSub(subId) {
    // Another subcontract's reading is no longer watched.
    if (sub && sub.subcontract.id !== subId) stopPoll();
    const data = await call('GET', `/api/hse/subcontracts/${encodeURIComponent(subId)}`);
    view('sub');
    box('s-flash', '');
    clearErrors($('s-add'));
    gone = [];
    if (!sub || sub.subcontract.id !== subId) { openGroups.aside = false; openGroups.removed = false; openGroups.points = false; }
    // A SWMS being added, typed before Back or a reload, is back in its boxes.
    const adding = readTyped(typedKey('add', subId));
    $('s-add-title').value = adding ? adding.title || '' : '';
    $('s-add-task').value = adding ? adding.task || '' : '';
    renderSub(data);
    watch();
  }

  async function sendScope(button, replace, tradeChecked = false) {
    const input = $('s-file');
    const file = input && input.files[0];
    clearErrors($('s-scope'));
    if (!file) { fieldError('s-file', 'Choose the scope file first.'); return; }
    if (!ACCEPTED.test(file.name)) { input.value = ''; fieldError('s-file', NOT_A_SCOPE); return; }
    if (file.size > 10 * 1024 * 1024) { fieldError('s-file', 'The file is too large. Upload the scope of works only.'); return; }
    if (window.SiteWriteProgress) window.SiteWriteProgress.unlockAudio();
    await busy(button, 'Sending...', async () => {
      try {
        const data = await call('POST', `/api/hse/subcontracts/${encodeURIComponent(sub.subcontract.id)}/scope`, { file: { name: file.name, data: await readFile(file) }, ...(replace ? { replace: true } : {}), ...(tradeChecked ? { tradeChecked: true } : {}) });
        stopPoll();
        watching = data.reading.status === 'reading';
        renderSub(data, data.message || '');
        watch();
      } catch (error) {
        if (error.replace) {
          if (window.confirm(`${error.message} Read the new scope?`)) await sendScope(button, true, tradeChecked);
          return;
        }
        // A scope that reads as another trade: asked before anything is read, and the lead can carry on.
        if (error.tradeMismatch) {
          if (window.confirm(`${error.message} Read it anyway?`)) await sendScope(button, replace, true);
          else fieldError('s-file', error.message);
          return;
        }
        // At the project's free readings the line under the button says so, in red, once.
        if (error.limit && $('s-readings')) { $('s-readings').innerHTML = `<strong>${esc(error.message)}</strong> A file already read for your account can still be used, at no cost.`; $('s-readings').className = 'limit-note'; }
        else if ($('s-file')) fieldError('s-file', error.message);
        else box('s-flash', esc(error.message), 'bad');
      }
    });
  }

  $('s-scope').addEventListener('click', (event) => {
    const read = event.target.closest('#s-read');
    if (read) sendScope(read, false);
  });
  $('s-scope').addEventListener('change', (event) => {
    if (event.target.id !== 's-file') return;
    clearErrors($('s-scope'));
    const file = event.target.files[0];
    if (file && !ACCEPTED.test(file.name)) { event.target.value = ''; fieldError('s-file', NOT_A_SCOPE); }
  });

  // The page stays where it was after a change: the card the person pressed (or the note left in its
  // place) is kept at the same height on the screen (messy round 6: Remove made the page jump, and the
  // next Remove took the wrong SWMS).
  function keepPlace(beforeTop, targetId) {
    const target = targetId && $(targetId);
    if (!target || beforeTop === null) return;
    window.scrollBy(0, target.getBoundingClientRect().top - beforeTop);
  }
  async function changeItem(itemId, body, { anchor, targetId, removing = false } = {}) {
    const beforeTop = anchor ? anchor.getBoundingClientRect().top : null;
    const at = sub.items.filter((item) => item.group === 'list').findIndex((item) => item.id === itemId);
    const data = await call('PUT', `/api/hse/subcontracts/${encodeURIComponent(sub.subcontract.id)}/items/${encodeURIComponent(itemId)}`, body);
    // A note stays for each SWMS removed and not put back since; a SWMS put back loses its note.
    gone = [...gone.filter((one) => one.id !== itemId && (data.items || []).some((item) => item.id === one.id && item.removed)), ...(removing ? [{ id: itemId, at: Math.max(0, at), message: data.message }] : [])];
    box('s-flash', '');
    renderSub(data);
    const target = removing ? `gone-${itemId}` : targetId;
    keepPlace(beforeTop, target);
    // The message is said beside the item; the note in its place is read out (role status).
    if (!removing && data.message) {
      const card = $(target);
      if (card) card.insertAdjacentHTML('afterbegin', `<div class="ok" role="status" style="margin:0 0 8px">${esc(data.message)}</div>`);
    }
  }

  // The buttons under a SWMS on the list, each naming it for a screen reader.
  function itemButtons(item) {
    const named = (verb) => `aria-label="${esc(`${verb} ${item.title}`)}"`;
    return `<button type="button" class="light" data-reword="${esc(item.id)}" ${named('Change the work for')}>Change the work</button><button type="button" class="light" data-retitle="${esc(item.id)}" ${named('Change the title of')}>Change the title</button><button type="button" class="danger" data-remove-item="${esc(item.id)}" ${named('Remove')}>Remove</button>`;
  }

  // The boxes open to change a SWMS's work or title, kept open with what was typed through every
  // redraw of the list (messy round 7: a Remove's redraw closed an open box before the lead typed).
  // { [id]: { work?: text, title?: text } }
  const editing = {};
  function editButtons(id, item) {
    const open = editing[id] || {};
    const what = open.work !== undefined && open.title !== undefined ? 'the title and work' : open.title !== undefined ? 'the title' : 'the work';
    return `<button type="button" data-save-work="${esc(id)}" aria-label="${esc(`Save ${what} for ${item.title}`)}">Save ${what.replace('the title and work', 'the changes')}</button><button type="button" class="light" data-cancel-work="${esc(id)}" aria-label="${esc(`Cancel changing ${what} for ${item.title}`)}">Cancel</button>`;
  }
  // The box to reword a SWMS's work. typed: words kept on this device from before.
  function openReword(id, text, fromBefore = false) {
    const work = $(`item-${id}-work`);
    const buttons = $(`item-${id}-buttons`);
    const item = sub.items.find((one) => one.id === id);
    if (!work || !buttons || !item) return;
    editing[id] = { ...(editing[id] || {}), work: text };
    work.outerHTML = `<div id="item-${esc(id)}-edit"><label for="work-${esc(id)}">The work this SWMS covers</label><textarea id="work-${esc(id)}" maxlength="1500" style="min-height:90px" data-work="${esc(id)}">${esc(text)}</textarea><p class="field-error hidden" id="work-${esc(id)}-error"></p>${fromBefore ? '<p class="meta">Your changes from before are back. They are not saved yet.</p>' : ''}</div>`;
    buttons.innerHTML = editButtons(id, item);
  }
  // The box to change a SWMS's title, with the same checks as a SWMS added: a capital first letter, no price.
  function openRetitle(id, text, fromBefore = false) {
    const title = $(`item-${id}-title`);
    const buttons = $(`item-${id}-buttons`);
    const item = sub.items.find((one) => one.id === id);
    if (!title || !buttons || !item) return;
    editing[id] = { ...(editing[id] || {}), title: text };
    title.outerHTML = `<div id="item-${esc(id)}-title-edit"><label for="title-${esc(id)}">The SWMS title <span class="hint">As the subcontractor will see it, for example Mechanical installation: plant room.</span></label><input id="title-${esc(id)}" type="text" maxlength="160" autocomplete="off" data-title-edit="${esc(id)}" value="${esc(text)}"><p class="field-error hidden" id="title-${esc(id)}-error"></p>${fromBefore ? '<p class="meta">Your changes from before are back. They are not saved yet.</p>' : ''}</div>`;
    buttons.innerHTML = editButtons(id, item);
  }

  $('s-list').addEventListener('input', (event) => {
    const id = event.target.dataset && event.target.dataset.work;
    if (id) { keepTyped(typedKey('work', sub.subcontract.id, id), { task: event.target.value }); if (editing[id]) editing[id].work = event.target.value; }
    const titleId = event.target.dataset && event.target.dataset.titleEdit;
    if (titleId) { keepTyped(typedKey('title', sub.subcontract.id, titleId), { title: event.target.value }); if (editing[titleId]) editing[titleId].title = event.target.value; }
  });
  $('s-list').addEventListener('toggle', (event) => {
    if (event.target.id === 's-aside') openGroups.aside = event.target.open;
    if (event.target.id === 's-removed') openGroups.removed = event.target.open;
  }, true);

  $('s-list').addEventListener('click', async (event) => {
    // Stage 7: a SWMS received outside SiteWrite, and a file uploaded on the list page, recorded as received.
    const outside = event.target.closest('[data-outside-record]');
    const record = event.target.closest('[data-upload-record]');
    if (outside || record) {
      const button = outside || record;
      button.disabled = true;
      try {
        let data;
        if (outside) {
          const itemId = outside.dataset.outsideRecord;
          const input = $(`outside-file-${itemId}`);
          const file = input && input.files && input.files[0];
          if (!file) { fieldError(`outside-file-${itemId}`, 'Choose the SWMS file first.'); button.disabled = false; return; }
          const response = await fetch(`/api/hse/subcontracts/${encodeURIComponent(sub.subcontract.id)}/items/${encodeURIComponent(itemId)}/outside`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream', 'X-Reviewer-Token': token, 'X-File-Name': encodeURIComponent(file.name), 'X-Note': encodeURIComponent(($(`outside-note-${itemId}`) || {}).value || '') },
            body: file,
          });
          data = await response.json().catch(() => ({}));
          if (!response.ok) { fieldError(`outside-file-${itemId}`, data.message || 'The file could not be recorded. Try again.'); button.disabled = false; return; }
        } else {
          data = await call('POST', `/api/hse/subcontracts/${encodeURIComponent(sub.subcontract.id)}/uploads/${encodeURIComponent(record.dataset.uploadRecord)}/record`);
        }
        renderSub(data.page, data.message);
        $('s-flash').scrollIntoView({ block: 'center' });
      } catch (error) {
        button.disabled = false;
        box('s-flash', esc(error.message), 'bad');
      }
      return;
    }
    const remove = event.target.closest('[data-remove-item]');
    const restore = event.target.closest('[data-restore]');
    const reword = event.target.closest('[data-reword]');
    const retitle = event.target.closest('[data-retitle]');
    const save = event.target.closest('[data-save-work]');
    const cancel = event.target.closest('[data-cancel-work]');
    try {
      if (remove) {
        remove.disabled = true;
        await changeItem(remove.dataset.removeItem, { removed: true }, { anchor: remove.closest('.swms-item'), removing: true });
      } else if (restore) {
        restore.disabled = true;
        const id = restore.dataset.restore;
        await changeItem(id, { removed: false }, { anchor: restore.closest('.swms-item, .swms-gone'), targetId: `item-${id}` });
      } else if (reword) {
        const id = reword.dataset.reword;
        const item = sub.items.find((one) => one.id === id);
        openReword(id, item.task);
        $(`work-${id}`).focus();
      } else if (retitle) {
        const id = retitle.dataset.retitle;
        const item = sub.items.find((one) => one.id === id);
        openRetitle(id, item.title);
        $(`title-${id}`).focus();
      } else if (save) {
        const id = save.dataset.saveWork;
        const body = {};
        if ($(`work-${id}`)) {
          body.task = $(`work-${id}`).value;
          if (!body.task.trim()) { fieldError(`work-${id}`, 'Say what work this SWMS covers, in a sentence or two.'); return; }
        }
        if ($(`title-${id}`)) {
          body.title = $(`title-${id}`).value;
          if (!body.title.trim()) { fieldError(`title-${id}`, 'Enter a title for the SWMS, for example Formwork to suspended slabs.'); return; }
        }
        save.disabled = true;
        const was = editing[id];
        // The words kept on this device go before the redraw, so the saved box does not open again.
        const typedWork = readTyped(typedKey('work', sub.subcontract.id, id));
        const typedTitle = readTyped(typedKey('title', sub.subcontract.id, id));
        try {
          delete editing[id];
          keepTyped(typedKey('work', sub.subcontract.id, id), null);
          keepTyped(typedKey('title', sub.subcontract.id, id), null);
          await changeItem(id, body, { anchor: save.closest('.swms-item'), targetId: `item-${id}` });
        } catch (error) {
          editing[id] = was;
          keepTyped(typedKey('work', sub.subcontract.id, id), typedWork);
          keepTyped(typedKey('title', sub.subcontract.id, id), typedTitle);
          save.disabled = false;
          if (error.field === 'task' && $(`work-${id}`)) { fieldError(`work-${id}`, error.message); return; }
          if (error.field === 'title' && $(`title-${id}`)) { fieldError(`title-${id}`, error.message); return; }
          throw error;
        }
      } else if (cancel) {
        delete editing[cancel.dataset.cancelWork];
        keepTyped(typedKey('work', sub.subcontract.id, cancel.dataset.cancelWork), null);
        keepTyped(typedKey('title', sub.subcontract.id, cancel.dataset.cancelWork), null);
        renderList();
      }
    } catch (error) {
      box('s-flash', esc(error.message), 'bad');
      if (remove) remove.disabled = false;
      if (restore) restore.disabled = false;
    }
  });

  $('s-add').addEventListener('input', () => {
    if (sub) keepTyped(typedKey('add', sub.subcontract.id), $('s-add-title').value || $('s-add-task').value ? { title: $('s-add-title').value, task: $('s-add-task').value } : null);
  });
  $('s-add').addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors($('s-add'));
    const body = { title: $('s-add-title').value, task: $('s-add-task').value };
    if (!body.title.trim()) { fieldError('s-add-title', 'Enter a title for the SWMS, for example Formwork to suspended slabs.'); return; }
    if (!body.task.trim()) { fieldError('s-add-task', 'Say what work this SWMS covers, in a sentence or two.'); return; }
    await busy($('s-add-go'), 'Adding...', async () => {
      try {
        const data = await call('POST', `/api/hse/subcontracts/${encodeURIComponent(sub.subcontract.id)}/items`, body);
        $('s-add-title').value = '';
        $('s-add-task').value = '';
        keepTyped(typedKey('add', sub.subcontract.id), null);
        gone = [];
        renderSub(data);
        // The new SWMS is shown, with the message beside it.
        const added = data.items.filter((item) => item.source === 'added').pop();
        const card = added && $(`item-${added.id}`);
        if (card) {
          card.insertAdjacentHTML('afterbegin', `<div class="ok" role="status" style="margin:0 0 8px">${esc(data.message)}</div>`);
          card.scrollIntoView({ block: 'center' });
        } else box('s-flash', esc(data.message), 'ok');
      } catch (error) {
        if (['title', 'task'].includes(error.field)) fieldError(`s-add-${error.field}`, error.message);
        else box('s-flash', esc(error.message), 'bad');
      }
    });
  });

  $('s-points-card').addEventListener('input', (event) => {
    const id = event.target.dataset && event.target.dataset.point;
    if (id) { keepTyped(typedKey('answer', sub.subcontract.id, id), { answer: event.target.value }); typedHere.add(id); }
  });
  $('s-points-card').addEventListener('toggle', (event) => {
    if (event.target.id === 's-points-out') openGroups.points = event.target.open;
  }, true);
  $('s-points-card').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-answer]');
    if (!button) return;
    const id = button.dataset.answer;
    clearErrors($(`point-${id}`));
    const beforeTop = $(`point-${id}`).getBoundingClientRect().top;
    await busy(button, 'Saving...', async () => {
      try {
        const data = await call('PUT', `/api/hse/subcontracts/${encodeURIComponent(sub.subcontract.id)}/points/${encodeURIComponent(id)}`, { answer: $(`answer-${id}`).value });
        keepTyped(typedKey('answer', sub.subcontract.id, id), null);
        box('s-flash', '');
        renderSub(data);
        keepPlace(beforeTop, `point-${id}`);
        const card = $(`point-${id}`);
        if (card) card.insertAdjacentHTML('beforeend', `<div class="ok" role="status">${esc(data.message)}</div>`);
      } catch (error) {
        if (error.field === 'answer') fieldError(`answer-${id}`, error.message);
        else box('s-flash', esc(error.message), 'bad');
      }
    });
  });

  $('s-remove').addEventListener('click', async () => {
    if (!sub) return;
    if (!window.confirm(`Remove ${sub.subcontract.name} from this project? Its SWMS list and answers go too.`)) return;
    try {
      const data = await call('DELETE', `/api/hse/subcontracts/${encodeURIComponent(sub.subcontract.id)}`);
      stopPoll();
      go(`#/project/${sub.project.id}`, esc(data.message));
    } catch (error) {
      box('s-flash', esc(error.message), 'bad');
    }
  });

  // ---- Sending the list, and reminders (stage 5) ----
  // The lead chooses the due date and presses "Check the email". The email shows exactly as it will go,
  // with the two links in brackets (they are made when it is sent). "Send the email" sends that email and
  // no other: if anything in it changed since, the new email is shown to check again.

  let checking = null;
  const SEND_TYPED = (id) => typedKey('due', id);
  function changeLines(changes) {
    const parts = [];
    if (changes.added.length) parts.push(`added ${changes.added.join(', ')}`);
    if (changes.removed.length) parts.push(`removed ${changes.removed.join(', ')}`);
    if (changes.changed.length) parts.push(`changed the work for ${changes.changed.join(', ')}`);
    return parts.join('; ');
  }
  function renderSend() {
    const card = $('s-send');
    const sending = sub.sending;
    const id = sub.subcontract.id;
    const lines = [];
    if (!sending.sent) lines.push('<p>Not sent yet.</p>');
    else {
      lines.push(`<p><strong>Sent to ${esc(sending.sent.to)}</strong> on ${esc(sending.sent.on)} by ${esc(sending.sent.by)}. Due ${esc(sending.sent.dueShown)}.</p>`);
      // A signed-out open could be anyone the email was passed to (messy round 9, blocker 5).
      lines.push(sending.opened ? `<p>Opened on ${esc(sending.opened)}.</p>` : sending.openedUnknown ? '<p class="meta">The link was opened by someone not signed in to SiteWrite, so who opened it is not known. It counts as opened once the company signs in to open it or takes up the list.</p>' : '<p class="meta">Not opened yet. It counts as opened when the company opens the link in the email signed in to SiteWrite, or takes up the list.</p>');
      if (sending.claimed) lines.push(`<p>Taken up in SiteWrite by <strong>${esc(sending.claimed.name)}</strong> (ABN ${esc(sending.claimed.abn)}) on ${esc(sending.claimed.on)}.</p>`);
      // A company whose name is not the subcontract's is flagged (messy round 7).
      if (sending.claimed && sending.claimed.mismatch) lines.push(`<p class="warn" id="s-claim-mismatch"><strong>${esc(sending.claimed.name)} is not the name on this subcontract (${esc(sub.subcontract.name)}).</strong> Check it is the right company.${sending.release && sending.release.can ? ' If it is not, release the list from it below.' : ''}</p>`);
      else lines.push(`<p class="meta">${sending.abn ? `Only a company with ABN ${esc(sending.abnShown)} can take it up in SiteWrite.` : 'No ABN given, so the first company to take it up in SiteWrite gets it. You will see which company.'}</p>`);
      // Stage 6 (D311): a list taken up by the wrong company, where no ABN was given, can be released by the lead.
      const release = sending.release || {};
      if (sending.claimed && release.can) {
        lines.push(release.lead
          ? `<p class="meta">Not the right company? Release the list from it. ${esc(sending.claimed.name)} then loses the list and its work on it, and cannot take it up again.</p><div class="actions"><button type="button" class="light" id="s-release">Release the list from ${esc(sending.claimed.name)}</button></div>`
          : `<p class="meta">Not the right company? The lead of your account can release the list from it.</p>`);
      }
      for (const done of release.released || []) lines.push(`<p class="meta">${esc(done.by)} released the list from ${esc(done.name)}${done.abn ? ` (ABN ${esc(done.abn)})` : ''} on ${esc(done.on)}.</p>`);
    }
    let warn = '';
    if (sending.stopped) warn += `<div class="warn"><strong>${esc(sending.stopped.email)} asked on ${esc(sending.stopped.on)} for no more list emails from you.</strong> SiteLink will not email them. Contact them yourself, or change the contact email to another person.</div>`;
    if (sending.emailChanged) warn += `<div class="warn"><strong>The list was sent to ${esc(sending.sent.to)}.</strong> Send it to ${esc(sending.email)} now. The link sent to ${esc(sending.sent.to)} will stop working.</div>`;
    if (sending.changes) warn += `<div class="warn"><strong>The list has changed since it was sent:</strong> ${esc(changeLines(sending.changes))}. Send the updated list. The email says what changed.</div>`;
    const typed = readTyped(SEND_TYPED(id));
    const due = typed && typeof typed.due === 'string' ? typed.due : sending.dueDate;
    const to = sending.email ? `<p>To <strong>${esc(sending.email)}</strong> <a href="#/sub/${esc(id)}/edit">Change details</a></p>` : `<p class="warn">No contact email yet. <a href="#/sub/${esc(id)}/edit">Add it under Change details</a>.</p>`;
    const checkLabel = !sending.sent || sending.emailChanged ? 'Check the email' : sending.changes ? 'Check the updated email' : 'Check the email with a new due date';
    // Sent, and nothing changed since: the email goes again only with a new due date, so its button shows
    // only once a new date is chosen (messy round 7: it showed straight after sending).
    const sameAsSent = Boolean(sending.sent && !sending.emailChanged && !sending.changes);
    const dueMoved = Boolean(due && sending.sent && due !== sending.sent.due);
    // An Unverified account sends nothing (D311): said at the top of the card, and the buttons wait.
    const blocked = sending.blocked;
    if (blocked) warn = `<div class="warn" id="s-unverified"><strong>${withMail(blocked.message, (/at (\S+@\S+?)\.?$/.exec(blocked.message) || [])[1])}</strong> <a href="#/account/${esc(blocked.orgId)}">Account settings</a></div>${warn}`;
    const off = blocked ? ' disabled' : '';
    // Reminders go to the address the list went to; after the address changes, the list goes first.
    // The Remind button shows only when a reminder can go; otherwise the card says when the next can.
    const remind = sending.sent && !sending.emailChanged && !sending.stopped ? `<h3>Remind</h3><p class="meta">Sends ${esc(sending.sent.to)} the SWMS on the list with no file uploaded yet. At most once every ${esc(Math.round(sending.reminderHours / 24))} days, ${esc(sending.remind.max)} times after each list, so they are not flooded.${sending.remind.used ? ` ${esc(sending.remind.used)} sent so far.` : ''}</p>
      ${sending.remind.why ? `<p class="meta" id="s-remind-why"><strong>${esc(sending.remind.why)}</strong></p>` : ''}
      ${sending.remind.can && !blocked ? '<div class="actions"><button type="button" class="light" id="s-remind">Remind</button></div>' : ''}` : '';
    card.innerHTML = `<h2>Send the list</h2><div class="send-state">${lines.join('')}</div>${warn}
      ${to}
      <label for="s-due">Submission due date <span class="hint">The date the SWMS are due back to you. It is in the email.</span></label>
      <input id="s-due" type="date" min="${esc(sending.today)}" value="${esc(due)}">
      <p class="field-error hidden" id="s-due-error"></p>
      <div class="actions"><button type="button" id="s-check"${off}${sameAsSent && !dueMoved ? ' class="hidden"' : ''}>${checkLabel}</button></div>
      <p class="meta${sameAsSent && !dueMoved ? '' : ' hidden'}" id="s-due-note">The list has not changed since it was sent. To move the due date, choose a new date above, then check the email.</p>
      <div id="s-confirm"></div>${remind}<div id="s-send-status" role="status"></div>`;
    if (checking && checking.id === id) showEmail(checking);
  }
  function showEmail(state) {
    const p = state.preview;
    const what = state.remind ? 'reminder' : 'email';
    const others = p.others && p.others.length ? `<p class="warn">The link sent to ${esc(p.others.join(' and '))} will stop working when this goes.</p>` : '';
    $('s-confirm').innerHTML = `<div class="panel" style="border-color:#1f4e3d"><h3 style="margin-top:0">Check the ${what}</h3><p class="meta">This is the ${what} exactly as it will go. The parts in square brackets become links when it is sent.</p>
      <div class="email-box"><dl><dt>From</dt><dd>${esc(p.email.fromName)}</dd><dt>Reply to</dt><dd>${esc(p.email.replyTo)}</dd><dt>To</dt><dd>${esc(p.email.to)}</dd><dt>Subject</dt><dd>${esc(p.email.subject)}</dd></dl><pre>${esc(p.email.text)}</pre></div>
      ${others}<div class="actions"><button type="button" id="s-send-go">${state.remind ? 'Send the reminder' : 'Send the email'}</button><button type="button" class="light" id="s-send-cancel">Change something</button></div></div>`;
    $('s-confirm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function checkEmail(button, remind) {
    clearErrors($('s-send'));
    box('s-send-status', '');
    const id = sub.subcontract.id;
    const due = remind ? '' : $('s-due').value;
    // Nothing on the list is said first, before the due date (messy round 7).
    if (!remind && !sub.items.some((item) => item.group === 'list')) { box('s-send-status', 'No SWMS are on the list. Put one back or add one before sending it.', 'bad'); return; }
    if (!remind && !due) { fieldError('s-due', 'Choose the date the SWMS are due.'); return; }
    await busy(button, 'Checking...', async () => {
      try {
        const { preview } = await call('POST', `/api/hse/subcontracts/${encodeURIComponent(id)}/${remind ? 'remind' : 'send'}/preview`, remind ? {} : { due });
        checking = { id, preview, due, remind };
        showEmail(checking);
      } catch (error) {
        checking = null;
        if (error.field === 'due') fieldError('s-due', error.message);
        else box('s-send-status', esc(error.message), 'bad');
        // A SWMS with no job steps: its card is marked, and the first is brought into view.
        if (error.noSteps) { const first = document.querySelector('.swms-item.no-steps'); if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      }
    });
  }
  $('s-send').addEventListener('input', (event) => {
    if (event.target.id !== 's-due' || !sub) return;
    // A new date is a new email: the one shown is taken away until it is checked again.
    checking = null;
    $('s-confirm').innerHTML = '';
    if (sub.sending.sent && !sub.sending.emailChanged && !sub.sending.changes) {
      const moved = Boolean(event.target.value) && event.target.value !== sub.sending.sent.due;
      $('s-check').classList.toggle('hidden', !moved);
      $('s-due-note').classList.toggle('hidden', moved);
    }
    keepTyped(SEND_TYPED(sub.subcontract.id), event.target.value && event.target.value !== sub.sending.dueDate ? { due: event.target.value } : null);
  });
  $('s-send').addEventListener('click', async (event) => {
    if (!sub) return;
    const id = sub.subcontract.id;
    if (event.target.closest('#s-check')) { await checkEmail(event.target.closest('#s-check'), false); return; }
    if (event.target.closest('#s-remind')) { await checkEmail(event.target.closest('#s-remind'), true); return; }
    const release = event.target.closest('#s-release');
    if (release) {
      const company = sub.sending.claimed && sub.sending.claimed.name;
      if (!window.confirm(`Release the list from ${company}? ${company} loses the list and its work on it in SiteWrite, and cannot take it up again. The list stays as it is, and its link still works.`)) return;
      await busy(release, 'Releasing...', async () => {
        try {
          const data = await call('POST', `/api/hse/subcontracts/${encodeURIComponent(id)}/release`, { check: sub.sending.release.check });
          renderSub(data);
          box('s-send-status', `<strong>${esc(data.message)}</strong>`, 'ok');
          $('s-send').scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (error) {
          box('s-send-status', esc(error.message), 'bad');
        }
      });
      return;
    }
    if (event.target.closest('#s-send-cancel')) { checking = null; $('s-confirm').innerHTML = ''; ($('s-due') || $('s-send')).focus(); return; }
    const go = event.target.closest('#s-send-go');
    if (!go || !checking) return;
    await busy(go, 'Sending...', async () => {
      try {
        const route = `/api/hse/subcontracts/${encodeURIComponent(id)}/${checking.remind ? 'remind' : 'send'}`;
        const data = await call('POST', route, checking.remind ? { check: checking.preview.check } : { due: checking.due, check: checking.preview.check });
        checking = null;
        keepTyped(SEND_TYPED(id), null);
        renderSub(data);
        box('s-send-status', `<strong>${esc(data.message)}</strong>`, 'ok');
        $('s-send').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (error) {
        if (error.preview) {
          // The email changed since it was checked (the list or the details moved): show the new one.
          checking = { ...checking, preview: error.preview };
          showEmail(checking);
          box('s-send-status', esc(error.message), 'warn');
        } else {
          box('s-send-status', esc(error.message), 'bad');
        }
      }
    });
  });

  // A file the subcontractor uploaded, opened in a new tab (a PDF) or saved (a Word file). It is sent
  // only with the lead's sign-in, so there is no public link to it.
  document.addEventListener('click', async (event) => {
    const button = event.target.closest && event.target.closest('[data-upload-open]');
    if (!button || !sub) return;
    const isPdf = /\.pdf$/i.test(button.dataset.uploadName || '');
    const tab = isPdf ? window.open('', '_blank') : null;
    try {
      const response = await fetch(`/api/hse/subcontracts/${encodeURIComponent(sub.subcontract.id)}/uploads/${encodeURIComponent(button.dataset.uploadOpen)}`, { headers: { 'X-Reviewer-Token': token } });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'The file could not be opened. Try again.');
      const url = URL.createObjectURL(await response.blob());
      // A browser with no PDF viewer (Android) saves the PDF under its own name instead, as account.js does.
      if (tab && navigator.pdfViewerEnabled !== false) tab.location.href = url;
      else { if (tab) tab.close(); const link = document.createElement('a'); link.href = url; link.download = button.dataset.uploadName || 'SWMS'; link.click(); }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      if (tab) tab.close();
      box('s-flash', esc(error.message), 'bad');
    }
  });

  // ---- What the subcontractor sees ----

  // The notes from the scope each SWMS's draft opens with, as the subcontractor sees them, each with the
  // answer that settles it (messy round 10, blocker 2: the lead could not see a note marked settled by an
  // answer on another subject).
  const notesBlock = (notes, from) => ((notes || []).length ? `<div class="pv-notes"><p class="meta"><strong>Notes from the scope on its draft</strong></p><ul>${notes.map((entry) => `<li>${esc(entry.text)}${entry.clause ? ` <span class="meta">(clause ${esc(entry.clause)})</span>` : ''}${entry.settled ? ` <span class="pv-settled"><strong>Settled:</strong> your answer is "${esc(String(entry.settled).replace(/[.\s]+$/, ''))}".</span>` : ''}</li>`).join('')}</ul></div>` : '');

  async function showPreview(subId) {
    // Said at once: the page takes a few seconds to gather the list (messy round 7).
    view('preview');
    $('pv-intro').textContent = '';
    $('pv-body').innerHTML = '<p class="meta" role="status">Loading what the subcontractor sees...</p>';
    const data = await call('GET', `/api/hse/subcontracts/${encodeURIComponent(subId)}`);
    sub = data;
    const p = data.preview;
    view('preview');
    document.title = `What the subcontractor sees: ${data.subcontract.name}`;
    $('pv-crumbs').innerHTML = `<a href="#/">Your projects</a> › <a href="#/project/${esc(data.project.id)}">${esc(data.project.name)}</a> › <a href="#/sub/${esc(subId)}">${esc(data.subcontract.name)}</a>`;
    $('pv-intro').textContent = `This is what ${p.to} sees on the page the list email links to. SWMS you removed and points you did not answer are left out. Prices, rates and amounts from the scope are never shown.`;
    $('pv-back').href = `#/sub/${subId}`;
    // Only the list, with the high risk work each SWMS holds: never that it may not need a SWMS.
    const swms = p.swms.length ? `<ol>${p.swms.map((item) => `<li><strong>${esc(item.title)}</strong><div>${esc(item.task)}</div>${item.alsoCovers && item.alsoCovers.length ? `<div class="also">Also covers: ${esc(coversList(item.alsoCovers))}.</div>` : ''}${item.highRisk ? `<span class="hrcw hrcw-${esc(item.highRisk.status)}"><strong>${esc(item.highRisk.heading)}.</strong>${item.highRisk.line ? ` ${esc(item.highRisk.line)}.` : ''}</span>` : ''}${item.clauses.length ? `<span class="meta">Scope ${clauseWord(item.clauses)} ${esc(item.clauses.join('; '))}.</span>` : ''}${notesBlock(item.notes, p.from)}</li>`).join('')}</ol>`
      : '<p class="warn">No SWMS are on this list. Put one back or add one if this subcontract needs any.</p>';
    const answers = p.answers.length ? `<h3>Answers from ${esc(p.from)}</h3>${p.answers.map((item) => `<div class="qa"><p class="meta">${esc(item.activity)}${item.clause ? ` (${clauseWord([item.clause])} ${esc(item.clause)})` : ''}</p><p>${esc(item.question)}</p><p><strong>${esc(p.from)}:</strong> ${esc(item.answer)}</p></div>`).join('')}` : '';
    const details = p.siteDetails ? `<h3>Site details to use (version ${esc(p.siteDetails.rev)})</h3><dl class="details">${p.siteDetails.list.map((entry) => `<dt>${esc(entry.label)}</dt><dd>${Array.isArray(entry.value) ? `<ul>${entry.value.map((rule) => `<li>${esc(rule)}</li>`).join('')}</ul>` : esc(entry.value)}</dd>`).join('')}</dl>`
      : `<h3>Site details to use</h3><p class="warn">Not set yet. <a href="#/project/${esc(data.project.id)}/details">Set the site details</a> before the list is sent.</p>`;
    // An account whose ABN does not match the ABN register is shown as Unverified to the subcontractor.
    const unverified = p.fromVerified ? '' : ' <span class="tag unverified" title="This builder\'s ABN does not match the ABN register yet.">Unverified</span>';
    $('pv-body').innerHTML = `<p class="meta">From ${esc(p.from)}${unverified} to ${esc(p.to)}${p.trade ? ` (${esc(p.trade)})` : ''}</p>
      <h2>${esc(p.from)} needs these SWMS from you</h2>
      <p><strong>${esc(p.project.name)}</strong><br>${esc(p.project.workplace)}<br><span class="meta">Principal contractor: ${esc(p.project.pcName)}</span></p>
      <h3>SWMS needed (${p.swms.length})</h3>${swms}${answers}${details}`;
  }

  // ---- Changing the site details ----

  const rulesText = (value) => (Array.isArray(value) ? value.join('\n') : String(value || ''));
  const rulesList = (text) => String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  // The details as the form holds them, compared and sent like the server keeps them.
  function formDetails() {
    const out = {};
    for (const field of page.fields) {
      const input = $(`d-${field.key}`);
      out[field.key] = isList(field) ? rulesList(input.value) : input.value.replace(/\s+/g, ' ').trim();
    }
    return out;
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function keepDraft() {
    if (!edit) return;
    const details = formDetails();
    const changed = page.fields.some((field) => !same(details[field.key], valueOf(edit.start, field)));
    store.set(`${DRAFT_PREFIX}${edit.projectId}`, changed ? JSON.stringify({ baseRev: edit.baseRev, start: edit.start, details, clash: edit.clash, theirs: edit.theirs }) : '');
  }
  function saveLabel() {
    $('d-save').textContent = `Save as version ${page.siteDetails.rev + 1}`;
  }
  function theirsNote(field) {
    if (!edit.clash.includes(field.key)) return '';
    const value = valueOf(edit.theirs.details, field);
    const shown = blank(value) ? 'empty' : isList(field) ? value.join('; ') : value;
    return `<div class="theirs" id="d-${field.key}-theirs"><strong>${esc(edit.theirs.setBy)} saved this in version ${esc(edit.theirs.rev)}:</strong> ${esc(shown)}<br><button type="button" class="link" data-use="${esc(field.key)}">Use theirs</button></div>`;
  }
  function renderFields(values) {
    $('d-fields').innerHTML = page.fields.map((field) => `<label for="d-${field.key}">${esc(field.label)} <span class="hint">${esc(HINTS[field.key] || '')}</span></label>
      ${isList(field) ? `<textarea id="d-${field.key}" maxlength="12000">${esc(rulesText(values[field.key]))}</textarea>` : `<input id="d-${field.key}" type="text" autocomplete="off" maxlength="300" value="${esc(values[field.key] || '')}">`}
      <p class="field-error hidden" id="d-${field.key}-error"></p>${theirsNote(field)}`).join('');
  }

  async function showDetails(projectId) {
    page = await call('GET', `/api/hse/projects/${encodeURIComponent(projectId)}`);
    const current = page.siteDetails;
    const draft = readDraft(page.project.id);
    edit = { projectId: page.project.id, baseRev: current.rev, start: current.details, clash: [], theirs: null };
    let values = current.details;
    box('d-note', '');
    box('d-status', '');
    box('d-problems', '');
    if (draft) {
      edit = { ...edit, baseRev: draft.baseRev, start: draft.start, clash: draft.clash || [], theirs: draft.theirs || null };
      values = draft.details;
      box('d-note', draft.baseRev === current.rev
        ? '<strong>Your changes from before are back.</strong> They are not saved yet. Save them, or press Cancel to drop them.'
        : `<strong>Your changes from before are back.</strong> ${esc(current.setBy)} has saved version ${esc(current.rev)} since you started. When you save, SiteLink keeps their changes and yours, unless you both changed the same detail.`, 'warn');
    }
    view('details');
    $('d-crumbs').innerHTML = `<a href="#/">Your projects</a> › <a href="#/project/${esc(page.project.id)}">${esc(page.project.name)}</a>`;
    renderFields(values);
    saveLabel();
  }

  $('d-fields').addEventListener('input', keepDraft);
  $('d-fields').addEventListener('click', (event) => {
    const use = event.target.closest('[data-use]');
    if (!use) return;
    const field = page.fields.find((item) => item.key === use.dataset.use);
    const value = valueOf(edit.theirs.details, field);
    $(`d-${field.key}`).value = isList(field) ? rulesText(value) : value;
    edit.clash = edit.clash.filter((key) => key !== field.key);
    const note = $(`d-${field.key}-theirs`);
    if (note) note.remove();
    keepDraft();
  });

  // Someone else saved while this person was editing. Details this person did not change take the
  // saved value; details both changed keep this person's words, with the saved ones shown beside.
  function takeCurrent(current, clash) {
    const mine = formDetails();
    for (const field of page.fields) {
      if (same(mine[field.key], valueOf(edit.start, field)) && !clash.includes(field.key)) {
        const value = valueOf(current.details, field);
        $(`d-${field.key}`).value = isList(field) ? rulesText(value) : value;
      }
    }
    const values = formDetails();
    edit = { ...edit, baseRev: current.rev, start: current.details, clash, theirs: current };
    page.siteDetails = current;
    renderFields(values);
    saveLabel();
    keepDraft();
  }

  $('details').addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors($('details'));
    box('d-status', '');
    box('d-problems', '');
    await busy($('d-save'), 'Saving...', async () => {
      try {
        const data = await call('PUT', `/api/hse/projects/${encodeURIComponent(edit.projectId)}/site-details`, { baseRev: edit.baseRev, details: formDetails() });
        store.set(`${DRAFT_PREFIX}${edit.projectId}`, '');
        const projectId = edit.projectId;
        edit = null;
        go(`#/project/${projectId}`, esc(data.message));
      } catch (error) {
        if (error.status === 409) {
          let current = error.conflict && error.conflict.current;
          if (!current) current = (await call('GET', `/api/hse/projects/${encodeURIComponent(edit.projectId)}`)).siteDetails;
          takeCurrent(current, (error.conflict && error.conflict.clash) || []);
          // One note, at the first detail both changed, so the refusal and the choice are in view
          // together on a phone (messy round 6). The older "changes are back" note is taken away.
          box('d-note', '');
          box('d-status', '<strong>Not saved yet.</strong> Choose which to keep above, then save.', 'warn');
          const first = $('d-fields').querySelector('.theirs');
          if (first) {
            first.insertAdjacentHTML('afterbegin', `<p style="margin:0 0 6px"><strong>${esc(error.message)}</strong></p>`);
            first.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            box('d-problems', `<strong>${esc(error.message)}</strong>`, 'warn');
            $('d-problems').scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        } else if (error.fields && Object.keys(error.fields).length > 1) {
          // Every problem at once: a list at the top, and each box's own note.
          box('d-note', '');
          box('d-problems', `<strong>${esc(error.message)}</strong>`, 'bad');
          box('d-status', '<strong>Not saved yet.</strong> Each box with a problem says why.', 'bad');
          fieldErrors('d-', error.fields);
        } else if (error.field && $(`d-${error.field}`)) { box('d-status', '<strong>Not saved yet.</strong>', 'bad'); fieldError(`d-${error.field}`, error.message); }
        else box('d-status', esc(error.message), 'bad');
      }
    });
    if (edit) saveLabel();
  });

  $('d-cancel').addEventListener('click', () => {
    if (!edit) return;
    store.set(`${DRAFT_PREFIX}${edit.projectId}`, '');
    const projectId = edit.projectId;
    edit = null;
    go(`#/project/${projectId}`);
  });

  // ---- Every version ----

  async function showVersions(projectId) {
    page = await call('GET', `/api/hse/projects/${encodeURIComponent(projectId)}`);
    view('versions');
    $('v-crumbs').innerHTML = `<a href="#/">Your projects</a> › <a href="#/project/${esc(page.project.id)}">${esc(page.project.name)}</a>`;
    $('v-list').innerHTML = page.versions.length ? page.versions.map((version) => `<details class="version" data-rev="${esc(version.rev)}">
      <summary><span><strong>Version ${esc(version.rev)}</strong>${version.rev === page.siteDetails.rev ? ' <span class="tag">Current</span>' : ''}<br><span class="meta">Set by ${esc(version.setBy)} on ${esc(version.setOn)}. Changed: ${esc(version.changed.join(', ').toLowerCase())}.</span></span></summary>
      <dl class="details"></dl></details>`).join('') : '<p class="meta">No versions yet.</p>';
  }
  $('v-list').addEventListener('toggle', async (event) => {
    const item = event.target;
    if (!item.open || item.dataset.loaded) return;
    try {
      const { siteDetails } = await call('GET', `/api/hse/projects/${encodeURIComponent(page.project.id)}/site-details/${encodeURIComponent(item.dataset.rev)}`);
      item.querySelector('dl').innerHTML = detailsList(page.fields, siteDetails.details);
      item.dataset.loaded = '1';
    } catch (error) {
      item.querySelector('dl').innerHTML = `<dd class="unset">${esc(error.message)}</dd>`;
    }
  }, true);

  // ---- Which page to show ----

  async function route() {
    const waiting = pendingFlash;
    pendingFlash = null;
    flash(waiting ? waiting.message : '', waiting ? waiting.kind : 'ok');
    if (!token) { signedOut(''); return; }
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    document.title = 'SiteLink by SiteWrite';
    try {
      if (!me) await loadMe();
      if (!me.name || parts[0] === 'you') { showYou(); return; }
      if (!orgs.length) { showSetup(); return; }
      if (!(parts[0] === 'sub' && (parts.length === 2 || parts[2] === 'item'))) stopPoll();
      if (parts[0] === 'team') await showTeam(parts[1]);
      else if (parts[0] === 'project' && parts[2] === 'subs' && parts[3] === 'new') await showSubForm(parts[1], null);
      else if (parts[0] === 'sub' && parts[2] === 'edit') await showSubForm(null, parts[1]);
      else if (parts[0] === 'sub' && parts[2] === 'preview') await showPreview(parts[1]);
      else if (parts[0] === 'sub' && parts[2] === 'item') {
        // Opened at one SWMS (the one screen's "Record it"): its card, with the file uploaded for it.
        await showSub(parts[1]);
        const card = $(`item-${parts[3]}`);
        const file = card && card.querySelector('.uploaded');
        if (file || card) { (file || card).scrollIntoView({ block: 'center' }); return; }
      } else if (parts[0] === 'sub') await showSub(parts[1]);
      else if (parts[0] === 'account') await showAccount(parts[1]);
      else if (parts[0] === 'new') await showProjectForm(parts[1], null);
      else if (parts[0] === 'project' && parts[2] === 'details') await showDetails(parts[1]);
      else if (parts[0] === 'project' && parts[2] === 'versions') await showVersions(parts[1]);
      else if (parts[0] === 'project' && parts[2] === 'edit') await showProjectForm(null, parts[1]);
      else if (parts[0] === 'project') await showProject(parts[1]);
      else await showHome();
    } catch (error) {
      if (error.status === 401) return;
      if (error.status === 404 && parts.length) { go('#/', `<strong>${esc(error.message)}</strong>`, 'bad'); return; }
      flash(esc(error.message), 'bad');
    }
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  // A link to a page of SiteLink (the "SWMS submitted" email's link to the project) opened signed out is
  // kept, and opened once the sign-in link is used (messy round 8: it landed on the project list).
  const AFTER_KEY = 'sitelink.after';
  (async () => {
    const params = new URLSearchParams(location.search);
    const login = params.get('login');
    if (!token && !login && /^#\/(?:project|sub)\//.test(location.hash)) store.set(AFTER_KEY, location.hash);
    if (login && !location.hash) {
      const after = store.get(AFTER_KEY);
      if (after && /^#\/(?:project|sub)\/[\w-]+(?:\/[\w-]+)*$/.test(after)) history.replaceState(null, '', `${location.pathname}${location.search}${after}`);
    }
    if (login) store.set(AFTER_KEY, '');
    if (login) {
      // The link works once: it is taken out of the address so a reload or Back does not use it again.
      history.replaceState(null, '', `${location.pathname}${location.hash}`);
      const before = token;
      try {
        ({ token } = await call('POST', '/api/hse/verify', { token: login }));
        store.set(KEY, token);
        me = null;
      } catch (error) {
        token = before;
        if (!token) {
          signedOut('');
          box('signin-note', `<strong>${esc(error.message)}</strong><p>Enter your email to get a new link.</p>`, 'bad');
          return;
        }
        pendingFlash = { message: `${esc(error.message)} You are still signed in on this device.`, kind: 'warn' };
      }
    }
    route();
  })();
})();
