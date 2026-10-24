// Accounts: signing in by email link or Face ID, the company's saved SWMS and
// sites, downloads, worker sign-on QR codes and review reminders. Without an
// account the SWMS can be previewed, and downloads ask the user to sign in.
(() => {
  const S = window.SiteWrite;
  const { api, esc } = S;
  const SESSION_KEY = 'sitewrite.session';
  const REVIEWER_KEY = 'sitewrite-reviewer';
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

  // A server that cannot be reached, or answers with a host's error page (a 502), says so plainly.
  const SERVER_DOWN = 'SiteWrite could not reach the server. Try again.';
  async function call(method, route, body) {
    let response;
    try {
      response = await fetch(api(route), {
        method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(session ? { Authorization: `Bearer ${session}`, 'X-Session-Token': session } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw Object.assign(new Error(SERVER_DOWN), { status: 0 });
    }
    if (response.status === 401 && session) signedOut();
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      // The box a refusal is about, and the parts of the check to tick again (D286).
      throw Object.assign(new Error((data && data.message) || (!data || response.status >= 500 ? SERVER_DOWN : 'Something went wrong. Try again.')), { status: response.status, field: data && data.field, stale: data && data.stale, data });
    }
    const type = response.headers.get('content-type') || '';
    return type.includes('application/json') ? response.json() : response;
  }

  // The page's own calls that need the session, such as the translation of a draft.
  S.call = call;
  // A design's file sent as it is, with the session (design-files.js), and a file the business holds
  // opened in a new tab from its bytes: there is no public link to it.
  S.sendFile = async (route, file) => {
    const response = await fetch(api(route), {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name || 'Design'), ...(session ? { Authorization: `Bearer ${session}`, 'X-Session-Token': session } : {}) },
      body: file,
    });
    if (response.status === 401 && session) signedOut();
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(response.status === 413 && !data.message ? 'The file is too large. Attach a copy of 10 MB or less.' : data.message || 'The file could not be attached. Try again.');
    return data;
  };
  S.openFile = async (route, name) => {
    // The tab opens on the tap, before the file arrives, so a phone does not block it.
    const tab = window.open('', '_blank');
    try {
      const response = await call('GET', route);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      // A phone with no PDF viewer (Android) saves the PDF under its own name instead.
      const viewer = !(blob.type === 'application/pdf' && navigator.pdfViewerEnabled === false);
      if (tab && viewer) tab.location.href = url;
      else { if (tab) tab.close(); const link = document.createElement('a'); link.href = url; link.download = name || 'Design'; link.click(); }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      if (tab) tab.close();
      throw error;
    }
  };
  document.addEventListener('click', (event) => {
    const button = event.target.closest && event.target.closest('[data-design-file-open]');
    if (!button) return;
    S.openFile(button.dataset.designFileOpen, button.dataset.designFileName).catch((error) => { button.insertAdjacentHTML('afterend', `<span class="meta"> ${esc(error.message)}</span>`); });
  });
  S.isSignedIn = () => Boolean(me);

  // A host's error (502, 503, 504) or no reply on a download is asked again once, a moment later
  // (messy round 6, run 8: a 502 on the first Word press). It is safe: a saved SWMS that has not
  // changed prints again as the same revision, and a new one is sent with the same key, so the server
  // finds the SWMS the first try saved instead of saving it twice.
  const HOST_ERROR = (error) => error && (error.status === 0 || [502, 503, 504].includes(error.status));
  const DOWNLOAD_DOWN = 'SiteWrite could not reach the server, so the file was not downloaded. Your SWMS and your ticks are kept. Press the button again.';
  // Asked again twice, after 1.5 and then 5 seconds: a server process that stopped takes a few seconds to come back, so one
  // retry 1.5 seconds later met the same 502 (messy round 18, A run 3: 502s at 10:46:30 and 10:46:31; the next press worked).
  const RETRY_WAITS = [1500, 5000];
  async function callOnceMore(method, route, body) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await call(method, route, body);
      } catch (error) {
        if (!HOST_ERROR(error)) throw error;
        if (attempt >= RETRY_WAITS.length) throw Object.assign(new Error(DOWNLOAD_DOWN), { status: error.status });
        await new Promise((resolve) => { setTimeout(resolve, RETRY_WAITS[attempt]); });
      }
    }
  }
  // Each press of a download button has its own key, kept for its one retry.
  const requestKey = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

  // Returns the saved SWMS and revision the download was saved as, where it was saved.
  async function download(route, fallbackName, body) {
    const response = await callOnceMore(body ? 'POST' : 'GET', route, body ? { ...body, requestKey: body.requestKey || requestKey() } : body);
    const header = (name) => response.headers.get(name) || '';
    const saved = header('x-sitewrite-swms')
      ? { id: header('x-sitewrite-swms'), revision: Number(header('x-sitewrite-revision')) || 1, title: decodeURIComponent(header('x-sitewrite-title')) }
      : null;
    const items = header('x-sitewrite-saved') ? JSON.parse(decodeURIComponent(header('x-sitewrite-saved'))) : [];
    if ((saved || items.length) && S.refreshMine) S.refreshMine();
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
    // A company with lists from main contractors sees them first (Goal 12 stage 6).
    const lists = me && S.builderListsReady ? await S.builderListsReady().catch(() => 0) : 0;
    showPanel(lists ? 'from-builders' : 'my-swms');
    scopeWaiting(true);
  }

  // A scope given while signed out is read by the AI once the user signs in, if it is still in the scope box
  // (scope.js). A page opened already signed in (a reload or Back) reads nothing new.
  function scopeWaiting(justSignedIn = false) {
    if (me && S.onSignedIn) S.onSignedIn({ justSignedIn });
  }

  function signedOut() {
    session = '';
    me = null;
    write(SESSION_KEY, '');
    // The offer to set up Face ID is for someone signed in (messy round 5: it stayed after sign out).
    $('faceid-offer').classList.add('hidden');
    status('faceid-status', '');
    reviewsBackNote([]);
    renderBar();
    // The lists from main contractors are the company's: they go with the session (from-builders.js).
    if (S.builderListsSignedOut) S.builderListsSignedOut();
  }

  async function refresh() {
    if (!session) return renderBar();
    // While a kept session is checked, the bar does not say "Sign in" (messy round 10: the office, still
    // signed in, read the signed-out bar for a moment on reopening the page and took it as signed out).
    if (!me && config.accounts && $('account-bar')) $('account-bar').innerHTML = '<span class="bar-note" role="status">Checking your sign-in...</span>';
    try {
      me = await call('GET', '/api/me');
      // Company details typed before signing in fill the company's empty ones and are saved to it.
      const kept = S.signedInProfile ? await S.signedInProfile(me.company, me.user && me.user.email) : (S.setProfile(me.company), null);
      if (kept) me.company = { ...me.company, ...kept };
      sites = (await call('GET', '/api/sites')).sites;
      S.addPrincipals(sites.map((site) => site.principalContractor), false);
      S.setPreparedBy(me.user.name || read(REVIEWER_KEY));
    } catch {
      me = null;
    }
    renderBar();
    renderSitePicker();
    if (me && S.redrawActions) S.redrawActions();
    if (me && !mineOpen()) checkReviewsBack();
    // The lists the company took up from main contractors (Goal 12 stage 6, from-builders.js).
    if (me && S.builderListsSignedIn) S.builderListsSignedIn();
  }

  function trialText(company) {
    if (company.planStatus === 'active' || company.planStatus === 'trialing') return 'Subscribed';
    const days = Math.ceil((new Date(company.trialEndsAt) - Date.now()) / 86400000);
    return days > 0 ? `Free trial: ${days} day${days === 1 ? '' : 's'} left` : 'Free trial ended';
  }

  function renderBar() {
    const bar = $('account-bar');
    if (!config.accounts) { bar.classList.add('hidden'); signInNotes(); return; }
    bar.classList.remove('hidden');
    if (!me) {
      bar.innerHTML = `<span class="bar-note">Try it free: preview any SWMS. Sign in to read a scope, download, save and share.</span>
        <button type="button" class="small" data-open="signin">Sign in or start free trial</button>`;
      document.querySelectorAll('.signed-in-only').forEach((el) => el.classList.add('hidden'));
      signInNotes();
      return;
    }
    const paying = ['active', 'trialing', 'past_due'].includes(me.company.planStatus);
    // Only the administrator manages the subscription (billing.js); anyone else who presses Subscribe is told to ask them.
    const billingLink = !config.billing ? '' : paying
      ? (me.user.isAdmin ? '<button type="button" class="link" id="manage-billing">Billing</button>' : '')
      : `<button type="button" class="small" id="subscribe">Subscribe, ${esc(config.price)}</button>`;
    bar.innerHTML = `<span class="bar-note"><strong>${esc(me.company.name || me.user.email)}</strong> · ${esc(trialText(me.company))}</span>
      <span class="bar-links">
        ${billingLink}
        ${S.builderBarLink ? S.builderBarLink() : ''}
        <button type="button" class="link" data-panel="my-swms">My SWMS</button>
        <button type="button" class="link" data-panel="sites-panel">Sites</button>
        <button type="button" class="link" data-panel="team-panel">Team</button>
        <button type="button" class="link" id="sign-out">Sign out</button>
      </span>`;
    document.querySelectorAll('.signed-in-only').forEach((el) => el.classList.remove('hidden'));
    signInNotes();
  }

  // Wording only for someone signed out (the scope panel's "Sign in, or start the free trial"), or
  // signed in with the trial ended. Hidden until the account is known, and when accounts are off.
  function signInNotes() {
    const out = Boolean(config.accounts) && !me;
    const noAccess = Boolean(config.accounts && me && !me.company.hasAccess);
    document.querySelectorAll('.signed-out-only').forEach((el) => el.classList.toggle('hidden', !out));
    document.querySelectorAll('.no-access-only').forEach((el) => el.classList.toggle('hidden', !noAccess));
  }

  function showPanel(id) {
    ['my-swms', 'sites-panel', 'team-panel', 'from-builders'].forEach((panel) => { if ($(panel)) $(panel).classList.toggle('hidden', panel !== id); });
    if (id === 'my-swms') loadSwms();
    if (id === 'from-builders' && S.loadBuilderLists) S.loadBuilderLists();
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
      // Work not saved is not left on a shared phone for the next person. An expired session
      // keeps it, so the user can sign in again and carry on.
      if (S.clearUnsaved) S.clearUnsaved();
      ['my-swms', 'sites-panel', 'team-panel', 'from-builders'].forEach((id) => { if ($(id)) $(id).classList.add('hidden'); });
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

  // The browser's own words for a device with no passkey are not shown (messy round 5: a desktop said
  // "Resident credentials or empty 'allowCredentials' lists are not supported at this time."). SiteWrite's
  // own refusals keep their plain message. Either way the email link is offered.
  const FACE_ID_NONE = 'Face ID is not set up for SiteWrite on this device. Sign in with the email link instead: enter your email above and press Email me a sign-in link. Once signed in, you can set up Face ID on this device.';
  const faceIdMessage = (error) => (error && error.status !== undefined ? `${error.message} You can sign in with the email link instead.` : error && error.name === 'NotAllowedError' ? 'Face ID was cancelled or is not set up on this device. You can sign in with the email link instead.' : FACE_ID_NONE);
  S.faceIdMessage = faceIdMessage;
  $('faceid-signin').addEventListener('click', async () => {
    try {
      await signInWithFaceId();
    } catch (error) {
      status('signin-status', faceIdMessage(error), true);
      $('signin-email').focus();
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

  // The check before download or save (human-check.js, D286): SiteWrite's check, each part ticked, then
  // the name and role, kept on this device as they are typed. The account's name fills an empty name.
  const checkBlock = (prefix, verb) => S.humanCheck.html(prefix, { verb });
  function restoreTyped(prefix) {
    const box = $(`${prefix}-name`);
    if (box && !box.value && me && me.user.name) box.value = me.user.name;
  }

  // Said beside the Save and download buttons while anything is outstanding: the site questions and
  // blanks (goal 2) and the tick for work SiteWrite has no job steps for (D184), all listed in one
  // box above (app.js), with a button that goes to it.
  const gateNote = (count) => `Download and save wait for ${count === 1 ? 'the item' : `the ${count} items`} listed above under "Before you can download this SWMS". <button type="button" class="link" data-gate-list>Go to the list</button>`;
  // Everything is answered, but something typed since the draft was prepared changes more than its own
  // box (a site question can change the hazards), so the draft is prepared again before it prints.
  const redrawNote = 'Press Update the draft to put your answers in the SWMS. <button type="button" class="link" data-gate-update>Update the draft</button>';

  // What the buttons send: the check made in the panel. Throws with what it still needs.
  const confirmed = (prefix) => S.humanCheck.value(prefix);
  // A refusal that names parts changed since they were ticked unticks them (D286).
  const checkRefused = (prefix, error) => { if (error && (error.stale || error.field)) S.humanCheck.refused(prefix, error); };

  // The answers the SWMS prints as given, as they are on the page now: typed since the draft was
  // prepared, they print without preparing it again (app.js currentAnswers).
  const answersNow = (kind) => (kind === 'draft' && S.currentAnswers ? S.currentAnswers() : {});

  // The state whose law the SWMS uses, named where it is downloaded (owner, D292 item 1).
  const stateLine = (draft) => `<p class="meta" id="new-state"><strong>State: ${esc(draft.state)}.</strong> This SWMS uses the ${esc(draft.instrument)}. If the job is in another state, change the job address or the state above, then update the draft.</p>`;
  // Steps still rated High after their controls (owner, D292 item 4): a clear warning before download,
  // naming each one. The SWMS still downloads, and each prints that it does not start until the risk is
  // lowered or accepted in writing.
  const highAfter = (draft) => (draft.jobSteps || []).map((step, index) => ({ step, index })).filter(({ step }) => step.risk && step.risk.after && step.risk.after.level === 'High');
  function highAfterHtml(draft, id) {
    const list = highAfter(draft);
    if (!list.length) return '';
    // Each step has Show me, which goes to the step (messy round 5, run 4), where it can be given more
    // controls, rated again after the controls, or taken off.
    return `<div class="warning high-after" id="${id}" role="status"><p><strong>${list.length === 1 ? 'One step is' : `${list.length} steps are`} still rated High after controls:</strong> ${list.map(({ step, index }) => `step ${index + 1} (${esc(step.step)}) <button type="button" class="link" data-high-go="${index}">Show me</button>`).join('; ')}.</p>
      <p>${list.length === 1 ? 'It prints' : 'Each prints'} "This step does not start until" the supervisor adds controls that lower the rating, or accepts the risk in writing. At the step you can add controls, change the rating after the controls to suit the site, or take the step off if it is not part of this job. You can still download this SWMS.</p></div>`;
  }
  S.highAfter = highAfter;

  S.showActions = (draft, original) => {
    let input = original;
    const box = $('result-actions');
    S.onGateChange = null;
    // A SWMS with answers still to give is not finished: nothing to download or save yet, and the
    // list above the draft says what each answer needs (app.js).
    if (draft.kind === 'stand-down' && (draft.missingHelp || []).length) {
      box.innerHTML = '';
      return;
    }
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
    // A SWMS from a main contractor's list is for that list's project, not one of the company's own sites:
    // "Save to a site: No site" is not asked (messy round 11, SiteLink).
    // After a reload the project page may not be drawn yet when the draft is: the list kept on this device says
    // so too (messy round 15, SiteLink: "Save to a site: No site" showed on Roof works once saved and reloaded).
    const fromList = Boolean((S.listSwmsTitle && S.listSwmsTitle()) || (S.onBuilderList && S.onBuilderList()));
    // A saved SWMS being changed: its changes save as its next revision until a new SWMS is started.
    const editing = !local && S.editing;
    // Goal 2: nothing downloads or saves until the site questions are answered and each part with no
    // job steps is dealt with (the list above, which drops each item as it is answered, app.js).
    // What the buttons wait for now, and the line beside them saying why.
    const holdNow = () => {
      const live = kind === 'draft' && S.liveGate ? S.liveGate() : { waiting: 0, stale: false };
      const redraw = !live.waiting && live.stale;
      return { hold: live.waiting > 0 || redraw, html: live.waiting ? gateNote(live.waiting) : redraw ? redrawNote : '' };
    };
    const held = holdNow();
    box.innerHTML = `<div class="panel confirm">
      ${editing ? `<p class="meta" id="new-editing">Saving changes to "${esc(editing.title)}" as its next revision, in SiteWrite's current wording. Earlier revisions stay as they were saved. <button type="button" class="link" id="new-separate">Save as a new SWMS instead</button></p>` : ''}
      ${editing && editing.review ? `<div class="pc-review pc-back" id="new-pc-review"><strong>${esc(editing.review.label)}</strong>, ${esc(editing.review.name)}, ${esc(editing.review.company)}, ${esc(editing.review.date)}<div class="pc-text"><strong>${editing.review.response === 'changes' ? 'Changes needed' : 'Conditions'}:</strong>\n${esc(conditionLines(editing.review.text))}</div><p class="meta">Save the changes, then send the principal contractor the new revision's reference.</p></div>` : ''}
      ${kind === 'draft' ? stateLine(draft) : ''}
      ${kind === 'draft' ? highAfterHtml(draft, 'new-high-risk') : ''}
      ${kind === 'draft' && !local && !fromList ? `<div class="field"><label for="new-site">Save to a site</label><select id="new-site" class="plain">${siteOptions}</select></div>` : ''}
      ${kind === 'draft' && editing ? `<div class="field"><label for="new-reason">What changed and why (optional)</label><input id="new-reason" type="text" maxlength="300"${editing.review ? ` value="${esc(`For the principal contractor's review of revision ${editing.review.revision}`)}"` : editing.reason ? ` value="${esc(editing.reason)}"` : ''}></div>` : ''}
      ${kind === 'draft' ? checkBlock('new', 'download or save') : ''}
      ${kind === 'draft' && !local ? '<p class="meta">Downloading saves the SWMS under My SWMS, so every copy printed has a record and a revision. The PDF and the QR sign-on are the copies workers sign; the Word file is a working copy.</p>' : ''}
      ${kind === 'draft' ? `<p class="note gate-hold${held.html ? '' : ' hidden'}" id="new-gate-note" role="status">${held.html}</p>` : ''}
      <div class="actions">
        ${kind === 'draft' && !local ? `<button type="button" id="new-save">${editing ? 'Save changes' : 'Save SWMS'}</button>` : ''}
        <button type="button" class="secondary" id="new-docx">Download Word</button>
        <button type="button" class="secondary" id="new-pdf">Download PDF</button>
      </div>
      <p class="note hidden" id="new-status"></p>
    </div>`;
    // The buttons work once nothing is left on the list above, SiteWrite's check has found nothing that
    // must be fixed, and each part is ticked with a name and role (D286). A stood-down draft has no check.
    const buttons = ['new-save', 'new-docx', 'new-pdf'].map($).filter(Boolean);
    const ready = () => {
      const held = holdNow();
      const check = kind === 'draft' ? S.humanCheck.status('new') : { ready: true, why: '' };
      buttons.forEach((button) => { if (button.textContent !== 'Saved') button.disabled = held.hold || !check.ready; });
      // Why the buttons wait, said beside them: the list can be pages above on a phone. Once nothing
      // else is outstanding, the check is all they wait for.
      const html = held.html || esc(check.why);
      const note = $('new-gate-note');
      if (note && note.innerHTML !== html) note.innerHTML = html;
      if (note) note.classList.toggle('hidden', !html);
    };
    if (kind === 'draft') {
      restoreTyped('new');
      const task = String((input && input.task) || '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 200);
      S.humanCheck.bind('new', {
        // The ticks kept on this device are for this SWMS: a saved one by its id, a new one by its task.
        key: `draft:${editing ? editing.id : ''}:${task}`,
        was: editing ? `draft::${task}` : '',
        // A SWMS of a project brings back the check it was given (scope.js).
        // Its ticks gone, it still brings back who checked it (messy round 9, stuck point 3).
        seed: (S.projectCheck && S.projectCheck(input)) || (S.projectCheckWho && S.projectCheckWho(input)) || null,
        // What each part of this draft prints, so a tick for a part that now prints differently comes off
        // at once, before SiteWrite's check answers (messy round 6, run 8).
        parts: draft.checkParts || null,
        body: () => ({ ...S.actionInput, ...answersNow(kind) }),
        lockedBy: () => { const held = holdNow(); return held.hold ? (held.html === redrawNote ? 'SiteWrite checks the draft once it is updated with your answers.' : 'SiteWrite checks the draft once everything listed above is answered.') : ''; },
        onChange: ready,
        onDone: (check, note) => { if (S.onCheckDone) S.onCheckDone(input, check, note); },
        onResult: (count) => { if (S.onCheckResult) S.onCheckResult(input, count); },
      });
    }
    // The list above changes as the user answers, and with the tick above the draft (app.js); SiteWrite
    // checks the draft again a moment later.
    S.onGateChange = () => { ready(); if (kind === 'draft') S.humanCheck.refresh('new'); };
    ready();
    const selected = S.siteId();
    if (selected && $('new-site')) $('new-site').value = selected;
    // One save or download at a time: a press while another is on its way waits for it, so it carries
    // the saved SWMS the first one made (messy round 11, run 7: Save SWMS and then Download Word, pressed
    // a second apart, saved two SWMS with the same title, address and date).
    const run = (fn) => {
      const next = (S.savingNow || Promise.resolve()).catch(() => {}).then(async () => {
        try { await fn(); } catch (error) { checkRefused('new', error); status('new-status', error.message, true); }
      });
      S.savingNow = next;
      return next;
    };
    // Signed in, a download saves the SWMS first (or its next revision, when it has changed), so
    // every print has a record. Later changes save as its next revision.
    const saveAndDownload = async (route, fallbackName) => {
      const listTitle = S.listSwmsTitle ? S.listSwmsTitle() : '';
      const body = { ...S.actionInput, ...answersNow(kind), ...(kind === 'draft' ? confirmed('new') : {}), ...(!local ? { swmsId: S.editing ? S.editing.id : undefined, siteId: ($('new-site') && $('new-site').value) || undefined } : {}), ...(listTitle ? { swmsTitle: listTitle } : {}),
        // What changed and why goes with a download that saves the next revision too, so it prints on it (messy round 18, B run 7).
        ...($('new-reason') && $('new-reason').value.trim() ? { reason: $('new-reason').value.trim() } : {}) };
      const { saved } = await download(route, fallbackName, body);
      // Downloaded: the note that the work is not saved yet goes, and stays gone after a reload (messy round 15, A run 1;
      // round 16, A runs 1 and 3).
      if (S.unsavedDownloaded) S.unsavedDownloaded(); else if (S.unsavedNoteOff) S.unsavedNoteOff();
      if (!saved) return;
      // A new revision was saved when the number moved on from the one being changed.
      const revised = saved.revision > 1 && !(S.editing && S.editing.id === saved.id && S.editing.revision === saved.revision);
      S.editing = { id: saved.id, title: saved.title, revision: saved.revision };
      // A SWMS of a project is that saved SWMS from now on: Save, Download and Submit keep one record of it.
      if (S.projectSaved) S.projectSaved(S.actionInput, saved.id, { ...S.actionInput, ...answersNow(kind) });
      // Saved and downloaded: the work stays on this device, marked as the saved SWMS, so a reload or a return to the home
      // page brings it back with its revision (messy round 17, B all runs: after a download the page reloaded empty).
      if (S.unsavedDownloaded) S.unsavedDownloaded(); else if (S.clearUnsaved) S.clearUnsaved();
      status('new-status', `Saved as "${saved.title}", revision ${saved.revision}, and downloaded. Find it under My SWMS. Changes you make now save as its next revision.${revised ? resignLine(saved.revision) : ''}`);
      if ($('new-save')) { $('new-save').textContent = 'Saved'; $('new-save').disabled = true; }
    };
    $('new-docx').addEventListener('click', () => run(() => saveAndDownload('/api/draft.docx', 'SiteWrite.docx')));
    $('new-pdf').addEventListener('click', () => run(() => saveAndDownload('/api/draft.pdf', 'SiteWrite.pdf')));
    if ($('new-save')) {
      $('new-save').addEventListener('click', () => run(async () => {
        // A SWMS from a main contractor's list is saved under its title on that list, as Download names it
        // (messy round 11, SiteLink wording 6: Save named Roof works by its task).
        const listTitle = S.listSwmsTitle ? S.listSwmsTitle() : '';
        const body = { input: { ...S.actionInput, ...answersNow(kind) }, siteId: ($('new-site') && $('new-site').value) || null, reason: $('new-reason') ? $('new-reason').value.trim() : '', ...confirmed('new'), ...(listTitle && !S.editing ? { title: listTitle } : {}) };
        const data = S.editing ? await call('PUT', `/api/swms/${S.editing.id}`, body) : await call('POST', '/api/swms', body);
        // Later changes to this SWMS save as its revisions.
        S.editing = { id: data.swms.id, title: data.swms.title, revision: data.swms.revision || 1 };
        if (S.projectSaved) S.projectSaved(S.actionInput, data.swms.id, body.input);
        // Saved: the work stays on this device as the saved SWMS, as after a download (messy round 17).
        if (S.unsavedDownloaded) S.unsavedDownloaded(); else if (S.clearUnsaved) S.clearUnsaved();
        // Nothing changed since it was saved: it keeps its revision (messy round 16, SiteLink stuck point 1).
        status('new-status', data.swms.unchanged
          ? `Saved "${data.swms.title}". Nothing has changed since revision ${data.swms.revision || 1}, so it stays revision ${data.swms.revision || 1}. Find it under My SWMS.`
          : `Saved "${data.swms.title}", revision ${data.swms.revision || 1}. Find it under My SWMS, where workers can sign on by QR code.${data.swms.revision > 1 ? resignLine(data.swms.revision, data.swms.signedEarlier) : ''}`);
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
  // When a worker signed on, as every other date and time reads: "18 October 2026, 2:27 am" (messy round 11,
  // SiteLink wording 7: it printed "18/10/2026, 2:27:16 am").
  const signedWhen = (value) => {
    const when = new Date(value);
    const time = when.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s/g, ' ').toLowerCase();
    return `${when.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}, ${time}`;
  };

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

  // My SWMS, open on the page, shows a SWMS as soon as a download saves it (messy round 3: it said
  // "No saved SWMS yet" until pressed again).
  S.refreshMine = () => { if ($('my-swms') && !$('my-swms').classList.contains('hidden')) loadSwms(); };

  // My SWMS follows reviews as they come back (messy round 4, A fault 11: the principal contractor's
  // response showed only after My SWMS was pressed again): while it is open it is asked again every
  // 30 seconds and when the page is shown again, quietly, and says when a response has arrived.
  let reviewsSeen = null;
  // When the list was last drawn, and when the person last used the page (seenOnScreen).
  let drawnAt = 0;
  let usedAt = 0;
  let seenTimer = null;
  async function loadSwms({ quiet = false } = {}) {
    const list = $('swms-list');
    if (!quiet) list.innerHTML = '<p class="lede">Loading…</p>';
    try {
      const { swms } = await call('GET', '/api/swms');
      const siteName = (id) => (sites.find((site) => site.id === id) || {}).name || '';
      const reviewed = new Map(swms.filter((item) => item.review).map((item) => [item.id, `${item.review.label}|${item.review.date}`]));
      const arrived = reviewsSeen ? swms.filter((item) => item.review && reviewsSeen.get(item.id) !== reviewed.get(item.id)) : [];
      reviewsSeen = reviewed;
      // My SWMS open shows each review, so the note above the page goes. A review counts as seen only
      // once a person has had it on screen (seenOnScreen below), not because the list was asked again
      // while open (messy round 7, run 7: the 30 second refresh marked it seen on an idle phone, and
      // the next page load showed no notice).
      reviewsBackNote([]);
      const arrivedHtml = arrived.length ? `<p class="note" role="status" id="swms-review-arrived">A principal contractor's review has come back: ${arrived.map((item) => `${esc(item.title)} (${esc(item.review.label)})`).join('; ')}.</p>` : '';
      const html = arrivedHtml + (swms.length ? swms.map((item) => `
        <div class="swms-row"${item.review ? ` data-review-row="${esc(item.id)}" data-review-key="${esc(reviewKey(item))}"` : ''}>
          <div>
            <strong>${esc(item.title)}</strong>
            <span class="meta">${esc(siteName(item.siteId) || item.place || 'No site')} · ${signedText(item)} · ${item.reviewDue ? '<span class="due">Check due</span>' : `Check by ${shortDate(item.reviewDueAt)}`}</span>
            ${(item.changeReview || []).length ? `<span class="meta"><span class="due">Review: the law or SiteWrite changed</span> ${esc(item.changeReview[item.changeReview.length - 1])}</span>` : ''}
            ${item.review ? `<span class="meta">Principal contractor: <span class="${PC_CLASS[item.review.response] || 'due'}">${esc(item.review.label)}</span> on <span class="nowrap">${esc(item.review.date)}</span></span>` : ''}
          </div>
          <button type="button" class="small" data-swms="${esc(item.id)}">Open</button>
        </div>`).join('') + '<div class="actions" style="margin-top:12px"><button type="button" class="small secondary" id="swms-export">Export all saved SWMS (every revision in Word, with team and sites, one zip)</button></div>' : '<p class="lede">No saved SWMS yet. Prepare one below and save it.</p>');
      if (!quiet || arrived.length || list.innerHTML.replace(/<p class="note" role="status" id="swms-review-arrived">.*?<\/p>/, '') !== html) {
        list.innerHTML = html;
        // Opened by the person (not the quiet refresh), the press that opened it counts as use.
        drawnAt = !quiet && usedAt > Date.now() - 10000 ? usedAt - 1 : Date.now();
      }
      seenSoon();
    } catch (error) {
      if (!quiet) list.innerHTML = `<p class="error">${esc(error.message)}</p>`;
    }
  }
  const mineOpen = () => Boolean(me && $('my-swms') && !$('my-swms').classList.contains('hidden'));
  setInterval(() => { if (document.visibilityState === 'hidden') return; if (mineOpen()) loadSwms({ quiet: true }); else checkReviewsBack(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') return; if (mineOpen()) loadSwms({ quiet: true }); else checkReviewsBack(); });

  // A principal contractor's review that has come back shows when the page loads, and as it arrives,
  // with My SWMS open or not (messy round 5: it showed only once My SWMS was pressed). Each one shows
  // until My SWMS is opened. What has been seen is kept on this device, for each person.
  const REVIEWS_SEEN_KEY = 'sitewrite.reviewsSeen';
  const reviewKey = (item) => `${item.review.revision}|${item.review.label}|${item.review.date}`;
  function seenReviews() {
    try { const all = JSON.parse(read(REVIEWS_SEEN_KEY) || '{}'); return (all && me && all[me.user.email]) || {}; } catch { return {}; }
  }
  // seen: { swms id: review key } for the reviews just seen, added to those seen before.
  function markReviewsSeen(seen) {
    if (!me || !Object.keys(seen).length) return;
    let all = {};
    try { all = JSON.parse(read(REVIEWS_SEEN_KEY) || '{}') || {}; } catch { all = {}; }
    all[me.user.email] = { ...((all && all[me.user.email]) || {}), ...seen };
    write(REVIEWS_SEEN_KEY, JSON.stringify(all));
  }
  // A review is seen when its row in My SWMS is on screen, with the page in view, after the person has
  // touched, scrolled or typed on the page since the row was drawn; or when its SWMS is opened. A page
  // left open on an idle phone sees nothing.
  function seenOnScreen() {
    if (!mineOpen() || document.visibilityState !== 'visible' || usedAt <= drawnAt) return;
    const seen = {};
    const before = seenReviews();
    document.querySelectorAll('#swms-list [data-review-row]').forEach((row) => {
      const box = row.getBoundingClientRect();
      if (box.height && box.top < window.innerHeight && box.bottom > 0 && before[row.dataset.reviewRow] !== row.dataset.reviewKey) seen[row.dataset.reviewRow] = row.dataset.reviewKey;
    });
    markReviewsSeen(seen);
  }
  // Seen after a moment on screen, not as the row flicks past.
  function seenSoon() {
    clearTimeout(seenTimer);
    seenTimer = setTimeout(seenOnScreen, 1000);
  }
  ['pointerdown', 'keydown', 'scroll', 'wheel', 'touchstart'].forEach((type) => document.addEventListener(type, (event) => {
    if (!event.isTrusted) return;
    usedAt = Date.now();
    if (mineOpen()) seenSoon();
  }, { capture: true, passive: true }));
  // Closed once, it stays in its place at the top for the rest of this page's life.
  document.addEventListener('click', (event) => {
    const close = event.target.closest && event.target.closest('[data-reviews-close]');
    if (!close) return;
    document.documentElement.dataset.reviewsClosed = '1';
    const note = $('reviews-back');
    if (note) note.classList.remove('reviews-back-float');
    close.remove();
  });
  function reviewsBackNote(list) {
    let note = $('reviews-back');
    if (!list.length) { if (note) note.remove(); return; }
    const fresh = !note;
    if (!note) {
      note = document.createElement('div');
      note.id = 'reviews-back';
      note.className = 'note reviews-back';
      note.setAttribute('role', 'status');
      $('account-bar').after(note);
    }
    // Where the page has brought work back further down ("Your work is back"), the note goes just above
    // it, where the page is scrolled to, and is scrolled into view with it (messy round 8, run 1: on the
    // phone the note loaded above the screen).
    const back = document.getElementById('unsaved-note');
    if (back && note.nextElementSibling !== back) back.before(note);
    else if (!back && note.previousElementSibling !== $('account-bar')) $('account-bar').after(note);
    const shown = list.slice(0, 3).map((item) => `${esc(item.title)} (${esc(item.review.label)}, ${esc(item.review.date)})`).join('; ');
    const html = `<p><strong>${list.length === 1 ? 'A principal contractor\'s review is back' : `${list.length} principal contractor reviews are back`}:</strong> ${shown}${list.length > 3 ? `; and ${list.length - 3} more` : ''}.</p><div class="actions"><button type="button" class="small" data-panel="my-swms">Open My SWMS</button></div>`;
    if (note.innerHTML !== html) note.innerHTML = html;
    if (fresh && back && note.getBoundingClientRect && note.getBoundingClientRect().top < 0) note.scrollIntoView({ block: 'start' });
    // A plain reload keeps the place further down the page (#draft), so a note at the top was above the
    // screen (messy round 11, run 7). Until closed, it stays at the top of the screen as the page scrolls,
    // so the place is kept and the note is seen wherever the page opens.
    if (fresh && note.classList && !(document.documentElement && document.documentElement.dataset.reviewsClosed === '1')) note.classList.add('reviews-back-float');
    if (note.classList && note.classList.contains('reviews-back-float') && !note.querySelector('[data-reviews-close]')) {
      const actions = note.querySelector('.actions');
      if (actions) actions.insertAdjacentHTML('beforeend', ' <button type="button" class="small secondary" data-reviews-close>Close</button>');
    }
  }
  async function checkReviewsBack() {
    if (!me || !config.accounts) return;
    try {
      const { swms } = await call('GET', '/api/swms');
      if (mineOpen()) return;
      const seen = seenReviews();
      reviewsBackNote(swms.filter((item) => item.review && seen[item.id] !== reviewKey(item)));
    } catch {
      // Shown next time.
    }
  }

  $('swms-list').addEventListener('click', async (event) => {
    if (event.target.closest('#swms-export')) {
      const exportButton = event.target.closest('#swms-export');
      exportButton.disabled = true;
      try { await download('/api/swms/export.zip', 'SiteWrite-saved-SWMS.zip'); } catch (error) { alert(error.message); } finally { exportButton.disabled = false; }
      return;
    }
    const button = event.target.closest('[data-swms]');
    if (button) {
      // Opening a SWMS shows its review.
      const row = button.closest && button.closest('[data-review-row]');
      if (row) markReviewsSeen({ [row.dataset.reviewRow]: row.dataset.reviewKey });
      openSwms(button.dataset.swms);
    }
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

  // Two designs answered "I have it" with the same document or drawing number (D223), as the cards
  // say while the SWMS is prepared. Advice on the page only: it does not print or hold a download.
  function sameNumbersNote(draft) {
    const rules = window.SiteWriteGate;
    const groups = rules && rules.sameDesignNumbers && draft ? rules.sameDesignNumbers(draft.designs || []) : [];
    if (!groups.length) return '';
    // A written method (D224) is corrected under its own heading.
    const ids = groups.flatMap((group) => group.ids);
    const methods = ids.filter((id) => /^method-\d+$/.test(id)).length;
    const where = !methods ? '"Designs this work relies on"' : methods === ids.length ? '"Written methodologies and sequences of works"' : '"Designs this work relies on" or "Written methodologies and sequences of works"';
    return `<div class="warning" id="saved-design-same">${groups.map((group) => `<p>${esc(group.text)}</p>`).join('')}<p>To correct a number, choose Change, fix it under ${where} and save a new revision.</p></div>`;
  }

  // The principal contractor's responses (goal 3): the one on the current revision first, with who
  // gave it, their company and email, the date and any conditions or changes needed, and the way to
  // fix it in SiteWrite. Without one, the reference and link to send the principal contractor.
  const PC_CLASS = { approved: 'pc-ok', conditions: 'pc-cond', changes: 'due' };
  // Numbered conditions, each on its own line (messy round 4: four conditions printed as one paragraph).
  const conditionLines = (text) => String(text || '').replace(/(\S)[ \t]+(?=\(?\d{1,2}[.)][ \t]+\S)/g, '$1\n');
  S.conditionLines = conditionLines;
  // The business's own check of a saved SWMS (D290) is named for the business, held with its ABN, so it
  // is not mistaken for the principal contractor's review.
  const ownName = () => (me && me.company && me.company.name) || 'your business';
  function pcReviewBlock(swms, reviews) {
    const current = (reviews || []).filter((item) => item.revision === Number(swms.revision));
    const earlier = (reviews || []).filter((item) => item.revision !== Number(swms.revision));
    const textHead = { conditions: 'Conditions', changes: 'Changes needed' };
    // From a SiteLink project, each condition on its own line with where it has got (messy round 8,
    // wording 7: two conditions ran into one line, and the confirmed one was not marked).
    const conditionList = (item) => `<ul class="pc-conditions">${item.conditions.map((one) => `<li><span class="pill">${esc(one.status)}</span> ${esc(one.text)}</li>`).join('')}</ul>`;
    const line = (item) => `<li><strong class="${PC_CLASS[item.response] || ''}">${esc(item.label)}</strong> · revision ${esc(item.revision)} · ${esc(item.date)}<br>${esc(item.name)}, ${esc(item.company)}${item.email ? ` (<a href="mailto:${esc(item.email)}">${esc(item.email)}</a>)` : ''}
      ${item.sitelink && (item.conditions || []).length ? `<div class="pc-text"><strong>Conditions:</strong>${conditionList(item)}</div>` : item.text ? `<div class="pc-text"><strong>${textHead[item.response] || 'Comments'}:</strong>\n${esc(conditionLines(item.text))}</div>` : ''}</li>`;
    const send = swms.reviewLink ? `<p class="meta">To have the principal contractor review revision ${esc(swms.revision)} in SiteWrite, send them the reference ${esc(swms.ref)} or this link: <a href="${esc(swms.reviewLink)}" target="_blank" rel="noopener">${esc(swms.reviewLink)}</a></p>` : '';
    const latest = current[0];
    // A SWMS submitted on a main contractor's list in SiteLink goes back the same way: submitted again
    // from From main contractors, with each condition marked done there.
    const viaList = latest && latest.sitelink;
    const fixText = viaList
      ? (latest.response === 'changes' ? `Make the changes, check the SWMS again, and submit it to ${latest.company} again from From main contractors.` : `Meet each condition before work starts, and mark it done under From main contractors. ${latest.company} confirms each one. If you change the SWMS, submit it again from there.`)
      : (latest && latest.response === 'changes' ? 'Make the changes, save the SWMS as a new revision, and send the principal contractor the new reference.' : 'Meet the conditions before work starts. If you change the SWMS, save it as a new revision and send the principal contractor the new reference.');
    const fix = latest && latest.response !== 'approved'
      ? `<p>${esc(fixText)}</p>
        <div class="actions"><button type="button" id="pc-fix">Fix this in SiteWrite</button></div>` : '';
    return `<div class="pc-review${latest && latest.response !== 'approved' ? ' pc-back' : ''}" id="pc-review"><h2>Principal contractor review</h2>
      ${current.length ? `<ul class="pc-list">${current.map(line).join('')}</ul>${fix}` : swms.submitted ? `<p>Revision ${esc(swms.revision)} was submitted to ${esc(swms.submitted.to)} for ${esc(swms.submitted.project)} on ${esc(swms.submitted.on)}. Its review shows here when ${esc(swms.submitted.to)} sends it.</p>` : `<p>Revision ${esc(swms.revision)} has not been reviewed yet.</p>${send}`}
      ${earlier.length ? `<details><summary>Earlier revisions (${earlier.length})</summary><ul class="pc-list">${earlier.map(line).join('')}</ul></details>` : ''}</div>`;
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
        <p class="meta">Revision ${esc(swms.revision)}, saved ${shortDate(swms.revisedAt)}${swms.ref ? ` · SiteWrite reference ${esc(swms.ref)}` : ''}</p>
        <p class="meta">Last checked by ${esc(ownName())} on ${shortDate(swms.lastReviewedAt)} (${esc(swms.reviewedBy)}) · ${swms.reviewDue ? '<span class="due">Check due now</span>' : `next check by ${shortDate(swms.reviewDueAt)}`}</p>
        ${update.available ? `<div class="note" id="saved-update"><p><strong>Updated wording is available.</strong> SiteWrite's library or the law has changed since this revision was saved. This revision prints as it was saved. To use the updated wording, check the changes and make a new revision.</p>
          ${(update.reasons || []).map((reason) => `<p><strong>Why:</strong> ${esc(reason)}</p>`).join('')}
          <details><summary>What would change (${update.changes.length})</summary><ul>${update.changes.map((line) => `<li>${esc(line)}</li>`).join('')}</ul></details>
          <div class="actions"><button type="button" class="secondary" id="saved-update-go">Make a new revision with the updated wording</button></div>
          <p class="meta">It opens with the updated wording, for you to check each part and save it as a new revision.</p></div>` : ''}
        ${sameNumbersNote(draft)}
        ${pcReviewBlock(swms, data.reviews)}
        ${historyBlock(history)}
        <div class="actions wrap-actions">
          <button type="button" id="saved-docx">Download Word</button>
          <button type="button" class="secondary" id="saved-pdf">Download PDF</button>
          <button type="button" class="secondary" id="saved-edit">Change</button>
          <button type="button" class="secondary" id="saved-copy">Copy for another job</button>
          <button type="button" class="secondary" id="saved-delete">Delete</button>
        </div>
        <div class="review-box">
          <h2 style="margin-top:16px">Mark as checked by ${esc(ownName())}</h2>
          ${data.lastCheck ? `<p class="meta">Revision ${esc(swms.revision)} was checked by ${esc(data.lastCheck.name)}, ${esc(data.lastCheck.role)}, ${esc(data.lastCheck.date)}.</p>` : ''}
          ${checkBlock('saved', 'mark it as checked')}
          <div class="actions"><button type="button" class="secondary" id="saved-reviewed">Mark as checked by ${esc(ownName())}</button></div>
          <p class="meta">Copy for another job uses this check too.</p>
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
          ${signons.length ? signons.map((item) => `<tr><td>${esc(item.worker_name)}${item.note ? `<br><span class="meta">${esc(item.note)}</span>` : ''}</td><td>${esc(item.worker_company)}</td><td>${esc(signedWhen(item.signed_at))}</td></tr>`).join('') : `<tr><td colspan="3">No one has signed on${swms.revision > 1 ? ` to revision ${esc(swms.revision)}` : ''} yet.</td></tr>`}
        </tbody></table>
        ${earlier.length ? `<h3 class="signed-head">Signed an earlier revision only</h3>
        <p class="meta">These workers have not signed revision ${esc(swms.revision)}. Their sign-ons stay on the revision they signed.</p>
        <table id="signed-earlier"><thead><tr><th>Name</th><th>Company</th><th>Signed</th></tr></thead><tbody>
          ${earlier.map((item) => `<tr><td>${esc(item.worker_name)}${item.note ? `<br><span class="meta">${esc(item.note)}</span>` : ''}</td><td>${esc(item.worker_company)}</td><td>${item.revision ? `Revision ${esc(item.revision)}` : 'An earlier revision'}<br><span class="meta">${esc(signedWhen(item.signed_at))}</span></td></tr>`).join('')}
        </tbody></table>` : ''}
      </div>
      ${draft.controlEdits && S.editNotes ? S.editNotes(draft.controlEdits) : ''}
      <div class="sheet">${S.render(draft, { swmsId: id })}</div>`;
    resultEl.classList.remove('hidden');
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const run = async (fn) => {
      try { await fn(); } catch (error) { checkRefused('saved', error); status('saved-status', error.message, true); }
    };
    // The business's own check of the revision as it prints (D290, D286): SiteWrite's check was made
    // when the SWMS was opened.
    restoreTyped('saved');
    S.humanCheck.bind('saved', { key: `saved:${id}:${swms.revision}`, initial: data.selfCheck || { partHashes: {} } });
    $('saved-docx').addEventListener('click', () => run(() => download(`/api/swms/${id}/docx`, 'SWMS.docx')));
    $('saved-pdf').addEventListener('click', () => run(() => download(`/api/swms/${id}/pdf`, 'SWMS.pdf')));
    resultEl.querySelectorAll('[data-revision-docx], [data-revision-pdf]').forEach((button) => button.addEventListener('click', () => run(() => {
      const docx = button.dataset.revisionDocx;
      return download(`/api/swms/${id}/${docx ? 'docx' : 'pdf'}?revision=${encodeURIComponent(docx || button.dataset.revisionPdf)}`, docx ? 'SWMS.docx' : 'SWMS.pdf');
    })));
    // The updated wording changes what prints, so it opens as a draft to check part by part (D286) and
    // save as the next revision.
    if ($('saved-update-go')) $('saved-update-go').addEventListener('click', () => change(null, 'Updated to SiteWrite\'s current wording'));
    $('saved-reviewed').addEventListener('click', () => run(async () => {
      await call('POST', `/api/swms/${id}/reviewed`, confirmed('saved'));
      status('saved-status', `Marked as checked by ${ownName()}. The next check is due in 3 months.`);
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
    // The saved SWMS opens itself, not a project kept on this device (messy round 4, A fault 11: "Fix this
    // in SiteWrite" opened the old project list): a project's SWMS opens as that SWMS of the project,
    // and any other is changed with the project put aside.
    const change = (review = null, reason = '') => run(async () => {
      if (S.projectForSaved) S.projectForSaved(id);
      await S.fillForm(data.input);
      S.editing = { id, title: swms.title, revision: swms.revision, ...(review ? { review } : {}), ...(reason ? { reason } : {}) };
      S.showSite(swms.siteId || '');
      if (S.prepare) await S.prepare();
      // The review being fixed is what the person reads first: its banner is brought to the top once the
      // draft is drawn, after the draft's own scrolling (messy round 10, run 8: on the phone the draft
      // opened at "Your own steps", with "Fixing for" out of view).
      // Boxes above it that fill in a moment later would push it out of view again, so it is held at the
      // top for a short while, until the person scrolls or taps.
      if (review) {
        const top = document.getElementById('fix-review-top');
        if (top) {
          top.setAttribute('tabindex', '-1');
          if (top.focus) top.focus({ preventScroll: true });
          let moved = false;
          const stop = () => { moved = true; };
          ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach((type) => window.addEventListener(type, stop, { once: true, passive: true }));
          const until = Date.now() + 3000;
          const hold = () => {
            if (moved || Date.now() > until || !document.body.contains(top)) return;
            if (Math.abs(top.getBoundingClientRect().top) > 4) top.scrollIntoView({ block: 'start' });
            requestAnimationFrame(hold);
          };
          hold();
        }
      }
    });
    $('saved-edit').addEventListener('click', () => change());
    // The principal contractor's conditions or changes are fixed the same way (D283: on the page, not in
    // the email), with them shown beside the save button.
    const standing = (data.reviews || []).find((item) => item.revision === Number(swms.revision));
    if ($('pc-fix')) $('pc-fix').addEventListener('click', () => change(standing));
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
      const { users, invited = [] } = await call('GET', '/api/company/users');
      const admin = Boolean(me && me.user.isAdmin);
      // Each person by name, with the email beside it (messy round 9, wording 10: Team showed only the
      // office admin's email). A person with no name yet can give theirs here.
      const mine = (user) => me && me.user && user.email === me.user.email;
      $('team-list').innerHTML = users.map((user) => `<li>${user.name ? `${esc(user.name)} <span class="meta">${esc(user.email)}</span>` : esc(user.email)}`
        + `${user.is_admin ? ' <span class="meta">(administrator)</span>' : user.last_seen_at ? '' : ' <span class="meta">(invited)</span>'}`
        + `${admin && !user.is_admin ? ` <button type="button" class="link" data-remove="${esc(user.email)}">Remove</button>` : ''}`
        + `${mine(user) && !user.name ? `<div class="field team-name"><label for="team-my-name">Your name, as your team sees it</label><input id="team-my-name" type="text" maxlength="120" autocomplete="name"><button type="button" class="small secondary" id="team-my-name-save">Save my name</button><span class="meta" id="team-my-name-status" role="status"></span></div>` : ''}</li>`).join('')
        // Invited, and not signed in yet: shown at once after "Send invitation".
        + invited.map((email) => `<li>${esc(email)} <span class="meta">(invited, not signed in yet)</span></li>`).join('');
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
    if (event.target.id === 'team-my-name-save') {
      const name = $('team-my-name').value.replace(/\s+/g, ' ').trim();
      if (!name) { $('team-my-name-status').textContent = 'Enter your name first.'; return; }
      try {
        await call('PUT', '/api/me', { name });
        if (me && me.user) me.user.name = name;
        loadTeam();
      } catch (error) {
        $('team-my-name-status').textContent = error.message;
      }
      return;
    }
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
  S.showPanel = (id) => showPanel(id);
  S.renderBar = () => renderBar();
  // For the project download: whether downloads are open, the review box, and the download itself.
  S.canDownload = () => !config.accounts || Boolean(me && me.company.hasAccess);
  S.accountsOn = () => Boolean(config.accounts);
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
    // The review reminder email links to My SWMS (/#my-swms). Signed out, the sign-in box opens;
    // signing in then shows My SWMS.
    if (window.location.hash === '#my-swms' && config.accounts) {
      if (me) showPanel('my-swms');
      else {
        $('signin').classList.remove('hidden');
        $('faceid-signin').classList.toggle('hidden', !passkeysWork());
        status('signin-status', 'Sign in to see My SWMS.');
        $('signin').scrollIntoView({ block: 'start' });
      }
    }
  }

  // The page waits for this before it brings back unsaved work, so its buttons match the account.
  S.accountReady = start().catch(() => {});
})();
