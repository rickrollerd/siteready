// The QuantityForge tab (/quantityforge). The page talks only to SiteWrite's server (/api/qf/...), which
// calls QuantityForge with its own token; nothing here holds a QuantityForge key. QuantityForge keeps
// nothing, so the page keeps the bill and sends it back with each change.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  // The same sign-in as the SiteWrite app (account.js).
  const SESSION_KEY = 'sitewrite.session';
  const session = (() => { try { return localStorage.getItem(SESSION_KEY) || ''; } catch { return ''; } })();
  const auth = () => (session ? { Authorization: `Bearer ${session}`, 'X-Session-Token': session } : {});
  const money = (n) => (n === null || n === undefined || n === '' ? '' : new Intl.NumberFormat('en-AU', { style: 'currency', currency: state.view && state.view.currency ? state.view.currency : 'AUD' }).format(Number(n)));
  const qty = (n) => (n === null || n === undefined ? '' : new Intl.NumberFormat('en-AU', { maximumFractionDigits: 3 }).format(Number(n)));

  const state = { file: null, name: '', pageNo: 1, sheetType: 'slab_plan', sentKey: '', page: null, bill: null, view: null, questions: [], answers: {}, profile: 'all', picked: '', zoom: 1, reviews: {} };
  // The drawings measured on this page, newest last. Kept only while the page is open: QuantityForge
  // keeps nothing and SiteWrite does not keep the PDFs.
  const sheets = [];
  const ZOOMS = [1, 1.5, 2, 3, 4, 6];
  const VIEWS = ['loading', 'off', 'signin', 'tab'];
  const show = (name) => VIEWS.forEach((id) => $(`view-${id}`).classList.toggle('hidden', id !== name));
  const message = (html, kind = 'bad') => { $('qf-message').innerHTML = html ? `<div class="${kind}">${html}</div>` : ''; };

  async function api(path, { method = 'GET', json, body, headers = {} } = {}) {
    const response = await fetch(`/api/qf/${path}`, {
      method,
      headers: { ...auth(), ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : body,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.message || 'Something went wrong. Try again.'), { status: response.status });
    return data;
  }

  function busy(on, words = '') {
    for (const id of ['qf-measure', 'qf-again']) $(id).disabled = on;
    $('qf-busy').textContent = on ? words : '';
  }

  // ---- Measuring ----
  // again: measure the drawing open now with the answers given; otherwise the file and page in the form.
  async function measure({ again = false } = {}) {
    const file = again ? state.file : $('qf-file').files[0];
    if (!file) return message('Choose the PDF of the sheet to measure.');
    const page = again ? state.pageNo : Math.max(1, Math.floor(Number($('qf-page').value) || 1));
    const key = `${file.name}|${file.size}|${file.lastModified}|${page}`;
    const known = sheets.find((s) => s.key === key);
    if (!again && known && key !== state.sentKey) open(known);
    const query = new URLSearchParams({ page: String(page), sheetType: $('qf-type').value, profile: state.profile });
    if ($('qf-scale').value) query.set('scale', String(Math.floor(Number($('qf-scale').value))));
    // A new sheet or page also needs its picture; answers for another sheet do not apply to it.
    const fresh = key !== state.sentKey;
    if (fresh) query.set('image', '1');
    const answers = fresh ? {} : state.answers;
    message('');
    busy(true, 'Measuring the sheet. This can take a minute.');
    try {
      const data = await api(`measure?${query}`, {
        method: 'POST',
        body: file,
        headers: { 'Content-Type': 'application/pdf', 'X-QF-Answers': encodeURIComponent(JSON.stringify(answers)) },
      });
      if (fresh) { remember(); state.answers = {}; state.zoom = 1; }
      if (data.page !== undefined) state.page = data.page;
      Object.assign(state, { file, name: file.name, pageNo: page, sheetType: query.get('sheetType'), sentKey: key });
      state.picked = '';
      take(data);
      if (data.scaleStatus && data.scaleStatus !== 'verified') message('QuantityForge could not check the scale on this sheet. Check one dimension on the drawing against the bill before you use it.', 'warn');
    } catch (error) {
      message(esc(error.message));
    } finally {
      busy(false);
    }
  }

  // The server's answer after any call: the whole bill, the lines for the trade picked, the questions.
  function take(data) {
    state.bill = data.bill;
    state.view = data.view;
    state.questions = data.questions || [];
    state.profile = data.profile || 'all';
    state.reviews = data.reviews || {};
    remember();
    renderQuestions();
    renderSheet();
    renderBill();
    renderSheets();
    $('result').classList.remove('hidden');
  }

  // ---- The drawings list ----
  const KEPT = ['file', 'name', 'pageNo', 'sheetType', 'sentKey', 'page', 'bill', 'view', 'questions', 'answers', 'profile', 'zoom', 'reviews'];
  const copied = (k, v) => (k === 'answers' || k === 'reviews' ? { ...(v || {}) } : v);
  function remember() {
    if (!state.sentKey) return;
    let entry = sheets.find((s) => s.key === state.sentKey);
    if (!entry) { entry = { key: state.sentKey }; sheets.push(entry); }
    for (const k of KEPT) entry[k] = copied(k, state[k]);
  }
  function open(entry) {
    remember();
    for (const k of KEPT) state[k] = copied(k, entry[k]);
    state.picked = '';
    $('line-detail').innerHTML = '';
    $('qf-page').value = String(entry.pageNo);
    $('qf-type').value = entry.sheetType;
    message('');
    renderQuestions();
    renderSheet();
    renderBill();
    renderSheets();
  }
  function sheetSummary(entry) {
    const v = entry.view || { lines: [], total: null };
    const billed = v.lines.length ? `${v.lines.length} ${v.lines.length === 1 ? 'line' : 'lines'}` : 'not billed yet';
    const priced = v.total !== null && v.total !== undefined ? `, ${money(v.total)}` : '';
    const asks = (entry.questions || []).filter((q) => q.input !== 'confirm').length;
    return `${billed}${priced}${asks ? `, ${asks} ${asks === 1 ? 'question' : 'questions'}` : ''}`;
  }
  function renderSheets() {
    $('sheets').classList.toggle('hidden', !sheets.length);
    $('sheets-list').innerHTML = sheets.map((entry, i) => `<li${entry.key === state.sentKey ? ' class="open"' : ''}>
      <button type="button" class="link" data-open="${i}"${entry.key === state.sentKey ? ' aria-current="true"' : ''}>${esc(entry.name)}, page ${esc(entry.pageNo)}</button>
      <span class="muted">${esc(sheetSummary(entry))}</span>
      <button type="button" class="link remove" data-remove="${i}" aria-label="Remove ${esc(entry.name)}, page ${esc(entry.pageNo)} from the list">Remove</button></li>`).join('');
  }
  $('sheets-list').addEventListener('click', (event) => {
    const openAt = event.target.closest('[data-open]');
    const removeAt = event.target.closest('[data-remove]');
    if (openAt) open(sheets[Number(openAt.dataset.open)]);
    if (removeAt) {
      const [gone] = sheets.splice(Number(removeAt.dataset.remove), 1);
      if (gone && gone.key === state.sentKey) {
        // The removed drawing is not kept again on the way to the next one.
        state.sentKey = '';
        if (sheets.length) open(sheets[sheets.length - 1]);
        else {
          Object.assign(state, { file: null, sentKey: '', page: null, bill: null, view: null, questions: [], answers: {}, picked: '' });
          $('result').classList.add('hidden');
          $('questions').classList.add('hidden');
          renderSheets();
        }
      } else renderSheets();
    }
  });

  // ---- Questions ----
  function renderQuestions() {
    const asks = state.questions.filter((q) => q.input !== 'confirm');
    const checks = state.questions.filter((q) => q.input === 'confirm');
    $('questions').classList.toggle('hidden', !state.questions.length);
    const none = state.view && !state.view.lines.length;
    $('questions-why').textContent = none
      ? 'QuantityForge found these items but holds them back until it knows the following. Answer what you can and measure again.'
      : 'Some items are held back until QuantityForge knows the following.';
    const field = (q) => {
      const id = `q-${q.key.replace(/[^a-z0-9_]/g, '-')}`;
      const now = state.answers[q.key] ?? '';
      const head = `<label for="${id}">${esc(q.label)}${q.unit ? ` (${esc(q.unit)})` : ''} <span class="items">${esc(q.items)}</span></label>`;
      if (q.input === 'choice') {
        return `<div class="question" role="group" aria-label="${esc(q.label)}"><label>${esc(q.label)} <span class="items">${esc(q.items)}</span></label><div class="choices">${q.choices.map((c) => `<label><input type="radio" name="${id}" data-key="${esc(q.key)}" value="${esc(c.value)}"${now === c.value ? ' checked' : ''}> ${esc(c.label)}</label>`).join('')}</div></div>`;
      }
      const type = q.input === 'number' ? 'number" min="1" step="1' : 'text';
      return `<div class="question">${head}<input id="${id}" type="${type}" data-key="${esc(q.key)}" value="${esc(now)}" placeholder="${esc(q.placeholder || '')}"></div>`;
    };
    $('questions-list').innerHTML = asks.map(field).join('')
      + checks.map((q) => `<div class="warn"><strong>${esc(q.label)}</strong><p>${esc(q.prompt)}</p></div>`).join('');
  }

  $('questions-list').addEventListener('input', (event) => {
    const key = event.target.dataset && event.target.dataset.key;
    if (key) state.answers[key] = event.target.value;
  });
  $('questions-list').addEventListener('change', (event) => {
    const key = event.target.dataset && event.target.dataset.key;
    if (key) state.answers[key] = event.target.value;
  });

  // ---- The drawing ----
  function renderSheet(boxes = []) {
    const page = state.page;
    if (!page || !page.image) {
      $('sheet').innerHTML = '<p class="note">The sheet could not be shown as a picture here. The bill is still measured from it.</p>';
      return;
    }
    state.boxes = boxes;
    const decided = state.picked && state.reviews[state.picked] ? ` ${state.reviews[state.picked].state}` : '';
    const marks = boxes.map((b) => `<div class="mark${decided}" style="left:${b.left * 100}%;top:${b.top * 100}%;width:${b.width * 100}%;height:${b.height * 100}%"></div>`).join('');
    $('sheet').innerHTML = `<div class="canvas" style="width:${state.zoom * 100}%"><img src="${page.image}" alt="The drawing sheet">${marks}</div>`;
    $('zoom-level').textContent = `${Math.round(state.zoom * 100)}%`;
    $('zoom-out').disabled = state.zoom <= ZOOMS[0];
    $('zoom-in').disabled = state.zoom >= ZOOMS[ZOOMS.length - 1];
    // Bring the box into view inside the drawing only, not the whole page.
    const first = $('sheet').querySelector('.mark');
    if (first) {
      const sheet = $('sheet');
      const img = sheet.querySelector('img');
      const place = () => {
        sheet.scrollTop = Math.max(0, first.offsetTop + first.offsetHeight / 2 - sheet.clientHeight / 2);
        sheet.scrollLeft = Math.max(0, first.offsetLeft + first.offsetWidth / 2 - sheet.clientWidth / 2);
      };
      if (img.complete) place(); else img.addEventListener('load', place, { once: true });
    }
  }

  async function pick(itemRef) {
    state.picked = itemRef;
    renderBill();
    $('line-detail').innerHTML = '<p class="muted">Finding the line on the drawing…</p>';
    try {
      const { line } = await api('provenance', { method: 'POST', json: { bill: state.bill, itemRef, pageWidthPt: state.page && state.page.widthPt, pageHeightPt: state.page && state.page.heightPt } });
      renderSheet(line.boxes);
      const measures = line.measures.map((m) => `<li>${esc(m.name.replace(/_/g, ' '))}: ${esc(qty(m.value))} ${esc(m.unit)}</li>`).join('');
      const params = line.parameters.map((p) => `<li>${esc(p.name.replace(/_/g, ' '))}: ${esc(p.value)} <span class="muted">(${p.source === 'supplied' ? 'your answer' : esc(String(p.source || '').replace(/_/g, ' '))})</span></li>`).join('');
      $('line-detail').innerHTML = `<div class="note"><strong>${esc(line.itemRef)} ${esc(line.description)}</strong>
        ${line.boxes.length ? '<p>The box on the sheet is the part QuantityForge measured for this line: red to check, green accepted, dashed grey rejected, dashed blue moved.</p>' : '<p>QuantityForge did not say where this line is on the sheet.</p>'}
        ${measures ? `<p>Measured</p><ul class="plain">${measures}</ul>` : ''}
        ${params ? `<p>Taken as</p><ul class="plain">${params}</ul>` : ''}
        ${line.reasons.length ? `<p>How it was measured</p><ul class="plain">${line.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
        ${line.changes && line.changes.length ? `<p>Changes</p><ul class="plain">${line.changes.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
        ${line.clauseRef ? `<p class="muted">Measured to ${esc(line.clauseRef)}</p>` : ''}</div>${reviewPanel(itemRef)}`;
    } catch (error) {
      $('line-detail').innerHTML = `<div class="bad">${esc(error.message)}</div>`;
    }
  }

  // ---- Accept, reject or move the picked line (/api/qf/review) ----
  function reviewPanel(itemRef) {
    const l = state.view && state.view.lines.find((x) => x.itemRef === itemRef);
    if (!l) return '';
    const review = state.reviews[itemRef];
    if (review) {
      const said = review.state === 'accepted' ? 'You accepted this line.' : review.state === 'rejected' ? `You rejected this line. It was ${esc(qty(review.qty))} ${esc(l.unitLabel)}.` : `You moved this line's ${esc(qty(review.qty))} ${esc(l.unitLabel)} to ${esc(review.to)}.`;
      return `<div class="review ${esc(review.state)}"><p>${said}</p><button type="button" class="light" data-review="reset">${review.state === 'accepted' ? 'Undo accept' : 'Undo'}</button></div>`;
    }
    const others = state.bill.lines.filter((x) => x.item_ref !== itemRef && x.unit === l.unit);
    const move = others.length
      ? `<label>Move to <select id="review-to">${others.map((x) => `<option value="${esc(x.item_ref)}">${esc(x.item_ref)} ${esc(x.description)}</option>`).join('')}</select></label><button type="button" class="light" data-review="reclassify">Move</button>`
      : '<p class="muted">No other line in the same unit to move it to.</p>';
    return `<div class="review"><p><strong>Is this line right?</strong></p>
      <button type="button" data-review="accept">Accept</button>
      <label>Reason (optional) <input id="review-reason" maxlength="160" placeholder="For example counted on another sheet"></label>
      <button type="button" class="light" data-review="reject">Reject</button>
      <div class="move">${move}</div></div>`;
  }
  $('line-detail').addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-review]');
    if (!button || !state.picked) return;
    const action = button.dataset.review;
    const itemRef = state.picked;
    const json = { bill: state.bill, reviews: state.reviews, itemRef, action, profile: state.profile };
    if (action === 'reject') json.reason = ($('review-reason') && $('review-reason').value) || '';
    if (action === 'reclassify') json.toRef = $('review-to') && $('review-to').value;
    button.disabled = true;
    try {
      take(await api('review', { method: 'POST', json }));
      message('');
      await pick(itemRef);
    } catch (error) {
      message(esc(error.message));
      button.disabled = false;
    }
  });

  // ---- The bill ----
  function renderBill() {
    const v = state.view;
    if (!v) return;
    if (!v.lines.length) {
      $('bill').innerHTML = '<p class="note">No lines billed yet. Answer the questions above and measure again.</p>';
    } else {
      const rows = v.lines.map((l) => `<tr class="line${state.picked === l.itemRef ? ' picked' : ''}${l.review ? ` ${esc(l.review.state)}` : ''}" data-ref="${esc(l.itemRef)}">
        <td class="ref">${esc(l.itemRef)}</td>
        <td>${esc(l.description)}${l.flags.map((f) => `<span class="flag">${esc(f)}</span>`).join('')}</td>
        <td class="num"><input type="number" min="0" step="any" value="${esc(l.qty)}" data-ref="${esc(l.itemRef)}" data-kind="quantity" aria-label="Quantity for ${esc(l.itemRef)}"${l.review && l.review.state !== 'accepted' ? ' disabled title="Reset the line to change its quantity"' : ''}></td>
        <td class="unit">${esc(l.unitLabel)}</td>
        <td class="num"><input type="number" min="0" step="0.01" value="${l.rate === null ? '' : esc(l.rate)}" data-ref="${esc(l.itemRef)}" data-kind="rate" placeholder="$" aria-label="Rate for ${esc(l.itemRef)}"></td>
        <td class="num">${esc(money(l.amount))}</td></tr>`).join('');
      const total = v.lines.some((l) => l.rate !== null) ? `<tr class="total"><td colspan="5">Total of priced lines (${esc(v.currency)}, excluding GST)</td><td class="num">${esc(money(v.total))}</td></tr>` : '';
      $('bill').innerHTML = `<table><thead><tr><th>Item</th><th>Description</th><th class="num">Quantity</th><th>Unit</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead><tbody>${rows}${total}</tbody></table>`;
    }
    const extras = [];
    if (v.warnings.length) extras.push(`<div class="warn"><strong>Check</strong><ul class="plain">${v.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>`);
    if (v.heldBackGroups.length) extras.push(`<div class="note"><strong>Found but not billed yet</strong><p>${esc(v.heldBackGroups.map((g) => (g.count > 1 ? `${g.label} (${g.count})` : g.label)).join(', '))}</p></div>`);
    if (v.notes.length) extras.push(`<div class="note"><strong>Notes</strong><ul class="plain">${v.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>`);
    $('extras').innerHTML = extras.join('');
    $('qf-trade').value = state.profile;
  }

  $('bill').addEventListener('click', (event) => {
    if (event.target.closest('input')) return;
    const row = event.target.closest('tr.line');
    if (row) pick(row.dataset.ref);
  });

  async function change(input) {
    const itemRef = input.dataset.ref;
    const kind = input.dataset.kind;
    const value = input.value.trim();
    try {
      const data = kind === 'quantity'
        ? await api('override', { method: 'POST', json: { bill: state.bill, itemRef, quantity: value === '' ? null : Number(value), reason: 'Changed on the QuantityForge tab', profile: state.profile, reviews: state.reviews } })
        : await api('rate', { method: 'POST', json: { bill: state.bill, itemRef, rate: value === '' ? null : Number(value), profile: state.profile, reviews: state.reviews } });
      take(data);
      message('');
    } catch (error) {
      message(esc(error.message));
      renderBill();
    }
  }
  $('bill').addEventListener('change', (event) => {
    if (event.target.matches('input[data-kind]')) change(event.target);
  });

  $('qf-trade').addEventListener('change', async () => {
    state.profile = $('qf-trade').value;
    if (!state.bill) return;
    try { take(await api('profile', { method: 'POST', json: { bill: state.bill, profile: state.profile, reviews: state.reviews } })); } catch (error) { message(esc(error.message)); }
  });

  // Zoom keeps the middle of what is in view in the middle.
  function zoomTo(next) {
    const sheet = $('sheet');
    const cx = (sheet.scrollLeft + sheet.clientWidth / 2) / (sheet.scrollWidth || 1);
    const cy = (sheet.scrollTop + sheet.clientHeight / 2) / (sheet.scrollHeight || 1);
    state.zoom = next;
    const keep = state.boxes || [];
    const canvas = sheet.querySelector('.canvas');
    if (canvas) canvas.style.width = `${next * 100}%`;
    else renderSheet(keep);
    $('zoom-level').textContent = `${Math.round(next * 100)}%`;
    $('zoom-out').disabled = next <= ZOOMS[0];
    $('zoom-in').disabled = next >= ZOOMS[ZOOMS.length - 1];
    sheet.scrollLeft = cx * sheet.scrollWidth - sheet.clientWidth / 2;
    sheet.scrollTop = cy * sheet.scrollHeight - sheet.clientHeight / 2;
    remember();
  }
  $('zoom-in').addEventListener('click', () => zoomTo(ZOOMS.find((z) => z > state.zoom) || state.zoom));
  $('zoom-out').addEventListener('click', () => zoomTo([...ZOOMS].reverse().find((z) => z < state.zoom) || state.zoom));
  $('zoom-fit').addEventListener('click', () => zoomTo(1));

  // The bill as a CSV file, for the trade picked.
  $('qf-export').addEventListener('click', async () => {
    if (!state.bill) return;
    $('qf-export').disabled = true;
    try {
      const response = await fetch('/api/qf/export.csv', {
        method: 'POST',
        headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ bill: state.bill, profile: state.profile, sheet: `${state.name} page ${state.pageNo}` }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'The file could not be made. Try again.');
      const blob = await response.blob();
      const name = (/filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '') || [])[1] || 'quantities.csv';
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    } catch (error) {
      message(esc(error.message));
    } finally {
      $('qf-export').disabled = false;
    }
  });

  $('sheet-form').addEventListener('submit', (event) => { event.preventDefault(); measure(); });
  $('questions').addEventListener('submit', (event) => { event.preventDefault(); measure({ again: true }); });

  // ---- Start ----
  (async () => {
    try {
      const status = await fetch('/api/qf/status').then((r) => r.json());
      if (!status.enabled) return show('off');
      if (!session) return show('signin');
      const { profiles } = await api('profiles');
      $('qf-trade').innerHTML = profiles.map((p) => `<option value="${esc(p.id)}">${esc(p.label)}</option>`).join('');
      show('tab');
    } catch (error) {
      if (error.status === 401) return show('signin');
      $('view-loading').innerHTML = `<div class="bad">${esc(error.message || 'The tab could not load. Try again.')}</div>`;
    }
  })();
})();
