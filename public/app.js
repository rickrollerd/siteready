// The web page calls the server it was loaded from. The native app sets
// <meta name="siteready-api"> to the server address.
const API_BASE = (document.querySelector('meta[name="siteready-api"]')?.content || '').replace(/\/+$/, '');
const api = (route) => `${API_BASE}${route}`;

const statesEl = document.getElementById('states');
const factsForm = document.getElementById('facts');
const resultEl = document.getElementById('result');
let questions = null;

function esc(value) {
  return String(value || '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}

function payload() {
  const state = document.querySelector('input[name="state"]:checked');
  const facts = {};
  const site = {};
  document.querySelectorAll('[data-fact]').forEach((el) => { facts[el.dataset.fact] = el.value.trim(); });
  document.querySelectorAll('[data-site]').forEach((el) => { site[el.dataset.site] = el.value.trim(); });
  const value = (id) => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };
  return {
    state: state ? state.value : '',
    fallRisk: (document.querySelector('input[name="fallRisk"]:checked') || {}).value || '',
    task: value('task'),
    company: value('company'),
    workplace: value('workplace'),
    principalContractor: value('principal'),
    siteManager: value('site-manager'),
    scaffoldSupervisor: value('scaffold-supervisor'),
    hospital: value('hospital'),
    firstAider: value('first-aider'),
    musterPoint: value('muster-point'),
    date: value('draft-date'),
    facts,
    site,
  };
}

async function loadStates() {
  const response = await fetch(api('/api/states'));
  const data = await response.json();
  statesEl.innerHTML = data.states.map((state) => `
    <li>
      <label class="state${state.loaded ? '' : ' disabled'}">
        <input type="radio" name="state" value="${esc(state.id)}" ${state.loaded ? '' : 'disabled'}>
        <span>${esc(state.name)}</span>
        <span class="tag">${state.loaded ? `${esc(state.compilation)} compilation` : 'Legislation not loaded'}</span>
      </label>
    </li>
  `).join('');
  document.getElementById('fall-explanation').textContent = data.fallExplanation || '';
  const first = statesEl.querySelector('input:not(:disabled)');
  if (first) first.checked = true;
}

document.getElementById('start').addEventListener('submit', async (event) => {
  event.preventDefault();
  document.getElementById('start-error').textContent = '';
  resultEl.classList.add('hidden');
  const response = await fetch(api('/api/draft/questions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload()),
  });
  const data = await response.json();
  if (!response.ok) {
    document.getElementById('start-error').textContent = data.message || 'That state is not available.';
    return;
  }
  questions = data;
  const warning = document.getElementById('fall-warning');
  warning.textContent = (data.fall && data.fall.warning) || '';
  warning.classList.toggle('hidden', !warning.textContent);
  const required = data.required || [];
  document.getElementById('required-block').innerHTML = required.length
    ? `<p class="lede" style="margin-bottom:12px">If a required fact is blank, the task is stood down. A method is not written.</p>` + required.map((item) => {
      const extra = item.prompt && item.prompt.replace(/\.$/, '') !== item.label
        ? `<span class="hint">${esc(item.prompt)}</span>` : '';
      return `
      <div class="field">
        <label for="fact-${esc(item.id)}">${esc(item.label)}${extra}</label>
        <textarea id="fact-${esc(item.id)}" data-fact="${esc(item.id)}"></textarea>
      </div>`;
    }).join('')
    : '<p class="lede">No further fact is required for this task.</p>';
  document.getElementById('site-block').innerHTML = (data.site || []).map((item) => `
    <div class="field">
      <label for="site-${esc(item.id)}">${esc(item.label)}</label>
      <textarea id="site-${esc(item.id)}" data-site="${esc(item.id)}"></textarea>
    </div>
  `).join('');
  factsForm.classList.remove('hidden');
  factsForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// A No shows what a fall from height is, in case the question was not clear.
document.querySelectorAll('input[name="fallRisk"]').forEach((input) => {
  input.addEventListener('change', () => {
    const no = document.querySelector('input[name="fallRisk"]:checked')?.value === 'no';
    document.getElementById('fall-explanation').classList.toggle('hidden', !no);
  });
});

document.getElementById('back').addEventListener('click', () => {
  factsForm.classList.add('hidden');
  resultEl.classList.add('hidden');
});

function render(draft) {
  const row = (label, value) => (value ? `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>` : '');
  const head = `
    <h3>Safe work method statement</h3>
    <p class="meta">${esc(draft.instrument)} · ${esc(draft.compilation)} compilation · section ${esc(draft.section)}</p>
    <p class="status">${esc(draft.status || 'Not approved. Not signed.')}</p>
    <table>
      <tbody>
        <tr><th>State</th><td>${esc(draft.state)}</td></tr>
        ${row('Principal contractor', draft.principalContractor)}
        <tr><th>Subcontractor</th><td>${esc(draft.subcontractor)}</td></tr>
        <tr><th>Workplace</th><td>${esc(draft.workplace)}</td></tr>
        ${row('Site manager', draft.siteManager)}
        ${row('Scaffold supervisor', draft.scaffoldSupervisor)}
        ${row('Hospital', draft.hospital)}
        ${row('First aider', draft.firstAider)}
        ${row('Muster point', draft.musterPoint)}
        <tr><th>Task</th><td>${esc(draft.task)}</td></tr>
        ${row('Fall of more than 2 metres', draft.fallRisk)}
        <tr><th>Date</th><td>${esc(draft.date)}</td></tr>
      </tbody>
    </table>`;
  if (draft.kind === 'stand-down') {
    return `${head}
      <h4>Stood down</h4>
      <p>${esc(draft.statement)}</p>
      <p><strong>Missing</strong></p>
      <ul>${draft.missing.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
      <p>No method is included.</p>`;
  }
  const risks = draft.highRisk.length
    ? `<ul>${draft.highRisk.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`
    : '<p>This task is not identified as high risk construction work.</p>';
  const hazards = draft.hazards.length
    ? `<table><thead><tr><th>Hazard</th><th>Risk</th></tr></thead><tbody>${draft.hazards.map((item) => `<tr><td>${esc(item.hazard)}</td><td>${esc(item.risk)}</td></tr>`).join('')}</tbody></table>`
    : '<p>None stated for this task.</p>';
  const controls = `<table><thead><tr><th>Hierarchy</th><th>Control</th></tr></thead><tbody>${draft.controls.map((item) => `<tr><td>${esc(item.level)}</td><td>${esc(item.text)}</td></tr>`).join('')}</tbody></table>`;
  const site = draft.site.map((field) => `<p><strong>${esc(field.label)}</strong></p><div class="blank">${esc(field.text)}</div>`).join('');
  const method = `<ol>${draft.method.map((step) => `<li>${esc(step)}</li>`).join('')}</ol>`;
  return `${head}
    <h4>High risk construction work</h4>${risks}
    <h4>Hazards and risks</h4>${hazards}
    <h4>Controls</h4>${controls}
    <h4>How the controls will be implemented, monitored and reviewed</h4>
    <p>${esc(draft.review)}</p>
    <h4>Site-specific</h4>${site}
    <h4>Method</h4>${method}
    <h4>Workers</h4>
    <div class="sign"><div>Name</div><div>Signature</div><div>Date</div></div>
    <div class="sign"><div></div><div></div><div></div></div>`;
}

factsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.getElementById('prepare');
  button.disabled = true;
  document.getElementById('facts-error').textContent = '';
  try {
    const body = JSON.stringify(payload());
    const response = await fetch(api('/api/draft'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'The statement could not be prepared.');
    resultEl.innerHTML = `<div class="sheet">${render(data)}</div>
      <div class="actions" style="margin-top:12px">
        <button type="button" id="download">Download Word</button>
      </div>`;
    resultEl.classList.remove('hidden');
    document.getElementById('download').addEventListener('click', () => downloadDocx(body, data.kind));
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    document.getElementById('facts-error').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

async function downloadDocx(body, kind) {
  const response = await fetch(api('/api/draft.docx'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (!response.ok) {
    document.getElementById('facts-error').textContent = 'The Word file could not be prepared.';
    return;
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = kind === 'stand-down' ? 'SiteReady-stood-down.docx' : 'SiteReady.docx';
  link.click();
  URL.revokeObjectURL(url);
}

loadStates().catch(() => {
  document.getElementById('start-error').textContent = 'The state list could not be loaded.';
});
