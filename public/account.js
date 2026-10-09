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
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(session ? { Authorization: `Bearer ${session}`, 'X-Session-Token': session } : {}) },
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

  // The page's own calls that need the session, such as the translation of a draft.
  S.call = call;
  S.isSignedIn = () => Boolean(me);

  // Returns the saved SWMS and revision the download was saved as, where it was saved.
  async function download(route, fallbackName, body) {
    const response = await call(body ? 'POST' : 'GET', route, body);
    const header = (name) => response.headers.get(name) || '';
    const saved = header('x-siteready-swms')
      ? { id: header('x-siteready-swms'), revision: Number(header('x-siteready-revision')) || 1, title: decodeURIComponent(header('x-siteready-title')) }
      : null;
    const items = header('x-siteready-saved') ? JSON.parse(decodeURIComponent(header('x-siteready-saved'))) : [];
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
    return { saved, items };
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
    scopeWaiting();
  }

  // A scope given while signed out is read by the AI once the user is signed in (scope.js).
  function scopeWaiting() {
    if (me && S.onSignedIn) S.onSignedIn();
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
      bar.innerHTML = `<span class="bar-note">Try it free: preview any SWMS. Sign in to read a scope, download, save and share.</span>
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

  // Said beside the Save and download buttons while anything is outstanding: the site questions and
  // blanks (goal 2) and the tick for work SiteReady has no job steps for (D184), all listed in one
  // box above (app.js), with a button that goes to it.
  const gateNote = (count) => `Download and save wait for ${count === 1 ? 'the item' : `the ${count} items`} listed above under "Before you can download this SWMS". <button type="button" class="link" data-gate-list>Go to the list</button>`;

  // cover is the box above the draft for work SiteReady has no job steps for (app.js, D184).
  function confirmed(prefix, cover = null) {
    const tick = $(`${prefix}-confirm`).checked;
    const name = $(`${prefix}-name`).value.trim();
    if (!tick || !name) throw new Error('Tick the box and enter your name first.');
    if (cover && !cover.checked) throw new Error('Tick the box above the draft for the work SiteReady has no job steps for first.');
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
    // What the buttons save. The reasons the user gives for a change after the SWMS is shown are
    // added to it (app.js) without drawing the buttons again.
    S.actionInput = input;
    const siteOptions = ['<option value="">No site</option>', ...sites.map((site) => `<option value="${esc(site.id)}">${esc(site.name)}</option>`)].join('');
    // A saved SWMS being changed: its changes save as its next revision until a new SWMS is started.
    const editing = !local && S.editing;
    // Goal 2: nothing downloads or saves until the site questions are answered (the list above). The
    // D184 tick is counted from the box above the draft, as the user ticks it.
    const gaps = kind === 'draft' ? (draft.gate || []).filter((gap) => gap.kind !== 'cover') : [];
    const covering = kind === 'draft' && (draft.notCovered || []).length > 0;
    const waitingNow = gaps.length + (covering && !($('not-covered-confirm') && $('not-covered-confirm').checked) ? 1 : 0);
    box.innerHTML = `<div class="panel confirm">
      ${editing ? `<p class="meta" id="new-editing">Saving changes to "${esc(editing.title)}" as its next revision, in SiteReady's current wording. Earlier revisions stay as they were saved. <button type="button" class="link" id="new-separate">Save as a new SWMS instead</button></p>` : ''}
      ${confirmBlock('new')}
      ${kind === 'draft' && !local ? `<div class="field"><label for="new-site">Save to a site</label><select id="new-site" class="plain">${siteOptions}</select></div>` : ''}
      ${kind === 'draft' && editing ? '<div class="field"><label for="new-reason">What changed and why (optional)</label><input id="new-reason" type="text" maxlength="300"></div>' : ''}
      ${kind === 'draft' && !local ? '<p class="meta">Downloading saves the SWMS under My SWMS, so every copy printed has a record and a revision. The PDF and the QR sign-on are the copies workers sign; the Word file is a working copy.</p>' : ''}
      ${gaps.length || covering ? `<p class="note gate-hold${waitingNow ? '' : ' hidden'}" id="new-gate-note">${waitingNow ? gateNote(waitingNow) : ''}</p>` : ''}
      <div class="actions">
        ${kind === 'draft' && !local ? `<button type="button" id="new-save">${editing ? 'Save changes' : 'Save SWMS'}</button>` : ''}
        <button type="button" class="secondary" id="new-docx">Download Word</button>
        <button type="button" class="secondary" id="new-pdf">Download PDF</button>
      </div>
      <p class="note hidden" id="new-status"></p>
    </div>`;
    // The buttons work once the box is ticked and a name is given, and, where SiteReady has no job
    // steps for part of the task, once the tick above the draft is ticked too.
    const buttons = ['new-save', 'new-docx', 'new-pdf'].map($).filter(Boolean);
    const uncovered = covering ? $('not-covered-confirm') : null;
    const ready = () => {
      const waiting = gaps.length + (uncovered && !uncovered.checked ? 1 : 0);
      buttons.forEach((button) => { if (button.textContent !== 'Saved') button.disabled = waiting > 0 || !($('new-confirm').checked && $('new-name').value.trim()); });
      // Why the buttons wait, said beside them: the list can be pages above on a phone.
      const note = $('new-gate-note');
      if (note) { note.innerHTML = waiting ? gateNote(waiting) : ''; note.classList.toggle('hidden', !waiting); }
    };
    $('new-confirm').addEventListener('change', ready);
    $('new-name').addEventListener('input', ready);
    if (uncovered) uncovered.addEventListener('change', ready);
    ready();
    const selected = S.siteId();
    if (selected && $('new-site')) $('new-site').value = selected;
    const run = async (fn) => {
      try { await fn(); } catch (error) { status('new-status', error.message, true); }
    };
    // Signed in, a download saves the SWMS first (or its next revision, when it has changed), so
    // every print has a record. Later changes save as its next revision.
    const saveAndDownload = async (route, fallbackName) => {
      const body = { ...S.actionInput, ...confirmed('new', uncovered), ...(!local ? { swmsId: S.editing ? S.editing.id : undefined, siteId: ($('new-site') && $('new-site').value) || undefined } : {}) };
      const { saved } = await download(route, fallbackName, body);
      if (!saved) return;
      // A new revision was saved when the number moved on from the one being changed.
      const revised = saved.revision > 1 && !(S.editing && S.editing.id === saved.id && S.editing.revision === saved.revision);
      S.editing = { id: saved.id, title: saved.title, revision: saved.revision };
      status('new-status', `Saved as "${saved.title}", revision ${saved.revision}, and downloaded. Find it under My SWMS. Changes you make now save as its next revision.${revised ? resignLine(saved.revision) : ''}`);
      if ($('new-save')) { $('new-save').textContent = 'Saved'; $('new-save').disabled = true; }
    };
    $('new-docx').addEventListener('click', () => run(() => saveAndDownload('/api/draft.docx', 'SiteReady.docx')));
    $('new-pdf').addEventListener('click', () => run(() => saveAndDownload('/api/draft.pdf', 'SiteReady.pdf')));
    if ($('new-save')) {
      $('new-save').addEventListener('click', () => run(async () => {
        const body = { input: S.actionInput, siteId: $('new-site').value || null, reason: $('new-reason') ? $('new-reason').value.trim() : '', ...confirmed('new', uncovered) };
        const data = S.editing ? await call('PUT', `/api/swms/${S.editing.id}`, body) : await call('POST', '/api/swms', body);
        // Later changes to this SWMS save as its revisions.
        S.editing = { id: data.swms.id, title: data.swms.title, revision: data.swms.revision || 1 };
        status('new-status', `Saved "${data.swms.title}", revision ${data.swms.revision || 1}. Find it under My SWMS, where workers can sign on by QR code.${data.swms.revision > 1 ? resignLine(data.swms.revision, data.swms.signedEarlier) : ''}`);
        $('new-save').textContent = 'Saved';
        $('new-save').disabled = true;
      }));
    }
    if ($('new-separate')) {
      $('new-separate').addEventListener('click', () => {
        S.editing = null;
        S.showActions(draft, S.actionInput);
      });
    }
  };

  // ---- My SWMS ----

  // Said when a new revision is saved: earlier sign-ons do not cover it. earlier is how many
  // workers signed only an earlier revision, where known.
  const resignLine = (revision, earlier) => ` Workers must sign on to revision ${revision} before starting work: sign-ons to an earlier revision do not cover it.${earlier ? ` ${earlier === 1 ? 'One worker' : `${earlier} workers`} signed an earlier revision and must sign again.` : ''} Ask your supervisor to have them scan the QR code again.`;

  const shortDate = (value) => new Date(value).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

  // Sign-ons count on the current revision only. Workers who signed an earlier revision are
  // counted apart: they must sign the current one before they start work.
  const signedText = (item) => {
    const now = item.revision > 1 ? `${item.signons} signed on to revision ${esc(item.revision)}` : `${item.signons} signed on`;
    return item.signedEarlier ? `${now} · <span class="due">${item.signedEarlier} still to sign revision ${esc(item.revision)}</span>` : now;
  };

  // After a new revision: who has signed it, and who signed only an earlier one and must sign it.
  function resignNote(swms, signons, earlier) {
    if ((swms.revision || 1) < 2 || (signons.length && !earlier.length)) return '';
    const head = signons.length ? '' : `<p><strong>No one has signed on to revision ${esc(swms.revision)} yet.</strong> It was saved on ${shortDate(swms.revisedAt)}. Sign-ons to an earlier revision do not cover it.</p>`;
    const who = earlier.length
      ? `<p>Tell your supervisor: ${earlier.length === 1 ? 'the worker below signed an earlier revision and must' : `the ${earlier.length} workers below signed an earlier revision and must each`} read and sign revision ${esc(swms.revision)}, by scanning the QR code again, before starting work.</p>`
      : `<p>Tell your supervisor: every worker must read and sign revision ${esc(swms.revision)}, by scanning the QR code, before starting work.</p>`;
    return `<div class="warning resign" id="resign-note">${head}${who}</div>`;
  }

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
            <span class="meta">${esc(siteName(item.siteId) || 'No site')} · ${signedText(item)} · ${item.reviewDue ? '<span class="due">Review due</span>' : `Review by ${shortDate(item.reviewDueAt)}`}</span>
            ${(item.changeReview || []).length ? `<span class="meta"><span class="due">Review: the law or SiteReady changed</span> ${esc(item.changeReview[item.changeReview.length - 1])}</span>` : ''}
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

  // A saved SWMS's revisions, newest first: when and by whom each was saved, why, what changed
  // from the one before, and its Word and PDF as they printed.
  function historyBlock(history) {
    if (!history || history.length < 2) return '';
    return `<details class="revisions"><summary>Revisions (${history.length})</summary><ul>${history.map((item) => `<li>
      <strong>Revision ${esc(item.revision)}</strong>${item.current ? ' (current)' : ''} · ${shortDate(item.savedAt)}${item.savedBy ? ` by ${esc(item.savedBy)}` : ''}${item.ref ? ` · ${esc(item.ref)}` : ''}
      ${item.reason ? `<br><span class="meta">${esc(item.reason)}</span>` : ''}
      ${(item.changes || []).length ? `<details><summary>What changed (${item.changes.length})</summary><ul>${item.changes.map((line) => `<li>${esc(line)}</li>`).join('')}</ul></details>` : ''}
      <span class="ctl-tools"><button type="button" class="link" data-revision-docx="${esc(item.revision)}">Word</button><button type="button" class="link" data-revision-pdf="${esc(item.revision)}">PDF</button></span>
    </li>`).join('')}</ul></details>`;
  }

  async function openSwms(id) {
    const data = await call('GET', `/api/swms/${id}`);
    const { swms, draft, signons } = data;
    const earlier = data.earlierSignons || [];
    const history = data.revisions && data.revisions.length > 1 ? (await call('GET', `/api/swms/${id}/revisions`)).revisions : data.revisions;
    const update = data.update || { available: false, changes: [] };
    const resultEl = S.resultEl;
    const qr = await call('GET', `/api/swms/${id}/qr.svg`).then((response) => response.text()).catch(() => '');
    const signLink = new URL(swms.signonPath, window.location.origin).toString();
    resultEl.innerHTML = `
      <div class="panel">
        <h2>${esc(swms.title)}</h2>
        <p class="meta">Revision ${esc(swms.revision)}, saved ${shortDate(swms.revisedAt)}${swms.ref ? ` · SiteReady reference ${esc(swms.ref)}` : ''}</p>
        <p class="meta">Last reviewed ${shortDate(swms.lastReviewedAt)} by ${esc(swms.reviewedBy)} · ${swms.reviewDue ? '<span class="due">Review due now</span>' : `next review by ${shortDate(swms.reviewDueAt)}`}</p>
        ${update.available ? `<div class="note" id="saved-update"><p><strong>Updated wording is available.</strong> SiteReady's library or the law has changed since this revision was saved. This revision prints as it was saved. To use the updated wording, check the changes and make a new revision.</p>
          ${(update.reasons || []).map((reason) => `<p><strong>Why:</strong> ${esc(reason)}</p>`).join('')}
          <details><summary>What would change (${update.changes.length})</summary><ul>${update.changes.map((line) => `<li>${esc(line)}</li>`).join('')}</ul></details>
          <div class="actions"><button type="button" class="secondary" id="saved-update-go">Make a new revision with the updated wording</button></div>
          <p class="meta">Uses the name and tick under Mark as reviewed below.</p></div>` : ''}
        ${historyBlock(history)}
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
        ${resignNote(swms, signons, earlier)}
        <h3 class="signed-head">${swms.revision > 1 ? `Signed on to revision ${esc(swms.revision)} (current)` : 'Signed on'}</h3>
        <table id="signed-current"><thead><tr><th>Name</th><th>Company</th><th>Signed</th></tr></thead><tbody>
          ${signons.length ? signons.map((item) => `<tr><td>${esc(item.worker_name)}${item.note ? `<br><span class="meta">${esc(item.note)}</span>` : ''}</td><td>${esc(item.worker_company)}</td><td>${new Date(item.signed_at).toLocaleString('en-AU')}</td></tr>`).join('') : `<tr><td colspan="3">No one has signed on${swms.revision > 1 ? ` to revision ${esc(swms.revision)}` : ''} yet.</td></tr>`}
        </tbody></table>
        ${earlier.length ? `<h3 class="signed-head">Signed an earlier revision only</h3>
        <p class="meta">These workers have not signed revision ${esc(swms.revision)}. Their sign-ons stay on the revision they signed.</p>
        <table id="signed-earlier"><thead><tr><th>Name</th><th>Company</th><th>Signed</th></tr></thead><tbody>
          ${earlier.map((item) => `<tr><td>${esc(item.worker_name)}${item.note ? `<br><span class="meta">${esc(item.note)}</span>` : ''}</td><td>${esc(item.worker_company)}</td><td>${item.revision ? `Revision ${esc(item.revision)}` : 'An earlier revision'}<br><span class="meta">${new Date(item.signed_at).toLocaleString('en-AU')}</span></td></tr>`).join('')}
        </tbody></table>` : ''}
      </div>
      ${draft.controlEdits && S.editNotes ? S.editNotes(draft.controlEdits) : ''}
      <div class="sheet">${S.render(draft)}</div>`;
    resultEl.classList.remove('hidden');
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const run = async (fn) => {
      try { await fn(); } catch (error) { status('saved-status', error.message, true); }
    };
    $('saved-docx').addEventListener('click', () => run(() => download(`/api/swms/${id}/docx`, 'SWMS.docx')));
    $('saved-pdf').addEventListener('click', () => run(() => download(`/api/swms/${id}/pdf`, 'SWMS.pdf')));
    resultEl.querySelectorAll('[data-revision-docx], [data-revision-pdf]').forEach((button) => button.addEventListener('click', () => run(() => {
      const docx = button.dataset.revisionDocx;
      return download(`/api/swms/${id}/${docx ? 'docx' : 'pdf'}?revision=${encodeURIComponent(docx || button.dataset.revisionPdf)}`, docx ? 'SWMS.docx' : 'SWMS.pdf');
    })));
    if ($('saved-update-go')) {
      $('saved-update-go').addEventListener('click', () => run(async () => {
        const next = await call('PUT', `/api/swms/${id}`, { reason: 'Updated to SiteReady\'s current wording', ...confirmed('saved') });
        await openSwms(id);
        status('saved-status', `Saved revision ${next.swms.revision} with the updated wording.${resignLine(next.swms.revision, next.swms.signedEarlier)}`);
        loadSwms();
      }));
    }
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
    // Change opens the SWMS ready to edit: its controls, hazards and Who can be changed straight
    // away, and the form above holds its answers. Saving makes the next revision.
    $('saved-edit').addEventListener('click', () => run(async () => {
      await S.fillForm(data.input);
      S.editing = { id, title: swms.title, revision: swms.revision };
      S.showSite(swms.siteId || '');
      if (S.prepare) await S.prepare();
    }));
    $('print-qr').addEventListener('click', () => {
      const win = window.open('', '_blank');
      if (!win) return;
      win.document.write(`<!DOCTYPE html><html><head><title>Sign on: ${esc(swms.title)}</title></head><body style="font-family:sans-serif;text-align:center;padding:40px"><h1>Sign on to this SWMS</h1><h2>${esc(swms.title)}</h2><p>Revision ${esc(swms.revision)}</p><div style="width:320px;margin:24px auto">${qr}</div><p>Scan with your phone camera, read the SWMS and sign.</p>${swms.revision > 1 ? '<p>If you signed an earlier revision, read and sign this one before you start work.</p>' : ''}</body></html>`);
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

  // The site box takes a typed name: a new site's name, or a saved site's, which fills in its
  // details. The saved site's id is found from its name.
  const siteNamed = (name) => sites.find((site) => site.name.trim().toLowerCase() === String(name || '').trim().toLowerCase());
  S.siteId = () => { const site = $('site-picker') && siteNamed($('site-picker').value); return site ? site.id : ''; };
  S.showSite = (id) => { const site = sites.find((item) => item.id === id); if ($('site-picker')) $('site-picker').value = site ? site.name : ''; };

  function renderSitePicker() {
    const list = $('site-list');
    if (!list) return;
    list.innerHTML = sites.map((site) => `<option value="${esc(site.name)}"></option>`).join('');
  }

  $('site-picker').addEventListener('change', () => {
    const site = siteNamed($('site-picker').value);
    if (site) S.fillFields(site);
  });

  $('site-save-current').addEventListener('click', async () => {
    const typed = $('site-picker').value.trim();
    const name = typed && !siteNamed(typed) ? typed : prompt('Name this site, for example "Hospital job, Herston"');
    if (!name) return;
    const values = S.payload();
    const body = { name };
    SITE_FIELDS.forEach(([key]) => { body[key] = values[key] || ''; });
    try {
      const { site } = await call('POST', '/api/sites', body);
      sites.push(site);
      renderSitePicker();
      $('site-picker').value = site.name;
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
  // A signed-in request, for the AI reading of a scope.
  S.call = (method, route, body) => call(method, route, body);
  S.saveCompany = async (profile) => {
    const data = await call('PUT', '/api/company', profile);
    // A business whose ABN has had its trial is told so, and the account panel shows it has no access.
    if (data.notice) { S.lastCompanyNotice = data.notice; if (me) { me.company = data.company; } }
    return data.company;
  };

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
    scopeWaiting();
  }

  start();
})();
