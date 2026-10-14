// Hazardous substances product by product, on the draft (owner, 13 October 2026, feedback item 22;
// D256, D257). SiteReady names the types of substance the work usually uses as a prompt; the user adds
// each product used. For each, they attach its safety data sheet (SDS) as a PDF, which SiteReady reads
// for its typed words (sds-read.js), or type its details from it, then tick "These match the SDS".
// Only products print: in the substances table with their Controls, and as one line in the step that
// uses each (substances.js). The download waits for each product listed to be complete and ticked.
// The rules shared with the server are in substance-rules.js. app.js draws the section where the
// registers print (render) and sends the products with the draft (payload).
(() => {
  const S = window.SiteReady || {};
  const R = window.SiteReadySubstanceRules;
  if (!R) return;
  const esc = (value) => (S.esc ? S.esc(value) : String(value || '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`));
  const LISTS = ['hazards', 'controls', 'firstAid', 'storage'];

  // The products as the user has them now: [{ id, type, product, supplier, quantity, sdsDate, hazards,
  // controls, firstAid, storage (each a list), step, file, read: { fields }, confirmed }].
  let products = [];
  // The suggested types ticked "Not required" (D277).
  let notUsed = new Set();
  // The draft last drawn, for its job steps and SiteReady's suggested types, and what the server said
  // of each product (the step it matched, what it still needs).
  let shown = null;
  // The product whose Remove was pressed, waiting for "Remove" or "Keep".
  let removing = '';
  // A message for a card, kept while the panel is drawn again: { id: text }.
  const messages = {};
  let panelStatus = '';

  const steps = () => ((shown && shown.jobSteps) || []);
  const fromServer = (id) => (((shown && shown.substances && shown.substances.products) || []).find((row) => row.id === id) || null);
  const rowOf = (id) => products.find((row) => row.id === id) || null;
  const typed = (row) => Boolean(String(row.product || '').trim() || String(row.supplier || '').trim() || String(row.quantity || '').trim() || row.sdsDate || row.file || LISTS.some((key) => R.linesOf(row[key]).length));

  // What is sent with the draft: each product with anything given, its lists one item a line.
  function payload() {
    const rows = products.filter(typed).map((row) => ({ ...row, ...Object.fromEntries(LISTS.map((key) => [key, R.linesOf(row[key])])) }));
    return rows.length ? rows : undefined;
  }
  function load(list, ticked) {
    notUsed = new Set(Array.isArray(ticked) ? ticked.filter((type) => R.TYPES.includes(type)) : []);
    products = (Array.isArray(list) ? list : []).filter((row) => row && /^sub-\d{1,2}$/.test(row.id || '')).map((row) => ({
      ...R.rowOf(row), id: row.id, type: row.type || '', ...(row.file ? { file: { ...row.file } } : {}), ...(row.read && Array.isArray(row.read.fields) ? { read: { fields: [...row.read.fields] } } : {}),
    }));
    removing = '';
  }
  function clear() { load([], []); panelStatus = ''; }
  const notUsedPayload = () => (notUsed.size ? [...notUsed] : undefined);

  // The step a product goes in now, as the page has it: the step chosen, else SiteReady's match.
  const stepNow = (row) => R.stepOf(row, steps());
  // What a product still needs before download, judged as the user types (the server checks again).
  function need(id) {
    const row = rowOf(id);
    return row ? R.substanceNeed(row, stepNow(row)) : null;
  }

  // ---- Drawing ----

  const fileSize = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
  const readFields = (row) => (row.read && Array.isArray(row.read.fields) ? row.read.fields : []);
  const amber = (row, key) => (readFields(row).includes(key) && !row.confirmed ? ' sub-read-field' : '');
  function box(row, key, label, hint, type = 'text', max = 200) {
    const id = `sub-${esc(row.id)}-${key}`;
    return `<div class="field"><label for="${id}">${label}${hint ? `<span class="hint">${hint}</span>` : ''}</label><input id="${id}" type="${type}" data-sub-field="${key}" maxlength="${max}" autocomplete="off" class="${amber(row, key).trim()}" value="${esc(row[key] || '')}"></div>`;
  }
  function area(row, key, label, hint) {
    const id = `sub-${esc(row.id)}-${key}`;
    return `<div class="field"><label for="${id}">${label}${hint ? `<span class="hint">${hint}</span>` : ''}</label><textarea id="${id}" data-sub-field="${key}" maxlength="4000" rows="${Math.min(10, Math.max(3, (row[key] || []).length + 1))}" class="${amber(row, key).trim()}">${esc((row[key] || []).join('\n'))}</textarea></div>`;
  }
  function stepChoice(row) {
    const id = `sub-${esc(row.id)}-step`;
    const matched = R.matchStep(row.type, steps());
    const chosen = row.step && steps().some((step) => step.step === row.step) ? row.step : '';
    const first = matched ? `SiteReady's match: ${matched}` : 'Choose the step';
    const options = [`<option value=""${chosen ? '' : ' selected'}>${esc(first)}</option>`, ...steps().map((step) => `<option value="${esc(step.step)}"${chosen === step.step ? ' selected' : ''}>${esc(step.step)}</option>`)].join('');
    return `<div class="field"><label for="${id}">Job step that uses it<span class="hint">The step gets one line naming the product and its controls.${matched ? '' : ' SiteReady could not tell which step uses it: choose one.'}</span></label><select id="${id}" class="plain" data-sub-field="step">${options}</select></div>`;
  }
  function fileBox(row) {
    const id = esc(row.id);
    const file = row.file
      ? `<p class="design-file">Attached: <strong>${esc(row.file.name)}</strong> <span class="meta">(${esc(fileSize(row.file.size || 0))})</span> <button type="button" class="link" data-sub-open="${id}">Open</button> <button type="button" class="link" data-sub-unfile="${id}">Remove the file</button></p>`
      : `<label class="secondary small design-attach" for="sub-${id}-file">Attach its safety data sheet (PDF)</label><input id="sub-${id}-file" class="visually-hidden" type="file" accept=".pdf,application/pdf" data-sub-file="${id}">`;
    return `<div class="field design-file-box"><p class="design-file-label">Its safety data sheet</p>
      <p class="meta">Attach the SDS as a PDF and SiteReady reads its typed words to fill in the details below for you to check. It does not read a scanned SDS or a photo: type the details from it instead. The file stays with this SWMS in SiteReady. It does not print.</p>
      ${file}<p class="meta sub-msg" data-sub-msg="${id}" role="status">${esc(messages[row.id] || '')}</p></div>`;
  }
  function card(row) {
    const id = esc(row.id);
    const server = fromServer(row.id);
    const legend = row.product || `New product${row.type ? `: ${R.promptName(row.type)}` : ''}`;
    const read = readFields(row).length && !row.confirmed
      ? '<p class="warning sub-read-note">Read from the safety data sheet: check each line matches it, change what does not, then tick "These match the SDS".</p>' : '';
    const old = R.sdsOld(row.sdsDate) ? `<p class="warning sub-old">${esc(R.OLD_NOTE)}</p>` : '';
    const future = R.sdsFuture(row.sdsDate) ? '<p class="warning sub-old">This date is after today. Check the issue date on the SDS.</p>' : '';
    // Before the draft is updated with it, the card says what it still needs; after, the list of what
    // is needed before download does (app.js).
    const own = server ? '' : R.substanceNeed(row, stepNow(row));
    const type = `<div class="field"><label for="sub-${id}-type">Type of product</label><select id="sub-${id}-type" class="plain" data-sub-field="type">${[...R.TYPES.map((label) => `<option value="${esc(label)}"${row.type === label ? ' selected' : ''}>${esc(label)}</option>`), `<option value=""${row.type ? '' : ' selected'}>Another product</option>`].join('')}</select></div>`;
    const remove = removing === row.id
      ? `<p class="sub-remove-ask" role="status">Remove this product? <button type="button" class="small" data-sub-remove-yes="${id}">Remove</button> <button type="button" class="secondary small" data-sub-remove-no="${id}">Keep</button></p>`
      : `<p><button type="button" class="link" data-sub-remove="${id}">Remove this product</button></p>`;
    return `<fieldset class="field design-card sub-card" id="substance-${id}" data-sub="${id}" tabindex="-1">
      <legend>${esc(legend)}</legend>
      ${type}
      ${fileBox(row)}
      ${read}
      ${box(row, 'product', 'Product name', 'As the SDS names it.')}
      ${box(row, 'supplier', 'Supplier', 'Optional. The company named on the SDS.')}
      <div class="design-pair">${box(row, 'sdsDate', 'Issue date of the SDS', 'On its first page, or in section 16.', 'date', 20)}${box(row, 'quantity', 'Quantity', 'Optional. For example 4 x 20 L.', 'text', 60)}</div>
      ${old}${future}
      ${area(row, 'controls', 'PPE and controls (sections 7 and 8)', 'One a line, in the SDS\'s words. These print in the Controls column and in the job step.')}
      ${area(row, 'hazards', 'Hazard statements (section 2)', 'Optional. One a line, for example H315 Causes skin irritation.')}
      ${area(row, 'firstAid', 'First aid (section 4)', 'Optional. One a line.')}
      ${area(row, 'storage', 'Storage and spills (sections 6 and 7)', 'Optional. One a line.')}
      ${stepChoice(row)}
      <label class="check"><input type="checkbox" data-sub-confirm="${id}"${row.confirmed ? ' checked' : ''}><span>These match the SDS <span class="meta">Tick once you have checked every line against the product's safety data sheet.</span></span></label>
      ${own ? `<p class="method-need sub-need" role="status">${esc(own)}</p>` : ''}
      ${remove}
    </fieldset>`;
  }

  // The products as they print (substances.js tableRows), from the draft as last prepared.
  function printedTable(draft) {
    const rows = ((draft.substances && draft.substances.products) || []).filter((row) => row.product && !R.isOpen(row.product));
    if (!rows.length) return '';
    const or = (lines, section) => (lines.length ? lines.join('\n') : `See its safety data sheet, ${section}.`);
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dated = (value) => { const date = R.dateOf(value); return date ? `Issued ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}.` : ''; };
    const head = ['Product', 'Hazards', 'Controls', 'First aid', 'Storage and spills', 'Safety data sheet'];
    const cells = (row) => [
      [row.product, row.type, row.supplier ? `Supplier: ${row.supplier}` : '', row.quantity ? `Quantity: ${row.quantity}` : ''].filter(Boolean).join('\n'),
      or(row.hazards, 'section 2'), or(row.controls, 'section 8'), or(row.firstAid, 'section 4'), or(row.storage, 'sections 6 and 7'),
      [dated(row.sdsDate), row.file ? `A copy is attached to this SWMS in SiteReady (${row.file.name || 'file'}).` : ''].filter(Boolean).join('\n'),
    ];
    const cell = (value, i) => `<td data-label="${esc(head[i])}">${esc(value).replace(/\n/g, '<br>')}</td>`;
    return `<p class="meta">Each product used, with the controls from its own safety data sheet (SDS). Keep each product's current SDS at the work area, and label every container, including anything decanted.</p>
      <table class="stack sub-table"><thead><tr>${head.map((label) => `<th>${esc(label)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${cells(row).map(cell).join('')}</tr>`).join('')}</tbody></table>`;
  }

  // The types SiteReady suggests for the work, and whether a product of each is added (D277: each needs
  // a product or the tick "Not required").
  const suggestedTypes = () => ((shown && shown.substances && shown.substances.items) || []).map((item) => item.product).filter((label) => R.TYPES.includes(label));
  const productsOf = (type) => products.filter((row) => row.type === type && typed(row));
  const TYPE_NEED = (type) => `${R.SHORT.get(type)}: add the product you use, or tick "Not required".`;
  // What a suggested type still needs, judged as the user ticks or adds (the server checks again).
  const typeNeed = (type) => (productsOf(type).length || notUsed.has(type) ? '' : TYPE_NEED(type));
  function typeRow(type) {
    const n = R.TYPES.indexOf(type);
    const added = productsOf(type);
    const body = added.length
      ? `<p class="meta sub-type-added">Added: ${esc(added.map((row) => String(row.product || '').trim() || 'a product still being filled in').join('; '))}.</p>`
      : `<div class="sub-type-tools"><button type="button" class="secondary small" data-sub-add="${esc(type)}">Add the product</button>
        <label class="check"><input type="checkbox" id="sub-type-${n}" data-sub-notused="${esc(type)}"${notUsed.has(type) ? ' checked' : ''}><span>Not required</span></label></div>`;
    return `<div class="field sub-type" id="sub-type-row-${n}"><p class="sub-type-name"><strong>${esc(type)}</strong></p>${body}</div>`;
  }
  function panelHtml() {
    const types = suggestedTypes();
    const names = types.map(R.promptName);
    const lead = types.length
      ? `This work usually uses ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]}. For each, add the product you use, with its safety data sheet, or tick "Not required".`
      : 'SiteReady found no hazardous substances in this work. If your crew uses a product with a safety data sheet (a sealant, a fuel, a cleaner), add it here.';
    const done = (types.length || products.length) && types.every((type) => !typeNeed(type)) && products.every((row) => !typed(row) || (fromServer(row.id) && !need(row.id)));
    return `<div class="panel answer-panel sub-panel${done ? ' done' : ''}" id="substances-panel">
      <p><strong>Hazardous products used in this work</strong></p>
      <p class="meta">${esc(lead)} Only the products you add print on the SWMS, each with the controls from its own safety data sheet, in the table below and in the job step that uses it.</p>
      <div class="sub-types">${types.map(typeRow).join('')}</div>
      <div class="sub-adds"><button type="button" class="secondary small" data-sub-add="">Add ${products.length || types.length ? 'another' : 'a'} product</button></div>
      <div id="substances-cards">${products.map(card).join('')}</div>
      ${products.length ? '<div class="actions"><button type="button" id="substances-update">Update the draft</button></div>' : ''}
      <p class="meta sub-status" id="substances-status" role="status">${esc(panelStatus)}</p>
    </div>`;
  }
  // The section where the registers print (app.js render): on the draft being prepared, the prompt and
  // each product's card above the table as it prints; elsewhere, the table only.
  function section(draft, { movable = false } = {}) {
    if (!draft || draft.kind !== 'draft') return '';
    const table = printedTable(draft);
    if (!movable) return table ? `<h4>Hazardous substances</h4>${table}` : '';
    shown = draft;
    return `<h4>Hazardous substances</h4><div id="substances-holder">${panelHtml()}</div>${table}`;
  }
  // The panel drawn again in place, keeping the focus on the box it was in.
  function redraw(focusId) {
    const holder = document.getElementById('substances-holder');
    if (!holder) return;
    holder.innerHTML = panelHtml();
    addStyle();
    if (focusId) { const el = document.getElementById(focusId); if (el) el.focus({ preventScroll: true }); }
  }
  const say = (id, text) => { messages[id] = text; const el = document.querySelector(`[data-sub-msg="${CSS.escape(id)}"]`); if (el) el.textContent = text; };

  // Prepares the draft again with the products as they are, and brings the panel (or the card) back
  // into view with what happened, so the change is seen (owner feedback item 25).
  async function update(focusCard) {
    if (!S.prepare) return;
    panelStatus = '';
    await S.prepare({ scroll: false });
    const ready = products.filter(typed);
    const printing = ((shown && shown.substances && shown.substances.products) || []).filter((row) => row.line).length;
    panelStatus = ready.length ? `Draft updated. ${printing === 1 ? 'One product prints' : `${printing} products print`} in the table below${printing ? ' and in the job step that uses it' : ''}.${ready.some((row) => need(row.id)) ? ' What is still needed shows under each product.' : ''}` : 'Draft updated.';
    const status = document.getElementById('substances-status');
    if (status) status.textContent = panelStatus;
    const target = (focusCard && document.getElementById(`substance-${focusCard}`)) || document.getElementById('substances-panel');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---- What the user does ----

  document.addEventListener('input', (event) => {
    const field = event.target.closest && event.target.closest('[data-sub-field]');
    const cardEl = field && field.closest('[data-sub]');
    if (!field || !cardEl || field.tagName === 'SELECT') return;
    const row = rowOf(cardEl.dataset.sub);
    if (!row) return;
    const key = field.dataset.subField;
    row[key] = LISTS.includes(key) ? String(field.value).split(/\r?\n/) : field.value;
    if (key === 'product') cardEl.querySelector('legend').textContent = field.value.trim() || 'New product';
    const own = cardEl.querySelector('.sub-need');
    if (own) own.textContent = R.substanceNeed(row, stepNow(row));
    if (S.keepUnsaved) S.keepUnsaved();
  });
  document.addEventListener('change', async (event) => {
    const target = event.target;
    const select = target.closest && target.closest('select[data-sub-field]');
    if (select) {
      const row = rowOf(select.closest('[data-sub]').dataset.sub);
      if (!row) return;
      row[select.dataset.subField] = select.value;
      redraw(select.id);
      if (S.keepUnsaved) S.keepUnsaved();
      return;
    }
    if (target.dataset && target.dataset.subField === 'sdsDate') {
      redraw(target.id);
      return;
    }
    // A suggested type ticked "Not required": the gate item clears as it is ticked, with no new
    // draft (it changes nothing that prints).
    const unused = target.closest && target.closest('[data-sub-notused]');
    if (unused) {
      if (unused.checked) notUsed.add(unused.dataset.subNotused); else notUsed.delete(unused.dataset.subNotused);
      if (S.keepUnsaved) S.keepUnsaved();
      return;
    }
    const tick = target.closest && target.closest('[data-sub-confirm]');
    if (tick) {
      const row = rowOf(tick.dataset.subConfirm);
      if (!row) return;
      row.confirmed = tick.checked;
      if (S.keepUnsaved) S.keepUnsaved();
      // The tick goes into the SWMS at once: the draft is prepared again with it.
      await update(row.id);
      return;
    }
    const input = target.closest && target.closest('[data-sub-file]');
    if (input && input.files && input.files[0]) await attach(input.dataset.subFile, input);
  });
  document.addEventListener('click', async (event) => {
    const add = event.target.closest && event.target.closest('[data-sub-add]');
    if (add) {
      const used = new Set(products.map((row) => row.id));
      let n = 1;
      while (used.has(`sub-${n}`)) n += 1;
      products.push({ ...R.rowOf({ type: add.dataset.subAdd }), id: `sub-${n}`, type: add.dataset.subAdd });
      panelStatus = '';
      redraw(`sub-sub-${n}-type`);
      const cardEl = document.getElementById(`substance-sub-${n}`);
      if (cardEl) cardEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const remove = event.target.closest && event.target.closest('[data-sub-remove]');
    if (remove) { removing = remove.dataset.subRemove; redraw(); const yes = document.querySelector(`[data-sub-remove-yes="${CSS.escape(removing)}"]`); if (yes) yes.focus(); return; }
    const keep = event.target.closest && event.target.closest('[data-sub-remove-no]');
    if (keep) { removing = ''; redraw(); return; }
    const yes = event.target.closest && event.target.closest('[data-sub-remove-yes]');
    if (yes) {
      const id = yes.dataset.subRemoveYes;
      const was = fromServer(id);
      products = products.filter((row) => row.id !== id);
      removing = '';
      delete messages[id];
      if (S.keepUnsaved) S.keepUnsaved();
      // A product already in the draft comes out of it at once.
      if (was) await update(); else redraw();
      return;
    }
    const unfile = event.target.closest && event.target.closest('[data-sub-unfile]');
    if (unfile) {
      const row = rowOf(unfile.dataset.subUnfile);
      if (row) { delete row.file; delete row.read; }
      say(unfile.dataset.subUnfile, 'File removed. The details typed stay.');
      redraw();
      if (S.keepUnsaved) S.keepUnsaved();
      return;
    }
    const open = event.target.closest && event.target.closest('[data-sub-open]');
    if (open) {
      const row = rowOf(open.dataset.subOpen);
      if (row && row.file && S.openFile) S.openFile(`/api/designs/files/${encodeURIComponent(row.file.id)}`, row.file.name).catch((error) => say(row.id, error.message));
      return;
    }
    if (event.target.closest && event.target.closest('#substances-update')) await update();
  });

  // The SDS attached: checked here for type and size, kept (design-files.js, as a design's file is),
  // then read for its typed words. What is read fills the empty boxes, marked as read until ticked.
  async function attach(id, input) {
    const file = input.files[0];
    if (!S.isSignedIn || !S.isSignedIn()) { say(id, 'Sign in to attach the safety data sheet. You can type its details now.'); input.value = ''; return; }
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { say(id, 'Attach the safety data sheet as a PDF. For a photo or a scan, type its details below.'); input.value = ''; return; }
    if (file.size > 10 * 1024 * 1024) { say(id, 'The file is larger than 10 MB. Attach a smaller copy, or type the details.'); input.value = ''; return; }
    say(id, 'Attaching...');
    let fileId;
    try {
      const data = await S.sendFile('/api/designs/files', file);
      const row = rowOf(id);
      if (!row) return;
      row.file = data.file;
      fileId = data.file.id;
      messages[id] = 'Reading the typed words of the safety data sheet...';
      redraw();
    } catch (error) {
      say(id, error.message);
      input.value = '';
      return;
    }
    let data;
    try {
      data = await S.call('POST', '/api/substances/read', { fileId });
    } catch (error) {
      say(id, error.message);
      return;
    }
    const row = rowOf(id);
    if (!row || !row.file || row.file.id !== fileId) return;
    // Only empty boxes are filled: what the user typed stays.
    const filled = (data.read || []).filter((key) => (LISTS.includes(key) ? !R.linesOf(row[key]).length : !String(row[key] || '').trim()));
    for (const key of filled) row[key] = LISTS.includes(key) ? [...data.details[key]] : data.details[key];
    if (filled.length) { row.read = { fields: filled }; row.confirmed = false; }
    messages[id] = filled.length
      ? `Filled from the safety data sheet: check each line against it.${data.dropped ? ' Lines SiteReady could not find word for word in the SDS were left out.' : ''}${filled.includes('controls') ? '' : ' Type its PPE and controls from sections 7 and 8.'}`
      : 'SiteReady found none of the details in the SDS\'s typed words. Type them from it.';
    redraw();
    if (S.keepUnsaved) S.keepUnsaved();
  }

  // The look of the cards, kept with this file.
  function addStyle() {
    if (document.getElementById('substances-style')) return;
    const style = document.createElement('style');
    style.id = 'substances-style';
    style.textContent = `.sub-adds { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 14px; }
      .sub-type { border-top: 1px solid #ecd9b5; padding: 8px 0 0; margin: 0 0 8px; }
      .sub-type-name { margin: 0 0 4px; }
      .sub-type-tools { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; }
      .sub-type .check { display: flex; gap: 8px; align-items: center; margin: 0; font-weight: 400; }
      .sub-card textarea { min-height: 72px; height: auto; }
      .sub-card .sub-read-field { border: 2px solid #c77700; background: #fffaf0; }
      .sub-card .sub-need { color: #8a2b2b; font-weight: 600; }
      .sub-card .sub-remove-ask { font-weight: 600; }
      .sub-card .check { display: flex; gap: 10px; align-items: flex-start; font-weight: 600; margin: 8px 0; }
      .sub-card .check .meta { display: block; font-weight: 400; }
      .sub-card select.plain { width: 100%; }
      .substance-line .meta { display: block; font-weight: 400; color: #3d4a59; }`;
    document.head.appendChild(style);
  }
  if (document.head) addStyle();

  window.SiteReadySubstances = { section, payload, notUsedPayload, load, clear, need, typeNeed, printedTable };
})();
