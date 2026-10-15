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
  const store = {
    get: (key) => { try { return localStorage.getItem(key) || ''; } catch { return ''; } },
    set: (key, value) => { try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch { /* not kept */ } },
  };
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

  async function call(method, route, body) {
    const response = await fetch(route, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { 'X-Reviewer-Token': token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && token) signedOut('You have been signed out. Sign in again to carry on.');
    if (!response.ok) throw Object.assign(new Error(data.message || 'Something went wrong. Try again.'), { status: response.status, field: data.field, conflict: data.conflict, register: data.register, taken: data.taken });
    return data;
  }

  const VIEWS = ['signin', 'you', 'setup', 'home', 'account', 'team', 'project-form', 'project', 'details', 'versions'];
  function view(name) {
    for (const id of VIEWS) $(`view-${id}`).classList.toggle('hidden', id !== name);
  }
  function box(id, html, kind = '') {
    $(id).innerHTML = html ? `<div class="${kind}">${html}</div>` : '';
  }
  function flash(html, kind = 'ok') { box('flash', html, kind); }
  function go(hash, message = null, kind = 'ok') {
    pendingFlash = message ? { message, kind } : null;
    if (location.hash === hash) route();
    else location.hash = hash;
  }

  function clearErrors(form) {
    form.querySelectorAll('.has-error').forEach((el) => el.classList.remove('has-error'));
    form.querySelectorAll('.field-error').forEach((el) => { el.classList.add('hidden'); el.textContent = ''; });
  }
  function fieldError(id, message) {
    const input = $(id);
    const note = $(`${id}-error`);
    if (input) input.classList.add('has-error');
    if (note) { note.textContent = message; note.classList.remove('hidden'); }
    if (input) { input.scrollIntoView({ behavior: 'smooth', block: 'center' }); input.focus({ preventScroll: true }); }
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
    // Unsaved site details are not left on a shared device.
    try { Object.keys(localStorage).filter((key) => key.startsWith(DRAFT_PREFIX)).forEach((key) => localStorage.removeItem(key)); } catch { /* none kept */ }
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

  function showYou() {
    view('you');
    $('you-name').value = me.name || '';
    $('you-position').value = me.position || '';
    $('you-phone').value = me.phone || '';
    box('you-status', '');
    if (!me.name) $('you-name').focus();
  }
  $('you').addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors($('you'));
    if (!$('you-name').value.trim()) { fieldError('you-name', 'Enter your name.'); return; }
    try {
      const data = await call('PUT', '/api/hse/me', { name: $('you-name').value, position: $('you-position').value, phone: $('you-phone').value });
      me = { ...me, ...data.me };
      $('who').textContent = `${me.name} (${me.email})`;
      go('#/', 'Your details are saved.');
    } catch (error) {
      if (error.field === 'name') fieldError('you-name', error.message);
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
        await loadMe();
        go('#/', esc(data.message));
      } catch (error) {
        if (error.register && error.register.name) {
          fieldError('setup-abn', 'Check this ABN.');
          box('setup-status', `<strong>${esc(error.message)}</strong>
            <div class="actions"><button type="button" class="light" id="setup-use">Use ${esc(error.register.name)}</button><button type="button" class="light" id="setup-keep">Keep ${esc($('setup-name').value.trim())} and set up</button></div>
            <p>If you keep your own name, the account shows Unverified until its name matches the ABN register.</p>`, 'warn');
          $('setup-use').dataset.name = error.register.name;
        } else if (error.taken) {
          fieldError('setup-abn', 'This ABN already has an account.');
          box('setup-status', `<strong>${esc(error.message)}</strong>`, 'warn');
        } else if (error.field === 'name' || error.field === 'abn') fieldError(`setup-${error.field}`, error.message);
        else box('setup-status', esc(error.message), 'bad');
      }
    });
  }
  $('setup').addEventListener('submit', (event) => { event.preventDefault(); setUp(false); });
  $('setup-status').addEventListener('click', (event) => {
    if (event.target.closest('#setup-use')) { $('setup-name').value = event.target.closest('#setup-use').dataset.name; setUp(false); }
    if (event.target.closest('#setup-keep')) setUp(true);
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
    const check = org.verified ? '' : `<div class="warn"><strong>Unverified.</strong> ${esc(org.abnNote)}${lead && org.registerName ? `<div class="actions"><button type="button" class="light" data-use-name="${esc(org.registerName)}">Use ${esc(org.registerName)} as the account name</button></div>` : ''}${lead && org.abn && (org.abnCheck === 'unavailable' || !org.abnCheck) ? '<div class="actions"><button type="button" class="light" id="acct-recheck">Check the ABN register again</button></div>' : ''}</div>`;
    const abnBlock = org.abn
      ? `<label>ABN</label><p class="abn-shown" id="acct-abn-shown">${esc(org.abnShown)}</p><p class="meta">The ABN links this account and cannot be changed. If it is wrong, contact SiteWrite.</p>`
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
      </div>`;
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
    const useName = event.target.closest('[data-use-name]');
    const recheck = event.target.closest('#acct-recheck');
    const makeLead = event.target.closest('[data-make-lead]');
    if (useName) {
      $('acct-name').value = useName.dataset.useName;
      await saveAccount(useName.dataset.useName);
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
  }
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
    }
    view('project-form');
  }
  $('pf-workplace').addEventListener('input', () => {
    if (!autoState || !window.SiteWriteAddress) return;
    const { state } = window.SiteWriteAddress.stateFromAddress($('pf-workplace').value);
    if (state) $('pf-state').value = state;
  });
  $('pf-state').addEventListener('change', () => { autoState = false; });
  $('project-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors($('project-form'));
    box('pf-status', '');
    const body = { name: $('pf-name').value, workplace: $('pf-workplace').value, state: $('pf-state').value, pcName: $('pf-pc').value };
    if (!body.name.trim()) { fieldError('pf-name', 'Enter the project name.'); return; }
    if (!body.workplace.trim()) { fieldError('pf-workplace', 'Enter the job address.'); return; }
    if (!body.state) { fieldError('pf-state', 'Choose the state or territory the work is in.'); return; }
    await busy($('pf-save'), 'Saving...', async () => {
      try {
        if (formProject) {
          await call('PUT', `/api/hse/projects/${encodeURIComponent(formProject.id)}`, body);
          go(`#/project/${formProject.id}`, 'The project details are saved.');
        } else {
          const { project } = await call('POST', `/api/hse/orgs/${encodeURIComponent(formOrg.id)}/projects`, body);
          go(`#/project/${project.id}`, 'The project is made. Now set its site details.');
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
          box('d-status', `<strong>${esc(error.message)}</strong>`, 'warn');
          $('d-status').scrollIntoView({ behavior: 'smooth', block: 'center' });
          const first = $('d-fields').querySelector('.theirs');
          if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (error.field && $(`d-${error.field}`)) fieldError(`d-${error.field}`, error.message);
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
      if (parts[0] === 'team') await showTeam(parts[1]);
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

  (async () => {
    const params = new URLSearchParams(location.search);
    const login = params.get('login');
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
