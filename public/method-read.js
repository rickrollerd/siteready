// Reading a written methodology or sequence of works and suggesting job steps (owner, D230). Shown in
// each written methodology's card. SiteReady reads typed words only (a Word file, a PDF with typed
// text, or pasted text), never a drawing or a scan. Each suggested step is accepted, changed or
// skipped by the user: nothing goes into the SWMS until it is accepted. An accepted library match
// adds those job steps; an accepted "Your step" goes in as the user's own step, as "Write a step for
// this" does. The page's job steps and own steps are changed only through window.SiteReady.methodSteps
// (app.js).
(() => {
  const S = window.SiteReady || {};
  const { api, esc } = S;
  // Each methodology card's reading, by its id: { stage, error, reading, items, pasting }. Each item
  // is a suggestion with the user's choice: state '' (open), 'accepted' or 'skipped', and what was added.
  const readings = new Map();
  const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
  const box = (id) => document.querySelector(`[data-method-read-box="${CSS.escape(id)}"]`);
  const steps = () => S.methodSteps;

  let enabled = null;
  async function readingOn() {
    if (enabled) return true;
    try { enabled = Boolean((await (await fetch(api('/api/methodology/read'))).json()).enabled); } catch { enabled = false; }
    return enabled;
  }

  const CHECK = 'These are suggestions. Check each one against the methodology before you accept it. Nothing goes into the SWMS until you accept it.';
  const ORDER = 'SiteReady keeps its usual order for the job steps. On the draft, move them to follow the methodology\'s order where it matters.';

  const quoteList = (label, list) => (list.length ? `<p class="meta method-quote-label">${label}</p><ul class="method-quotes">${list.map((quote) => `<li>"${esc(quote)}"</li>`).join('')}</ul>` : '');

  // One suggestion: what the methodology says, what SiteReady suggests, and Accept, Change and Skip.
  function itemHtml(id, item, index) {
    const own = item.kind === 'own';
    const library = item.groups.map((group) => `<strong>${esc(group.label)}</strong>${group.steps.length > 1 || group.steps[0] !== group.label ? ` <span class="meta">(${esc(group.steps.join('; '))})</span>` : ''}`).join('; ');
    const head = `<p class="method-step-name"><strong>${item.n}. ${esc(item.step)}</strong> <span class="method-kind">${own ? 'Your step' : 'Library job step'}</span></p>`;
    const what = own
      ? '<p class="meta">Nothing in SiteReady\'s library fits this step, so it would go in as your own step, with only the hazards and controls the methodology states.</p>'
      : `<p class="meta">Matched to SiteReady's job steps: ${library}. They bring their own sourced hazards and controls. Check they cover what the methodology says.</p>`;
    // A sentence that is both the step and its control is listed once, under the step's words.
    const same = (a, b) => a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();
    const alsoControl = (quote) => item.controls.some((line) => same(line, quote));
    const words = (item.quotes.length ? `<p class="meta method-quote-label">The methodology says:</p><ul class="method-quotes">${item.quotes.map((quote) => `<li>"${esc(quote)}"${alsoControl(quote) ? ' <span class="meta">(a control it states)</span>' : ''}</li>`).join('')}</ul>` : '')
      + quoteList('Controls it states for this step:', item.controls.filter((line) => !item.quotes.some((quote) => same(line, quote))))
      + quoteList('Hazards it names for this step:', item.hazards);
    const open = !item.state;
    const missing = open && own && !item.hazards.length ? '<p class="meta method-missing">The methodology names no hazard for this step. Write at least one in your own words before you accept it: a step needs a hazard and a control to print.</p>' : '';
    const missingControl = open && own && !item.controls.length ? '<p class="meta method-missing">The methodology states no control for this step. Write at least one in your own words before you accept it.</p>' : '';
    let actions;
    if (item.state === 'accepted') {
      actions = `<p class="method-done" role="status">${esc(item.done)} <button type="button" class="link" data-mr-undo="${index}">Undo</button></p>`;
    } else if (item.state === 'skipped') {
      actions = `<p class="method-done" role="status">Skipped. It is not in the SWMS. <button type="button" class="link" data-mr-undo="${index}">Undo</button></p>`;
    } else {
      actions = `${item.changing ? changeHtml(item, index) : ''}<div class="method-actions"><button type="button" class="small" data-mr-accept="${index}">Accept</button>${item.changing ? '' : ` <button type="button" class="secondary small" data-mr-change="${index}">Change</button>`} <button type="button" class="secondary small" data-mr-skip="${index}">Skip</button></div><p class="meta method-msg" role="status" data-mr-msg="${index}"></p>`;
    }
    return `<li class="method-suggestion" data-state="${esc(item.state || 'open')}" id="method-sug-${esc(id)}-${index}">${head}${words}${what}${missing}${missingControl}${actions}</li>`;
  }

  // Change: a library match can take other job steps, or become the user's own step; the user's own
  // step can be named and given hazards and controls in the user's own words.
  function changeHtml(item, index) {
    const own = item.kind === 'own';
    if (!own) {
      const library = (steps() && steps().libraryGroups()) || [];
      const chosen = new Set(item.groups.map((group) => group.id));
      const options = library.map((group) => `<optgroup label="${esc(group.trade)}">${group.kinds.map((kind) => `<option value="${esc(kind.id)}"${chosen.has(kind.id) ? ' selected' : ''}>${esc(kind.label)}</option>`).join('')}</optgroup>`).join('');
      return `<div class="method-change"><label for="mr-group-${index}">Job steps for this step<span class="hint">Choose the job steps from SiteReady's library that fit.</span></label>
        <select id="mr-group-${index}" data-mr-group="${index}">${options}</select>
        <p><button type="button" class="link" data-mr-own="${index}">Write it as your own step instead</button></p></div>`;
    }
    const value = item.edited || item;
    return `<div class="method-change">
      <div class="field"><label for="mr-name-${index}">Step name</label><input id="mr-name-${index}" type="text" data-mr-name="${index}" maxlength="300" value="${esc(value.step)}"></div>
      <div class="field"><label for="mr-hazards-${index}">Hazards<span class="hint">One a line.</span></label><textarea id="mr-hazards-${index}" data-mr-hazards="${index}" rows="3">${esc(value.hazards.join('\n'))}</textarea></div>
      <div class="field"><label for="mr-controls-${index}">Controls<span class="hint">One a line. The methodology's own controls are filled in.</span></label><textarea id="mr-controls-${index}" data-mr-controls="${index}" rows="4">${esc(value.controls.join('\n'))}</textarea></div>
    </div>`;
  }

  // What was left out of the suggestions for not being word for word in the methodology (D234).
  function droppedText(dropped) {
    const steps = (dropped && dropped.steps) || 0;
    const lines = (dropped && dropped.lines) || 0;
    if (!steps && !lines) return '';
    const said = [];
    if (steps) said.push(steps === 1 ? '1 suggested step was left out because its wording was not found word for word in the methodology.' : `${steps} suggested steps were left out because their wording was not found word for word in the methodology.`);
    if (lines) {
      const what = lines === 1 ? '1 control or hazard line was' : `${lines} control or hazard lines were`;
      said.push(steps ? `${what} left out of the other suggestions for the same reason.`
        : `${what} left out of the suggestions because ${lines === 1 ? 'its' : 'their'} wording was not found word for word in the methodology.`);
    }
    said.push(steps && lines ? 'Check the methodology for any step, control or hazard that is missing.' : steps ? 'Check the methodology for any step that is missing.' : 'Check the methodology for any control or hazard that is missing.');
    return said.join(' ');
  }
  const droppedNote = (dropped) => { const text = droppedText(dropped); return text ? `<p class="warning method-dropped" role="status">${esc(text)}</p>` : ''; };

  function panelHtml(row) {
    const id = row.id;
    const state = readings.get(id) || {};
    // Any file attached is offered: a photo or a scanned PDF is refused with the plain message.
    const file = row.file || null;
    const intro = '<p class="meta">SiteReady can read a typed methodology and suggest job steps from it. It cannot read drawings, photos or scanned pages.</p>';
    if (!state.stage) return `${intro}<button type="button" class="secondary small" data-mr-open="${esc(id)}">Read it and suggest steps</button>`;
    if (state.stage === 'choose') {
      return `${intro}
        ${file ? `<p><button type="button" class="small" data-mr-file="${esc(id)}">Read the attached file (${esc(file.name)})</button></p>` : ''}
        <p><label class="secondary small design-attach" for="mr-pick-${esc(id)}">Choose a Word file (.docx) or PDF to read</label><input id="mr-pick-${esc(id)}" class="visually-hidden" type="file" accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" data-mr-pick="${esc(id)}"></p>
        <div class="field"><label for="mr-paste-${esc(id)}">Or paste the methodology's text</label><textarea id="mr-paste-${esc(id)}" rows="4" data-mr-paste="${esc(id)}"></textarea></div>
        <p><button type="button" class="secondary small" data-mr-pasted="${esc(id)}">Read the pasted text</button> <button type="button" class="link" data-mr-close="${esc(id)}">Cancel</button></p>
        <p class="meta">The methodology's text is sent to SiteReady's AI provider to be read, as a scope is.</p>
        ${state.error ? `<p class="error" role="alert">${esc(state.error)}</p>` : ''}`;
    }
    if (state.stage === 'reading') return '<p class="note" aria-live="polite">SiteReady is reading every word of the methodology. This usually takes a minute or two.</p>';
    // Done.
    const items = state.items || [];
    if (!items.length) {
      const why = state.reading && state.reading.isMethodology === false
        ? `This does not read as a written methodology or sequence of works, so no steps are suggested.${state.reading.notMethodology ? ` ${state.reading.notMethodology}` : ''}`
        : 'No steps of work were found in the methodology, so none are suggested.';
      return `<p class="note">${esc(why)}</p><p><button type="button" class="link" data-mr-open="${esc(id)}">Read another file</button></p>`;
    }
    const pages = (state.reading.pagesNotRead || []);
    const pageNote = pages.length ? `<p class="meta">${pages.length === 1 ? `Page ${pages[0]} looks` : `Pages ${pages.join(', ')} look`} like a drawing or a scan. Only typed words are read, so check ${pages.length === 1 ? 'that page' : 'those pages'} against the job steps yourself.</p>` : '';
    const open = items.filter((item) => !item.state).length;
    return `<h3 class="method-head">Suggested job steps from the methodology</h3>
      <p class="warning">${esc(CHECK)}</p>${droppedNote(state.reading.dropped)}${pageNote}
      <p class="meta">${items.length} step${items.length === 1 ? '' : 's'}, in the methodology's order. ${open ? `${open} still to accept, change or skip.` : 'All done.'} ${esc(ORDER)}</p>
      <ol class="method-suggestions">${items.map((item, index) => itemHtml(id, item, index)).join('')}</ol>
      <p><button type="button" class="link" data-mr-open="${esc(id)}">Read another file</button></p>`;
  }

  // The panel for a card (app.js methodCard), drawn from what is kept here.
  function boxHtml(row) {
    return `<div class="method-read" data-method-read-box="${esc(row.id)}">${panelHtml(row)}</div>`;
  }
  function redraw(id) {
    const el = box(id);
    const row = steps() && steps().methodRow(id);
    if (el && row) el.innerHTML = panelHtml(row);
  }

  const toBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(new Error('The file could not be opened.'));
    reader.readAsDataURL(file);
  });

  async function read(id, body) {
    const state = readings.get(id) || {};
    if (!S.isSignedIn || !S.isSignedIn()) { readings.set(id, { ...state, stage: 'choose', error: 'Sign in to have SiteReady read the methodology.' }); redraw(id); return; }
    if (!(await readingOn())) { readings.set(id, { ...state, stage: 'choose', error: 'Reading a methodology is not switched on here. The methodology can still be attached. Make the job steps match it yourself.' }); redraw(id); return; }
    readings.set(id, { stage: 'reading' });
    redraw(id);
    try {
      let reading = await S.call('POST', '/api/methodology/read', body);
      const started = Date.now();
      while (reading.status === 'reading') {
        if (Date.now() - started > 15 * 60 * 1000) throw new Error('The reading is taking too long. Try again later.');
        await wait(5000);
        reading = await S.call('GET', `/api/methodology/read/${encodeURIComponent(reading.id)}`);
      }
      if (reading.status !== 'done') throw new Error(reading.error || 'The reading failed. Try again later.');
      readings.set(id, { stage: 'done', reading, items: reading.suggestions.map((item) => ({ ...item, state: '' })) });
    } catch (error) {
      readings.set(id, { stage: 'choose', error: error.message });
    }
    redraw(id);
  }

  // What the user's own step will be: the step as suggested, or as changed.
  function ownFrom(item) {
    const value = item.edited || item;
    return { part: '', name: value.step.trim(), hazards: value.hazards.map((line) => line.trim()).filter(Boolean), controls: value.controls.map((line) => line.trim()).filter(Boolean), who: '' };
  }

  function keepEdits(el, item, index) {
    if (item.kind === 'own' && item.changing) {
      const value = (name) => (el.querySelector(`[data-mr-${name}="${index}"]`) || {}).value || '';
      item.edited = { step: value('name'), hazards: value('hazards').split('\n'), controls: value('controls').split('\n') };
    }
    if (item.kind === 'library' && item.changing) {
      const select = el.querySelector(`[data-mr-group="${index}"]`);
      const kind = select && select.value && steps().libraryKind(select.value);
      if (kind) item.groups = [{ id: kind.id, label: kind.label, steps: kind.steps }];
    }
  }

  function accept(id, index) {
    const state = readings.get(id);
    const item = state.items[index];
    const el = box(id);
    const say = (text) => { const msg = el && el.querySelector(`[data-mr-msg="${index}"]`); if (msg) msg.textContent = text; };
    keepEdits(el, item, index);
    const api = steps();
    if (!api) return;
    if (item.kind === 'library') {
      const added = api.addKinds(item.groups.map((group) => group.id));
      item.added = { kinds: added };
      item.done = added.length ? 'Accepted. Added to the job steps above.' : 'Accepted. These job steps were already in your SWMS.';
    } else {
      const own = ownFrom(item);
      // As "Write a step for this": a step needs a name, a hazard and a control, written in by the user
      // where the methodology does not state them.
      const need = !own.name ? 'Give the step a name.' : !own.hazards.length ? 'Write at least one hazard. A step needs a hazard and a control to print.'
        : !own.controls.length ? 'Write at least one control. A step needs a hazard and a control to print.' : '';
      if (need) {
        if (!item.changing) { item.changing = true; redraw(id); }
        const msg = box(id) && box(id).querySelector(`[data-mr-msg="${index}"]`);
        if (msg) msg.textContent = need;
        return;
      }
      if (api.ownNames().some((name) => name.toLowerCase() === own.name.toLowerCase())) { say('You already have a step with this name. Change its name.'); return; }
      api.addOwnStep(own);
      item.added = { own: own.name };
      item.done = 'Accepted. It goes in as your own step, marked as your own on the draft.';
    }
    item.state = 'accepted';
    item.changing = false;
    redraw(id);
  }

  function undo(id, index) {
    const item = readings.get(id).items[index];
    const api = steps();
    if (item.state === 'accepted' && api && item.added) {
      if (item.added.kinds && item.added.kinds.length) api.removeKinds(item.added.kinds);
      if (item.added.own) api.removeOwnStep(item.added.own);
    }
    item.state = '';
    item.added = null;
    redraw(id);
  }

  document.addEventListener('click', async (event) => {
    const target = event.target.closest && event.target.closest('[data-mr-open],[data-mr-close],[data-mr-file],[data-mr-pasted],[data-mr-accept],[data-mr-change],[data-mr-skip],[data-mr-undo],[data-mr-own]');
    if (!target) return;
    const holder = target.closest('[data-method-read-box]');
    if (!holder) return;
    const id = holder.dataset.methodReadBox;
    const data = target.dataset;
    if (data.mrOpen !== undefined) { readings.set(id, { stage: 'choose' }); redraw(id); return; }
    if (data.mrClose !== undefined) { readings.delete(id); redraw(id); return; }
    if (data.mrFile !== undefined) {
      const row = steps().methodRow(id);
      if (row && row.file) await read(id, { fileId: row.file.id });
      return;
    }
    if (data.mrPasted !== undefined) {
      const text = (holder.querySelector('[data-mr-paste]') || {}).value || '';
      if (!text.trim()) { readings.set(id, { stage: 'choose', error: 'Paste the methodology\'s text first.' }); redraw(id); return; }
      await read(id, { text });
      return;
    }
    const state = readings.get(id);
    if (!state || !state.items) return;
    const index = Number(data.mrAccept ?? data.mrChange ?? data.mrSkip ?? data.mrUndo ?? data.mrOwn);
    const item = state.items[index];
    if (!item) return;
    if (data.mrAccept !== undefined) accept(id, index);
    else if (data.mrChange !== undefined) { item.changing = true; redraw(id); }
    else if (data.mrSkip !== undefined) { keepEdits(holder, item, index); item.state = 'skipped'; item.changing = false; redraw(id); }
    else if (data.mrUndo !== undefined) undo(id, index);
    else if (data.mrOwn !== undefined) { item.kind = 'own'; item.changing = true; redraw(id); }
  });

  document.addEventListener('change', async (event) => {
    const input = event.target.closest && event.target.closest('[data-mr-pick]');
    if (!input || !input.files || !input.files[0]) return;
    const id = input.dataset.mrPick;
    const file = input.files[0];
    if (!/\.(docx|pdf)$/i.test(file.name)) { readings.set(id, { stage: 'choose', error: 'Choose a Word file (.docx) or a PDF. A drawing or a photo cannot be read.' }); redraw(id); return; }
    if (file.size > 10 * 1024 * 1024) { readings.set(id, { stage: 'choose', error: 'The file is larger than 10 MB. Paste the methodology\'s text instead.' }); redraw(id); return; }
    try {
      await read(id, { file: { name: file.name, data: await toBase64(file) } });
    } catch (error) {
      readings.set(id, { stage: 'choose', error: error.message });
      redraw(id);
    }
  });

  window.SiteReadyMethodRead = { boxHtml, droppedText, forget: (id) => readings.delete(id), clear: () => readings.clear() };
})();
