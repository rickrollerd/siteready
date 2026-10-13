// The SWMS chosen from a scope, prepared in one go, then checked and downloaded together.
//
// Owner, 13 October 2026 (D239): "SWMS chosen from a scope are all done in one go: site details asked
// once, then one page with each SWMS's own questions in its own section, answers that suit all filled
// across and changeable, one button prepares all."
// D240: "can we review the swms before downloading, we need to be able to. This allows the user to then
// see if its correct, if its not correct we need a button that allows the user to change the wording
// in the specific step in the review section plus Review each, download all".
//
// The page has three parts: the site details for every SWMS (the job address and people above, the
// site questions and who runs the crane), then each SWMS's own questions, then Prepare all. Prepared,
// the list shows each SWMS with what it still needs; Check opens it in the usual draft, where Change
// this step and the control changes work as before (and are learned from), and one button downloads
// them all as Word and PDF in one zip once each has cleared its checks. Each saves as its own SWMS
// and revision. The project, with every answer, is kept on this device (scope.js).
(() => {
  const S = window.SiteReady;
  const { api, esc } = S;
  const $ = (id) => document.getElementById(id);
  const fill = () => window.SiteReadyDesignFill || null;
  const gate = () => window.SiteReadyGate || null;

  let project = null;
  let hooks = null;
  // Each SWMS's questions as the server last gave them, by its place in the list.
  const asked = new Map();
  const askSeq = new Map();
  const askTimers = new Map();

  // The details above the page every SWMS shares, and what the download needs of them (download-gate.js).
  const PEOPLE = [
    ['workplace', 'Job address'], ['principal', 'Principal contractor'], ['compliance-responsible', 'Person who makes sure the SWMS is followed'],
    ['reviewer', 'Person who reviews the controls'], ['first-aider', 'First aider'], ['muster-point', 'Muster point'],
  ];
  const SITE = [
    ['liveServices', 'Live services', 'Power, gas, water, data or other live services in or near the work, including overhead power lines. Write None if there are none.'],
    ['publicInterface', 'Public interface', 'Where the public, traffic or neighbours are close to the work. Write None if they are not.'],
    ['otherTrades', 'Other trades', 'Other trades working nearby, or above or below you. Write None if there are none.'],
    ['ground', 'Ground', 'Soft or sloping ground, open excavations, or slab and deck loads. Write None if none apply.'],
    ['access', 'Access', 'How the crew gets to the work area, and how plant and materials get there.'],
  ];
  const CRANE = [['none', 'No crane'], ['company', 'A crane company'], ['own', 'Our company']];
  const PAGE_KEYS = ['state', 'residential', 'company', 'companyAbn', 'companyAddress', 'companyPhone', 'companyEmail', 'workplace', 'principalContractor', 'siteManager', 'scaffoldSupervisor', 'hospital', 'firstAider', 'musterPoint', 'worksManager', 'worksManagerPhone', 'complianceResponsible', 'reviewer', 'reviewDate', 'date', 'preparedBy'];

  const shared = () => {
    project.shared = project.shared || {};
    project.shared.designs = project.shared.designs || {};
    project.shared.emergency = project.shared.emergency || {};
    return project.shared;
  };
  const save = () => hooks.save();

  // The site answers for every SWMS start from the scope's conditions (D252), for the user to check.
  function sharedSite() {
    const site = shared();
    if (!site.site) {
      const start = {};
      for (const item of project.items) for (const [id, text] of Object.entries(item.site || {})) start[id] = start[id] ? `${start[id]} ${text}` : text;
      site.site = start;
      site.siteFromScope = Object.keys(start);
    }
    return site.site;
  }

  // The page's own details (the job address, the people, the state), as the SWMS form sends them.
  function pageBase() {
    const now = S.payload();
    return Object.fromEntries(PAGE_KEYS.map((key) => [key, now[key]]));
  }
  const questionDesign = (id) => { const rules = fill(); return (rules && rules.QUESTION_DESIGNS[id]) || null; };
  // The designs a SWMS uses: those asked at its questions and those its steps rely on, given once for
  // the project and used wherever the same design applies.
  function designIds(index) {
    const got = asked.get(index);
    if (!got) return [];
    const ids = (got.required || []).map((item) => questionDesign(item.id)).filter(Boolean).map((design) => design.id);
    for (const row of got.designs || []) if (row.needed && !ids.includes(row.id)) ids.push(row.id);
    return ids;
  }
  function designRow(id, what) {
    const rows = shared().designs;
    if (!rows[id]) rows[id] = { id, what: what || '', status: '', by: '', number: '', revision: '', date: '' };
    return rows[id];
  }
  function payloadFor(index) {
    const item = project.items[index];
    const designs = designIds(index).map((id) => shared().designs[id]).filter((row) => row && row.status);
    const emergency = shared().emergency;
    return {
      ...pageBase(),
      crane: shared().crane || item.crane || 'company',
      task: (item.goTask !== undefined ? item.goTask : item.task) || '',
      scopeTask: item.scopeTask || undefined,
      trade: item.trade || '',
      kinds: item.kinds || undefined,
      leaveOut: item.leaveOut || undefined,
      unmatched: item.unmatched || undefined,
      fallRisk: item.fallRisk || item.goFall || '',
      facts: { ...(item.facts || {}) },
      site: { ...(item.siteOwn || sharedSite()) },
      designs: designs.length ? designs.map((row) => ({ ...row })) : undefined,
      emergency: Object.keys(emergency).length ? { ...emergency } : undefined,
    };
  }

  // ---- Asking each SWMS's questions ----

  async function askItem(index) {
    const item = project.items[index];
    if (!item) return;
    const fall = item.fallRisk || item.goFall;
    if (!fall) { asked.set(index, { needsFall: true }); drawItem(index); return; }
    const mine = (askSeq.get(index) || 0) + 1;
    askSeq.set(index, mine);
    try {
      const response = await fetch(api('/api/draft/questions'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadFor(index)) });
      const data = await response.json();
      if (askSeq.get(index) !== mine) return;
      if (!response.ok) { asked.set(index, { error: data.message || 'The questions could not be asked.' }); drawItem(index); return; }
      const before = asked.get(index);
      asked.set(index, data);
      // A question already on the page keeps its box while the user types; only new or gone ones redraw.
      const shape = (got) => JSON.stringify(got && !got.error ? [(got.required || []).map((q) => q.id), (got.designs || []).filter((row) => row.needed).map((row) => row.id), Boolean(got.standDown)] : null);
      if (shape(before) !== shape(data) || !document.getElementById(`go-item-${index}`)) drawItem(index);
      else notesFor(index);
    } catch {
      if (askSeq.get(index) === mine && !asked.get(index)) { asked.set(index, { error: 'No signal. The questions show once SiteReady can be reached.' }); drawItem(index); }
    }
  }
  function askSoon(index) {
    clearTimeout(askTimers.get(index));
    askTimers.set(index, setTimeout(() => askItem(index), 700));
  }
  async function askAll() {
    for (let index = 0; index < project.items.length; index += 1) await askItem(index);
  }

  // ---- Drawing the page ----

  function peopleMissing() {
    return PEOPLE.filter(([id]) => { const el = $(id); return el && !el.value.trim(); });
  }
  function peopleBlock() {
    const missing = peopleMissing();
    return `<div id="go-people">${missing.length
      ? `<div class="note"><p>Still to fill in above, once for every SWMS:</p><ul class="go-people">${missing.map(([id, label]) => `<li><button type="button" class="link" data-go-field="${id}">${esc(label)}</button></li>`).join('')}</ul></div>`
      : '<p class="meta">The job address and the people above are filled in. They print on every SWMS.</p>'}</div>`;
  }

  function siteBoxes(prefix, values, attr) {
    return SITE.map(([id, label, hint]) => `<div class="field"><label for="${prefix}-${id}">${esc(label)}<span class="hint">${esc(hint)}</span></label><textarea id="${prefix}-${id}" ${attr} data-site-id="${id}">${esc(values[id] || '')}</textarea></div>`).join('');
  }

  function render(panel, current, given) {
    project = current;
    hooks = given;
    if (project.stage === 'review') {
      panel.innerHTML = reviewHtml();
      // Details given since the SWMS were prepared (brought back after a reload) are put into them.
      const now = JSON.stringify(pageBase());
      // So are emergency answers given in another SWMS of the project (D239: filled across).
      const across = Object.keys(shared().emergency);
      const stale = project.items.some((item) => item.body && (JSON.stringify(Object.fromEntries(PAGE_KEYS.map((key) => [key, item.body[key]]))) !== now
        || across.some((id) => !((item.body.emergency || {})[id] || '').trim())));
      if (stale && !refreshing) { clearTimeout(refreshTimer); refreshTimer = setTimeout(refreshAll, 300); }
      return;
    }
    const site = sharedSite();
    const crane = shared().crane || (project.items.find((item) => item.crane) || {}).crane || 'company';
    shared().crane = crane;
    const n = project.items.length;
    panel.innerHTML = `<div class="project-head"><h2>Project SWMS</h2><button type="button" class="small secondary" id="project-fresh">Start fresh</button></div>
      <p class="lede">${n} SWMS from the scope. Answer the questions once on this page, then press <strong>Prepare all ${n} SWMS</strong>. You then check each one before they download together.</p>
      ${project.from ? '<div class="actions" style="margin-top:0"><button type="button" class="small secondary" id="project-change">Change the SWMS chosen</button></div>' : ''}
      <p class="error" id="project-error"></p>
      <section class="go-block">
        <h3>1. Site details, for every SWMS</h3>
        ${peopleBlock()}
        <fieldset class="field choice"><legend>Is a crane used, and who operates it?</legend>${CRANE.map(([value, label]) => `<label><input type="radio" name="go-crane" value="${value}"${crane === value ? ' checked' : ''}> ${label}</label>`).join(' ')}</fieldset>
        <p class="meta">The site questions below are answered once for every SWMS. ${(shared().siteFromScope || []).length ? 'Some are filled from the scope\'s conditions: check they are right for this site. ' : ''}A SWMS that differs can have its own in its section.</p>
        ${siteBoxes('go-site', site, 'data-go-shared-site')}
      </section>
      <section class="go-block">
        <h3>2. The questions for each SWMS</h3>
        <p class="meta">An answer that suits more than one SWMS is filled across, marked so, and can be changed in each. A design given once is used wherever the same design applies.</p>
        ${project.items.map((item, index) => `<details class="go-item" id="go-item-${index}" open><summary><strong>SWMS ${index + 1} of ${n}: ${esc(item.title)}</strong></summary><div class="go-body" id="go-body-${index}">${itemBody(index)}</div></details>`).join('')}
      </section>
      <div class="actions go-prepare"><button type="button" id="go-prepare">Prepare all ${n} SWMS</button></div>
      <p class="meta" id="go-status" role="status"></p>
      <div class="actions"><button type="button" class="small secondary" id="project-close">Close project</button></div>`;
    project.items.forEach((_item, index) => notesFor(index));
    if (!project.items.every((_item, index) => asked.has(index))) askAll();
  }

  function drawItem(index) {
    const body = $(`go-body-${index}`);
    if (!body) return;
    body.innerHTML = itemBody(index);
    notesFor(index);
  }

  function itemBody(index) {
    const item = project.items[index];
    const got = asked.get(index);
    const task = item.goTask !== undefined ? item.goTask : item.task;
    const parts = [`<div class="field"><label for="go-task-${index}">Task<span class="hint">A plain list of the work, as it prints on the SWMS. Change it if it is not right.</span></label><textarea id="go-task-${index}" data-go-task="${index}">${esc(task)}</textarea></div>`];
    if (!item.fallRisk) {
      const from = item.fallFrom;
      parts.push(`<fieldset class="field choice"><legend>Could a person fall more than 2 metres during this work?</legend>${['yes', 'no'].map((value) => `<label><input type="radio" name="go-fall-${index}" data-go-fall="${index}" value="${value}"${item.goFall === value ? ' checked' : ''}> ${value === 'yes' ? 'Yes' : 'No'}</label>`).join(' ')}${from !== undefined ? `<p class="meta go-across">Filled from SWMS ${from + 1}. Change it here if this SWMS differs.</p>` : ''}</fieldset>`);
    }
    if (!got) parts.push('<p class="meta">Finding the questions for this SWMS...</p>');
    else if (got.needsFall) parts.push('<p class="note">Answer the fall question to see this SWMS\'s questions.</p>');
    else if (got.error) parts.push(`<p class="error">${esc(got.error)}</p>`);
    else {
      if (got.standDown) parts.push(`<p class="warning">${esc(got.standDown.message)}</p>`);
      const required = got.required || [];
      parts.push(required.length ? required.map((question) => questionHtml(index, question)).join('') : '<p class="meta">No further question for this SWMS.</p>');
      const found = (got.designs || []).filter((row) => row.needed && !required.some((question) => (questionDesign(question.id) || {}).id === row.id));
      if (found.length) parts.push(`<p class="go-sub"><strong>Designs this work relies on</strong></p>${found.map((row) => designHtml(index, row.id, row.label || row.what, row.steps)).join('')}`);
      const own = Boolean(item.siteOwn);
      parts.push(`<div class="go-site-own">${own ? `<p class="meta">This SWMS has its own site answers. <button type="button" class="link" data-go-site-same="${index}">Use the answers for every SWMS</button></p>${siteBoxes(`go-site-${index}`, item.siteOwn, `data-go-own-site="${index}"`)}` : `<p class="meta">Site questions: the answers for every SWMS, above. <button type="button" class="link" data-go-site-own="${index}">Change them for this SWMS</button></p>`}</div>`);
      if ((item.plant || []).length) parts.push(`<p class="meta">Plant the scope names: ${esc(item.plant.join(', '))}. You confirm the plant when you check this SWMS.</p>`);
    }
    return parts.join('');
  }

  function questionHtml(index, question) {
    const item = project.items[index];
    const id = `go-${index}-${question.id}`;
    const value = (item.facts || {})[question.id] || '';
    const hint = question.prompt && question.prompt.replace(/\.$/, '') !== question.label ? `<span class="hint">${esc(question.prompt)}</span>` : '';
    if (question.choices) {
      const chosen = value || question.default || '';
      return `<fieldset class="field choice" data-go-q="${esc(question.id)}"><legend>${esc(question.label)}</legend>${hint}${question.choices.map((choice) => `<label style="display:flex;margin:0 0 8px"><input type="radio" name="${id}" data-go-fact="${index}" data-q="${esc(question.id)}" value="${esc(choice.value)}"${choice.value === chosen ? ' checked' : ''}> ${esc(choice.label)}</label>`).join('')}</fieldset>`;
    }
    const picks = (question.suggestions || []).length ? `<div class="picks"><span class="picks-label">Standard answers:</span>${question.suggestions.map((pick, n) => `<button type="button" class="pick-button" data-go-pick="${index}" data-q="${esc(question.id)}" data-n="${n}">${esc(pick.label)}</button>`).join('')}</div>` : '';
    const design = questionDesign(question.id);
    return `<div class="field" data-go-q="${esc(question.id)}"><label for="${id}">${esc(question.label)}${hint}</label>${picks}<textarea id="${id}" data-go-fact="${index}" data-q="${esc(question.id)}">${esc(value)}</textarea><p class="meta go-across" id="${id}-across" hidden></p><p class="answer-note" id="${id}-note" hidden></p><p class="blank-warning" id="${id}-blanks" hidden></p>${design ? designHtml(index, design.id, design.label, null, question.id) : ''}</div>`;
  }

  // A design, given once for the project: whether it is issued, and its details.
  function designHtml(index, designId, label, steps, questionId = '') {
    const row = designRow(designId, label);
    const name = `go-design-${index}-${designId}`;
    const radio = (value, text) => `<label><input type="radio" name="${name}" data-go-design="${esc(designId)}" data-field="status" value="${value}"${row.status === value ? ' checked' : ''}> ${text}</label>`;
    const box = (key, text, hint) => `<div class="field"><label for="${name}-${key}">${text}${hint ? `<span class="hint">${hint}</span>` : ''}</label><input id="${name}-${key}" type="text" data-go-design="${esc(designId)}" data-field="${key}" maxlength="200" autocomplete="off" value="${esc(row[key] || '')}"></div>`;
    const usedElsewhere = project.items.some((_item, other) => other !== index && designIds(other).includes(designId));
    return `<fieldset class="field design-card go-design" data-status="${esc(row.status || '')}" data-design-id="${esc(designId)}"${questionId ? ` data-for-q="${esc(questionId)}"` : ''}><legend>${esc(row.what || label)}</legend>
      ${steps && steps.length ? `<p class="meta">Used in: ${esc(steps.join('; '))}.</p>` : ''}
      ${usedElsewhere ? '<p class="meta">Given once, used in every SWMS of this project that relies on it.</p>' : ''}
      <div class="choice design-status">${radio('given', 'I have it')}${radio('notIssued', 'Not issued yet')}${radio('notNeeded', 'Not needed for this work')}</div>
      <div class="design-given">${box('by', 'Who prepared it', 'The engineer or firm.')}<div class="design-pair">${box('number', 'Document or drawing number', 'From the title block.')}${box('revision', 'Revision', 'Leave it empty if it has none.')}</div></div>
      <p class="note design-hold">${questionId ? 'The answer above prints as a hold point: the work it covers does not start until the design is issued and the SWMS is updated. You can leave the answer empty.' : 'The steps that use it print a hold point until the design is issued and the SWMS is updated.'}</p>
    </fieldset>`;
  }

  // The notes under each answer: filled from another SWMS, too thin to print, blanks to fill.
  function notesFor(index) {
    const item = project.items[index];
    const got = asked.get(index) || {};
    const weak = new Map((got.weak || []).map((entry) => [entry.id, entry.help]));
    const missing = new Map(((item.draftHelp || [])).map((entry) => [entry.id, entry.help]));
    for (const question of got.required || []) {
      if (question.choices) continue;
      const id = `go-${index}-${question.id}`;
      const box = $(id);
      if (!box) continue;
      const across = $(`${id}-across`);
      const from = (item.filledFrom || {})[question.id];
      if (across) { across.hidden = from === undefined; across.textContent = from === undefined ? '' : `Filled from SWMS ${from + 1}. Change it here if this SWMS differs.`; }
      const note = $(`${id}-note`);
      const text = weak.has(question.id) ? `Too thin to print. ${weak.get(question.id)}` : (!box.value.trim() && missing.has(question.id)) ? `Still needed. ${missing.get(question.id)}` : '';
      if (note) { note.textContent = text; note.hidden = !text; }
      box.classList.toggle('answer-thin', Boolean(text));
      const blanks = $(`${id}-blanks`);
      const warning = fill() ? fill().blankWarning(box.value) : '';
      if (blanks) { blanks.textContent = warning; blanks.hidden = !warning; }
      box.classList.toggle('has-blank', Boolean(warning));
    }
  }

  // ---- What the user does on the page ----

  // An answer goes to its SWMS, and to the same question in the others that are blank or were filled
  // from it (D239: "answers that suit all filled across and changeable").
  function setFact(index, questionId, value) {
    const item = project.items[index];
    item.facts = { ...(item.facts || {}), [questionId]: value };
    if (item.filledFrom) delete item.filledFrom[questionId];
    project.items.forEach((other, at) => {
      if (at === index) return;
      const got = asked.get(at);
      if (!got || !(got.required || []).some((question) => question.id === questionId)) return;
      const theirs = (other.facts || {})[questionId] || '';
      const fromHere = (other.filledFrom || {})[questionId] === index;
      if (theirs && !fromHere) return;
      other.facts = { ...(other.facts || {}), [questionId]: value };
      other.filledFrom = { ...(other.filledFrom || {}), [questionId]: index };
      if (!value) delete other.filledFrom[questionId];
      const box = $(`go-${at}-${questionId}`);
      if (box && box.tagName === 'TEXTAREA') box.value = value;
      else document.querySelectorAll(`[name="go-${at}-${questionId}"]`).forEach((radio) => { radio.checked = radio.value === value; });
      notesFor(at);
      askSoon(at);
    });
  }

  // A design's status, number or revision fills the design blanks in the answers that refer to it.
  function fillDesigns(designId) {
    const rules = fill();
    if (!rules) return;
    const row = shared().designs[designId];
    project.items.forEach((item, index) => {
      for (const [questionId, design] of Object.entries(rules.QUESTION_DESIGNS)) {
        if (design.id !== designId) continue;
        const box = $(`go-${index}-${questionId}`);
        const now = (item.facts || {})[questionId] || '';
        if (!now) continue;
        item.goFilled = item.goFilled || {};
        const result = rules.fillDesign(now, row, item.goFilled[questionId] || []);
        item.goFilled[questionId] = result.applied;
        if (result.text !== now) {
          item.facts = { ...item.facts, [questionId]: result.text };
          if (box) box.value = result.text;
        }
      }
      notesFor(index);
    });
    document.querySelectorAll(`.go-design[data-design-id="${designId}"]`).forEach((card) => {
      card.dataset.status = row.status || '';
      card.querySelectorAll('[data-go-design]').forEach((input) => {
        if (input.type === 'radio') input.checked = input.value === row.status;
        else if (input !== document.activeElement) input.value = row[input.dataset.field] || '';
      });
    });
  }

  function onInput(event) {
    if (!project || project.stage !== 'questions') return;
    const target = event.target;
    if (target.dataset.goTask !== undefined) {
      const index = Number(target.dataset.goTask);
      project.items[index].goTask = target.value;
      save();
      askSoon(index);
      return;
    }
    if (target.dataset.goFact !== undefined && target.tagName === 'TEXTAREA') {
      const index = Number(target.dataset.goFact);
      setFact(index, target.dataset.q, target.value);
      const item = project.items[index];
      if (item.draftHelp) item.draftHelp = item.draftHelp.filter((entry) => entry.id !== target.dataset.q);
      notesFor(index);
      save();
      askSoon(index);
      return;
    }
    if (target.dataset.goSharedSite !== undefined) {
      sharedSite()[target.dataset.siteId] = target.value;
      save();
      return;
    }
    if (target.dataset.goOwnSite !== undefined) {
      const item = project.items[Number(target.dataset.goOwnSite)];
      item.siteOwn = { ...(item.siteOwn || {}), [target.dataset.siteId]: target.value };
      save();
      return;
    }
    if (target.dataset.goDesign !== undefined && target.type !== 'radio') {
      const row = designRow(target.dataset.goDesign);
      row[target.dataset.field] = target.value;
      if (['number', 'revision'].includes(target.dataset.field)) fillDesigns(row.id);
      save();
    }
  }

  function onChange(event) {
    if (!project || project.stage !== 'questions') return;
    const target = event.target;
    if (target.name === 'go-crane') {
      shared().crane = target.value;
      save();
      project.items.forEach((_item, index) => askSoon(index));
      return;
    }
    if (target.dataset.goFall !== undefined) {
      const index = Number(target.dataset.goFall);
      project.items[index].goFall = target.value;
      delete project.items[index].fallFrom;
      // The same answer fills the fall question of the SWMS not answered yet, or filled from this one.
      project.items.forEach((other, at) => {
        if (at === index || other.fallRisk || (other.goFall && other.fallFrom !== index)) return;
        other.goFall = target.value;
        other.fallFrom = index;
        drawItem(at);
        askItem(at);
      });
      save();
      drawItem(index);
      askItem(index);
      return;
    }
    if (target.dataset.goFact !== undefined && target.type === 'radio') {
      const index = Number(target.dataset.goFact);
      setFact(index, target.dataset.q, target.value);
      save();
      askSoon(index);
      return;
    }
    if (target.dataset.goDesign !== undefined && target.type === 'radio') {
      const row = designRow(target.dataset.goDesign);
      row.status = target.value;
      fillDesigns(row.id);
      save();
      project.items.forEach((_item, index) => { if (designIds(index).includes(row.id)) askSoon(index); });
    }
  }

  function onClick(event) {
    if (!project) return;
    const field = event.target.closest('[data-go-field]');
    if (field) {
      const el = $(field.dataset.goField);
      // A box in a closed section (the company profile) is opened first.
      const closed = el && el.closest('details:not([open])');
      if (closed) closed.open = true;
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus({ preventScroll: true }); }
      return;
    }
    const siteGo = event.target.closest('[data-go-site-answer]');
    if (siteGo) {
      project.stage = 'questions';
      save();
      hooks.render();
      const box = $(`go-site-${siteGo.dataset.goSiteAnswer}`);
      if (box) { box.scrollIntoView({ behavior: 'smooth', block: 'center' }); box.focus({ preventScroll: true }); }
      return;
    }
    const pick = event.target.closest('[data-go-pick]');
    if (pick) {
      const index = Number(pick.dataset.goPick);
      const question = ((asked.get(index) || {}).required || []).find((entry) => entry.id === pick.dataset.q);
      const answer = question && (question.suggestions || [])[Number(pick.dataset.n)];
      const box = $(`go-${index}-${pick.dataset.q}`);
      if (!answer || !box) return;
      box.value = box.value.trim() ? `${box.value.trim()} ${answer.text}` : answer.text;
      setFact(index, pick.dataset.q, box.value);
      const design = questionDesign(pick.dataset.q);
      if (design && shared().designs[design.id]) fillDesigns(design.id);
      notesFor(index);
      save();
      askSoon(index);
      box.focus();
      const blank = box.value.indexOf('____');
      if (blank >= 0 && box.setSelectionRange) box.setSelectionRange(blank, blank + 4);
      return;
    }
    const own = event.target.closest('[data-go-site-own]');
    if (own) {
      const index = Number(own.dataset.goSiteOwn);
      project.items[index].siteOwn = { ...sharedSite() };
      save();
      drawItem(index);
      const first = $(`go-site-${index}-liveServices`);
      if (first) first.focus();
      return;
    }
    const sameSite = event.target.closest('[data-go-site-same]');
    if (sameSite) {
      const index = Number(sameSite.dataset.goSiteSame);
      delete project.items[index].siteOwn;
      save();
      drawItem(index);
      return;
    }
    const goTo = event.target.closest('[data-go-to-item]');
    if (goTo) {
      const index = Number(goTo.dataset.goToItem);
      const box = document.querySelector(`#go-item-${index} .answer-note:not([hidden])`);
      const holder = box ? box.previousElementSibling && box.closest('.field') : $(`go-item-${index}`);
      const target = box ? (box.closest('.field') || box) : $(`go-item-${index}`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const input = holder && holder.querySelector('textarea');
      if (input) input.focus({ preventScroll: true });
      return;
    }
    if (event.target.closest('#go-prepare')) { prepareAll(event.target.closest('#go-prepare')); return; }
    if (event.target.closest('#go-back-questions')) {
      project.stage = 'questions';
      save();
      hooks.render();
      return;
    }
  }

  // ---- Prepare all ----

  async function prepareAll(button) {
    const status = $('go-status');
    const fallMissing = project.items.findIndex((item) => !item.fallRisk && !item.goFall);
    if (fallMissing >= 0) {
      status.textContent = `Answer the fall question for SWMS ${fallMissing + 1} first.`;
      const radio = document.querySelector(`[data-go-fall="${fallMissing}"]`);
      if (radio) { radio.scrollIntoView({ behavior: 'smooth', block: 'center' }); radio.focus({ preventScroll: true }); }
      return;
    }
    button.disabled = true;
    try {
      for (let index = 0; index < project.items.length; index += 1) {
        status.textContent = `Preparing SWMS ${index + 1} of ${project.items.length}...`;
        if (!asked.get(index) || asked.get(index).error) await askItem(index);
        // What the user changed when checking it before (steps, controls, plant, emergency answers) stays.
        const body = { ...(project.items[index].body || {}), ...payloadFor(index) };
        await prepareOne(index, body);
      }
      afterPrepare();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }

  async function prepareOne(index, body) {
    const response = await fetch(api('/api/draft'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const draft = await response.json();
    if (!response.ok) throw new Error(draft.message || `SWMS ${index + 1} could not be prepared.`);
    const item = project.items[index];
    item.body = body;
    item.kind = draft.kind;
    item.notCovered = draft.notCovered || [];
    item.notCoveredWritten = draft.notCoveredWritten || [];
    item.notCoveredMain = draft.notCoveredMain || [];
    item.draftHelp = draft.kind === 'stand-down' ? (draft.missingHelp || []) : [];
    item.needs = draft.kind === 'stand-down'
      ? ((draft.missingHelp || []).length ? draft.missingHelp.map((gap) => gap.label) : (draft.missing || []))
      : [...new Set([...(draft.gate || []).filter((gap) => gap.kind !== 'cover').map((gap) => gap.label)])];
    item.status = hooks.statusOf(item);
  }

  function afterPrepare() {
    const status = $('go-status');
    const unfinished = project.items.map((item, index) => (item.kind !== 'draft' ? index : -1)).filter((index) => index >= 0);
    if (unfinished.length) {
      // A SWMS whose answers are too thin stays on this page, with each answer's note under its box.
      const all = unfinished.length === project.items.length;
      status.innerHTML = `<div class="warning go-unfinished"><p><strong>${all ? 'None of the SWMS can be prepared yet.' : `${unfinished.length === 1 ? 'One SWMS is' : `${unfinished.length} SWMS are`} not finished. The others are prepared.`}</strong> These answers need more. Each one says under its box what would do.</p><ul>${unfinished.map((index) => `<li>SWMS ${index + 1}, ${esc(project.items[index].title)}: ${esc((project.items[index].needs || []).join('; '))}. <button type="button" class="link" data-go-to-item="${index}">Go to it</button></li>`).join('')}</ul></div>`;
      save();
      unfinished.forEach((index) => notesFor(index));
      status.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    project.stage = 'review';
    save();
    hooks.render();
    requestAnimationFrame(() => $('project-panel').scrollIntoView({ block: 'start' }));
    if (S.markStage) S.markStage('review');
  }

  // On the review list, a change to the details every SWMS shares (the job address, the people, the
  // company) is put into each SWMS, and the list says again what each still needs.
  let refreshTimer = null;
  let refreshing = false;
  async function refreshAll() {
    if (!project || project.stage !== 'review' || refreshing) return;
    refreshing = true;
    try {
      for (let index = 0; index < project.items.length; index += 1) {
        const item = project.items[index];
        if (item.body) await prepareOne(index, { ...item.body, ...pageBase(), emergency: { ...shared().emergency, ...Object.fromEntries(Object.entries(item.body.emergency || {}).filter(([, value]) => String(value || '').trim())) } });
      }
      save();
      if (project.stage === 'review') hooks.render();
    } catch {
      // With no signal the list stays as it was; each SWMS is checked again when it is opened.
    } finally {
      refreshing = false;
    }
  }

  // ---- The review list (D240) ----

  // What every SWMS shares is said once, above the list; each SWMS lists only its own.
  const SHARED_LABELS = new Set(PEOPLE.map(([, label]) => label));
  const SITE_LABEL = /^Site: /;
  // A site answer every SWMS shares (none has its own) is asked for once, on the questions page.
  const sharedSiteNeeds = () => {
    const using = project.items.filter((item) => !item.siteOwn && item.body);
    if (!using.length) return [];
    return SITE.filter(([, label]) => using.some((item) => (item.needs || []).includes(`Site: ${label}`))).map(([id, label]) => ({ id, label }));
  };
  function companyMissing() {
    if (!S.signedIn || !S.signedIn()) return '';
    const profile = (S.getProfile && S.getProfile()) || {};
    const name = String(profile.name || '').trim();
    const abn = String(profile.abn || '').replace(/\D/g, '');
    return name && abn ? '' : !name && !abn ? 'Company name and ABN' : !name ? 'Company name' : 'ABN';
  }
  function itemState(item) {
    const own = (item.needs || []).filter((label) => !SHARED_LABELS.has(label) && !(SITE_LABEL.test(label) && !item.siteOwn));
    if (item.status === 'ready') return { ready: true, text: 'Ready to download.' };
    if (item.kind && item.kind !== 'draft') return { ready: false, text: `Not finished: ${own.join('; ')} need more.` };
    if (item.status === 'write' || item.status === 'tick') return { ready: false, text: 'Needs your own step, or the SWMS that covers it named, for work SiteReady has no job steps for.' };
    return { ready: false, text: own.length ? `Before download, open it to give: ${own.join('; ')}.` : 'Waiting only for the details above.' };
  }
  function sharedNeeds() {
    // A person's box left empty, or given an answer a SWMS does not accept ("TBA").
    const people = PEOPLE.filter(([id, label]) => { const el = $(id); return (el && !el.value.trim()) || project.items.some((item) => (item.needs || []).includes(label)); }).map(([id, label]) => ({ id, label }));
    const company = companyMissing();
    return company ? [{ id: !String(((S.getProfile && S.getProfile()) || {}).name || '').trim() ? 'profile-company' : 'profile-abn', label: company }, ...people] : people;
  }
  function reviewHtml() {
    const n = project.items.length;
    const states = project.items.map(itemState);
    const ready = states.filter((state) => state.ready).length;
    const firstToCheck = project.items.findIndex((item, index) => !states[index].ready || !item.checked);
    const can = S.canDownload && S.canDownload();
    return `<div class="project-head"><h2>Project SWMS</h2><button type="button" class="small secondary" id="project-fresh">Start fresh</button></div>
      <p class="lede">${n} SWMS prepared. Check each one: open it, read its steps as they will print, and change any step's wording with <strong>Change this step</strong>. Each must clear its checks before the download.</p>
      <p class="error" id="project-error"></p>
      ${sharedNeeds().length || sharedSiteNeeds().length ? `<div class="note" id="go-shared-needs"><p><strong>For every SWMS, still to give:</strong></p><ul class="go-people">${sharedNeeds().map((need) => `<li><button type="button" class="link" data-go-field="${need.id}">${esc(need.label)}</button></li>`).join('')}${sharedSiteNeeds().map((need) => `<li><button type="button" class="link" data-go-site-answer="${need.id}">Site question: ${esc(need.label)}</button></li>`).join('')}</ul><p class="meta">Give each once. The list below follows.</p></div>` : ''}
      <ol class="go-review">${project.items.map((item, index) => `<li class="${states[index].ready ? 'ready' : 'needs'}"><div><strong>${esc(item.title)}</strong><span class="meta">${esc(states[index].text)}${item.checked ? ' Checked.' : ' Not checked yet.'}</span></div><button type="button" class="${index === firstToCheck ? '' : 'secondary '}small" data-project-open="${index}">${item.checked ? 'Check it again' : 'Check this SWMS'}</button></li>`).join('')}</ol>
      <div id="project-download">${can
        ? `${ready < n ? `<p class="note">${n - ready} of ${n} SWMS still ${n - ready === 1 ? 'needs' : 'need'} something before download: open ${n - ready === 1 ? 'it' : 'each'} with Check this SWMS and deal with what its list says.</p>` : '<p class="meta">Every SWMS has cleared its checks.</p>'}
          ${S.confirmBlock('project')}<div class="actions"><button type="button" id="project-zip"${ready < n ? ' disabled' : ''}>Download all ${n} SWMS (Word and PDF, one zip)</button></div>
          ${S.signedIn && S.signedIn() ? '<p class="meta">Downloading saves each SWMS under My SWMS as its own SWMS and revision, so every copy printed has a record.</p>' : ''}`
        : '<p class="note">Sign in, or start the free trial, to download the project\'s SWMS together.</p>'}</div>
      <p class="meta" id="project-status" role="status">${project.downloaded ? 'Downloaded. Changes you make to one now save as its next revision.' : ''}</p>
      <div class="actions"><button type="button" class="small secondary" id="go-back-questions">Back to the questions</button><button type="button" class="small secondary" id="project-close">Close project</button></div>`;
  }

  // The people's boxes above are filled in once; the list on the page follows them as they are typed.
  document.addEventListener('input', (event) => {
    if (!project) return;
    if (project.stage === 'questions' && PEOPLE.some(([id]) => event.target.id === id)) { const box = $('go-people'); if (box) box.outerHTML = peopleBlock(); }
    if (project.stage === 'review' && event.target.closest && event.target.closest('#job-details, #profile')) {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refreshAll, 900);
    }
  });
  // A saved company profile counts at once.
  document.addEventListener('click', (event) => {
    if (project && project.stage === 'review' && event.target.closest && event.target.closest('#profile-save')) setTimeout(() => hooks.render(), 600);
  });
  document.addEventListener('input', (event) => { if (event.target.closest && event.target.closest('#project-panel')) onInput(event); });
  document.addEventListener('change', (event) => { if (event.target.closest && event.target.closest('#project-panel')) onChange(event); });
  document.addEventListener('click', (event) => { if (event.target.closest && event.target.closest('#project-panel')) onClick(event); });

  window.SiteReadyProjectGo = { render, payloadFor: (index) => payloadFor(index) };
  // A project kept from before opens on its page (scope.js drew it before this script was loaded),
  // and again once the account is known, which the download and the company details depend on.
  if (S.renderProject) S.renderProject();
  if (S.accountReady) S.accountReady.then(() => { if (S.renderProject) S.renderProject(); });
})();
