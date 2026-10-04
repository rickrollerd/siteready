// The web page calls the server it was loaded from. The native app sets
// <meta name="siteready-api"> to the server address.
const API_BASE = (document.querySelector('meta[name="siteready-api"]')?.content || '').replace(/\/+$/, '');
const api = (route) => `${API_BASE}${route}`;

const statesEl = document.getElementById('states');
const factsForm = document.getElementById('facts');
const resultEl = document.getElementById('result');
let questions = null;

// The company profile is kept in this browser only. It is not sent anywhere
// until a statement is prepared, and the server does not keep it.
const PROFILE_KEY = 'siteready.profile';
const PROFILE_FIELDS = { name: 'profile-company', abn: 'profile-abn', address: 'profile-address', phone: 'profile-phone', email: 'profile-email' };
let profile = loadProfile();
let pendingLogo = profile.logo || '';

function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}

function showProfile() {
  Object.entries(PROFILE_FIELDS).forEach(([key, id]) => { document.getElementById(id).value = profile[key] || ''; });
  const preview = document.getElementById('profile-logo-preview');
  preview.src = pendingLogo || '';
  preview.classList.toggle('hidden', !pendingLogo);
  document.getElementById('profile-summary').textContent = profile.name ? `· ${profile.name}` : '';
  document.getElementById('profile').open = !profile.name;
  const company = document.getElementById('company');
  if (!company.value && profile.name) company.value = profile.name;
}

function profileStatus(text) {
  const el = document.getElementById('profile-status');
  el.textContent = text;
  el.classList.toggle('hidden', !text);
}

// The logo is redrawn at header size so it stays small enough to save and send.
function shrinkLogo(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The logo could not be read.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('The logo could not be read. Use a PNG or JPEG.'));
      image.onload = () => {
        const scale = Math.min(900 / image.width, 300 / image.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        let url = canvas.toDataURL('image/png');
        if (url.length > 500000) {
          context.globalCompositeOperation = 'destination-over';
          context.fillStyle = '#fff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          url = canvas.toDataURL('image/jpeg', 0.85);
        }
        if (url.length > 500000) reject(new Error('The logo is too large. Use a smaller image.'));
        else resolve(url);
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

document.getElementById('profile-logo').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    pendingLogo = await shrinkLogo(file);
    profileStatus('Logo ready. Save the profile to keep it.');
  } catch (error) {
    profileStatus(error.message);
  }
  const preview = document.getElementById('profile-logo-preview');
  preview.src = pendingLogo || '';
  preview.classList.toggle('hidden', !pendingLogo);
});

// The ABN looks up the business on the Australian Business Register and offers its names.
let abnLooked = '';
async function lookUpAbn() {
  const digits = document.getElementById('profile-abn').value.replace(/\D/g, '');
  const box = document.getElementById('abn-found');
  if (digits.length !== 11 || digits === abnLooked) return;
  abnLooked = digits;
  try {
    const data = await (await fetch(api(`/api/abn?abn=${digits}`))).json();
    if (!data.enabled) { box.classList.add('hidden'); return; }
    if (!data.found) { box.textContent = data.error || 'ABN not found.'; box.classList.remove('hidden'); return; }
    const names = [...new Set([...(data.businessNames || []), data.entityName].filter(Boolean))];
    const nameBox = document.getElementById('profile-company');
    if (!nameBox.value.trim() && names.length) nameBox.value = names[0];
    box.innerHTML = `<strong>${esc(data.entityName)}</strong>${data.active ? '' : ` <span class="warn">ABN ${esc(data.status || 'not active').toLowerCase()}</span>`}${data.state ? ` · ${esc(data.state)} ${esc(data.postcode)}` : ''}${names.length > 1 ? `<br>Use name: ${names.map((name) => `<button type="button" class="link" data-abn-name="${esc(name)}">${esc(name)}</button>`).join(' · ')}` : ''}`;
    box.classList.remove('hidden');
  } catch {
    box.classList.add('hidden');
  }
}
document.getElementById('profile-abn').addEventListener('change', lookUpAbn);
document.getElementById('profile-abn').addEventListener('input', () => { if (document.getElementById('profile-abn').value.replace(/\D/g, '').length === 11) lookUpAbn(); });
document.getElementById('abn-found').addEventListener('click', (event) => {
  const button = event.target.closest('[data-abn-name]');
  if (button) document.getElementById('profile-company').value = button.dataset.abnName;
});

document.getElementById('profile-save').addEventListener('click', async () => {
  const next = {};
  Object.entries(PROFILE_FIELDS).forEach(([key, id]) => { next[key] = document.getElementById(id).value.trim(); });
  if (pendingLogo) next.logo = pendingLogo;
  // Signed in, the profile is the company's and is kept on the server for the whole team.
  if (window.SiteReady && window.SiteReady.saveCompany && window.SiteReady.signedIn()) {
    try {
      window.SiteReady.lastCompanyNotice = '';
      setProfile(await window.SiteReady.saveCompany(next));
      profileStatus(window.SiteReady.lastCompanyNotice || 'Saved for your company.');
    } catch (error) {
      profileStatus(error.message);
    }
    return;
  }
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  } catch {
    profileStatus('The profile could not be saved on this device. Private browsing can stop this.');
    return;
  }
  const company = document.getElementById('company');
  if (!company.value || company.value === profile.name) company.value = next.name;
  profile = next;
  showProfile();
  profileStatus('Saved on this device.');
});

document.getElementById('profile-clear').addEventListener('click', () => {
  try { localStorage.removeItem(PROFILE_KEY); } catch { /* nothing saved */ }
  const company = document.getElementById('company');
  if (company.value === profile.name) company.value = '';
  profile = {};
  pendingLogo = '';
  document.getElementById('profile-logo').value = '';
  showProfile();
  profileStatus('Profile removed from this device.');
});

showProfile();

// Used when signed in: the saved company replaces this device's profile.
function setProfile(next) {
  const company = document.getElementById('company');
  if (!company.value || company.value === profile.name) company.value = next.name || '';
  // Signed in, the company on every SWMS is the account's own.
  if (next.name) { company.value = next.name; company.readOnly = true; company.title = 'Set from your company details.'; }
  profile = next;
  pendingLogo = next.logo || '';
  showProfile();
}

function esc(value) {
  return String(value || '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}

// Date fields hold 2026-10-01. The statement prints 1 October 2026.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function isoToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function longDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return match ? `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}` : '';
}

function isoDate(text) {
  const match = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(String(text || '').trim());
  const month = match ? MONTHS.findIndex((name) => name.toLowerCase() === match[2].toLowerCase()) : -1;
  return month >= 0 ? `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}` : '';
}

const DATE_FIELDS = new Set(['review-date', 'draft-date']);
const reviewDateEl = document.getElementById('review-date');
const draftDateEl = document.getElementById('draft-date');
draftDateEl.value = isoToday();
reviewDateEl.min = isoToday();
// The calendar opens on a click anywhere in the box, not only on its icon.
[reviewDateEl, draftDateEl].forEach((el) => el.addEventListener('click', () => {
  try { el.showPicker(); } catch { /* the browser opens its own picker */ }
}));

// Prepared by is remembered on this device. Signed in, the account name fills it.
const PREPARED_KEY = 'siteready.preparedBy';
const preparedEl = document.getElementById('prepared-by');
try { preparedEl.value = localStorage.getItem(PREPARED_KEY) || ''; } catch { /* not kept */ }
preparedEl.addEventListener('change', () => {
  try { localStorage.setItem(PREPARED_KEY, preparedEl.value.trim()); } catch { /* not kept */ }
});

// Large Australian head contractors named in published 2025-26 rankings (Hubexo
// Construction League, company revenue lists). Checked October 2026.
const BUILDERS = [
  'Acciona', 'ADCO Constructions', 'BESIX Watpac', 'BMD', 'Buildcorp', 'Built', 'CPB Contractors', 'Downer',
  'FDC Construction & Fitout', 'Fulton Hogan', 'Georgiou', 'Hansen Yuncken', 'Hickory', 'Hutchinson Builders', 'Icon',
  'John Holland', 'Kane Constructions', 'Kapitol', 'Laing O\'Rourke', 'Lendlease', 'Lipman', 'Mainbrace Constructions',
  'McConnell Dowell', 'Mirvac', 'Multiplex', 'Richard Crookes Constructions',
];

// Principal contractors used before, and those on saved sites, are suggested as you type,
// ahead of the builders list.
const PRINCIPALS_KEY = 'siteready.principals';
let principals = [];
try { principals = JSON.parse(localStorage.getItem(PRINCIPALS_KEY) || '[]'); } catch { principals = []; }
if (!Array.isArray(principals)) principals = [];

function addPrincipals(names, keep) {
  for (const name of names.map((item) => String(item || '').trim()).filter(Boolean)) {
    principals = [name, ...principals.filter((item) => item.toLowerCase() !== name.toLowerCase())];
  }
  principals = principals.slice(0, 50);
  if (keep) {
    try { localStorage.setItem(PRINCIPALS_KEY, JSON.stringify(principals)); } catch { /* not kept */ }
  }
  const known = new Set(principals.map((name) => name.toLowerCase()));
  const all = [...principals, ...BUILDERS.filter((name) => !known.has(name.toLowerCase()))];
  document.getElementById('principal-list').innerHTML = all.map((name) => `<option value="${esc(name)}"></option>`).join('');
}

function payload() {
  const state = document.querySelector('input[name="state"]:checked');
  const facts = {};
  const site = {};
  document.querySelectorAll('[data-fact]').forEach((el) => {
    if (el.type === 'radio' && !el.checked) return;
    facts[el.dataset.fact] = el.value.trim();
  });
  document.querySelectorAll('[data-site]').forEach((el) => { site[el.dataset.site] = el.value.trim(); });
  const value = (id) => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };
  return {
    state: state ? state.value : '',
    fallRisk: (document.querySelector('input[name="fallRisk"]:checked') || {}).value || '',
    residential: (document.querySelector('input[name="residential"]:checked') || {}).value || '',
    crane: (document.querySelector('input[name="crane"]:checked') || {}).value || 'company',
    task: value('task'),
    // Set when the task comes from a scope of works: its SWMS uses only that trade's job steps.
    trade: value('task-trade'),
    company: value('company'),
    companyAbn: profile.abn || '',
    companyAddress: profile.address || '',
    companyPhone: profile.phone || '',
    companyEmail: profile.email || '',
    workplace: value('workplace'),
    principalContractor: value('principal'),
    siteManager: value('site-manager'),
    scaffoldSupervisor: value('scaffold-supervisor'),
    hospital: value('hospital'),
    firstAider: value('first-aider'),
    musterPoint: value('muster-point'),
    worksManager: value('works-manager'),
    worksManagerPhone: value('works-manager-phone'),
    complianceResponsible: value('compliance-responsible'),
    reviewer: value('reviewer'),
    reviewDate: longDate(value('review-date')),
    date: longDate(value('draft-date')),
    preparedBy: value('prepared-by'),
    swmsRef: value('swms-ref'),
    ppe: document.querySelector('[data-ppe]') ? [...document.querySelectorAll('[data-ppe]:checked')].map((el) => el.value) : undefined,
    // The job steps picked, or none to use the ones SiteReady finds in the task.
    kinds: stepPicks || undefined,
    stepOrder: stepOrder || undefined,
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
        <span class="tag">${state.loaded ? esc(state.versionLabel) : 'Legislation not loaded'}</span>
      </label>
    </li>
  `).join('');
  stateList = data.states;
  const first = statesEl.querySelector('input:not(:disabled)');
  if (first) first.checked = true;
  statesEl.querySelectorAll('input').forEach((input) => input.addEventListener('change', showFallExplanation));
  showFallExplanation();
}

let stateList = [];

// The state comes from the job address: the law that applies is the law where the work is done.
const workplaceEl = document.getElementById('workplace');
const workplaceList = document.getElementById('workplace-list');
const workplaceState = document.getElementById('workplace-state');

function stateName(id) {
  const state = stateList.find((item) => item.id === id);
  return state ? state.name : '';
}

// Ticks the state the address is in, and says so. A state picked by hand that differs is flagged.
function applyAddressState() {
  const found = window.SiteReadyAddress ? window.SiteReadyAddress.stateFromAddress(workplaceEl.value) : { state: '' };
  workplaceState.classList.remove('state-warning');
  if (!found.state) {
    workplaceState.textContent = workplaceEl.value.trim() ? 'Include the state or postcode in the job address, so the right state law is used.' : '';
    return;
  }
  const radio = document.querySelector(`input[name="state"][value="${found.state}"]`);
  if (radio && !radio.disabled && !radio.checked) {
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
  }
  workplaceState.textContent = found.from === 'postcode'
    ? `State set to ${stateName(found.state)} from the postcode. Check it is right.`
    : `State set to ${stateName(found.state)} from the job address.`;
}

function checkStateMatchesAddress() {
  const found = window.SiteReadyAddress ? window.SiteReadyAddress.stateFromAddress(workplaceEl.value) : { state: '' };
  const chosen = document.querySelector('input[name="state"]:checked');
  if (found.state && chosen && chosen.value !== found.state) {
    workplaceState.textContent = `The job address is in ${stateName(found.state)}, but ${stateName(chosen.value)} is picked. The SWMS must use the law of the state where the work is done.`;
    workplaceState.classList.add('state-warning');
  } else if (found.state) {
    applyAddressState();
  }
}

// Address suggestions under an address box, from the server's address lookup.
// onPick runs after the box changes, by typing or by picking a suggestion.
// recent() gives addresses used before on this device: they are offered when the box
// is empty or matches them, ahead of the lookup's suggestions.
function addressLookup(input, list, onPick = () => {}, recent = () => []) {
  let picks = [];
  let active = -1;
  let timer = null;
  let seq = 0;
  const close = () => {
    list.classList.add('hidden');
    list.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    picks = [];
    active = -1;
  };
  const show = () => {
    if (!picks.length) return close();
    list.innerHTML = picks.map((item, i) => `<li role="option" id="${list.id}-${i}" aria-selected="${i === active}" data-i="${i}">${esc(item.text)}${item.used ? ' <span class="meta">(used before)</span>' : ''}</li>`).join('');
    list.classList.remove('hidden');
    input.setAttribute('aria-expanded', 'true');
  };
  const choose = (i) => {
    const item = picks[i];
    if (!item) return;
    input.value = item.text;
    close();
    onPick();
  };
  const usedBefore = (text) => {
    const words = text.toLowerCase().split(/[\s,]+/).filter(Boolean);
    return recent().filter((address) => words.every((word) => address.toLowerCase().includes(word))).slice(0, 5).map((address) => ({ text: address, used: true }));
  };
  const showUsed = () => {
    picks = usedBefore(input.value.trim());
    active = -1;
    show();
  };
  const lookUp = async (text) => {
    const mine = ++seq;
    try {
      const response = await fetch(api(`/api/address?q=${encodeURIComponent(text)}`));
      if (!response.ok) return;
      const data = await response.json();
      // Only the latest lookup is shown.
      if (mine !== seq || input.value !== text) return;
      const used = usedBefore(text.trim());
      const seen = new Set(used.map((item) => item.text.toLowerCase()));
      picks = [...used, ...(data.suggestions || []).filter((item) => !seen.has(item.text.toLowerCase()))];
      active = -1;
      show();
    } catch {
      // Without suggestions the address is typed in full.
    }
  };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    onPick();
    const text = input.value.trim();
    if (text.length < 3) return showUsed();
    showUsed();
    timer = setTimeout(() => lookUp(input.value), 300);
  });
  input.addEventListener('focus', () => { if (input.value.trim().length < 3) showUsed(); });
  input.addEventListener('keydown', (event) => {
    if (list.classList.contains('hidden')) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      active = (active + step + picks.length) % picks.length;
      show();
      input.setAttribute('aria-activedescendant', `${list.id}-${active}`);
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      choose(active);
    } else if (event.key === 'Escape') {
      close();
    }
  });
  // mousedown, not click, so the choice lands before the field loses focus.
  list.addEventListener('mousedown', (event) => {
    const li = event.target.closest('li[data-i]');
    if (!li) return;
    event.preventDefault();
    choose(Number(li.dataset.i));
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
}

addressLookup(workplaceEl, workplaceList, applyAddressState, () => readMemory().workplace || []);
const profileAddressEl = document.getElementById('profile-address');
if (profileAddressEl) addressLookup(profileAddressEl, document.getElementById('profile-address-list'));
statesEl.addEventListener('change', checkStateMatchesAddress);

// A No shows what a fall from height is, in the chosen state's law, in case the question was not clear.
function showFallExplanation() {
  const chosen = document.querySelector('input[name="state"]:checked');
  const state = stateList.find((item) => chosen && item.id === chosen.value);
  // The Northern Territory asks whether the work is residential, which sets the fall height.
  const asksResidential = Boolean(state && state.residentialFallMetres);
  document.getElementById('residential-question').classList.toggle('hidden', !asksResidential);
  document.getElementById('residential-legend').textContent = (state && state.residentialQuestion) || '';
  document.querySelectorAll('input[name="residential"]').forEach((input) => { input.required = asksResidential; });
  const residential = asksResidential && document.querySelector('input[name="residential"]:checked')?.value === 'yes';
  document.getElementById('fall-metres').textContent = residential ? String(state.residentialFallMetres) : '2';
  const el = document.getElementById('fall-explanation');
  el.textContent = (state && (residential && state.residentialFallExplanation ? state.residentialFallExplanation : state.fallExplanation)) || '';
  const no = document.querySelector('input[name="fallRisk"]:checked')?.value === 'no';
  el.classList.toggle('hidden', !no || !el.textContent);
}

document.getElementById('start').addEventListener('submit', (event) => {
  event.preventDefault();
  // The state always follows the job address.
  applyAddressState();
  // A new task starts from the steps found in it, or the steps the scope reader found for it.
  const scope = window.siteReadyScopeTask;
  stepPicks = scope && scope.task === document.getElementById('task').value.trim() && Array.isArray(scope.kinds) ? [...scope.kinds] : null;
  loadQuestions();
});

// Job steps: null follows the steps SiteReady finds in the task; a list is the user's own picks.
let stepPicks = null;
// The job steps in the order the user put them in the preview, by name.
let stepOrder = null;
let stepLibrary = { groups: [] };
const stepById = new Map();

async function loadStepLibrary() {
  try {
    const response = await fetch(api('/api/steps'));
    if (!response.ok) return;
    stepLibrary = await response.json();
    stepLibrary.groups.forEach((group) => group.kinds.forEach((kind) => { if (!stepById.has(kind.id)) stepById.set(kind.id, kind); }));
    fillStepAdd();
  } catch {
    // Without the library the found steps can still be ticked and unticked.
  }
}

// Steps found by the server search: words matched anywhere in a step, with site synonyms.
let stepSearchIds = null;
let stepSearchSeq = 0;

function fillStepAdd() {
  const search = document.getElementById('step-search').value.trim().toLowerCase();
  const shown = new Set(stepPicks || (questions && questions.steps ? questions.steps.chosen : []));
  const select = document.getElementById('step-add');
  if (search && stepSearchIds) {
    // Best matches first, as one list.
    const kinds = stepSearchIds.filter((id) => !shown.has(id)).map((id) => stepById.get(id)).filter(Boolean);
    select.innerHTML = kinds.length
      ? `<option value="">${kinds.length} step${kinds.length === 1 ? '' : 's'} found. Choose one to add</option>${kinds.map((kind) => `<option value="${esc(kind.id)}">${esc(kind.label)}</option>`).join('')}`
      : '<option value="">No steps found. Try another word</option>';
    return;
  }
  const match = (kind) => !search || `${kind.label} ${kind.steps.join(' ')}`.toLowerCase().includes(search);
  select.innerHTML = '<option value="">Choose a step to add</option>' + stepLibrary.groups.map((group) => {
    const kinds = group.kinds.filter((kind) => !shown.has(kind.id) && match(kind));
    return kinds.length ? `<optgroup label="${esc(group.trade)}">${kinds.map((kind) => `<option value="${esc(kind.id)}">${esc(kind.label)}</option>`).join('')}</optgroup>` : '';
  }).join('');
}

let stepSearchTimer = null;
function searchStepsLater() {
  clearTimeout(stepSearchTimer);
  const search = document.getElementById('step-search').value.trim();
  if (search.length < 2) { stepSearchIds = null; fillStepAdd(); return; }
  fillStepAdd();
  stepSearchTimer = setTimeout(async () => {
    const seq = ++stepSearchSeq;
    try {
      const response = await fetch(api(`/api/steps/search?q=${encodeURIComponent(search)}`));
      const data = await response.json();
      if (seq !== stepSearchSeq) return;
      stepSearchIds = data.ids || [];
    } catch {
      stepSearchIds = null;
    }
    fillStepAdd();
  }, 200);
}

function renderSteps(steps) {
  const chosen = new Set(steps.chosen || []);
  const locked = new Set(steps.locked || []);
  // Suggested steps keep their place when unticked; added steps follow them.
  const ids = [...new Set([...(steps.suggested || []), ...(stepPicks || []), ...(steps.chosen || [])])];
  document.getElementById('steps-block').innerHTML = ids.length ? ids.map((id) => {
    const kind = stepById.get(id) || { label: id, steps: [] };
    const others = kind.steps.filter((name) => name !== kind.label);
    const names = others.length ? `<span class="step-names">${esc(others.join('; '))}</span>` : '';
    const off = locked.has(id) && !chosen.has(id);
    const warning = off ? `<span class="step-warning">${esc(REMOVED_WARNINGS[id] || 'The task calls for this step. Make sure this risk is covered another way before work starts.')}</span>` : '';
    return `<li><label><input type="checkbox" data-step value="${esc(id)}"${chosen.has(id) ? ' checked' : ''}><span>${esc(kind.label)}${locked.has(id) ? '<span class="tag">Recommended</span>' : ''}${names}${warning}</span></label></li>`;
  }).join('') : '<li>No job steps were found in the task. Add the steps for the work below.</li>';
  fillStepAdd();
}

// Shown when a step the task's words call for is taken off.
const REMOVED_WARNINGS = {
  road: 'The task mentions a road or street. Make sure traffic is managed before work starts, for example under the principal contractor\'s traffic management plan.',
  asbestosCheck: 'The work could disturb asbestos. Make sure asbestos is identified before work starts.',
  asbestos: 'The task involves asbestos. It must be removed under the asbestos rules, by a licensed removalist where required.',
  isolation: 'The work needs power or plant isolated. Make sure it is isolated and proved before work starts.',
  confined: 'The task mentions a confined space. Entry needs its own controls and permit.',
  water: 'The work is near water. Make sure drowning risks are controlled.',
  power: 'The work is near power lines. Make sure approach distances are kept.',
  propping: 'The work needs temporary support. Make sure the structure is propped before it is cut or loaded.',
  trench: 'The work involves a trench. Make sure the trench is supported or kept shallow before anyone enters it.',
};

// Changing the steps asks the questions again, keeping what has been filled in.
async function refreshSteps() {
  const kept = {};
  document.querySelectorAll('[data-fact]').forEach((el) => {
    if (el.type === 'radio') { if (el.checked) kept[el.dataset.fact] = el.value; } else kept[el.dataset.fact] = el.value;
  });
  const site = {};
  document.querySelectorAll('[data-site]').forEach((el) => { site[el.dataset.site] = el.value; });
  const ppe = new Set([...document.querySelectorAll('[data-ppe]:checked')].map((el) => el.value));
  if (!(await loadQuestions({ stay: true }))) return;
  document.querySelectorAll('[data-fact]').forEach((el) => {
    const value = kept[el.dataset.fact];
    if (value === undefined) return;
    if (el.type === 'radio') el.checked = el.value === value;
    else el.value = value;
  });
  document.querySelectorAll('[data-site]').forEach((el) => { if (site[el.dataset.site] !== undefined) el.value = site[el.dataset.site]; });
  (questions && questions.required || []).forEach((item) => markPicks(item.id));
  // PPE the user ticked or unticked stays as they set it; the rest follows the new suggestion.
  document.querySelectorAll('[data-ppe]').forEach((el) => { if (ppeTouched.has(el.value)) el.checked = ppe.has(el.value); else if (ppe.has(el.value)) el.checked = true; });
}

// Ticking a harness or life jacket asks about it; unticking one takes the question away.
const ppeTouched = new Set();
document.getElementById('ppe-block').addEventListener('change', (event) => {
  if (event.target.matches('[data-ppe]')) ppeTouched.add(event.target.value);
  if (event.target.matches('[data-ppe][value="harness"], [data-ppe][value="lifeJacket"]')) refreshSteps();
});

document.getElementById('steps-block').addEventListener('change', (event) => {
  if (!event.target.matches('[data-step]')) return;
  stepPicks = [...document.querySelectorAll('[data-step]:checked')].map((el) => el.value);
  refreshSteps();
});

document.getElementById('step-add').addEventListener('change', (event) => {
  const id = event.target.value;
  if (!id) return;
  const current = stepPicks || [...document.querySelectorAll('[data-step]:checked')].map((el) => el.value);
  stepPicks = [...new Set([...current, id])];
  document.getElementById('step-search').value = '';
  stepSearchIds = null;
  refreshSteps();
});

document.getElementById('step-search').addEventListener('input', searchStepsLater);

document.getElementById('steps-reset').addEventListener('click', () => {
  stepPicks = null;
  refreshSteps();
});

loadStepLibrary();

async function loadQuestions(options = {}) {
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
    return false;
  }
  questions = data;
  // Spelling SiteReady fixed in the task, shown so the user can check it.
  const note = document.getElementById('spelling-note');
  const fixes = data.spellingFixes || [];
  note.textContent = fixes.length ? `Spelling fixed in the SWMS: ${fixes.map((fix) => `${fix.from} to ${fix.to}`).join(', ')}.` : '';
  note.classList.toggle('hidden', !fixes.length);
  const warning = document.getElementById('fall-warning');
  warning.textContent = (data.fall && data.fall.warning) || '';
  warning.classList.toggle('hidden', !warning.textContent);
  const required = data.required || [];
  document.getElementById('required-block').innerHTML = required.length
    ? `<p class="lede" style="margin-bottom:12px">If a required fact is blank, the task is stood down. A method is not written.</p>` + required.map((item) => {
      const extra = item.prompt && item.prompt.replace(/\.$/, '') !== item.label
        ? `<span class="hint">${esc(item.prompt)}</span>` : '';
      if (item.choices) {
        return `
      <fieldset class="field choice">
        <legend>${esc(item.label)}</legend>
        ${item.choices.map((choice) => `<label style="display:flex;margin:0 0 8px"><input type="radio" name="fact-${esc(item.id)}" data-fact="${esc(item.id)}" value="${esc(choice.value)}"> ${esc(choice.label)}</label>`).join('')}
      </fieldset>`;
      }
      const picks = (item.suggestions || []).length
        ? `<div class="picks"><span class="picks-label">Standard answers:</span>${item.suggestions.map((pick, index) => `<button type="button" class="pick-button" data-pick-for="${esc(item.id)}" data-pick="${index}">${esc(pick.label)}</button>`).join('')}</div>`
        : '';
      return `
      <div class="field">
        <label for="fact-${esc(item.id)}">${esc(item.label)}${extra}</label>
        ${picks}
        <textarea id="fact-${esc(item.id)}" data-fact="${esc(item.id)}" spellcheck="true" autocorrect="on" autocapitalize="sentences"></textarea>
      </div>`;
    }).join('')
    : '<p class="lede">No further fact is required for this task.</p>';
  document.getElementById('ppe-block').innerHTML = (data.ppe || []).map((group) => `
    <fieldset class="ppe-group">
      <legend>${esc(group.area)}</legend>
      ${group.items.map((item) => `<label><input type="checkbox" data-ppe value="${esc(item.id)}"${item.ticked ? ' checked' : ''}> ${esc(item.label)}</label>`).join('')}
    </fieldset>
  `).join('');
  document.getElementById('site-block').innerHTML = (data.site || []).map((item) => `
    <div class="field">
      <label for="site-${esc(item.id)}">${esc(item.label)}${item.hint ? `<span class="hint">${esc(item.hint)}</span>` : ''}</label>
      ${lastUsed(`site-${item.id}`) ? `<button type="button" class="pick-button" data-same-as-last="site-${esc(item.id)}">Same as last SWMS</button>` : ''}
      <textarea id="site-${esc(item.id)}" data-site="${esc(item.id)}" spellcheck="true" autocorrect="on" autocapitalize="sentences"></textarea>
    </div>
  `).join('');
  renderSteps(data.steps || { suggested: [], chosen: [], locked: [] });
  factsForm.classList.remove('hidden');
  if (!options.stay) factsForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}

// Puts a saved SWMS back into the form, so it can be changed and saved again.
const FORM_FIELDS = {
  principalContractor: 'principal', company: 'company', workplace: 'workplace', siteManager: 'site-manager',
  worksManager: 'works-manager', worksManagerPhone: 'works-manager-phone', complianceResponsible: 'compliance-responsible',
  reviewer: 'reviewer', reviewDate: 'review-date', scaffoldSupervisor: 'scaffold-supervisor', hospital: 'hospital',
  firstAider: 'first-aider', musterPoint: 'muster-point', date: 'draft-date', preparedBy: 'prepared-by', swmsRef: 'swms-ref', task: 'task', trade: 'task-trade',
};

function fillFields(values) {
  Object.entries(FORM_FIELDS).forEach(([key, id]) => {
    if (values[key] === undefined) return;
    const el = document.getElementById(id);
    if (DATE_FIELDS.has(id)) el.value = isoDate(values[key]) || (id === 'draft-date' ? isoToday() : '');
    else el.value = values[key] || '';
  });
  applyAddressState();
}

async function fillForm(input) {
  const pick = (name, value) => {
    const el = value && document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (el) el.checked = true;
  };
  pick('state', input.state);
  pick('residential', input.residential);
  pick('crane', input.crane || 'company');
  pick('fallRisk', input.fallRisk);
  fillFields(input);
  document.getElementById('task-trade').value = input.trade || '';
  stepPicks = Array.isArray(input.kinds) ? [...input.kinds] : null;
  stepOrder = Array.isArray(input.stepOrder) ? [...input.stepOrder] : null;
  showFallExplanation();
  if (!(await loadQuestions())) return;
  document.querySelectorAll('[data-fact]').forEach((el) => {
    const value = (input.facts || {})[el.dataset.fact] || '';
    if (el.type === 'radio') el.checked = el.value === value;
    else el.value = value;
  });
  document.querySelectorAll('[data-site]').forEach((el) => { el.value = (input.site || {})[el.dataset.site] || ''; });
  (questions && questions.required || []).forEach((item) => markPicks(item.id));
  if (Array.isArray(input.ppe)) document.querySelectorAll('[data-ppe]').forEach((el) => { el.checked = input.ppe.includes(el.value); });
}

// Testing live equipment needs arc-rated clothing and insulated gloves (Model Code s 9.5).
factsForm.addEventListener('change', (event) => {
  if (event.target.dataset.fact !== 'energisedWork' || event.target.value !== 'testing') return;
  document.querySelectorAll('[data-ppe]').forEach((el) => { if (['arcRated', 'gloveInsulated'].includes(el.value)) el.checked = true; });
});

// A standard answer's wording as a pattern: blanks (____) match whatever was filled in.
function pickPattern(text) {
  const parts = String(text).split('____').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(parts.join('[^]*?'));
}

// Highlights the standard answers whose wording is in the box.
function markPicks(id) {
  const item = (questions && questions.required || []).find((entry) => entry.id === id);
  const box = document.getElementById(`fact-${id}`);
  if (!item || !box) return;
  document.querySelectorAll(`[data-pick-for="${id}"]`).forEach((button) => {
    const pick = (item.suggestions || [])[Number(button.dataset.pick)];
    button.setAttribute('aria-pressed', String(Boolean(pick && pickPattern(pick.text).test(box.value))));
  });
}

// A standard answer is added to the box, where it can be changed. Blanks (____) are left to fill in.
// Clicking it again takes its wording back out.
document.getElementById('required-block').addEventListener('click', (event) => {
  const button = event.target.closest('[data-pick-for]');
  if (!button || !questions) return;
  const item = (questions.required || []).find((entry) => entry.id === button.dataset.pickFor);
  const pick = item && (item.suggestions || [])[Number(button.dataset.pick)];
  if (!pick) return;
  const box = document.getElementById(`fact-${item.id}`);
  const pattern = pickPattern(pick.text);
  if (pattern.test(box.value)) {
    box.value = box.value.replace(pattern, '').replace(/\s{2,}/g, ' ').trim();
    markPicks(item.id);
    box.focus();
    return;
  }
  box.value = box.value.trim() ? `${box.value.trim()} ${pick.text}` : pick.text;
  markPicks(item.id);
  box.focus();
  const blank = box.value.indexOf('____');
  if (blank >= 0) box.setSelectionRange(blank, blank + 4);
});

document.getElementById('required-block').addEventListener('input', (event) => {
  const id = event.target.id && event.target.id.startsWith('fact-') ? event.target.id.slice(5) : '';
  if (id) markPicks(id);
});

// Trade and task pick lists fill in the task, the fall question and who runs the crane.
let trades = [];
const tradeEl = document.getElementById('trade');
const presetEl = document.getElementById('preset');

async function loadPresets() {
  try {
    const response = await fetch(api('/api/presets'));
    if (!response.ok) return;
    trades = (await response.json()).trades || [];
    tradeEl.innerHTML = '<option value="">Choose a trade</option>' + trades.map((trade, index) => `<option value="${index}">${esc(trade.name)}</option>`).join('');
  } catch {
    // The pick lists are a convenience. Without them the task is written by hand.
  }
}

tradeEl.addEventListener('change', () => {
  const trade = trades[Number(tradeEl.value)];
  presetEl.innerHTML = '<option value="">Choose a task</option>' + (trade ? trade.tasks.map((item, index) => `<option value="${index}">${esc(item.title)}</option>`).join('') : '');
  presetEl.disabled = !trade;
});

presetEl.addEventListener('change', () => {
  const trade = trades[Number(tradeEl.value)];
  const item = trade && trade.tasks[Number(presetEl.value)];
  if (!item) return;
  const taskEl = document.getElementById('task');
  if (taskEl.value.trim() && taskEl.value.trim() !== taskEl.dataset.preset && !confirm('Replace the task you have written?')) return;
  taskEl.value = item.task;
  taskEl.dataset.preset = item.task;
  document.getElementById('task-trade').value = '';
  const fall = document.querySelector(`input[name="fallRisk"][value="${item.fallRisk}"]`);
  if (fall) { fall.checked = true; fall.dispatchEvent(new Event('change', { bubbles: true })); }
  const crane = document.querySelector(`input[name="crane"][value="${item.crane}"]`);
  if (crane) crane.checked = true;
});

loadPresets();

document.querySelectorAll('input[name="fallRisk"], input[name="residential"]').forEach((input) => {
  input.addEventListener('change', showFallExplanation);
});

document.getElementById('back').addEventListener('click', () => {
  factsForm.classList.add('hidden');
  resultEl.classList.add('hidden');
});

function render(draft, { movable = false } = {}) {
  const row = (label, value) => (value ? `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>` : '');
  const logo = profile.logo ? `<img class="sheet-logo" src="${esc(profile.logo)}" alt="">` : '';
  const company = draft.companyDetails ? `<p class="meta">${esc(draft.companyDetails)}</p>` : '';
  const name = draft.subcontractor ? `<p class="sheet-company">${esc(draft.subcontractor)}</p>` : '';
  const head = `${logo || name || company ? `<div class="sheet-head"><div>${name}${company}</div>${logo}</div>` : ''}
    <h3>Safe work method statement</h3>
    <p class="meta">${esc(draft.instrument)} · ${esc(draft.versionLabel)} · ${esc(draft.sectionRef)}</p>
    <p class="status">${esc(draft.status || 'Not approved. Not signed.')}</p>
    <table>
      <tbody>
        <tr><th>State</th><td>${esc(draft.state)}</td></tr>
        ${row('SWMS reference number', draft.swmsRef)}
        ${row('Principal contractor', draft.principalContractor)}
        <tr><th>Subcontractor</th><td>${esc(draft.subcontractor)}</td></tr>
        <tr><th>Workplace</th><td>${esc(draft.workplace)}</td></tr>
        ${row('Site manager', draft.siteManager)}
        ${row('Scaffold supervisor', draft.scaffoldSupervisor)}
        ${row('Hospital', draft.hospital)}
        ${row('First aider', draft.firstAider)}
        ${row('Muster point', draft.musterPoint)}
        <tr><th>Task</th><td>${esc(draft.task)}</td></tr>
        ${row('Crane operated by', draft.craneOperator)}
        ${row('Residential construction work', draft.residential)}
        ${row(`Fall of more than ${draft.fallMetres || 2} metres`, draft.fallRisk)}
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
  const controls = `<table><thead><tr><th>Hierarchy</th><th>Control</th></tr></thead><tbody>${draft.controls.map((item) => `<tr><td>${esc(item.level)}</td><td>${esc(item.text)}</td></tr>`).join('')}</tbody></table>`;
  const site = draft.site.map((field) => `<p><strong>${esc(field.label)}</strong></p><div class="blank">${esc(field.text)}</div>`).join('');
  const list = (items) => `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`;
  const riskCell = (risk) => (risk ? `Before: <strong>${esc(risk.before.level)}</strong><br>${esc(risk.before.label)}<br>After: <strong>${esc(risk.after.level)}</strong><br>${esc(risk.after.label)}` : '');
  const steps = `<table class="stack"><thead><tr><th>Job step</th><th>Hazards and risks</th><th>Controls</th><th>Risk rating</th></tr></thead><tbody>${(draft.jobSteps || []).map((step, index, all) => `<tr${movable ? ` draggable="true" data-step-row="${index}"` : ''}><td data-label="Job step"><strong>${index + 1}. ${esc(step.step)}</strong>${movable ? `<span class="step-move"><button type="button" data-move="-1" data-index="${index}" aria-label="Move ${esc(step.step)} up"${index === 0 ? ' disabled' : ''}>&#9650;</button><button type="button" data-move="1" data-index="${index}" aria-label="Move ${esc(step.step)} down"${index === all.length - 1 ? ' disabled' : ''}>&#9660;</button></span>` : ''}</td><td data-label="Hazards and risks">${list(step.hazards)}</td><td data-label="Controls">${list(step.controls)}</td><td data-label="Risk rating">${riskCell(step.risk)}</td></tr>`).join('')}</tbody></table>
    <p class="meta">Suggested ratings, before and after the controls. The supervisor checks them and changes them to suit the site. Where a rating after the controls is still High, add controls or have the supervisor accept the risk before work starts.</p>`;
  const grid = (labels, rows) => `<table class="stack"><thead><tr>${labels.map((label) => `<th>${esc(label)}</th>`).join('')}</tr></thead><tbody>${rows.map((cells) => `<tr>${cells.map((value, index) => `<td data-label="${esc(labels[index] || '')}">${esc(value).replace(/\n/g, '<br>')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const registers = `${(draft.plant || []).length ? `<h4>Plant and equipment</h4>${grid(['Item', 'Inspection and maintenance', 'Licence or ticket to operate'], draft.plant.map((item) => [item.item, item.inspection, item.licence]))}` : ''}
    ${draft.substances && draft.substances.items.length ? `<h4>Hazardous substances</h4>${grid(['Type of product', 'Product name', 'Safety data sheet attached', 'Quantity'], draft.substances.items.map((item) => [item.product, '', 'Yes / No', '']))}` : ''}
    ${(draft.qualifications || []).length ? `<h4>Licences, tickets and training</h4>${list(draft.qualifications)}` : ''}
    ${(draft.emergency || []).length ? `<h4>Emergency arrangements</h4>${grid(['Emergency', 'Equipment and arrangements', 'Location, contact or detail'], draft.emergency.map((item) => [item.type, item.equipment, item.detail]))}` : ''}
    ${draft.sources && (draft.sources.legislation.length || draft.sources.codes.length) ? `<h4>Legislation and codes of practice</h4>${grid(['Legislation', 'Codes of practice and guidance'], [[draft.sources.legislation.join('\n'), draft.sources.codes.join('\n')]])}` : ''}`;
  const ppe = `<table><tbody>${(draft.ppe || []).map((group) => `<tr><th>${esc(group.area)}</th><td>${group.items.map((item) => `${item.ticked ? '&#9745;' : '&#9744;'} ${esc(item.label)}`).join(' &nbsp; ')}</td></tr>`).join('')}</tbody></table>`;
  const people = `<table><tbody>
      ${row('Works manager', draft.worksManager) || '<tr><th>Works manager</th><td></td></tr>'}
      ${row('Contact phone', draft.worksManagerPhone) || '<tr><th>Contact phone</th><td></td></tr>'}
      ${row('Person responsible for ensuring compliance', draft.complianceResponsible) || '<tr><th>Person responsible for ensuring compliance</th><td></td></tr>'}
      ${row('Person responsible for reviewing the controls', draft.reviewer) || '<tr><th>Person responsible for reviewing the controls</th><td></td></tr>'}
      ${row('Review date', draft.reviewDate) || '<tr><th>Review date</th><td></td></tr>'}
    </tbody></table>`;
  return `${head}
    <h4>Responsibilities</h4>${people}
    <h4>High risk construction work</h4>${risks}
    <h4>Controls</h4>${controls}
    <h4>Job steps</h4>${movable ? '<p class="meta">Use the arrows, or drag a row, to put the job steps in the order the work is done.</p>' : ''}${steps}
    <h4>Personal protective equipment</h4>${ppe}
    ${registers}
    <h4>${esc(draft.reviewHeading)}</h4>
    <p>${esc(draft.review)}</p>
    <h4>Site-specific</h4>${site}
    ${(draft.references || []).length ? `<h4>Documents to keep on site with this SWMS</h4><table><tbody>${draft.references.map((item) => `<tr><th>${esc(item.label)}</th><td>${esc(item.text)}</td></tr>`).join('')}</tbody></table>` : ''}
    <h4>Prepared by</h4>
    <table><tbody>${[['Name and position', draft.preparedBy], ['Signature', ''], ['Date', draft.preparedBy ? draft.date : ''], ['Date given to the principal contractor', '']].map(([label, value]) => `<tr><th>${label}</th><td>${esc(value)}</td></tr>`).join('')}</tbody></table>
    <h4>Principal contractor review</h4>
    <p class="meta">Completed by the principal contractor before the work starts.</p>
    <table><tbody>
      <tr><th>Principal contractor</th><td>${esc(draft.principalContractor)}</td></tr>
      ${['Date SWMS received', 'Reviewed by (name and position)'].map((label) => `<tr><th>${label}</th><td></td></tr>`).join('')}
      <tr><th>Outcome</th><td>&#9744; Accepted &nbsp; &#9744; Accepted with changes &nbsp; &#9744; Not accepted: revise and resubmit</td></tr>
      ${['Comments or changes', 'Signature', 'Date'].map((label) => `<tr><th>${label}</th><td></td></tr>`).join('')}
    </tbody></table>
    <h4>Worker sign-on</h4>
    <p>By signing, I confirm this SWMS has been explained to me, I understand it, and I will follow it. If the work changes or a control is not working, I will stop and tell my supervisor.</p>
    <div class="sign"><div>Name</div><div>Signature</div><div>Date</div></div>
    <div class="sign"><div></div><div></div><div></div></div>
    <p class="meta">The Word file has two pages of lines for workers to sign.</p>`;
}

// The nearest hospitals and medical centres to the job address. Each lookup is a paid
// Google request, so it runs only when asked.
document.getElementById('hospital-find').addEventListener('click', async () => {
  const box = document.getElementById('hospital-list');
  const address = document.getElementById('workplace').value.trim();
  box.classList.remove('hidden');
  if (!address) { box.innerHTML = '<p class="meta">Enter the job address first.</p>'; return; }
  box.innerHTML = '<p class="meta">Looking up...</p>';
  try {
    const data = await (await fetch(api(`/api/nearby-care?address=${encodeURIComponent(address)}`))).json();
    if (!data.enabled) { box.innerHTML = '<p class="meta">Suggestions are not set up. Type the hospital.</p>'; return; }
    if (data.error) { box.innerHTML = `<p class="meta">${esc(data.error)}</p>`; return; }
    const option = (place) => `<li><button type="button" data-care="${esc(`${place.name}, ${place.address}`)}"><strong>${esc(place.name)}</strong><br>${esc(place.address)}<br><span class="meta">About ${esc(place.km)} km away in a straight line</span></button></li>`;
    box.innerHTML = `${data.hospitals.length ? `<p class="meta"><strong>Hospitals.</strong> Check the one you pick has a 24 hour emergency department.</p><ul class="care-list">${data.hospitals.map(option).join('')}</ul>` : '<p class="meta">No hospital found nearby. Type the hospital.</p>'}
      ${data.clinics.length ? `<p class="meta"><strong>Medical centres</strong>, for minor injuries in opening hours. Serious injuries go to an emergency department.</p><ul class="care-list">${data.clinics.map(option).join('')}</ul>` : ''}`;
  } catch {
    box.innerHTML = '<p class="meta">Suggestions are not available right now. Type the hospital.</p>';
  }
});
document.getElementById('hospital-list').addEventListener('click', (event) => {
  const button = event.target.closest('[data-care]');
  if (!button) return;
  document.getElementById('hospital').value = button.dataset.care;
  document.getElementById('hospital-list').classList.add('hidden');
});

// Each box remembers what was typed in the last few SWMS on this device, and offers it
// again. Nothing leaves the device. Storage can be off (private browsing): then nothing is kept.
const MEMORY_KEY = 'siteready.fieldMemory';
const REMEMBERED = ['site-manager', 'works-manager', 'works-manager-phone', 'compliance-responsible', 'reviewer', 'scaffold-supervisor', 'hospital', 'first-aider', 'muster-point', 'prepared-by'];
function readMemory() {
  try { return JSON.parse(localStorage.getItem(MEMORY_KEY) || '{}') || {}; } catch { return {}; }
}
function lastUsed(id) {
  const list = readMemory()[id];
  return Array.isArray(list) && list.length ? list[0] : '';
}
function rememberFields() {
  const memory = readMemory();
  // The job address is kept too, and offered in its own suggestion list.
  const ids = [...REMEMBERED, 'workplace', ...[...document.querySelectorAll('[data-site]')].map((el) => el.id)];
  for (const id of ids) {
    const el = document.getElementById(id);
    const value = el && el.value.trim();
    if (!value || /^If not known yet/.test(value)) continue;
    memory[id] = [value, ...(memory[id] || []).filter((item) => item !== value)].slice(0, 8);
  }
  try { localStorage.setItem(MEMORY_KEY, JSON.stringify(memory)); } catch { /* not kept */ }
  offerRemembered();
}
function offerRemembered() {
  const memory = readMemory();
  for (const id of REMEMBERED) {
    const el = document.getElementById(id);
    if (!el || !(memory[id] || []).length) continue;
    let list = document.getElementById(`memory-${id}`);
    if (!list) {
      list = document.createElement('datalist');
      list.id = `memory-${id}`;
      el.after(list);
      el.setAttribute('list', list.id);
    }
    list.innerHTML = memory[id].map((value) => `<option value="${esc(value)}"></option>`).join('');
  }
}
offerRemembered();
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-same-as-last]');
  if (!button) return;
  const el = document.getElementById(button.dataset.sameAsLast);
  if (el) { el.value = lastUsed(button.dataset.sameAsLast); el.focus(); }
});

// Prepares the draft and shows it. Moving a job step prepares it again in the new order.
let shownSteps = [];
async function prepareDraft({ scroll = true } = {}) {
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
    addPrincipals([JSON.parse(body).principalContractor], true);
    shownSteps = (data.jobSteps || []).map((step) => step.step);
    rememberFields();
    resultEl.innerHTML = `<div class="sheet">${render(data, { movable: true })}</div><div id="result-actions"></div>`;
    resultEl.classList.remove('hidden');
    // Downloading and saving need an account; the account script adds those buttons.
    window.SiteReady.showActions(data, JSON.parse(body));
    // A SWMS in a project is recorded against its task.
    if (window.SiteReady.onDraft) window.SiteReady.onDraft(data, JSON.parse(body));
    if (scroll) resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    document.getElementById('facts-error').textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

factsForm.addEventListener('submit', (event) => {
  event.preventDefault();
  prepareDraft();
});

function moveStep(from, to) {
  if (from === to || from < 0 || to < 0 || from >= shownSteps.length || to >= shownSteps.length) return;
  const order = [...shownSteps];
  const [moved] = order.splice(from, 1);
  order.splice(to, 0, moved);
  stepOrder = order;
  prepareDraft({ scroll: false }).then(() => {
    const row = resultEl.querySelector(`[data-step-row="${to}"] button`);
    if (row) row.focus();
  });
}

resultEl.addEventListener('click', (event) => {
  const button = event.target.closest('[data-move]');
  if (!button) return;
  const index = Number(button.dataset.index);
  moveStep(index, index + Number(button.dataset.move));
});
let dragFrom = null;
resultEl.addEventListener('dragstart', (event) => {
  const row = event.target.closest('[data-step-row]');
  if (!row) return;
  dragFrom = Number(row.dataset.stepRow);
  event.dataTransfer.effectAllowed = 'move';
  row.classList.add('dragging');
});
resultEl.addEventListener('dragover', (event) => {
  if (dragFrom !== null && event.target.closest('[data-step-row]')) event.preventDefault();
});
resultEl.addEventListener('drop', (event) => {
  const row = event.target.closest('[data-step-row]');
  if (dragFrom === null || !row) return;
  event.preventDefault();
  const to = Number(row.dataset.stepRow);
  const from = dragFrom;
  dragFrom = null;
  moveStep(from, to);
});
resultEl.addEventListener('dragend', () => {
  dragFrom = null;
  resultEl.querySelectorAll('.dragging').forEach((row) => row.classList.remove('dragging'));
});
// A new task starts with SiteReady's order again.
document.getElementById('task').addEventListener('input', () => { stepOrder = null; ppeTouched.clear(); });

window.SiteReady = Object.assign(window.SiteReady || {}, {
  api, esc, payload, render, fillForm, fillFields, setProfile, getProfile: () => profile, resultEl, addPrincipals,
  // Signed in, the account name fills Prepared by when it is empty.
  setPreparedBy: (name) => { if (name && !preparedEl.value.trim()) preparedEl.value = name; },
});

addPrincipals([], false);
document.getElementById('principal').addEventListener('change', (event) => addPrincipals([event.target.value], true));

loadStates().catch(() => {
  document.getElementById('start-error').textContent = 'The state list could not be loaded.';
});
