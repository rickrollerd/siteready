// The principal contractor's review page (goal 3): /review.html?ref=SR-ABCD-2345. The reviewer
// signs in by email link (a reviewer, not an account), reads the saved revision, runs Builder check
// on it and sends one of three responses. The reviewer's session is kept apart from an account's.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const KEY = 'siteready.reviewer';
  const store = {
    get: (key) => { try { return localStorage.getItem(key) || ''; } catch { return ''; } },
    set: (key, value) => { try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch { /* not kept */ } },
  };
  let token = store.get(KEY);
  let ref = '';
  let business = '';
  let sending = false;

  async function call(method, route, body) {
    const response = await fetch(route, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { 'X-Reviewer-Token': token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.message || 'Something went wrong. Try again.'), { status: response.status, field: data.field });
    return data;
  }

  const show = (id, on) => $(id).classList.toggle('hidden', !on);
  function status(id, html, kind = '') {
    $(id).innerHTML = html ? `<div class="${kind}">${html}</div>` : '';
  }

  // A reference as typed or pasted: "sr abcd 2345" or "SRABCD2345" reads as SR-ABCD-2345.
  function cleanRef(value) {
    const text = String(value || '').toUpperCase();
    const found = /SR[\s-]*([2-9A-HJ-NP-Z]{4})[\s-]*([2-9A-HJ-NP-Z]{4})(?![A-Z0-9])/.exec(text);
    return found ? `SR-${found[1]}-${found[2]}` : text.trim();
  }

  // ---- The SWMS, read only, as it prints ----

  const MARK = /\s*\((Our own hazard|Our own control|Does not apply to this job)\)\s*$/;
  // One line of a step: a hold point in bold; the user's own lines and hazards that do not apply
  // keep their mark, as on the printed SWMS.
  function line(text) {
    const value = String(text || '');
    const mark = MARK.exec(value);
    const body = mark ? value.slice(0, mark.index) : value;
    const off = mark && mark[1] === 'Does not apply to this job';
    return `<li class="${off ? 'off' : ''}${/^\s*Hold point:/.test(body) ? ' hold' : ''}">${esc(body)}${mark ? ` <span class="mark">(${esc(mark[1])})</span>` : ''}</li>`;
  }
  const list = (items) => ((items || []).length ? `<ul>${items.map(line).join('')}</ul>` : '');
  const pairs = (rows) => {
    const kept = rows.filter(([, value]) => String(value || '').trim());
    return kept.length ? `<table class="pairs"><tbody>${kept.map(([label, value]) => `<tr><th>${esc(label)}</th><td class="lines">${esc(value)}</td></tr>`).join('')}</tbody></table>` : '';
  };
  const grid = (head, rows, files = []) => `<div class="table-wrap"><table class="stack"><thead><tr>${head.map((label) => `<th>${esc(label)}</th>`).join('')}</tr></thead><tbody>${rows.map((row, i) => `<tr>${row.map((value, j) => `<td class="lines" data-label="${esc(head[j])}">${esc(value)}${j === row.length - 1 && files[i] ? `<br><button type="button" class="link" data-file="${esc(files[i].id)}" data-name="${esc(files[i].name)}">Open ${esc(files[i].name)}</button>` : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const risk = (item) => (item ? [`Before: ${item.before.level} (${item.before.label})`, `After: ${item.after.level} (${item.after.label})`, item.response || ''].filter(Boolean).join('\n') : '');
  const shared = (step, steps) => ((step.seeAlso || []).length
    ? [`The controls in ${step.seeAlso.map((name) => `step ${steps.findIndex((other) => other.step === name) + 1} (${name})`).join(' and ')} also apply here.`] : []);
  const revisionText = (draft) => `Revision ${draft.revision || 1}${draft.revisionDate || draft.date ? `, ${draft.revisionDate || draft.date}` : ''}`;
  const table = (block) => (block ? `<h3>${esc(block.title)}</h3><p class="note">${esc(block.note)}</p>${grid(block.head, block.rows, block.files)}` : '');

  function sheet(draft, tables) {
    const steps = draft.jobSteps || [];
    const stepRows = steps.map((step, index) => `<tr>
      <td><strong>${index + 1}. ${esc(step.step)}</strong></td>
      <td data-label="Hazards and risks">${list(step.hazards)}</td>
      <td data-label="Controls">${list([...(step.controls || []), ...shared(step, steps)])}</td>
      <td data-label="Risk rating" class="lines">${esc(risk(step.risk))}</td>
      <td data-label="Who">${esc(step.responsible || '')}</td></tr>`).join('');
    // PPE for all work by area; the extra items for particular steps are listed with their steps (D246).
    const allWork = (draft.ppe || []).map((group) => [group.area, group.items.filter((item) => item.ticked && !Array.isArray(item.steps)).map((item) => item.label).join(', ')]);
    const stepPpe = tables.stepPpe || [];
    return `${pairs([['State', draft.state], ['SWMS reference number', draft.swmsRef], ['Revision', revisionText(draft)], ['Principal contractor', draft.principalContractor], ['Subcontractor', draft.subcontractor],
      ['Workplace', draft.workplace], ['Site manager', draft.siteManager], ['Scaffold supervisor', draft.scaffoldSupervisor], ['Hospital', draft.hospital], ['First aider', draft.firstAider],
      ['Muster point', draft.musterPoint], ['Task', draft.task], ['Crane operated by', draft.craneOperator], ['Residential construction work', draft.residential],
      [`Fall of more than ${draft.fallMetres || 2} metres`, draft.fallRisk], ['Date', draft.date]])}
      <h3>Responsibilities</h3>${pairs([['Works manager', draft.worksManager], ['Contact phone', draft.worksManagerPhone], ['Person responsible for ensuring compliance with this SWMS', draft.complianceResponsible],
        ['Person responsible for reviewing the control measures', draft.reviewer], ['Review date', draft.reviewDate]])}
      <h3>High risk construction work</h3>${(draft.highRisk || []).length ? `<ul>${draft.highRisk.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : '<p>This task is not identified as high risk construction work.</p>'}
      ${table(tables.designs)}
      ${(draft.controls || []).length ? `<h3>Controls</h3><table class="pairs"><tbody>${draft.controls.map((item) => `<tr><th>${esc(item.level)}</th><td>${esc(item.text)}</td></tr>`).join('')}</tbody></table>` : ''}
      <h3>Job steps</h3><div class="table-wrap"><table class="steps"><thead><tr><th>Job step</th><th>Hazards and risks</th><th>Controls</th><th>Risk rating</th><th>Who</th></tr></thead><tbody>${stepRows}</tbody></table></div>
      <h3>Personal protective equipment</h3>${stepPpe.length ? '<p class="note"><strong>For all work</strong></p>' : ''}${pairs(allWork)}
      ${stepPpe.length ? `<p class="note"><strong>For particular steps</strong>. Worn as well as the PPE for all work, in the steps listed.</p>${pairs(stepPpe.map((item) => [item.label, item.steps.join('; ')]))}` : ''}
      ${(draft.plant || []).length ? `<h3>Plant and equipment</h3>${grid(['Item', 'Inspection and maintenance', 'Licence or ticket to operate'], draft.plant.map((item) => [item.item, item.inspection, item.licence]))}` : ''}
      ${table(tables.substances)}
      ${(draft.qualifications || []).length ? `<h3>Licences, tickets and training</h3><ul>${draft.qualifications.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}
      ${(draft.emergency || []).length ? `<h3>Emergency arrangements</h3>${grid(['Emergency', 'Equipment and arrangements', 'Location, contact or detail'], draft.emergency.map((item) => [item.type, item.equipment, item.detail]))}` : ''}
      ${draft.sources && ((draft.sources.legislation || []).length || (draft.sources.codes || []).length) ? `<h3>Legislation and codes of practice</h3><ul>${[...(draft.sources.legislation || []), ...(draft.sources.codes || [])].map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}
      <h3>${esc(draft.reviewHeading || 'Review')}</h3><p class="lines">${esc(draft.review)}</p>
      <h3>Site-specific</h3>${pairs((draft.site || []).map((field) => [field.label, field.text]))}
      ${(draft.references || []).length ? `<h3>Documents to keep on site with this SWMS</h3>${pairs(draft.references.map((item) => [item.label, item.text]))}` : ''}
      <h3>Prepared by</h3>${pairs([['Name and position', draft.preparedBy], ['Date', draft.preparedBy ? draft.date : '']]) || '<p class="note">Left blank on the SWMS, to be signed by hand.</p>'}`;
  }

  // A design or safety data sheet file the revision names, opened in the browser's own viewer.
  $('sheet').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-file]');
    if (!button) return;
    const win = window.open('', '_blank');
    try {
      const response = await fetch(`/api/review/swms/${encodeURIComponent(ref)}/files/${encodeURIComponent(button.dataset.file)}`, { headers: { 'X-Reviewer-Token': token } });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'That file could not be opened.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      // A phone with no PDF viewer (Android) saves the file under its own name instead.
      const viewer = !(blob.type === 'application/pdf' && navigator.pdfViewerEnabled === false);
      if (win && viewer) win.location.href = url;
      else { if (win) win.close(); const link = document.createElement('a'); link.href = url; link.download = button.dataset.name || 'File'; link.click(); }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      if (win) win.close();
      alert(error.message);
    }
  });

  // ---- Responses already given ----

  function responsesBlock(responses) {
    if (!responses.length) return '<div class="panel"><strong>Not reviewed yet.</strong> <span class="meta">No response has been sent on this revision.</span></div>';
    return `<div class="panel"><h2>Responses on this revision</h2><ul class="response-list">${responses.map((item) => `<li>
      <strong>${esc(item.label)}</strong> · ${esc(item.name)}, ${esc(item.company)} · ${esc(item.date)}
      ${item.text ? `<div class="pre meta">${esc(item.text)}</div>` : ''}</li>`).join('')}</ul><p class="meta">The latest response stands.</p></div>`;
  }

  // ---- Loading a reference ----

  async function open(value) {
    ref = cleanRef(value);
    $('ref').value = ref;
    status('summary', '');
    show('signin', false);
    show('review', false);
    if (!ref) { status('summary', 'Enter the SiteReady reference from the footer of the SWMS, such as SR-ABCD-2345.', 'bad'); return; }
    let found;
    let shape = false;
    try {
      const response = await fetch(`/api/verify/${encodeURIComponent(ref)}`);
      shape = response.status === 400;
      found = await response.json();
    } catch (error) {
      status('summary', esc(error.noSignal ? error.message : 'The reference could not be checked just now. Try again shortly.'), 'bad');
      return;
    }
    if (!found.found) {
      status('summary', shape ? `<strong>Check the reference.</strong> ${esc(found.message || '')}` : `<strong>Not found.</strong> ${esc(found.message || '')} Check each letter and number against the footer of the SWMS.`, 'bad');
      return;
    }
    business = found.business || '';
    const state = !found.revision ? 'This SWMS was not saved in SiteReady, so it cannot be reviewed here. Ask the business for a saved copy.'
      : found.current ? 'This is the current revision.' : 'This revision is no longer current. Ask the business for the current revision and its reference.';
    status('summary', `<strong>Genuine SiteReady reference.</strong><dl><dt>Prepared for</dt><dd>${esc(found.business)}</dd><dt>Title</dt><dd>${esc(found.title)}</dd>
      ${found.revision ? `<dt>Revision</dt><dd>${esc(found.revision)}</dd>` : ''}<dt>Reference</dt><dd>${esc(found.ref)}</dd></dl><p><strong>${esc(state)}</strong></p>`, found.reviewable ? 'ok' : 'bad');
    if (!found.revision) return;
    if (!token) { show('signin', true); return; }
    await load();
  }

  // Unsent words are kept on this device for each reference, so Back or a reload loses nothing.
  const draftKey = () => `siteready.review.${ref}`;
  function keepDraft() {
    store.set(draftKey(), JSON.stringify({ response: chosen(), text: $('text').value, name: $('name').value, company: $('company').value }));
  }
  function restoreDraft() {
    let kept = {};
    try { kept = JSON.parse(store.get(draftKey()) || '{}'); } catch { kept = {}; }
    $('text').value = kept.text || '';
    if (kept.name && !$('name').value) $('name').value = kept.name;
    if (kept.company && !$('company').value) $('company').value = kept.company;
    document.querySelectorAll('input[name="response"]').forEach((input) => { input.checked = input.value === kept.response; });
    textLabel();
  }

  async function load() {
    let data;
    let me;
    try {
      [data, { reviewer: me }] = await Promise.all([call('GET', `/api/review/swms/${encodeURIComponent(ref)}`), call('GET', '/api/review/me')]);
    } catch (error) {
      if (error.status === 401) { token = ''; store.set(KEY, ''); show('signin', true); return; }
      status('summary', esc(error.message), 'bad');
      return;
    }
    $('who').textContent = me.email;
    if (!$('name').value) $('name').value = me.name || '';
    if (!$('company').value) $('company').value = me.company || '';
    $('responses').innerHTML = responsesBlock(data.responses || []);
    $('sheet-title').textContent = `1. Read the SWMS: ${data.title}, revision ${data.revision}`;
    const html = sheet(data.draft, data.tables || {});
    // Each load rating shows its mass, as the printed SWMS does (D263).
    $('sheet').innerHTML = window.SiteReadyMass ? window.SiteReadyMass.withMassHtml(html) : html;
    $('sheet-box').open = window.matchMedia('(min-width: 900px)').matches;
    $('respond-closed').innerHTML = data.current ? '' : `<strong>This revision is no longer current.</strong><p>This is revision ${esc(data.revision)}. The business has saved revision ${esc(data.latestRevision)} since, so only that revision can be given a response. Ask the business for its reference.</p>`;
    show('respond-closed', !data.current);
    show('respond-open', data.current);
    show('respond-sent', false);
    show('check', false);
    clearErrors();
    status('respond-status', '');
    restoreDraft();
    show('review', true);
  }

  // ---- Builder check ----

  const PICK = { Accepted: 'approved', 'Accepted with changes': 'conditions' };
  $('run-check').addEventListener('click', async () => {
    const button = $('run-check');
    button.disabled = true;
    button.textContent = 'Checking...';
    try {
      const data = await call('POST', `/api/review/swms/${encodeURIComponent(ref)}/check`);
      $('score').textContent = data.score;
      $('band').textContent = data.band;
      $('band').className = `band ${data.band === 'Accepted' ? 'accepted' : data.band === 'Accepted with changes' ? 'changes' : 'rejected'}`;
      const must = data.findings.filter((item) => item.hard && !item.pass).length;
      $('check-line').textContent = `${must ? `${must} must-fix item${must === 1 ? '' : 's'}. ` : 'No must-fix items. '}${(data.preStart || []).join(' ')}`;
      const ordered = [...data.findings.filter((item) => item.hard && !item.pass), ...data.findings.filter((item) => !item.hard && !item.pass), ...data.findings.filter((item) => item.pass)];
      $('findings').innerHTML = ordered.map((item) => `<li class="${item.pass ? 'pass' : 'fail'}"><span class="rule">${esc(item.rule)} ${esc(item.title)}</span>
        ${item.hard ? (item.pass ? ' (passed)' : ' (must fix)') : ` (${esc(item.points)} of ${esc(item.max)})`}<div>${esc(item.message)}</div><div class="source">Source: ${esc(item.source)}</div></li>`).join('');
      show('check', true);
      // The response that matches the check is picked; the reviewer can change it.
      const pick = document.querySelector(`input[name="response"][value="${PICK[data.band] || 'changes'}"]`);
      if (pick && !$('respond-open').classList.contains('hidden')) { pick.checked = true; textLabel(); keepDraft(); }
    } catch (error) {
      status('respond-status', esc(error.message), 'bad');
    } finally {
      button.disabled = false;
      button.textContent = 'Run Builder check again';
    }
  });

  // ---- Responding ----

  const chosen = () => (document.querySelector('input[name="response"]:checked') || {}).value || '';
  const NEEDS = { conditions: 'Write the conditions of the approval.', changes: 'Write the changes needed.' };
  const SAYS_NOTHING = { conditions: 'Write the conditions of the approval. If there are none, choose Approved.', changes: 'Write the changes needed, so the business knows what to fix.' };
  const EMPTY_WORDS = /^(?:none|nil|nothing|no|n\/?a|na|tbc|tba|tbd|ok|okay|yes|see above|as discussed|-+|\.+|x+)$/i;
  function textLabel() {
    $('text-label').textContent = { conditions: 'Conditions (required)', changes: 'Changes needed (required)' }[chosen()] || 'Comments (optional)';
  }
  document.querySelectorAll('input[name="response"]').forEach((input) => input.addEventListener('change', () => { textLabel(); clearErrors(); keepDraft(); }));
  for (const id of ['text', 'name', 'company']) $(id).addEventListener('input', keepDraft);

  const FIELDS = { response: ['choices', 'response-error'], text: ['text', 'text-error'], name: ['name', 'name-error'], company: ['company', 'company-error'] };
  function clearErrors() {
    for (const [box, note] of Object.values(FIELDS)) { $(box).classList.remove('has-error'); show(note, false); }
  }
  function fieldError(field, message) {
    const [box, note] = FIELDS[field];
    $(box).classList.add('has-error');
    $(note).textContent = message;
    show(note, true);
    $(box).scrollIntoView({ behavior: 'smooth', block: 'center' });
    if ($(box).focus && box !== 'choices') $(box).focus({ preventScroll: true });
  }
  // The same checks the server makes, so a mistake is shown at its box before anything is sent.
  function problem() {
    const response = chosen();
    const text = $('text').value.trim();
    if (!response) return ['response', 'Choose a response: Approved, Approved with conditions or Not approved.'];
    if (NEEDS[response] && !text) return ['text', NEEDS[response]];
    if (NEEDS[response] && EMPTY_WORDS.test(text.replace(/[.!]+$/, '').trim())) return ['text', SAYS_NOTHING[response]];
    if (!$('name').value.trim()) return ['name', 'Enter your name.'];
    if (!$('company').value.trim()) return ['company', 'Enter your company.'];
    return null;
  }

  // Leaving the page while a response is being sent asks first.
  window.addEventListener('beforeunload', (event) => {
    if (!sending) return;
    event.preventDefault();
    event.returnValue = '';
  });

  function sentBlock(review) {
    return `<div class="ok"><strong>Sent: ${esc(review.label)}.</strong><p>Recorded against revision ${esc(review.revision)} on ${esc(review.date)}. ${esc(business || 'The business')} can see it in SiteReady and has been emailed that its review is back.</p></div>
      <button type="button" class="light" id="change-response">Send a different response</button>`;
  }

  $('respond').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending) return;
    clearErrors();
    status('respond-status', '');
    const wrong = problem();
    if (wrong) { fieldError(...wrong); return; }
    sending = true;
    $('send').disabled = true;
    $('send').textContent = 'Sending...';
    try {
      const { review } = await call('POST', `/api/review/swms/${encodeURIComponent(ref)}/response`, { response: chosen(), text: $('text').value, name: $('name').value, company: $('company').value });
      store.set(draftKey(), '');
      $('text').value = '';
      $('respond-sent').innerHTML = sentBlock(review);
      show('respond-open', false);
      show('respond-sent', true);
      $('respond-sent').scrollIntoView({ behavior: 'smooth', block: 'center' });
      const data = await call('GET', `/api/review/swms/${encodeURIComponent(ref)}`).catch(() => null);
      if (data) $('responses').innerHTML = responsesBlock(data.responses || []);
    } catch (error) {
      if (error.field && FIELDS[error.field]) fieldError(error.field, error.message);
      else status('respond-status', esc(error.message), 'bad');
      if (error.status === 409) load();
    } finally {
      sending = false;
      $('send').disabled = false;
      $('send').textContent = 'Send the response';
    }
  });

  $('respond-sent').addEventListener('click', (event) => {
    if (!event.target.closest('#change-response')) return;
    show('respond-sent', false);
    show('respond-open', true);
    document.querySelectorAll('input[name="response"]').forEach((input) => { input.checked = false; });
    textLabel();
    $('choices').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  // ---- Signing in and out ----

  $('signin').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('send-link');
    button.disabled = true;
    status('signin-note', '');
    status('signin-status', 'Sending...', 'meta');
    try {
      const data = await call('POST', '/api/review/email', { email: $('email').value, ref });
      status('signin-status', `<strong>${esc(data.message)}</strong><p>Open the email on the device you will review on, and press the link. If you open it on another device, you review on that one. This page stays signed out.</p>`, 'ok');
    } catch (error) {
      status('signin-status', esc(error.message), 'bad');
    } finally {
      button.disabled = false;
      button.textContent = 'Email me another link';
    }
  });

  $('sign-out').addEventListener('click', async () => {
    await call('POST', '/api/review/logout').catch(() => {});
    token = '';
    store.set(KEY, '');
    show('review', false);
    show('signin', true);
  });

  $('find').addEventListener('submit', (event) => {
    event.preventDefault();
    const value = cleanRef($('ref').value);
    history.replaceState(null, '', `${location.pathname}?ref=${encodeURIComponent(value)}`);
    open(value);
  });

  (async () => {
    const params = new URLSearchParams(location.search);
    const login = params.get('login');
    const fromAddress = params.get('ref') || '';
    if (fromAddress) $('ref').value = cleanRef(fromAddress);
    if (login) {
      // The link works once: it is taken out of the address so a reload or Back does not use it again.
      history.replaceState(null, '', `${location.pathname}${fromAddress ? `?ref=${encodeURIComponent(fromAddress)}` : ''}`);
      const before = token;
      try {
        ({ token } = await call('POST', '/api/review/verify', { token: login }));
        store.set(KEY, token);
      } catch (error) {
        // A used or expired link signs no one in. A reviewer already signed in on this device stays signed in.
        token = before;
        await open(fromAddress);
        if (token) status('summary', `${$('summary').innerHTML}<div class="warn">${esc(error.message)} You are still signed in on this device.</div>`);
        else if (!$('signin').classList.contains('hidden')) {
          status('signin-note', `<strong>${esc(error.message)}</strong><p>Enter your email to get a new link.</p>`, 'bad');
          $('signin').scrollIntoView({ block: 'start' });
          $('email').focus({ preventScroll: true });
        }
        return;
      }
    }
    if (fromAddress) await open(fromAddress);
  })();
})();
