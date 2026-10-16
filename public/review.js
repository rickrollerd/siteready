// The principal contractor's review page (goal 3): /review.html?ref=SW-ABCD-2345. The reviewer
// signs in by email link (a reviewer, not an account), reads the saved revision, runs Builder check
// on it and sends one of three responses. The reviewer's session is kept apart from an account's.
//
// Opened from SiteLink's project screen (Goal 12 stage 7) as /review.html?submission={id}, the same page
// reviews a SWMS submitted on a builder's list, in the project's context: the project, the
// subcontractor, what was submitted and how, the "Set by" details it changed, the sign-ons on it, and
// each condition, which the lead confirms once the subcontractor marks it done. The name and company
// come from SiteLink. A SWMS received outside SiteWrite is a file, with an optional Builder check.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const KEY = 'sitewrite.reviewer';
  const store = {
    get: (key) => { try { return localStorage.getItem(key) || ''; } catch { return ''; } },
    set: (key, value) => { try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch { /* not kept */ } },
  };
  let token = store.get(KEY);
  let ref = '';
  let business = '';
  let sending = false;
  // A submission on a SiteLink project, reviewed in the project's context.
  const submissionId = new URLSearchParams(location.search).get('submission') || '';
  const inProject = Boolean(submissionId);
  let page = null;
  const base = () => (inProject ? `/api/hse/submissions/${encodeURIComponent(submissionId)}` : `/api/review/swms/${encodeURIComponent(ref)}`);

  // A host's error (502, 503, 504) or a reply that is not SiteWrite's own says so plainly, and a request
  // that is safe to send again (tries: 2) is sent once more first (messy round 7, run 7: a 502 on
  // "Email me a sign-in link" said "Something went wrong" while the button already read "Email me another
  // link").
  const SERVER_DOWN = 'SiteWrite could not reach the server. Try again.';
  async function call(method, route, body, { tries = 1, down = SERVER_DOWN } = {}) {
    for (let attempt = 1; ; attempt += 1) {
      let response;
      try {
        response = await fetch(route, {
          method,
          headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { 'X-Reviewer-Token': token } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (error) {
        if (attempt < tries) { await new Promise((resolve) => { setTimeout(resolve, 900); }); continue; }
        throw Object.assign(new Error(down), { serverDown: true });
      }
      const type = (response.headers && response.headers.get && response.headers.get('content-type')) || '';
      const ours = /json/i.test(type);
      if (!ours || [502, 503, 504].includes(response.status)) {
        if (attempt < tries) { await new Promise((resolve) => { setTimeout(resolve, 900); }); continue; }
        if (!ours || response.status >= 500) throw Object.assign(new Error(down), { serverDown: true, status: response.status });
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(data.message || (response.status >= 500 ? down : 'Something went wrong. Try again.')), { status: response.status, field: data.field });
      return data;
    }
  }

  const show = (id, on) => $(id).classList.toggle('hidden', !on);
  function status(id, html, kind = '') {
    $(id).innerHTML = html ? `<div class="${kind}">${html}</div>` : '';
  }

  // A reference as typed or pasted: "sw abcd 2345" or "SWABCD2345" reads as SW-ABCD-2345. An old SR-
  // reference, from before the change of name (D295), reads the same way.
  function cleanRef(value) {
    const text = String(value || '').toUpperCase();
    const found = /S([RW])[\s-]*([2-9A-HJ-NP-Z]{4})[\s-]*([2-9A-HJ-NP-Z]{4})(?![A-Z0-9])/.exec(text);
    return found ? `S${found[1]}-${found[2]}-${found[3]}` : text.trim();
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

  function sheet(draft, tables, checked = [], prepared = null) {
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
      ['First aid location', draft.firstAidLocation], ['Muster point', draft.musterPoint], ['Site rules', (draft.siteRules || []).join('\n')], ['Task', draft.task], ['Crane operated by', draft.craneOperator], ['Residential construction work', draft.residential],
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
      <h3>Prepared by</h3>${pairs([['Name and position', prepared ? prepared.name : ''], ['Date', prepared ? prepared.date : '']]) || '<p class="note">Left blank on the SWMS, to be signed by hand.</p>'}
      ${checked.length ? `<h3>Checked by</h3>${pairs(checked)}` : ''}`;
  }

  // A design or safety data sheet file the revision names, opened in the browser's own viewer.
  $('sheet').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-file]');
    if (!button) return;
    const win = window.open('', '_blank');
    try {
      const response = await fetch(button.dataset.file === '__outside' ? `${base()}/file` : `${base()}/files/${encodeURIComponent(button.dataset.file)}`, { headers: { 'X-Reviewer-Token': token } });
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
    if (!responses.length) return `<div class="panel"><strong>Not reviewed yet.</strong> <span class="meta">No response has been sent on this ${inProject && page && page.submission.channel === 'outside' ? 'SWMS' : 'revision'}.</span></div>`;
    return `<div class="panel"><h2>Responses on this ${inProject && page && page.submission.channel === 'outside' ? 'SWMS' : 'revision'}</h2><ul class="response-list">${responses.map((item) => `<li>
      <strong>${esc(item.label)}</strong> · ${esc(item.name)}, ${esc(item.company)} · ${esc(item.date)}
      ${item.text && !(item.conditions || []).length ? `<div class="pre meta">${esc(item.text)}</div>` : ''}
      ${(item.conditions || []).length ? conditionsList(item.conditions) : ''}</li>`).join('')}</ul><p class="meta">The latest response stands.</p></div>`;
  }

  // ---- Conditions (Goal 12 stage 7): the subcontractor marks each done, the lead confirms it ----

  const CONDITION_STATE = { outstanding: 'To do', done: 'Marked done', closed: 'Confirmed done' };
  function conditionLine(entry) {
    const company = (page && (page.submission.company || page.subcontract.name)) || 'The subcontractor';
    const direct = page && !page.subcontract.claimed;
    let more = '';
    if (entry.status === 'outstanding') {
      more = `${entry.backNote ? `<span class="meta">You sent it back on ${esc(entry.backOn)}: ${esc(entry.backNote)}</span>` : ''}${direct
        ? `<span class="meta">${esc(company)} is not on SiteWrite, so you close it yourself once it is done.</span><button type="button" class="light small" data-cond-confirm="${esc(entry.id)}">Confirm it is done</button>`
        : `<span class="meta">Waiting for ${esc(company)} to mark it done.</span>`}`;
    } else if (entry.status === 'done') {
      more = `<span class="meta">Marked done by ${esc(entry.doneBy)} on ${esc(entry.doneOn)}${entry.doneNote ? `: ${esc(entry.doneNote.replace(/[.\s]+$/, ''))}` : ''}.</span>
        <span class="cond-actions"><button type="button" class="small" data-cond-confirm="${esc(entry.id)}">Confirm it is done</button>
        <label class="meta" for="back-${esc(entry.id)}">Or say what is still needed</label><input type="text" id="back-${esc(entry.id)}" maxlength="500" autocomplete="off">
        <button type="button" class="light small" data-cond-back="${esc(entry.id)}">Not done yet</button></span>`;
    } else {
      more = `<span class="meta">Confirmed by ${esc(entry.closedBy)} on ${esc(entry.closedOn)}.</span>`;
    }
    return `<li class="cond" id="cond-${esc(entry.id)}"><span class="tag cond-${esc(entry.status)}">${CONDITION_STATE[entry.status] || esc(entry.status)}</span> ${esc(entry.text)}${more}</li>`;
  }
  const conditionsList = (list) => `<ol class="conditions">${list.map(conditionLine).join('')}</ol>`;
  $('review').addEventListener('click', async (event) => {
    const confirmIt = event.target.closest('[data-cond-confirm]');
    const backIt = event.target.closest('[data-cond-back]');
    const button = confirmIt || backIt;
    if (!button) return;
    const id = button.dataset.condConfirm || button.dataset.condBack;
    const row = $(`cond-${id}`);
    button.disabled = true;
    try {
      if (confirmIt) await call('POST', `/api/hse/conditions/${encodeURIComponent(id)}/confirm`);
      else await call('POST', `/api/hse/conditions/${encodeURIComponent(id)}/back`, { note: ($(`back-${id}`) || {}).value || '' });
      await loadProject({ keepCheck: true });
      const again = $(`cond-${id}`);
      if (again) again.scrollIntoView({ block: 'center' });
    } catch (error) {
      button.disabled = false;
      if (row) row.insertAdjacentHTML('beforeend', `<p class="field-error">${esc(error.message)}</p>`);
    }
  });

  // ---- Loading a reference ----

  async function open(value) {
    ref = cleanRef(value);
    $('ref').value = ref;
    status('summary', '');
    show('signin', false);
    show('review', false);
    if (!ref) { status('summary', 'Enter the SiteWrite reference from the footer of the SWMS, such as SW-ABCD-2345.', 'bad'); return; }
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
    const state = !found.revision ? 'This SWMS was not saved in SiteWrite, so it cannot be reviewed here. Ask the business for a saved copy.'
      : found.current ? 'This is the current revision.' : 'This revision is no longer current. Ask the business for the current revision and its reference.';
    status('summary', `<strong>Genuine SiteWrite reference.</strong><dl><dt>Prepared for</dt><dd>${esc(found.business)}</dd><dt>Title</dt><dd>${esc(found.title)}</dd>
      ${found.revision ? `<dt>Revision</dt><dd>${esc(found.revision)}</dd>` : ''}<dt>Reference</dt><dd>${esc(found.ref)}</dd></dl><p><strong>${esc(state)}</strong></p>`, found.reviewable ? 'ok' : 'bad');
    if (!found.revision) return;
    if (!token) { show('signin', true); return; }
    await load();
  }

  // Unsent words are kept on this device for each reference, so Back or a reload loses nothing.
  const draftKey = () => `sitewrite.review.${inProject ? `submission.${submissionId}` : ref}`;
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
    const html = sheet(data.draft, data.tables || {}, Array.isArray(data.checked) ? data.checked : [], data.prepared || (data.draft && data.draft.preparedBy ? { name: data.draft.preparedBy, date: data.draft.date } : null));
    // Each load rating shows its mass, as the printed SWMS does (D263).
    $('sheet').innerHTML = window.SiteWriteMass ? window.SiteWriteMass.withMassHtml(html) : html;
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

  // ---- A submission on a SiteLink project (Goal 12 stage 7) ----

  const lowerFirst = (text) => String(text || '').replace(/^[A-Z](?=[a-z])/, (letter) => letter.toLowerCase());
  function contextBlock(data) {
    const s = data.submission;
    const company = s.company || data.subcontract.name;
    const crumbs = `<p class="meta"><a href="/sitelink#/project/${esc(data.project.id)}">${esc(data.project.name)}</a> › <a href="/sitelink#/sub/${esc(data.subcontract.id)}">${esc(data.subcontract.name)}</a></p>`;
    const how = s.channel === 'sitewrite'
      ? `<p>Submitted in SiteWrite by ${esc(s.by)} of ${esc(company)} on ${esc(s.on)}. Revision ${esc(s.revision)}${s.ref ? `, reference ${esc(s.ref)}` : ''}.${s.checkedBy ? ` Checked by ${esc(s.checkedBy.name)}, ${esc(s.checkedBy.role)}.` : ''}</p>`
      : `<p>Received outside SiteWrite and recorded by ${esc(s.by)} on ${esc(s.on)}: ${esc(s.file ? s.file.name : 'a file')}.${s.note ? ` Note: ${esc(s.note)}${/[.!?]$/.test(s.note) ? '' : '.'}` : ''}</p>`;
    const overrides = (s.overrides || []).length
      ? `<div class="warn"><strong>This SWMS changes ${s.overrides.length === 1 ? 'a detail' : `${s.overrides.length} details`} you set for the project.</strong><ul>${s.overrides.map((item) => `<li>${esc(item.label)}: you set "${esc(item.set)}". This SWMS has ${item.now ? `"${esc(item.now)}"` : 'nothing'}${item.olderRev ? `, as in site details version ${esc(item.olderRev)}: it was prepared before you changed it` : ''}.</li>`).join('')}</ul></div>` : '';
    const signed = data.signOns === null || data.signOns === undefined ? '' : `<p class="meta">Workers signed on to this revision: ${esc(data.signOns)}.</p>`;
    const later = data.later ? `<div class="warn"><strong>${esc(company)} has submitted ${data.later.channel === 'sitewrite' ? `revision ${esc(data.later.revision)}` : 'another SWMS for this'} since, on ${esc(data.later.on)}.</strong> <a href="/review.html?submission=${esc(data.later.id)}">Open the latest</a></div>` : '';
    const earlier = (data.earlier || []).length ? `<p class="meta">Submitted before: ${data.earlier.map((one) => `<a href="/review.html?submission=${esc(one.id)}">${one.channel === 'sitewrite' ? `revision ${esc(one.revision)}` : 'a file'}, ${esc(one.on)}</a>`).join('; ')}.</p>` : '';
    const before = (data.openBefore || []).length ? `<div class="warn"><strong>Conditions on an earlier revision still open (${data.openBefore.length}).</strong> They stand until you confirm them.${conditionsList(data.openBefore)}</div>` : '';
    const gone = data.gone ? `<div class="bad"><strong>${esc(company)} has deleted this SWMS from SiteWrite.</strong> Your record of the submission and your responses stay.</div>` : '';
    return `<div class="panel">${crumbs}<h2>${esc(data.title)}</h2><p class="meta">For ${esc(data.subcontract.name)}${data.subcontract.trade ? ` (${esc(data.subcontract.trade)})` : ''} on ${esc(data.project.name)}, ${esc(data.project.workplace)}.</p>${how}${signed}${earlier}${gone}${later}${overrides}${before}</div>`;
  }

  // The file of a SWMS received outside SiteWrite, with how far its Builder check has got.
  function outsideSheet(data) {
    const s = data.submission;
    return `<p>This SWMS came as a file, so there is nothing to show here. <button type="button" class="link" data-file="__outside" data-name="${esc(s.file ? s.file.name : 'SWMS')}">Open ${esc(s.file ? s.file.name : 'the file')}</button></p>`;
  }
  function outsideCheckNote(data) {
    const s = data.submission;
    const r = data.readings || {};
    if (s.checkStatus === 'reading') return 'Builder check is reading the file. It takes a minute or two, and shows here when it is done.';
    if (s.builderCheck) return `Builder check read the file, using one of the project's free readings (${r.used} of ${r.limit} used). The result is below. You decide.`;
    if (s.checkStatus === 'failed') return `${s.checkError || 'The file could not be read.'} Try again, or read the SWMS yourself.`;
    if (!r.on) return 'Builder check on a file is not switched on just now. Read the SWMS yourself.';
    return `Optional. SiteWrite's AI reads the file into the check's form, so it uses one of the project's free readings (${r.used} of ${r.limit} used). Or read the SWMS yourself.`;
  }

  let polling = null;
  async function loadProject({ keepCheck = false } = {}) {
    let data;
    try {
      data = await call('GET', base());
    } catch (error) {
      if (error.status === 401) { token = ''; store.set(KEY, ''); status('summary', `<strong>Sign in to SiteLink to review this SWMS.</strong><p><a href="/sitelink">Open SiteLink</a>, sign in, then open it again from the project screen.</p>`, 'warn'); show('review', false); return; }
      status('summary', esc(error.message), 'bad');
      return;
    }
    page = data;
    business = data.submission.company || data.subcontract.name;
    document.title = `${data.title}: review`;
    $('who').textContent = data.me.email;
    $('context').innerHTML = contextBlock(data);
    $('responses').innerHTML = responsesBlock(data.responses || []);
    const outside = data.submission.channel === 'outside';
    $('sheet-title').textContent = outside ? `1. Read the SWMS: ${data.title}` : `1. Read the SWMS: ${data.title}, revision ${data.submission.revision}`;
    $('sheet-note').textContent = outside ? 'Received outside SiteWrite, as a file.' : 'Read only. This is the revision exactly as it was submitted. Worker sign-ons are not shown.';
    if (outside || data.gone) $('sheet').innerHTML = outside ? outsideSheet(data) : '<p class="meta">Deleted by the business.</p>';
    else {
      const html = sheet(data.draft, data.tables || {}, Array.isArray(data.checked) ? data.checked : [], data.prepared || null);
      $('sheet').innerHTML = window.SiteWriteMass ? window.SiteWriteMass.withMassHtml(html) : html;
    }
    $('sheet-box').open = outside || window.matchMedia('(min-width: 900px)').matches;
    // The name and company are SiteLink's: the person's own details and the account.
    $('name').value = data.me.name || '';
    $('company').value = data.org.name;
    $('name').readOnly = true;
    $('company').readOnly = true;
    $('who-note').innerHTML = data.me.name ? `From your SiteLink details. <a href="/sitelink#/you">Change your name</a>` : '<strong>Add your name in SiteLink first, under Your details.</strong> <a href="/sitelink#/you">Your details</a>';
    $('text-hint').textContent = 'For conditions, write each one on its own line. The subcontractor marks each one done, and you confirm it.';
    $('check-intro').textContent = outside ? outsideCheckNote(data) : $('check-intro').dataset.revision || $('check-intro').textContent;
    $('run-check').disabled = outside && (data.submission.checkStatus === 'reading' || !(data.readings || {}).on);
    $('run-check').textContent = outside ? (data.submission.builderCheck ? 'Builder check is done' : data.submission.checkStatus === 'reading' ? 'Reading the file...' : 'Run Builder check on the file') : 'Run Builder check';
    if (outside && data.submission.builderCheck) { $('run-check').disabled = true; showCheck(data.outsideCheck || data.submission.builderCheck); }
    else if (!keepCheck) show('check', false);
    const closed = !data.current || data.gone;
    $('respond-closed').innerHTML = closed ? (data.gone ? '<strong>This SWMS was deleted by the business, so it cannot be given a response.</strong>' : `<strong>This is not the latest.</strong><p>${esc(business)} has submitted ${data.later && data.later.channel === 'sitewrite' ? `revision ${esc(data.later.revision)}` : 'another SWMS for this'} since, so only the latest can be given a response. <a href="/review.html?submission=${esc(data.later.id)}">Open the latest</a></p>`) : '';
    show('respond-closed', closed);
    if (!keepCheck) {
      show('respond-open', !closed);
      show('respond-sent', false);
      clearErrors();
      status('respond-status', '');
      restoreDraft();
    }
    show('review', true);
    clearTimeout(polling);
    if (outside && data.submission.checkStatus === 'reading') polling = setTimeout(() => loadProject({ keepCheck: true }), 4000);
  }

  // ---- Builder check ----

  const PICK = { Accepted: 'approved', 'Accepted with changes': 'conditions' };
  function showCheck(data) {
      $('score').textContent = data.score;
      $('band').textContent = data.band;
      $('band').className = `band ${data.band === 'Accepted' ? 'accepted' : data.band === 'Accepted with changes' ? 'changes' : 'rejected'}`;
      const must = data.findings.filter((item) => item.hard && !item.pass).length;
      $('check-line').textContent = `${must ? `${must} must-fix item${must === 1 ? '' : 's'}. ` : 'No must-fix items. '}${(data.preStart || []).join(' ')}`;
      const ordered = [...data.findings.filter((item) => item.hard && !item.pass), ...data.findings.filter((item) => !item.hard && !item.pass), ...data.findings.filter((item) => item.pass)];
      $('findings').innerHTML = ordered.map((item) => `<li class="${item.pass ? 'pass' : 'fail'}"><span class="rule">${esc(item.rule)} ${esc(item.title)}</span>
        ${item.hard ? (item.pass ? ' (passed)' : ' (must fix)') : ` (${esc(item.points)} of ${esc(item.max)})`}<div>${esc(item.message)}</div><div class="source">Source: ${esc(item.source)}</div></li>`).join('');
      show('check', true);
  }
  $('run-check').addEventListener('click', async () => {
    const button = $('run-check');
    button.disabled = true;
    button.textContent = 'Checking...';
    try {
      const data = await call('POST', `${base()}/check`);
      // A file received outside SiteWrite is read by the AI first: the page asks how it is going.
      if (data.status === 'reading') { status('respond-status', ''); await loadProject({ keepCheck: true }); return; }
      showCheck(data);
      // The response that matches the check is picked; the reviewer can change it.
      const pick = document.querySelector(`input[name="response"][value="${PICK[data.band] || 'changes'}"]`);
      if (pick && !$('respond-open').classList.contains('hidden')) { pick.checked = true; textLabel(); keepDraft(); }
    } catch (error) {
      status('respond-status', esc(error.message), 'bad');
    } finally {
      if (!(inProject && page && page.submission.channel === 'outside')) {
        button.disabled = false;
        button.textContent = 'Run Builder check again';
      }
    }
  });

  // ---- Responding ----

  const chosen = () => (document.querySelector('input[name="response"]:checked') || {}).value || '';
  const NEEDS = { conditions: 'Write the conditions of the approval.', changes: 'Write the changes needed.' };
  const SAYS_NOTHING = { conditions: 'Write the conditions of the approval. If there are none, choose Approved.', changes: 'Write the changes needed, so the business knows what to fix.' };
  const EMPTY_WORDS = /^(?:none|nil|nothing|no|n\/?a|na|tbc|tba|tbd|ok|okay|yes|see above|as discussed|-+|\.+|x+)$/i;
  function textLabel() {
    $('text-label').textContent = { conditions: inProject ? 'Conditions (required), one to a line' : 'Conditions (required)', changes: 'Changes needed (required)' }[chosen()] || 'Comments (optional)';
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
    if (!$('name').value.trim()) return ['name', inProject ? 'Add your name in SiteLink first, under Your details.' : 'Enter your name.'];
    if (!$('company').value.trim()) return ['company', 'Enter your company.'];
    return null;
  }

  // Leaving the page while a response is being sent asks first.
  window.addEventListener('beforeunload', (event) => {
    if (!sending) return;
    event.preventDefault();
    event.returnValue = '';
  });

  function sentBlock(review, sent = {}) {
    if (inProject) {
      const outside = page && page.submission.channel === 'outside';
      const told = sent.emailed ? `${esc(business)} can see it in SiteWrite and has been emailed that its review is back, from you.` : `${esc(business)} is not on SiteWrite, so SiteLink did not email it. Send your response to them yourself.`;
      return `<div class="ok"><strong>Sent: ${esc(review.label)}.</strong><p>Recorded against ${outside ? 'this SWMS' : `revision ${esc(review.revision)}`} on ${esc(review.date)}. ${told} It is in the project log.</p>${(review.conditions || []).length ? `<p>${review.conditions.length === 1 ? 'The condition shows' : `The ${review.conditions.length} conditions show`} on the project screen until you confirm ${review.conditions.length === 1 ? 'it' : 'each'} done.</p>` : ''}</div>
        <p><a href="/sitelink#/project/${esc(page.project.id)}">Back to the project</a></p>
        <button type="button" class="light" id="change-response">Send a different response</button>`;
    }
    return `<div class="ok"><strong>Sent: ${esc(review.label)}.</strong><p>Recorded against revision ${esc(review.revision)} on ${esc(review.date)}. ${esc(business || 'The business')} can see it in SiteWrite and has been emailed that its review is back.</p></div>
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
      const sent = await call('POST', `${base()}/response`, inProject ? { response: chosen(), text: $('text').value } : { response: chosen(), text: $('text').value, name: $('name').value, company: $('company').value });
      const { review } = sent;
      store.set(draftKey(), '');
      $('text').value = '';
      $('respond-sent').innerHTML = sentBlock(review, sent);
      show('respond-open', false);
      show('respond-sent', true);
      $('respond-sent').scrollIntoView({ behavior: 'smooth', block: 'center' });
      const data = await call('GET', base()).catch(() => null);
      if (data) { if (inProject) page = data; $('responses').innerHTML = responsesBlock(data.responses || []); }
    } catch (error) {
      if (error.field && FIELDS[error.field]) fieldError(error.field, error.message);
      else status('respond-status', esc(error.message), 'bad');
      if (error.status === 409) { if (inProject) loadProject(); else load(); }
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
      // Sending a link again is safe: each link works once, and either one signs in.
      const data = await call('POST', '/api/review/email', { email: $('email').value, ref }, { tries: 2, down: 'SiteWrite could not reach the server, so no sign-in link was sent. Your email address is kept. Press Email me a sign-in link again.' });
      status('signin-status', `<strong>${esc(data.message)}</strong><p>Open the email on the device you will review on, and press the link. If you open it on another device, you review on that one. This page stays signed out.</p>`, 'ok');
      // Only once a link has gone does the button offer another.
      button.textContent = 'Email me another link';
    } catch (error) {
      status('signin-status', esc(error.message), 'bad');
    } finally {
      button.disabled = false;
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
    if (inProject) {
      // Opened from SiteLink: signed in there, on this device. No reference to type.
      $('find').classList.add('hidden');
      $('page-title').textContent = 'Review a submitted SWMS';
      $('intro').textContent = 'From your SiteLink project. Read the SWMS as it was submitted, run Builder check, and send your response. The subcontractor sees it in SiteWrite and is emailed that its review is back, from you.';
      $('check-intro').dataset.revision = $('check-intro').textContent;
      $('who').parentElement.innerHTML = 'Signed in to SiteLink as <strong id="who"></strong>.';
      if (!token) { status('summary', '<strong>Sign in to SiteLink to review this SWMS.</strong><p><a href="/sitelink">Open SiteLink</a>, sign in, then open it again from the project screen.</p>', 'warn'); return; }
      await loadProject();
      return;
    }
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
