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

  const state = { file: null, sentKey: '', page: null, bill: null, view: null, questions: [], answers: {}, profile: 'all', picked: '' };
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
  async function measure() {
    const file = $('qf-file').files[0];
    if (!file) return message('Choose the PDF of the sheet to measure.');
    const page = Math.max(1, Math.floor(Number($('qf-page').value) || 1));
    const key = `${file.name}|${file.size}|${file.lastModified}|${page}`;
    const query = new URLSearchParams({ page: String(page), sheetType: $('qf-type').value, profile: state.profile });
    if ($('qf-scale').value) query.set('scale', String(Math.floor(Number($('qf-scale').value))));
    // A new sheet or page also needs its picture; answers for another sheet do not apply to it.
    if (key !== state.sentKey) { query.set('image', '1'); if (state.sentKey) state.answers = {}; }
    message('');
    busy(true, 'Measuring the sheet. This can take a minute.');
    try {
      const data = await api(`measure?${query}`, {
        method: 'POST',
        body: file,
        headers: { 'Content-Type': 'application/pdf', 'X-QF-Answers': encodeURIComponent(JSON.stringify(state.answers)) },
      });
      if (data.page !== undefined) state.page = data.page;
      state.sentKey = key;
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
    renderQuestions();
    renderSheet();
    renderBill();
    $('result').classList.remove('hidden');
  }

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
    const marks = boxes.map((b) => `<div class="mark" style="left:${b.left * 100}%;top:${b.top * 100}%;width:${b.width * 100}%;height:${b.height * 100}%"></div>`).join('');
    $('sheet').innerHTML = `<img src="${page.image}" alt="The drawing sheet">${marks}`;
    // Bring the box into view inside the drawing only, not the whole page.
    const first = $('sheet').querySelector('.mark');
    if (first) {
      const sheet = $('sheet');
      const img = sheet.querySelector('img');
      const place = () => { sheet.scrollTop = Math.max(0, first.offsetTop - sheet.clientHeight / 3); };
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
        ${line.boxes.length ? '<p>The red box is the part of the sheet QuantityForge measured for this line.</p>' : '<p>QuantityForge did not say where this line is on the sheet.</p>'}
        ${measures ? `<p>Measured</p><ul class="plain">${measures}</ul>` : ''}
        ${params ? `<p>Taken as</p><ul class="plain">${params}</ul>` : ''}
        ${line.reasons.length ? `<p>How it was measured</p><ul class="plain">${line.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
        ${line.clauseRef ? `<p class="muted">Measured to ${esc(line.clauseRef)}</p>` : ''}</div>`;
    } catch (error) {
      $('line-detail').innerHTML = `<div class="bad">${esc(error.message)}</div>`;
    }
  }

  // ---- The bill ----
  function renderBill() {
    const v = state.view;
    if (!v) return;
    if (!v.lines.length) {
      $('bill').innerHTML = '<p class="note">No lines billed yet. Answer the questions above and measure again.</p>';
    } else {
      const rows = v.lines.map((l) => `<tr class="line${state.picked === l.itemRef ? ' picked' : ''}" data-ref="${esc(l.itemRef)}">
        <td class="ref">${esc(l.itemRef)}</td>
        <td>${esc(l.description)}${l.flags.map((f) => `<span class="flag">${esc(f)}</span>`).join('')}</td>
        <td class="num"><input type="number" min="0" step="any" value="${esc(l.qty)}" data-ref="${esc(l.itemRef)}" data-kind="quantity" aria-label="Quantity for ${esc(l.itemRef)}"></td>
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
        ? await api('override', { method: 'POST', json: { bill: state.bill, itemRef, quantity: value === '' ? null : Number(value), reason: 'Changed on the QuantityForge tab', profile: state.profile } })
        : await api('rate', { method: 'POST', json: { bill: state.bill, itemRef, rate: value === '' ? null : Number(value), profile: state.profile } });
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
    try { take(await api('profile', { method: 'POST', json: { bill: state.bill, profile: state.profile } })); } catch (error) { message(esc(error.message)); }
  });

  $('sheet-form').addEventListener('submit', (event) => { event.preventDefault(); measure(); });
  $('questions').addEventListener('submit', (event) => { event.preventDefault(); measure(); });

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
