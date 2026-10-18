// The SWMS list a main contractor sent a subcontractor (Goal 12 stage 5): /list.html?t={link}. It
// works with no account. It shows the builder, the project, the SWMS list, the due date and the site
// details; a SWMS the subcontractor already has can be uploaded for each SWMS on the list; and the
// person can sign in to SiteWrite, or start an account, and take up the list for their company (D308).
// /list.html?stop={link} is the "stop these emails" page.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  // The same sign-in as the SiteWrite app (account.js), so signing in here signs in there too.
  const SESSION_KEY = 'sitewrite.session';
  const store = {
    get: (key) => { try { return localStorage.getItem(key) || ''; } catch { return ''; } },
    set: (key, value) => { try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch { /* not kept */ } },
  };
  const params = new URLSearchParams(location.search);
  const token = params.get('t') || '';
  let session = store.get(SESSION_KEY);
  let list = null;
  let me = null;
  let claimNote = null;
  const MAX_MB = 10;
  const ACCEPTED = /\.(pdf|docx)$/i;

  const VIEWS = ['loading', 'error', 'list', 'stop'];
  function view(name) {
    for (const id of VIEWS) $(`view-${id}`).classList.toggle('hidden', id !== name);
  }
  function box(id, html, kind = '') {
    $(id).innerHTML = html ? `<div class="${kind}">${html}</div>` : '';
  }
  async function call(method, route, body, { signedIn = false } = {}) {
    let response;
    try {
      response = await fetch(route, {
        method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(signedIn && session ? { Authorization: `Bearer ${session}`, 'X-Session-Token': session } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw Object.assign(new Error('SiteWrite could not reach the server. Try again.'), { status: 0 });
    }
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && signedIn) { session = ''; store.set(SESSION_KEY, ''); me = null; }
    if (!response.ok) throw Object.assign(new Error(data.message || 'Something went wrong. Try again.'), { status: response.status, field: data.field, confirm: data.confirm });
    return data;
  }
  async function busy(button, text, fn) {
    const before = button.textContent;
    button.disabled = true;
    button.textContent = text;
    try { return await fn(); } finally { button.disabled = false; button.textContent = before; }
  }
  const clauseWord = (items) => (items.length === 1 && !/[,;&]|\band\b/.test(items[0]) ? 'clause' : 'clauses');
  // "Also covers: cells and secure areas and access equipment": the package names read as a list.
  const coversList = (list) => { const names = list.map((name) => String(name).replace(/^trade installation:\s*/i, '').replace(/^./, (letter) => letter.toLowerCase())); return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || ''; };
  // An ABN reads with its spaces wherever it shows (messy round 7: "66719388375").
  const formatAbn = (abn) => { const d = String(abn || '').replace(/\D/g, ''); return d.length === 11 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : String(abn || ''); };

  // ---- The list ----

  function renderList() {
    const l = list;
    document.title = `SWMS for ${l.project.name}: SiteWrite`;
    const unverified = l.builder.verified ? '' : ' <span class="tag unverified" title="This builder\'s ABN does not match the ABN register yet.">Unverified</span>';
    // No comma straight after the tag (messy round 8, wording 12: "Unverified , sent by").
    $('l-from').innerHTML = `From ${esc(l.builder.name)}${unverified}<br>Sent by ${esc(l.from.name)}`;
    $('l-title').textContent = `${l.builder.name} needs these SWMS from you`;
    box('l-changed', l.changed ? `<strong>${esc(l.builder.name)} has changed this list since the email of ${esc(l.sentOn)}.</strong> This is the list as it is now.` : '', 'warn');
    $('l-project').textContent = l.project.name;
    $('l-workplace').textContent = l.project.workplace;
    $('l-pc').textContent = `Principal contractor: ${l.project.pcName}`;
    $('l-for').textContent = `For ${l.subcontractor.name}${l.subcontractor.trade ? ` (${l.subcontractor.trade})` : ''}`;
    $('l-due').textContent = l.due.past ? `This was due on ${l.due.shown}.` : `Due ${l.due.shown}`;
    $('l-due').classList.toggle('past', l.due.past);
    $('l-swms-title').textContent = `SWMS needed (${l.swms.length})`;
    $('l-swms-intro').textContent = l.uploadsOn
      ? `Already have a SWMS for one of these? Upload it under its title, as a PDF or a Word file. ${l.builder.name} sees it straight away.`
      : `Already have a SWMS for one of these? Email it to ${l.from.name}.`;
    $('l-swms').innerHTML = l.swms.length ? l.swms.map(card).join('') : `<p class="warn">No SWMS are on this list. Contact ${esc(l.from.name)} if you expected some.</p>`;
    // Answers the builder gave to points the scope left open.
    $('l-answers-card').classList.toggle('hidden', !l.answers.length);
    $('l-answers').innerHTML = l.answers.length ? `<h2>Answers from ${esc(l.builder.name)}</h2>${l.answers.map((item) => `<div class="qa"><p class="meta">${esc(item.activity)}${item.clause ? ` (${clauseWord([item.clause])} ${esc(item.clause)})` : ''}</p><p>${esc(item.question)}</p><p><strong>${esc(l.builder.name)}:</strong> ${esc(item.answer)}</p></div>`).join('')}` : '';
    $('l-details').innerHTML = l.siteDetails
      ? `<h2>Site details to use</h2><p class="meta">${esc(l.builder.name)} asks every contractor on this project to use these on their SWMS (version ${esc(l.siteDetails.rev)}).</p><dl class="details">${l.siteDetails.list.map((entry) => `<dt>${esc(entry.label)}</dt><dd>${Array.isArray(entry.value) ? `<ul>${entry.value.map((rule) => `<li>${esc(rule)}</li>`).join('')}</ul>` : esc(entry.value)}</dd>`).join('')}</dl>`
      : '<h2>Site details to use</h2><p class="meta">Not set yet.</p>';
    const reach = [l.from.email, l.from.phone].filter(Boolean).map(esc).join(' or ');
    $('l-contact').innerHTML = `<strong>Questions about this list?</strong><p>Contact ${esc(l.from.name)}${l.from.position ? `, ${esc(l.from.position)}` : ''}, at ${esc(l.builder.name)}${reach ? `: ${reach}` : ''}. Replying to the email reaches them too.</p>`;
    renderClaim();
  }

  function card(item) {
    // Once a company has taken up the list, its files show only to people signed in for it (messy round 7).
    const hidden = item.uploadsHidden ? `<p class="meta">${item.uploadsHidden === 1 ? 'A file has' : `${item.uploadsHidden} files have`} been uploaded for this SWMS. Only people signed in for ${esc(list.filesFor)} can see ${item.uploadsHidden === 1 ? 'it' : 'them'} or take ${item.uploadsHidden === 1 ? 'it' : 'them'} off.</p>` : '';
    const files = item.uploads.length ? `<ul class="files">${item.uploads.map((file) => `<li><span>${esc(file.name)} <span class="meta">(${esc(file.type)}, uploaded ${esc(file.on)})</span></span><button type="button" class="danger" data-remove="${esc(file.id)}" data-name="${esc(file.name)}" data-title="${esc(item.title)}" aria-label="${esc(`Take ${file.name} off ${item.title}`)}">Take it off</button></li>`).join('')}</ul>` : '';
    const upload = list.uploadsOn ? `<details class="upload"><summary>${item.uploads.length ? 'Upload another file for this SWMS' : 'Upload a SWMS you have for this'}</summary>
        <label for="file-${esc(item.id)}">Your SWMS for ${esc(item.title)} <span class="hint">A PDF or a Word file (.docx), up to ${esc(list.uploadMaxMb)} MB.</span></label>
        <input id="file-${esc(item.id)}" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document">
        <p class="field-error hidden" id="file-${esc(item.id)}-error"></p>
        <div class="actions"><button type="button" data-upload="${esc(item.id)}" aria-label="${esc(`Upload the file for ${item.title}`)}">Upload</button></div></details>` : '';
    return `<div class="swms" id="item-${esc(item.id)}"><h3>${esc(item.title)}</h3>
      ${item.highRisk ? `<span class="hrcw hrcw-${esc(item.highRisk.status)}"><strong>${esc(item.highRisk.heading)}.</strong>${item.highRisk.line ? ` ${esc(item.highRisk.line)}.` : ''}</span>` : ''}
      ${item.task ? `<p class="work">${esc(item.task)}</p>` : ''}
      ${item.alsoCovers && item.alsoCovers.length ? `<p class="also">Also covers: ${esc(coversList(item.alsoCovers))}.</p>` : ''}
      ${item.clauses.length ? `<p class="meta">Scope ${clauseWord(item.clauses)} ${esc(item.clauses.join('; '))}.</p>` : ''}
      ${files}${hidden}${upload}<div id="item-${esc(item.id)}-status" role="status"></div></div>`;
  }

  function fileError(itemId, message) {
    const input = $(`file-${itemId}`);
    const note = $(`file-${itemId}-error`);
    if (input) input.classList.add('has-error');
    if (note) { note.textContent = message; note.classList.remove('hidden'); }
  }

  $('l-swms').addEventListener('click', async (event) => {
    const up = event.target.closest('[data-upload]');
    if (up) {
      const itemId = up.dataset.upload;
      const input = $(`file-${itemId}`);
      const file = input && input.files[0];
      input.classList.remove('has-error');
      $(`file-${itemId}-error`).classList.add('hidden');
      if (!file) { fileError(itemId, 'Choose the SWMS file first.'); return; }
      if (/\.doc$/i.test(file.name)) { fileError(itemId, 'Older Word files (.doc) cannot be taken. Save it as .docx or as a PDF and upload it again.'); return; }
      if (!ACCEPTED.test(file.name)) { fileError(itemId, 'Choose a PDF or a Word file (.docx).'); return; }
      if (file.size > MAX_MB * 1024 * 1024) { fileError(itemId, `The file is larger than ${MAX_MB} MB. Upload a smaller copy of the SWMS.`); return; }
      await busy(up, 'Uploading...', async () => {
        try {
          const response = await fetch(`/api/list/${encodeURIComponent(token)}/items/${encodeURIComponent(itemId)}/upload`, {
            method: 'POST',
            headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name), ...(session ? { Authorization: `Bearer ${session}`, 'X-Session-Token': session } : {}) },
            body: file,
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.message || 'The file could not be uploaded. Try again.');
          list = data.list;
          renderList();
          box(`item-${itemId}-status`, esc(data.message), 'ok');
        } catch (error) {
          fileError(itemId, error.message);
        }
      });
      return;
    }
    const remove = event.target.closest('[data-remove]');
    if (remove) {
      if (!window.confirm(`Take ${remove.dataset.name} off ${remove.dataset.title}?`)) return;
      const itemId = remove.closest('.swms').id.replace(/^item-/, '');
      await busy(remove, 'Taking it off...', async () => {
        try {
          const data = await call('DELETE', `/api/list/${encodeURIComponent(token)}/uploads/${encodeURIComponent(remove.dataset.remove)}`, null, { signedIn: true });
          list = data.list;
          renderList();
          box(`item-${itemId}-status`, esc(data.message), 'ok');
        } catch (error) {
          box(`item-${itemId}-status`, esc(error.message), 'bad');
        }
      });
    }
  });

  // ---- Taking up the list in SiteWrite (D308) ----

  function renderClaim() {
    const l = list;
    const who = $('who-line');
    who.classList.toggle('hidden', !me);
    if (me) who.innerHTML = `Signed in as ${esc(me.user.email)} · <a href="#" id="sign-out">Sign out</a>`;
    const abnLine = l.abnSet ? ` Only the company whose ABN ${esc(l.builder.name)} gave can take it up.` : '';
    let html = '<h2>Work on these SWMS in SiteWrite</h2>';
    if (!claimNote && l.mine && me) claimNote = { kind: 'ok', message: `This list is linked to ${me.company.name} in SiteWrite. ${l.builder.name} can see that you have it.` };
    if (claimNote && claimNote.kind === 'ok') {
      // Stage 6: the SWMS are drafted and waiting under From main contractors in SiteWrite.
      const id = claimNote.listId || l.listId || '';
      html += `<div class="ok"><strong>${esc(claimNote.message)}</strong></div><p>Its SWMS are drafted and waiting in SiteWrite, under From main contractors, with the site details ${esc(l.builder.name)} set filled in. You check each one and fill in what only you know.</p><div class="actions"><a class="button" href="/${id ? `?list=${encodeURIComponent(id)}` : '#from-builders'}">Open the SWMS in SiteWrite</a></div>`;
    } else if (!me) {
      html += `<p>Sign in, or start an account, to take up this list. It is then linked to your company, and ${esc(l.builder.name)} can see that you have it.${abnLine}</p>
        <form id="signin" novalidate><label for="signin-email">Your work email</label><input id="signin-email" type="email" autocomplete="email" inputmode="email" maxlength="200">
        <p class="field-error hidden" id="signin-email-error"></p>
        <div class="actions"><button type="submit" id="signin-go">Email me a sign-in link</button></div></form>
        <div id="signin-status" role="status"></div>
        <p class="meta">A new account starts with a free trial. You do not have to use SiteWrite: you can upload your SWMS above, or reply to the email.</p>`;
    } else {
      const company = me.company || {};
      const ready = String(company.name || '').trim() && String(company.abn || '').replace(/\D/g, '').length === 11;
      // A company that cannot take it up (another ABN, or another company has it) is told why, with no button.
      const refused = (claimNote && claimNote.kind === 'bad' && claimNote.message) || (ready && l.refusal);
      if (refused) {
        // A wrong ABN saved on the company is fixed here (messy round 8, stuck point 3: the page offered
        // only "contact" and "sign out", and the fix was found by hand in the company profile).
        const abnWrong = l.refusalKind === 'abn';
        html += `<p>Signed in for <strong>${esc(company.name)}</strong> (ABN ${esc(formatAbn(company.abn))}).</p><div class="bad">${esc(refused)}</div>`;
        if (abnWrong && fixing) html += companyForm(company, 'Save and try again', '<p>Change your company name and ABN as they should be. They print on every SWMS your company makes in SiteWrite.</p>');
        else if (abnWrong) html += `<p>Is your company's name or ABN wrong in SiteWrite? <button type="button" class="light" id="company-fix">Change the company name and ABN</button></p>`;
        html += '<p class="meta">You can still upload your SWMS above. If you signed in with the wrong account, sign out at the top of the page.</p>';
        $('l-claim').innerHTML = html;
        return;
      }
      if (ready && !l.abnSet) {
        // With no ABN given, the company is asked whether the list is for it, naming the company it will
        // be linked to (messy round 7: another company took it up with no question).
        html += `<div class="ask" id="claim-ask"><p><strong>This list is for ${esc(l.subcontractor.name)}. Is that your company?</strong></p>
          <p>Taking it up links it to <strong>${esc(company.name)}</strong> (ABN ${esc(formatAbn(company.abn))}) in SiteWrite, and ${esc(l.builder.name)} sees that ${esc(company.name)} has it.</p>
          <div class="actions"><button type="button" id="claim-go" data-confirm="1">Yes, take it up for ${esc(company.name)}</button><button type="button" class="light" id="claim-no">No, it is not ours</button></div></div>`;
      } else if (ready) {
        html += `<p>Take up this list for <strong>${esc(company.name)}</strong> (ABN ${esc(formatAbn(company.abn))}).${abnLine}</p><div class="actions"><button type="button" id="claim-go">Take up this list for ${esc(company.name)}</button></div>`;
      } else {
        html += companyForm(company, 'Save and take up the list', `<p>Add your company name and ABN. They link the list to your company, and print on your SWMS.${abnLine}</p>`);
      }
      if (claimNote) html += `<div class="${esc(claimNote.kind)}">${esc(claimNote.message)}</div>`;
    }
    $('l-claim').innerHTML = html;
  }

  // The company's name and ABN, to add or to put right.
  let fixing = false;
  function companyForm(company, label, lede) {
    return `${lede}<form id="company" novalidate><label for="c-name">Company name</label><input id="c-name" type="text" autocomplete="organization" maxlength="200" value="${esc(company.name || '')}"><p class="field-error hidden" id="c-name-error"></p>
      <label for="c-abn">ABN <span class="hint">Your company's 11 digit ABN.</span></label><input id="c-abn" type="text" inputmode="numeric" maxlength="20" value="${esc(company.abn || '')}"><p class="field-error hidden" id="c-abn-error"></p>
      <div class="actions"><button type="submit" id="company-go">${esc(label)}</button></div></form>`;
  }
  // A company name typed all in lower case gets capitals ("wallaroo electrical" is Wallaroo Electrical):
  // it prints on every SWMS (messy round 8, wording 13). A name with any capital is kept as typed.
  const SMALL = new Set(['and', 'n', 'of', 'the', 'for', 'at', 'in', 'on', 'by']);
  const tidyCompany = (name) => (/[A-Z]/.test(name) ? name : name.replace(/[a-z][\w']*/g, (word, at) => (at && SMALL.has(word) ? word : `${word[0].toUpperCase()}${word.slice(1)}`)));

  async function claim(button) {
    await busy(button, 'Taking it up...', async () => {
      try {
        const data = await call('POST', `/api/list/${encodeURIComponent(token)}/claim`, button.dataset.confirm ? { confirm: true } : null, { signedIn: true });
        claimNote = { kind: 'ok', message: data.message, listId: data.listId || '' };
      } catch (error) {
        if (error.status === 401) claimNote = { kind: 'warn', message: 'You have been signed out. Sign in again to take up the list.' };
        else if (error.field === 'company') claimNote = { kind: 'warn', message: error.message };
        else if (error.confirm) claimNote = { kind: 'warn', message: error.message };
        else claimNote = { kind: 'bad', message: error.message };
      }
    });
    renderClaim();
    $('l-claim').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  $('l-claim').addEventListener('click', async (event) => {
    const go = event.target.closest('#claim-go');
    if (go) { await claim(go); return; }
    if (event.target.closest('#company-fix')) { fixing = true; renderClaim(); $('c-abn').focus(); return; }
    if (event.target.closest('#claim-no')) {
      // Logged for the lead (messy round 8, blocker 5); the page says the same whatever the answer.
      call('POST', `/api/list/${encodeURIComponent(token)}/not-ours`, {}, { signedIn: true }).catch(() => {});
      claimNote = { kind: 'warn', message: `Then do not take it up. ${list.uploadsOn ? 'You can still upload a SWMS above. ' : ''}If the list should be yours, contact ${list.from.name} at ${list.builder.name}${list.from.email ? ` (${list.from.email})` : ''}. If you signed in with the wrong account, sign out at the top of the page.` };
      renderClaim();
    }
  });
  document.addEventListener('click', async (event) => {
    if (!event.target.closest || !event.target.closest('#sign-out')) return;
    event.preventDefault();
    await call('POST', '/api/auth/logout', null, { signedIn: true }).catch(() => {});
    session = '';
    store.set(SESSION_KEY, '');
    me = null;
    claimNote = null;
    renderClaim();
  });
  $('l-claim').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    form.querySelectorAll('.has-error').forEach((el) => el.classList.remove('has-error'));
    form.querySelectorAll('.field-error').forEach((el) => el.classList.add('hidden'));
    const mark = (id, message) => { $(id).classList.add('has-error'); $(`${id}-error`).textContent = message; $(`${id}-error`).classList.remove('hidden'); $(id).focus(); };
    if (form.id === 'signin') {
      const email = $('signin-email').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { mark('signin-email', 'Enter a valid email address.'); return; }
      await busy($('signin-go'), 'Sending...', async () => {
        try {
          const data = await call('POST', `/api/list/${encodeURIComponent(token)}/sign-in`, { email });
          box('signin-status', `<strong>${esc(data.message)}</strong>`, 'ok');
        } catch (error) {
          if (error.field === 'email') mark('signin-email', error.message);
          else box('signin-status', esc(error.message), 'bad');
        }
      });
      $('signin-go').textContent = 'Email me another link';
      return;
    }
    if (form.id === 'company') {
      const name = tidyCompany($('c-name').value.trim().replace(/\s+/g, ' '));
      const abn = $('c-abn').value.trim();
      if (!name) { mark('c-name', 'Enter your company name.'); return; }
      if (abn.replace(/\D/g, '').length !== 11) { mark('c-abn', 'That ABN is not valid. Check the 11 digits.'); return; }
      await busy($('company-go'), 'Saving...', async () => {
        try {
          const c = me.company || {};
          // The rest of the company profile is sent as it is, so nothing else changes.
          const data = await call('PUT', '/api/company', { name, abn, address: c.address || '', phone: c.phone || '', email: c.email || '' }, { signedIn: true });
          me.company = data.company;
          claimNote = null;
          fixing = false;
          // The list again, now that the company is known: whether it can take the list up, and why not
          // (messy round 7: a company another had beaten to it was asked "Is that your company?").
          list = await call('GET', `/api/list/${encodeURIComponent(token)}`, null, { signedIn: true }).catch(() => list);
          renderList();
        } catch (error) {
          // A name and ABN fixed once a SWMS was saved or downloaded: the message says how SiteWrite corrects them.
          if (/ABN/.test(error.message) || error.status === 403) mark('c-abn', error.message);
          else mark('c-name', error.message);
          return;
        }
        renderClaim();
        const go = $('claim-go');
        if (go && !go.dataset.confirm) await claim(go);
        else if (go) $('claim-ask').scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  });

  async function loadMe() {
    if (!session) { me = null; return; }
    try {
      me = await call('GET', '/api/me', null, { signedIn: true });
    } catch {
      me = null;
    }
  }

  // ---- "Stop these emails" ----

  async function showStop(stopToken) {
    view('stop');
    document.title = 'Stop these emails: SiteWrite';
    const draw = (info, message = '') => {
      $('stop-box').innerHTML = info.stopped
        ? `${message ? `<div class="ok"><strong>${esc(message)}</strong></div>` : `<p><strong>${esc(info.email)} gets no list emails from ${esc(info.builder)} through SiteWrite.</strong></p>`}
          <p class="meta">Changed your mind? Start them again.</p><div class="actions"><button type="button" class="light" id="stop-undo">Start them again</button></div>`
        : `${message ? `<div class="ok"><strong>${esc(message)}</strong></div>` : ''}<p>Stop SWMS lists and reminders from ${esc(info.builder)} to ${esc(info.email)}? ${esc(info.builder)} is told, and can contact you another way.</p>
          <div class="actions"><button type="button" id="stop-go">Stop these emails</button></div>`;
    };
    try {
      draw(await call('GET', `/api/list/stop/${encodeURIComponent(stopToken)}`));
    } catch (error) {
      $('stop-box').innerHTML = `<div class="bad">${esc(error.message)}</div>`;
      return;
    }
    $('stop-box').addEventListener('click', async (event) => {
      const button = event.target.closest('#stop-go, #stop-undo');
      if (!button) return;
      await busy(button, 'Saving...', async () => {
        try {
          const data = await call('POST', `/api/list/stop/${encodeURIComponent(stopToken)}`, { undo: button.id === 'stop-undo' });
          draw(data, data.message);
        } catch (error) {
          $('stop-box').insertAdjacentHTML('beforeend', `<div class="bad">${esc(error.message)}</div>`);
        }
      });
    });
  }

  // ---- Start ----

  (async () => {
    const stop = params.get('stop');
    if (stop) { await showStop(stop); return; }
    if (!token) {
      view('error');
      box('error-box', 'This page needs the link from the email. Open the email and press the link again.', 'bad');
      return;
    }
    const login = params.get('login');
    let fromLink = false;
    if (login) {
      // The sign-in link works once: it is taken out of the address so a reload does not use it again.
      history.replaceState(null, '', `${location.pathname}?t=${encodeURIComponent(token)}`);
      try {
        const data = await call('POST', '/api/auth/verify', { token: login });
        session = data.token;
        store.set(SESSION_KEY, session);
        fromLink = true;
      } catch (error) {
        claimNote = { kind: 'bad', message: `${error.message}${session ? '' : ' Enter your email below to get a new link.'}` };
      }
    }
    try {
      // With the sign-in, when there is one, so the page knows whether the list is already this company's.
      list = await call('GET', `/api/list/${encodeURIComponent(token)}`, null, { signedIn: true });
    } catch (error) {
      view('error');
      box('error-box', esc(error.message), 'bad');
      return;
    }
    await loadMe();
    view('list');
    renderList();
    if (fromLink && me) {
      $('l-claim').scrollIntoView({ block: 'start' });
      // Back from the sign-in link with the company set up: the list is taken up straight away when the
      // ABN the builder gave settles it. With no ABN, the question "Is that your company?" waits.
      const go = $('claim-go');
      if (go && !go.dataset.confirm) await claim(go);
    }
  })();
})();
