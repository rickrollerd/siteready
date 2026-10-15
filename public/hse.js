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
    if (!response.ok) throw Object.assign(new Error(data.message || 'Something went wrong. Try again.'), { status: response.status, field: data.field, conflict: data.conflict, register: data.register, taken: data.taken, limit: data.limit, replace: data.replace });
    return data;
  }

  const VIEWS = ['signin', 'you', 'setup', 'home', 'account', 'team', 'project-form', 'project', 'details', 'versions', 'sub-form', 'sub', 'preview'];
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
      const list = !sub.swms && !sub.removed ? (sub.scope === 'reading' ? 'Not listed yet' : 'None yet') : `${sub.swms} SWMS${sub.removed ? ` (${sub.removed} removed)` : ''}${sub.pointsOpen ? `<span class="scope-state">${sub.pointsOpen} ${sub.pointsOpen === 1 ? 'point' : 'points'} to answer</span>` : ''}`;
      return `<tr><td class="sub-name"><a href="#/sub/${esc(sub.id)}">${esc(sub.name)}</a><span class="scope-state">${esc(sub.trade)} · ${esc(SCOPE_STATE[sub.scope] || SCOPE_STATE.none)}</span></td>
        <td data-label="SWMS list">${list}</td><td data-label="SWMS in">None yet</td><td data-label="Review status">List not sent yet</td><td data-label="Conditions outstanding">None</td><td data-label="Updated after plan change">No plans yet</td><td data-label="Last contact">None yet</td></tr>`;
    }).join('') : '<tr><td class="empty" colspan="7">No subcontractors yet. Add each subcontract and upload its scope of works. SiteLink lists the SWMS each one needs.</td></tr>';
  }

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
      $('sf-save').textContent = 'Save';
      $('sf-cancel').href = `#/sub/${subId}`;
    } else {
      const data = await call('GET', `/api/hse/projects/${encodeURIComponent(projectId)}`);
      subForm = { projectId: data.project.id, subId: null };
      $('sf-title').textContent = 'Add a subcontract';
      $('sf-crumbs').innerHTML = `<a href="#/">Your projects</a> › <a href="#/project/${esc(data.project.id)}">${esc(data.project.name)}</a>`;
      for (const id of ['sf-name', 'sf-trade', 'sf-email']) $(id).value = '';
      $('sf-save').textContent = 'Add the subcontract';
      $('sf-cancel').href = `#/project/${data.project.id}`;
    }
    view('sub-form');
  }
  $('sub-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors($('sub-form'));
    box('sf-status', '');
    const body = { name: $('sf-name').value, trade: $('sf-trade').value, email: $('sf-email').value };
    if (!body.name.trim()) { fieldError('sf-name', 'Enter the subcontractor\'s company name.'); return; }
    if (!body.trade.trim()) { fieldError('sf-trade', 'Enter the trade, for example Formwork or Electrical.'); return; }
    await busy($('sf-save'), 'Saving...', async () => {
      try {
        if (subForm.subId) {
          await call('PUT', `/api/hse/subcontracts/${encodeURIComponent(subForm.subId)}`, body);
          go(`#/sub/${subForm.subId}`, 'The subcontract details are saved.');
        } else {
          const data = await call('POST', `/api/hse/projects/${encodeURIComponent(subForm.projectId)}/subcontracts`, body);
          go(`#/sub/${data.subcontract.id}`, `${esc(data.subcontract.name)} is added. Now upload its scope of works.`);
        }
      } catch (error) {
        if (['name', 'trade', 'email'].includes(error.field)) fieldError(`sf-${error.field}`, error.message);
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
  const hrcwLine = (flag) => (flag ? `<span class="hrcw hrcw-${esc(flag.status)}"><strong>${esc(flag.heading)}.</strong>${flag.lines && flag.lines[0] ? ` ${esc(flag.lines[0])}.` : ''}</span>` : '');

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
      html += `<p>${esc(subcontract.docName)} <span class="meta">read on ${esc(subcontract.scopeOn)}, uploaded by ${esc(subcontract.scopeBy)}.</span></p>${same}
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

  function itemCard(item) {
    const clauses = item.clauses.length ? `<p class="meta">From scope ${clauseWord(item.clauses)} ${esc(item.clauses.join(', '))}.</p>` : item.source === 'added' ? '<p class="meta">Added by your team.</p>' : '';
    if (item.removed) {
      return `<div class="swms-item removed" id="item-${esc(item.id)}"><h3>${esc(item.title)}</h3>${item.removedWhy ? `<p class="meta">${esc(item.removedWhy)}</p>` : ''}
        <div class="actions"><button type="button" class="light" data-restore="${esc(item.id)}">Put back</button></div></div>`;
    }
    return `<div class="swms-item" id="item-${esc(item.id)}"><h3>${esc(item.title)}</h3>${hrcwLine(item.highRisk)}
      <p class="work" id="item-${esc(item.id)}-work">${esc(item.task)}</p>${clauses}
      <div class="actions" id="item-${esc(item.id)}-buttons"><button type="button" class="light" data-reword="${esc(item.id)}">Change the work</button><button type="button" class="danger" data-remove-item="${esc(item.id)}">Remove</button></div></div>`;
  }

  function renderList() {
    const kept = sub.items.filter((item) => !item.removed);
    const removed = sub.items.filter((item) => item.removed);
    $('s-list-title').textContent = `SWMS this subcontract needs (${kept.length})`;
    let html = '';
    if (sub.reading.status === 'none' && !sub.items.length) html += '<p class="meta">Upload the scope above, or add the SWMS yourself below.</p>';
    else if (sub.reading.status === 'reading' && !sub.items.length) html += '<p class="meta">The list shows here when the scope has been read.</p>';
    else if (!kept.length) html += '<div class="warn"><strong>Every SWMS is removed.</strong> The subcontractor would be told this subcontract needs no SWMS. Put one back or add one if it needs any.</div>';
    html += kept.map(itemCard).join('');
    if (removed.length) html += `<details${kept.length ? '' : ' open'}><summary>Removed (${removed.length})</summary>${removed.map(itemCard).join('')}</details>`;
    const duties = sub.reading.duties || [];
    if (duties.length) html += `<details><summary>${duties.length} ${duties.length === 1 ? 'duty' : 'duties'} in the scope ${duties.length === 1 ? 'needs' : 'need'} no SWMS</summary><ul>${duties.map((duty) => `<li>${esc(duty)}</li>`).join('')}</ul></details>`;
    $('s-list').innerHTML = html;
  }

  function renderPoints() {
    const points = sub.points;
    if (!points.length) {
      $('s-points-card').innerHTML = `<h2>Points to confirm</h2><p class="meta">${sub.reading.status === 'done' ? 'The scope leaves no points open about who does the work or what you provide.' : 'Points the scope leaves open show here when it has been read.'}</p>`;
      return;
    }
    const open = points.filter((point) => !point.answer).length;
    $('s-points-card').innerHTML = `<h2>Points to confirm (${points.length})</h2>
      <p class="meta">The scope leaves these open. Answer the ones you can. Only answered points go to the subcontractor, with your answer. ${open ? `${open} not answered yet.` : 'All are answered.'}</p>
      ${points.map((point) => `<div class="point" id="point-${esc(point.id)}">
        <p><strong>${esc(point.activity)}</strong>${point.clause ? ` <span class="meta">(${clauseWord([point.clause])} ${esc(point.clause)})</span>` : ''}</p>
        <p>${esc(point.question)}</p>
        <label for="answer-${esc(point.id)}">Your answer ${point.answer ? `<span class="tag">Answered: goes to the subcontractor</span>` : '<span class="tag grey">Not answered: not sent</span>'}</label>
        <textarea id="answer-${esc(point.id)}" maxlength="1000">${esc(point.answer)}</textarea>
        <p class="field-error hidden" id="answer-${esc(point.id)}-error"></p>
        ${point.answer ? `<p class="meta">Answered by ${esc(point.answeredBy)} on ${esc(point.answeredOn)}.</p>` : ''}
        <div class="actions"><button type="button" class="light" data-answer="${esc(point.id)}">Save answer</button></div>
      </div>`).join('')}`;
  }

  function renderSub(data, message = '') {
    sub = data;
    const s = data.subcontract;
    document.title = `${s.name}: SiteLink`;
    $('s-crumbs').innerHTML = `<a href="#/">Your projects</a> › <a href="#/project/${esc(data.project.id)}">${esc(data.project.name)}</a>`;
    $('s-name').textContent = s.name;
    $('s-meta').textContent = [s.trade, s.email || 'No contact email yet'].filter(Boolean).join(' · ');
    $('s-edit').href = `#/sub/${s.id}/edit`;
    $('s-preview-link').href = `#/sub/${s.id}/preview`;
    $('s-preview-go').href = `#/sub/${s.id}/preview`;
    renderScope();
    renderList();
    renderPoints();
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
    $('s-add-title').value = '';
    $('s-add-task').value = '';
    renderSub(data);
    watch();
  }

  async function sendScope(button, replace) {
    const input = $('s-file');
    const file = input && input.files[0];
    clearErrors($('s-scope'));
    if (!file) { fieldError('s-file', 'Choose the scope file first.'); return; }
    if (!ACCEPTED.test(file.name)) { input.value = ''; fieldError('s-file', NOT_A_SCOPE); return; }
    if (file.size > 10 * 1024 * 1024) { fieldError('s-file', 'The file is too large. Upload the scope of works only.'); return; }
    if (window.SiteWriteProgress) window.SiteWriteProgress.unlockAudio();
    await busy(button, 'Sending...', async () => {
      try {
        const data = await call('POST', `/api/hse/subcontracts/${encodeURIComponent(sub.subcontract.id)}/scope`, { file: { name: file.name, data: await readFile(file) }, ...(replace ? { replace: true } : {}) });
        stopPoll();
        watching = data.reading.status === 'reading';
        renderSub(data, data.message || '');
        watch();
      } catch (error) {
        if (error.replace) {
          if (window.confirm(`${error.message} Read the new scope?`)) await sendScope(button, true);
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

  async function changeItem(itemId, body, focusId) {
    const data = await call('PUT', `/api/hse/subcontracts/${encodeURIComponent(sub.subcontract.id)}/items/${encodeURIComponent(itemId)}`, body);
    renderSub(data);
    box('s-flash', esc(data.message || ''), 'ok');
    const back = focusId && $(focusId);
    if (back && back.scrollIntoView) back.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  $('s-list').addEventListener('click', async (event) => {
    const remove = event.target.closest('[data-remove-item]');
    const restore = event.target.closest('[data-restore]');
    const reword = event.target.closest('[data-reword]');
    const save = event.target.closest('[data-save-work]');
    const cancel = event.target.closest('[data-cancel-work]');
    try {
      if (remove) {
        remove.disabled = true;
        await changeItem(remove.dataset.removeItem, { removed: true }, 's-list-card');
      } else if (restore) {
        restore.disabled = true;
        await changeItem(restore.dataset.restore, { removed: false }, `item-${restore.dataset.restore}`);
      } else if (reword) {
        const id = reword.dataset.reword;
        const item = sub.items.find((one) => one.id === id);
        $(`item-${id}-work`).outerHTML = `<div id="item-${esc(id)}-edit"><label for="work-${esc(id)}">The work this SWMS covers</label><textarea id="work-${esc(id)}" maxlength="1500" style="min-height:90px">${esc(item.task)}</textarea><p class="field-error hidden" id="work-${esc(id)}-error"></p></div>`;
        $(`item-${id}-buttons`).innerHTML = `<button type="button" data-save-work="${esc(id)}">Save the work</button><button type="button" class="light" data-cancel-work="${esc(id)}">Cancel</button>`;
        $(`work-${id}`).focus();
      } else if (save) {
        const id = save.dataset.saveWork;
        const task = $(`work-${id}`).value;
        if (!task.trim()) { fieldError(`work-${id}`, 'Say what work this SWMS covers, in a sentence or two.'); return; }
        save.disabled = true;
        try {
          await changeItem(id, { task }, `item-${id}`);
        } catch (error) {
          save.disabled = false;
          if (error.field === 'task') { fieldError(`work-${id}`, error.message); return; }
          throw error;
        }
      } else if (cancel) {
        renderList();
      }
    } catch (error) {
      box('s-flash', esc(error.message), 'bad');
      if (remove) remove.disabled = false;
      if (restore) restore.disabled = false;
    }
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
        renderSub(data);
        box('s-flash', esc(data.message), 'ok');
      } catch (error) {
        if (['title', 'task'].includes(error.field)) fieldError(`s-add-${error.field}`, error.message);
        else box('s-flash', esc(error.message), 'bad');
      }
    });
  });

  $('s-points-card').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-answer]');
    if (!button) return;
    const id = button.dataset.answer;
    clearErrors($(`point-${id}`));
    await busy(button, 'Saving...', async () => {
      try {
        const data = await call('PUT', `/api/hse/subcontracts/${encodeURIComponent(sub.subcontract.id)}/points/${encodeURIComponent(id)}`, { answer: $(`answer-${id}`).value });
        renderSub(data);
        box('s-flash', esc(data.message), 'ok');
        const back = $(`point-${id}`);
        if (back && back.scrollIntoView) back.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  // ---- What the subcontractor sees ----

  async function showPreview(subId) {
    const data = await call('GET', `/api/hse/subcontracts/${encodeURIComponent(subId)}`);
    sub = data;
    const p = data.preview;
    view('preview');
    document.title = `What the subcontractor sees: ${data.subcontract.name}`;
    $('pv-crumbs').innerHTML = `<a href="#/">Your projects</a> › <a href="#/project/${esc(data.project.id)}">${esc(data.project.name)}</a> › <a href="#/sub/${esc(subId)}">${esc(data.subcontract.name)}</a>`;
    $('pv-intro').textContent = `This is the list ${p.to} will get from ${p.from}. SWMS you removed and points you did not answer are left out. Prices, rates and amounts from the scope are never shown. Sending the list is not open yet.`;
    $('pv-back').href = `#/sub/${subId}`;
    const swms = p.swms.length ? `<ol>${p.swms.map((item) => `<li><strong>${esc(item.title)}</strong><div>${esc(item.task)}</div>${item.highRisk ? `<span class="hrcw hrcw-${esc(item.highRisk.status)}">${esc(item.highRisk.heading)}.</span>` : ''}${item.clauses.length ? `<span class="meta">Scope ${clauseWord(item.clauses)} ${esc(item.clauses.join(', '))}.</span>` : ''}</li>`).join('')}</ol>`
      : '<p class="warn">No SWMS are on this list. Put one back or add one if this subcontract needs any.</p>';
    const answers = p.answers.length ? `<h3>Answers from ${esc(p.from)}</h3>${p.answers.map((item) => `<div class="qa"><p class="meta">${esc(item.activity)}${item.clause ? ` (${clauseWord([item.clause])} ${esc(item.clause)})` : ''}</p><p>${esc(item.question)}</p><p><strong>${esc(p.from)}:</strong> ${esc(item.answer)}</p></div>`).join('')}` : '';
    const details = p.siteDetails ? `<h3>Site details to use (version ${esc(p.siteDetails.rev)})</h3><dl class="details">${p.siteDetails.list.map((entry) => `<dt>${esc(entry.label)}</dt><dd>${Array.isArray(entry.value) ? `<ul>${entry.value.map((rule) => `<li>${esc(rule)}</li>`).join('')}</ul>` : esc(entry.value)}</dd>`).join('')}</dl>`
      : `<h3>Site details to use</h3><p class="warn">Not set yet. <a href="#/project/${esc(data.project.id)}/details">Set the site details</a> before the list is sent.</p>`;
    $('pv-body').innerHTML = `<p class="meta">From ${esc(p.from)} to ${esc(p.to)}${p.trade ? ` (${esc(p.trade)})` : ''}</p>
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
      if (!(parts[0] === 'sub' && parts.length === 2)) stopPoll();
      if (parts[0] === 'team') await showTeam(parts[1]);
      else if (parts[0] === 'project' && parts[2] === 'subs' && parts[3] === 'new') await showSubForm(parts[1], null);
      else if (parts[0] === 'sub' && parts[2] === 'edit') await showSubForm(null, parts[1]);
      else if (parts[0] === 'sub' && parts[2] === 'preview') await showPreview(parts[1]);
      else if (parts[0] === 'sub') await showSub(parts[1]);
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
