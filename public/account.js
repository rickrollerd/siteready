// Accounts: signing in by email link or Face ID, the company's saved SWMS and
// sites, downloads, worker sign-on QR codes and review reminders. Without an
// account the SWMS can be previewed, and downloads ask the user to sign in.
(() => {
  const S = window.SiteReady;
  const { api, esc } = S;
  const SESSION_KEY = 'siteready.session';
  const REVIEWER_KEY = 'siteready-reviewer';
  let session = read(SESSION_KEY);
  let me = null;
  let sites = [];
  let config = { accounts: false, trialDays: 14 };
  const $ = (id) => document.getElementById(id);

  function read(key) {
    try { return localStorage.getItem(key) || ''; } catch { return ''; }
  }
  function write(key, value) {
    try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch { /* not kept */ }
  }

  async function call(method, route, body) {
    const response = await fetch(api(route), {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(session ? { Authorization: `Bearer ${session}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 401 && session) signedOut();
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw Object.assign(new Error(data.message || 'Something went wrong. Try again.'), { status: response.status });
    }
    const type = response.headers.get('content-type') || '';
    return type.includes('application/json') ? response.json() : response;
  }

  async function download(route, fallbackName, body) {
    const response = await call(body ? 'POST' : 'GET', route, body);
    const blob = await response.blob();
    const match = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') || '');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = match ? match[1] : fallbackName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---- Face ID (passkeys) ----

  const toBytes = (value) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
  const toText = (buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const passkeysWork = () => Boolean(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);

  async function setUpFaceId() {
    const { options, challengeId } = await call('POST', '/api/auth/passkey/register/options');
    const credential = await navigator.credentials.create({
      publicKey: {
        ...options,
        challenge: toBytes(options.challenge),
        user: { ...options.user, id: toBytes(options.user.id) },
        excludeCredentials: (options.excludeCredentials || []).map((item) => ({ ...item, id: toBytes(item.id) })),
      },
    });
    const response = {
      id: credential.id,
      rawId: toText(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: toText(credential.response.clientDataJSON),
        attestationObject: toText(credential.response.attestationObject),
        transports: credential.response.getTransports ? credential.response.getTransports() : [],
      },
      clientExtensionResults: credential.getClientExtensionResults(),
      authenticatorAttachment: credential.authenticatorAttachment || undefined,
    };
    await call('POST', '/api/auth/passkey/register', { challengeId, response });
  }

  async function signInWithFaceId() {
    const { options, challengeId } = await call('POST', '/api/auth/passkey/login/options');
    const credential = await navigator.credentials.get({
      publicKey: { ...options, challenge: toBytes(options.challenge), allowCredentials: [] },
    });
    const response = {
      id: credential.id,
      rawId: toText(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: toText(credential.response.clientDataJSON),
        authenticatorData: toText(credential.response.authenticatorData),
        signature: toText(credential.response.signature),
        userHandle: credential.response.userHandle ? toText(credential.response.userHandle) : undefined,
      },
      clientExtensionResults: credential.getClientExtensionResults(),
      authenticatorAttachment: credential.authenticatorAttachment || undefined,
    };
    const { token } = await call('POST', '/api/auth/passkey/login', { challengeId, response });
    await signedIn(token);
  }

  // ---- Signing in and out ----

  function status(id, text, isError) {
    const el = $(id);
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('hidden', !text);
    el.classList.toggle('error-note', Boolean(isError));
  }

  async function signedIn(token) {
    session = token;
    write(SESSION_KEY, token);
    await refresh();
    $('signin').classList.add('hidden');
    if (passkeysWork() && me && !me.user.hasPasskey) $('faceid-offer').classList.remove('hidden');
    showPanel('my-swms');
  }

  function signedOut() {
    session = '';
    me = null;
    write(SESSION_KEY, '');
    renderBar();
  }

  async function refresh() {
    if (!session) return renderBar();
    try {
      me = await call('GET', '/api/me');
      S.setProfile(me.company);
      sites = (await call('GET', '/api/sites')).sites;
      S.addPrincipals(sites.map((site) => site.principalContractor), false);
      S.setPreparedBy(me.user.name || read(REVIEWER_KEY));
    } catch {
      me = null;
    }
    renderBar();
    renderSitePicker();
  }

  function trialText(company) {
    if (company.planStatus === 'active' || company.planStatus === 'trialing') return 'Subscribed';
    const days = Math.ceil((new Date(company.trialEndsAt) - Date.now()) / 86400000);
    return days > 0 ? `Free trial: ${days} day${days === 1 ? '' : 's'} left` : 'Free trial ended';
  }

  function renderBar() {
    const bar = $('account-bar');
    if (!config.accounts) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    if (!me) {
      bar.innerHTML = `<span class="bar-note">Try it free: preview any SWMS. Sign in to download, save and share.</span>
        <button type="button" class="small" data-open="signin">Sign in or start free trial</button>`;
      document.querySelectorAll('.signed-in-only').forEach((el) => el.classList.add('hidden'));
      return;
    }
    const paying = ['active', 'trialing', 'past_due'].includes(me.company.planStatus);
    const billingLink = !config.billing ? '' : paying
      ? '<button type="button" class="link" id="manage-billing">Billing</button>'
      : `<button type="button" class="small" id="subscribe">Subscribe, ${esc(config.price)}</button>`;
    bar.innerHTML = `<span class="bar-note"><strong>${esc(me.company.name || me.user.email)}</strong> · ${esc(trialText(me.company))}</span>
      <span class="bar-links">
        ${billingLink}
        <button type="button" class="link" data-panel="my-swms">My SWMS</button>
        <button type="button" class="link" data-panel="sites-panel">Sites</button>
        <button type="button" class="link" data-panel="team-panel">Team</button>
        <button type="button" class="link" id="sign-out">Sign out</button>
      </span>`;
    document.querySelectorAll('.signed-in-only').forEach((el) => el.classList.remove('hidden'));
  }

  function showPanel(id) {
    ['my-swms', 'sites-panel', 'team-panel'].forEach((panel) => $(panel).classList.toggle('hidden', panel !== id));
    if (id === 'my-swms') loadSwms();
    if (id === 'sites-panel') renderSites();
    if (id === 'team-panel') loadTeam();
    $(id).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.addEventListener('click', async (event) => {
    const open = event.target.closest('[data-open="signin"]');
    if (open) {
      $('signin').classList.remove('hidden');
      $('faceid-signin').classList.toggle('hidden', !passkeysWork());
      $('signin-email').focus();
      return;
    }
    const panel = event.target.closest('[data-panel]');
    if (panel) return showPanel(panel.dataset.panel);
    if (event.target.id === 'subscribe' || event.target.closest('[data-subscribe]')) {
      try {
        const { url } = await call('POST', '/api/billing/checkout');
        window.location.href = url;
      } catch (error) {
        alert(error.message);
      }
      return;
    }
    if (event.target.id === 'manage-billing') {
      try {
        const { url } = await call('POST', '/api/billing/portal');
        window.location.href = url;
      } catch (error) {
        alert(error.message);
      }
      return;
    }
    if (event.target.id === 'sign-out') {
      await call('POST', '/api/auth/logout').catch(() => {});
      signedOut();
      ['my-swms', 'sites-panel', 'team-panel'].forEach((id) => $(id).classList.add('hidden'));
    }
  });

  $('signin-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    status('signin-status', 'Sending…');
    try {
      const data = await call('POST', '/api/auth/email', { email: $('signin-email').value });
      status('signin-status', `${data.message} Open it on this device.`);
    } catch (error) {
      status('signin-status', error.message, true);
    }
  });

  $('faceid-signin').addEventListener('click', async () => {
    try {
      await signInWithFaceId();
    } catch (error) {
      status('signin-status', error.name === 'NotAllowedError' ? 'Face ID was cancelled.' : error.message, true);
    }
  });

  $('faceid-setup').addEventListener('click', async () => {
    try {
      await setUpFaceId();
      $('faceid-offer').classList.add('hidden');
      me.user.hasPasskey = true;
      status('faceid-status', 'Face ID is set up. Next time, sign in with Face ID.');
    } catch (error) {
      status('faceid-status', error.name === 'NotAllowedError' ? 'Face ID set-up was cancelled.' : error.message, true);
    }
  });
  $('faceid-later').addEventListener('click', () => $('faceid-offer').classList.add('hidden'));

  // ---- After a draft is prepared: downloads, saving ----

  function confirmBlock(prefix) {
    return `
      <label class="check"><input type="checkbox" id="${prefix}-confirm"><span>I understand this is a draft. My business will check it against the site, change it where needed, and approve it before it is used. <a href="/terms.html" target="_blank" rel="noopener">Terms of use</a></span></label>
      <div class="field">
        <label for="${prefix}-name">Your name (printed on the SWMS)</label>
        <input id="${prefix}-name" type="text" autocomplete="name" maxlength="120" value="${esc(read(REVIEWER_KEY) || (me && me.user.name) || '')}">
      </div>`;
  }

  function confirmed(prefix) {
    const tick = $(`${prefix}-confirm`).checked;
    const name = $(`${prefix}-name`).value.trim();
    if (!tick || !name) throw new Error('Tick the box and enter your name first.');
    write(REVIEWER_KEY, name);
    return { reviewConfirmed: true, reviewedBy: name };
  }

  S.showActions = (draft, original) => {
    let input = original;
    const box = $('result-actions');
    if (config.accounts && !me) {
      box.innerHTML = `<div class="panel confirm"><p><strong>Like it?</strong> Sign in, or start a free ${config.trialDays} day trial, to download this SWMS as Word or PDF, save it, and get workers to sign on by QR code.</p>
        <div class="actions"><button type="button" data-open="signin">Sign in or start free trial</button></div></div>`;
      return;
    }
    if (me && !me.company.hasAccess) {
      box.innerHTML = `<div class="panel confirm"><p><strong>Your free trial has ended.</strong> Subscribe for ${esc(config.price)} to keep downloading, saving and sharing SWMS. Your saved SWMS and sites are kept.</p>
        ${config.billing ? '<div class="actions"><button type="button" data-subscribe>Subscribe</button></div>' : ''}</div>`;
      return;
    }
    const kind = draft.kind;
    // Without accounts on the server, downloads carry this device's logo and nothing is saved.
    const local = !config.accounts;
    if (local) {
      const logo = (S.getProfile() || {}).logo;
      if (logo) input = { ...input, logo };
    }
    const siteOptions = ['<option value="">No site</option>', ...sites.map((site) => `<option value="${esc(site.id)}">${esc(site.name)}</option>`)].join('');
    box.innerHTML = `<div class="panel confirm">
      ${confirmBlock('new')}
      ${kind === 'draft' && !local ? `<div class="field"><label for="new-site">Save to a site</label><select id="new-site" class="plain">${siteOptions}</select></div>` : ''}
      <div class="actions">
        ${kind === 'draft' && !local ? '<button type="button" id="new-save">Save SWMS</button>' : ''}
        <button type="button" class="secondary" id="new-docx">Download Word</button>
        <button type="button" class="secondary" id="new-pdf">Download PDF</button>
      </div>
      <p class="note hidden" id="new-status"></p>
    </div>`;
    // The buttons work once the box is ticked and a name is given.
    const buttons = ['new-save', 'new-docx', 'new-pdf'].map($).filter(Boolean);
    const ready = () => buttons.forEach((button) => { if (button.textContent !== 'Saved') button.disabled = !($('new-confirm').checked && $('new-name').value.trim()); });
    $('new-confirm').addEventListener('change', ready);
    $('new-name').addEventListener('input', ready);
    ready();
    const selected = $('site-picker') && $('site-picker').value;
    if (selected && $('new-site')) $('new-site').value = selected;
    const run = async (fn) => {
      try { await fn(); } catch (error) { status('new-status', error.message, true); }
    };
    $('new-docx').addEventListener('click', () => run(() => download('/api/draft.docx', 'SiteReady.docx', { ...input, ...confirmed('new') })));
    $('new-pdf').addEventListener('click', () => run(() => download('/api/draft.pdf', 'SiteReady.pdf', { ...input, ...confirmed('new') })));
    if ($('new-save')) {
      $('new-save').addEventListener('click', () => run(async () => {
        const editing = box.dataset.editing;
        const body = { input, siteId: $('new-site').value || null, ...confirmed('new') };
        const data = editing ? await call('PUT', `/api/swms/${editing}`, body) : await call('POST', '/api/swms', body);
        status('new-status', `Saved "${data.swms.title}". Find it under My SWMS, where workers can sign on by QR code.`);
        delete box.dataset.editing;
        $('new-save').textContent = 'Saved';
        $('new-save').disabled = true;
      }));
    }
    if (S.editingId && $('new-save')) {
      box.dataset.editing = S.editingId;
      $('new-save').textContent = 'Save changes';
      S.editingId = null;
    }
  };

  // ---- My SWMS ----

  const shortDate = (value) => new Date(value).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

  async function loadSwms() {
    const list = $('swms-list');
    list.innerHTML = '<p class="lede">Loading…</p>';
    try {
      const { swms } = await call('GET', '/api/swms');
      const siteName = (id) => (sites.find((site) => site.id === id) || {}).name || '';
      list.innerHTML = swms.length ? swms.map((item) => `
        <div class="swms-row">
          <div>
            <strong>${esc(item.title)}</strong>
            <span class="meta">${esc(siteName(item.siteId) || 'No site')} · ${item.signons} signed on · ${item.reviewDue ? '<span class="due">Review due</span>' : `Review by ${shortDate(item.reviewDueAt)}`}</span>
          </div>
          <button type="button" class="small" data-swms="${esc(item.id)}">Open</button>
        </div>`).join('') + '<div class="actions" style="margin-top:12px"><button type="button" class="small secondary" id="swms-export">Export all saved SWMS (Word, one zip)</button></div>' : '<p class="lede">No saved SWMS yet. Prepare one below and save it.</p>';
    } catch (error) {
      list.innerHTML = `<p class="error">${esc(error.message)}</p>`;
    }
  }

  $('swms-list').addEventListener('click', async (event) => {
    if (event.target.closest('#swms-export')) {
      const exportButton = event.target.closest('#swms-export');
      exportButton.disabled = true;
      try { await download('/api/swms/export.zip', 'SiteReady-saved-SWMS.zip'); } catch (error) { alert(error.message); } finally { exportButton.disabled = false; }
      return;
    }
    const button = event.target.closest('[data-swms]');
    if (button) openSwms(button.dataset.swms);
  });

  async function openSwms(id) {
    const data = await call('GET', `/api/swms/${id}`);
    const { swms, draft, signons } = data;
    const resultEl = S.resultEl;
    const qr = await call('GET', `/api/swms/${id}/qr.svg`).then((response) => response.text()).catch(() => '');
    const signLink = new URL(swms.signonPath, window.location.origin).toString();
    resultEl.innerHTML = `
      <div class="panel">
        <h2>${esc(swms.title)}</h2>
        <p class="meta">Last reviewed ${shortDate(swms.lastReviewedAt)} by ${esc(swms.reviewedBy)} · ${swms.reviewDue ? '<span class="due">Review due now</span>' : `next review by ${shortDate(swms.reviewDueAt)}`}</p>
        <div class="actions wrap-actions">
          <button type="button" id="saved-docx">Download Word</button>
          <button type="button" class="secondary" id="saved-pdf">Download PDF</button>
          <button type="button" class="secondary" id="saved-edit">Change</button>
          <button type="button" class="secondary" id="saved-copy">Copy for another job</button>
          <button type="button" class="secondary" id="saved-delete">Delete</button>
        </div>
        <div class="review-box">
          <h2 style="margin-top:16px">Mark as reviewed</h2>
          ${confirmBlock('saved')}
          <div class="actions"><button type="button" class="secondary" id="saved-reviewed">Mark reviewed</button></div>
        </div>
        <p class="note hidden" id="saved-status"></p>
        <h2 style="margin-top:18px">Worker sign-on</h2>
        <div class="qr-box">
          <div class="qr">${qr}</div>
          <div>
            <p>Workers scan this code, read the SWMS on their phone, and sign with a finger. Signatures print on the Word and PDF files.</p>
            <p class="meta">Or send them the link: <a href="${esc(signLink)}" target="_blank" rel="noopener">${esc(signLink)}</a></p>
            <div class="actions"><button type="button" class="secondary" id="print-qr">Print the QR code</button></div>
          </div>
        </div>
        <table><thead><tr><th>Name</th><th>Company</th><th>Signed</th></tr></thead><tbody>
          ${signons.length ? signons.map((item) => `<tr><td>${esc(item.worker_name)}</td><td>${esc(item.worker_company)}</td><td>${new Date(item.signed_at).toLocaleString('en-AU')}</td></tr>`).join('') : '<tr><td colspan="3">No one has signed on yet.</td></tr>'}
        </tbody></table>
      </div>
      <div class="sheet">${S.render(draft)}</div>`;
    resultEl.classList.remove('hidden');
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const run = async (fn) => {
      try { await fn(); } catch (error) { status('saved-status', error.message, true); }
    };
    $('saved-docx').addEventListener('click', () => run(() => download(`/api/swms/${id}/docx`, 'SWMS.docx')));
    $('saved-pdf').addEventListener('click', () => run(() => download(`/api/swms/${id}/pdf`, 'SWMS.pdf')));
    $('saved-reviewed').addEventListener('click', () => run(async () => {
      await call('POST', `/api/swms/${id}/reviewed`, confirmed('saved'));
      status('saved-status', 'Marked as reviewed. The next review is due in 3 months.');
      loadSwms();
    }));
    $('saved-copy').addEventListener('click', () => run(async () => {
      const copy = await call('POST', `/api/swms/${id}/copy`, confirmed('saved'));
      status('saved-status', `Copied as "${copy.swms.title}". It has its own sign-on QR code.`);
      loadSwms();
    }));
    $('saved-delete').addEventListener('click', () => run(async () => {
      if (!confirm(`Delete "${swms.title}"?`)) return;
      await call('DELETE', `/api/swms/${id}`);
      resultEl.classList.add('hidden');
      loadSwms();
    }));
    $('saved-edit').addEventListener('click', () => run(async () => {
      S.editingId = id;
      await S.fillForm(data.input);
      if ($('site-picker')) $('site-picker').value = swms.siteId || '';
      status('saved-status', 'The SWMS is in the form below. Change it, prepare it again, then save the changes.');
    }));
    $('print-qr').addEventListener('click', () => {
      const win = window.open('', '_blank');
      if (!win) return;
      win.document.write(`<!DOCTYPE html><html><head><title>Sign on: ${esc(swms.title)}</title></head><body style="font-family:sans-serif;text-align:center;padding:40px"><h1>Sign on to this SWMS</h1><h2>${esc(swms.title)}</h2><div style="width:320px;margin:24px auto">${qr}</div><p>Scan with your phone camera, read the SWMS and sign.</p></body></html>`);
      win.document.close();
      win.print();
    });
  }

  // ---- Sites ----

  const SITE_FIELDS = [
    ['workplace', 'Workplace address'], ['principalContractor', 'Principal contractor'], ['siteManager', 'Site manager'],
    ['worksManager', 'Works manager'], ['worksManagerPhone', 'Works manager phone'], ['complianceResponsible', 'Person who makes sure the SWMS is followed'],
    ['reviewer', 'Person who reviews the controls'], ['scaffoldSupervisor', 'Scaffold supervisor'], ['hospital', 'Hospital'],
    ['firstAider', 'First aider'], ['musterPoint', 'Muster point'],
  ];

  function renderSitePicker() {
    const picker = $('site-picker');
    if (!picker) return;
    const current = picker.value;
    picker.innerHTML = ['<option value="">Choose a saved site</option>', ...sites.map((site) => `<option value="${esc(site.id)}">${esc(site.name)}</option>`)].join('');
    picker.value = sites.some((site) => site.id === current) ? current : '';
  }

  $('site-picker').addEventListener('change', () => {
    const site = sites.find((item) => item.id === $('site-picker').value);
    if (site) S.fillFields(site);
  });

  $('site-save-current').addEventListener('click', async () => {
    const name = prompt('Name this site, for example "Hospital job, Herston"');
    if (!name) return;
    const values = S.payload();
    const body = { name };
    SITE_FIELDS.forEach(([key]) => { body[key] = values[key] || ''; });
    try {
      const { site } = await call('POST', '/api/sites', body);
      sites.push(site);
      renderSitePicker();
      $('site-picker').value = site.id;
    } catch (error) {
      alert(error.message);
    }
  });

  function siteForm(site = {}) {
    return `<form class="site-form" data-site-id="${esc(site.id || '')}">
      <div class="field"><label>Site name</label><input type="text" name="name" value="${esc(site.name || '')}" required></div>
      ${SITE_FIELDS.map(([key, label]) => `<div class="field"><label>${esc(label)}</label><input type="text" name="${key}" value="${esc(site[key] || '')}"></div>`).join('')}
      <div class="actions"><button type="submit">${site.id ? 'Save site' : 'Add site'}</button>${site.id ? '<button type="button" class="secondary" data-delete-site>Delete site</button>' : ''}</div>
    </form>`;
  }

  function renderSites() {
    $('sites-list').innerHTML = sites.map((site) => `<details class="site-item"><summary>${esc(site.name)}</summary>${siteForm(site)}</details>`).join('') || '<p class="lede">No sites yet.</p>';
    $('site-new').innerHTML = siteForm();
  }

  $('sites-panel').addEventListener('submit', async (event) => {
    const form = event.target.closest('.site-form');
    if (!form) return;
    event.preventDefault();
    const body = Object.fromEntries(new FormData(form).entries());
    try {
      if (form.dataset.siteId) await call('PUT', `/api/sites/${form.dataset.siteId}`, body);
      else await call('POST', '/api/sites', body);
      sites = (await call('GET', '/api/sites')).sites;
      renderSites();
      renderSitePicker();
    } catch (error) {
      alert(error.message);
    }
  });

  $('sites-panel').addEventListener('click', async (event) => {
    if (!event.target.matches('[data-delete-site]')) return;
    const form = event.target.closest('.site-form');
    if (!confirm('Delete this site? Saved SWMS stay.')) return;
    await call('DELETE', `/api/sites/${form.dataset.siteId}`);
    sites = sites.filter((site) => site.id !== form.dataset.siteId);
    renderSites();
    renderSitePicker();
  });

  // ---- Team ----

  async function loadTeam() {
    try {
      const { users } = await call('GET', '/api/company/users');
      const admin = Boolean(me && me.user.isAdmin);
      $('team-list').innerHTML = users.map((user) => `<li>${esc(user.email)}`
        + `${user.is_admin ? ' <span class="meta">(administrator)</span>' : user.last_seen_at ? '' : ' <span class="meta">(invited)</span>'}`
        + `${admin && !user.is_admin ? ` <button type="button" class="link" data-remove="${esc(user.email)}">Remove</button>` : ''}</li>`).join('');
    } catch (error) {
      $('team-list').innerHTML = `<li class="error">${esc(error.message)}</li>`;
    }
    const admin = Boolean(me && me.user.isAdmin);
    ['team-invite-field', 'team-invite'].forEach((id) => $(id).classList.toggle('hidden', !admin));
    $('team-email').required = admin;
    $('team-note').classList.toggle('hidden', admin);
    $('team-faceid').classList.toggle('hidden', !passkeysWork() || !me || me.user.hasPasskey);
  }

  $('team-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const data = await call('POST', '/api/company/users', { email: $('team-email').value });
      status('team-status', data.message);
      $('team-email').value = '';
      loadTeam();
    } catch (error) {
      status('team-status', error.message, true);
    }
  });

  $('team-list').addEventListener('click', async (event) => {
    const email = event.target.dataset && event.target.dataset.remove;
    if (!email || !window.confirm(`Remove ${email} from your company? They will be signed out and lose access.`)) return;
    try {
      const data = await call('DELETE', `/api/company/users/${encodeURIComponent(email)}`);
      status('team-status', data.message);
      loadTeam();
    } catch (error) {
      status('team-status', error.message, true);
    }
  });

  $('team-faceid').addEventListener('click', async () => {
    try {
      await setUpFaceId();
      me.user.hasPasskey = true;
      status('team-status', 'Face ID is set up on this device.');
      $('team-faceid').classList.add('hidden');
    } catch (error) {
      status('team-status', error.name === 'NotAllowedError' ? 'Face ID set-up was cancelled.' : error.message, true);
    }
  });

  S.signedIn = () => Boolean(me);
  // For the project download: whether downloads are open, the review box, and the download itself.
  S.canDownload = () => !config.accounts || Boolean(me && me.company.hasAccess);
  S.accountsOn = () => Boolean(config.accounts);
  S.confirmBlock = (prefix) => confirmBlock(prefix);
  S.download = (route, fallbackName, body) => download(route, fallbackName, body);
  S.saveCompany = async (profile) => (await call('PUT', '/api/company', profile)).company;

  // ---- Start ----

  async function start() {
    try {
      config = await (await fetch(api('/api/config'))).json();
    } catch {
      config = { accounts: false };
    }
    const params = new URLSearchParams(window.location.search);
    const login = params.get('login');
    const billingResult = params.get('billing');
    if (billingResult) {
      history.replaceState(null, '', window.location.pathname);
      const note = $('billing-status');
      note.textContent = billingResult === 'success'
        ? 'Thanks. Your subscription is set up. It can take a minute to show here.'
        : 'Subscribing was cancelled. Nothing was charged.';
      note.classList.remove('hidden');
      if (billingResult === 'success') setTimeout(refresh, 5000);
    }
    if (login && config.accounts) {
      history.replaceState(null, '', window.location.pathname);
      try {
        const { token } = await call('POST', '/api/auth/verify', { token: login });
        await signedIn(token);
        return;
      } catch (error) {
        $('signin').classList.remove('hidden');
        status('signin-status', error.message, true);
      }
    }
    await refresh();
  }

  start();
})();
