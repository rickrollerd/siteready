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
  if (next.name) { company.value = next.name; company.readOnly = true; company.title = 'Set from your Company profile.'; }
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
    leaveOut: leaveOut || undefined,
    // The rows of a scope reading that the reader matched to no job steps, for the task as read,
    // and the parts with no job steps the user ticked as dealt with (owner decision D184).
    unmatched: scopeUnmatched || undefined,
    // The parts of a task picked from the pick list that SiteReady has no job steps for (goal 1).
    pickGaps: pickGaps || undefined,
    notCoveredConfirmed: coverTicked ? JSON.parse(coverTicked) : undefined,
    controlEdits: controlEdits || undefined,
    hazardEdits: hazardEdits || undefined,
    whoEdits: whoEdits || undefined,
    ownSteps: ownSteps || undefined,
    fills: fills || undefined,
    plantChoice: plantChoice || undefined,
    emergency: emergencyAnswers || undefined,
    designs: designsPayload(),
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
  // The steps picked or left out for this same task are kept, so Continue on a reopened SWMS
  // does not undo them.
  const scope = window.siteReadyScopeTask;
  const task = document.getElementById('task').value.trim();
  if (task !== choicesTask) {
    stepPicks = scope && scope.task === task && Array.isArray(scope.kinds) ? [...scope.kinds] : null;
    leaveOut = scope && scope.task === task && Array.isArray(scope.leaveOut) ? [...scope.leaveOut] : null;
    scopeUnmatched = scope && scope.task === task && Array.isArray(scope.unmatched) ? [...scope.unmatched] : null;
    // A task picked from the pick list, still as picked, starts from its own job steps and names
    // the parts SiteReady has no job steps for. Changed words start from the steps found in them.
    const picked = !(scope && scope.task === task) && pickedTask && pickedTask.task === task ? pickedTask : null;
    if (picked) {
      stepPicks = [...picked.kinds];
      leaveOut = picked.leaveOut && picked.leaveOut.length ? [...picked.leaveOut] : null;
    }
    pickGaps = picked && picked.gaps && picked.gaps.length ? [...picked.gaps] : null;
    choicesTask = task;
  }
  // With no signal the plain message shows here, not nothing (goal 7).
  loadQuestions().catch((error) => { document.getElementById('start-error').textContent = error.message; });
});

// Job steps: null follows the steps SiteReady finds in the task; a list is the user's own picks.
let stepPicks = null;
// Steps for work the scope gives to others, which the user chose to leave out.
let leaveOut = null;
// Rows of the scope reading with no job steps, while the task is the one read from the scope.
let scopeUnmatched = null;
// The task last picked from the pick list, and the parts of it with no job steps while it is as picked.
let pickedTask = null;
let pickGaps = null;
// The parts with no job steps the user ticked as dealt with, as shown above the draft (D184).
let coverTicked = null;
// The job steps in the order the user put them in the preview, by name.
let stepOrder = null;
// The user's own changes to the controls, by job step name: { removed, changed, added }.
let controlEdits = null;
// The user's own hazards, by job step name: { changed, added, notApplicable }, and who is
// responsible for each step's controls (the Who column), by job step name.
let hazardEdits = null;
let whoEdits = null;
// The job steps the user wrote for work SiteReady has no job steps for: [{ part, name, hazards,
// controls, who }], hazards and controls one a line.
let ownSteps = null;
// The user's answers for the blanks (____) in control lines, by line: { line: [answer, ...] }.
let fills = null;
// The plant the user confirmed (goal 2): { used, notUsed, added: [{ item, licence }] }, and the
// changes made in the plant box not yet confirmed: { ticks: { name: true or false }, own: [...] }.
let plantChoice = null;
let plantPending = null;
// The answers to the emergency questions for the work (goal 2), by question.
let emergencyAnswers = null;
// The designs the job steps rely on (designs.js), as the user answered them, in the order shown:
// [{ id, what, status: 'given' | 'notIssued' | 'notNeeded' | '', by, number, revision, date, file }].
// The designs SiteReady found, as the server last said, with the steps that rely on each.
let designAnswers = null;
let designsFound = [];
// Each design's answer by id, kept while the server does not list that design, so it comes back
// when the design does: a reopened SWMS is first asked before its answers to the questions are on
// the page, when the steps that rely on a design may not be listed yet.
let designsKept = new Map();
// The task the step picks and steps left out were made for.
let choicesTask = null;

// A new SWMS starts from SiteReady's steps, order, controls and PPE, and is saved as a new SWMS.
// Typing in the task box keeps the user's changes: those that no longer match are reported.
function newSwms() {
  stepPicks = null;
  leaveOut = null;
  scopeUnmatched = null;
  pickGaps = null;
  coverTicked = null;
  stepOrder = null;
  controlEdits = null;
  hazardEdits = null;
  whoEdits = null;
  ownSteps = null;
  fills = null;
  plantChoice = null;
  plantPending = null;
  emergencyAnswers = null;
  designAnswers = null;
  designsFound = [];
  designsKept = new Map();
  if (window.SiteReadyMethodRead) window.SiteReadyMethodRead.clear();
  drawDesigns([]);
  choicesTask = null;
  ppeTouched.clear();
  // Its questions start blank.
  freshFacts = true;
  if (window.SiteReady) window.SiteReady.editing = null;
}
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

// Steps for where the work is done, for a task SiteReady has no job steps for: shown, not ticked.
let stepsAround = [];

function renderSteps(steps) {
  const chosen = new Set(steps.chosen || []);
  const locked = new Set(steps.locked || []);
  const around = new Set(steps.around || []);
  stepsAround = [...around];
  // Suggested steps keep their place when unticked; added steps follow them.
  const ids = [...new Set([...(steps.suggested || []), ...(stepPicks || []), ...(steps.chosen || [])])];
  document.getElementById('steps-block').innerHTML = ids.length ? ids.map((id) => {
    const kind = stepById.get(id) || { label: id, steps: [] };
    const others = kind.steps.filter((name) => name !== kind.label);
    const names = others.length ? `<span class="step-names">${esc(others.join('; '))}</span>` : '';
    const off = locked.has(id) && !chosen.has(id) && !around.has(id);
    const warning = around.has(id)
      ? '<span class="step-note">For where the work is done, not the work itself. It is ticked again when you add a step for the work.</span>'
      : off ? `<span class="step-warning">${esc(REMOVED_WARNINGS[id] || 'The task calls for this step. Make sure this risk is covered another way before work starts.')}</span>` : '';
    return `<li><label><input type="checkbox" data-step value="${esc(id)}"${chosen.has(id) ? ' checked' : ''}><span>${esc(kind.label)}${locked.has(id) ? '<span class="tag">Recommended</span>' : ''}${names}${warning}</span></label></li>`;
  }).join('') : '<li>No job steps were found in the task. Add the steps for the work below.</li>';
  fillStepAdd();
}

// Shown when a step the task's words call for is taken off.
const REMOVED_WARNINGS = {
  road: 'The task mentions a road or street. Make sure traffic is managed before work starts, for example under the principal contractor\'s traffic management plan (TMP).',
  asbestosCheck: 'The work could disturb asbestos. Make sure asbestos is identified before work starts.',
  asbestos: 'The task involves asbestos. It must be removed under the asbestos rules, by a licensed removalist where required.',
  isolation: 'The work needs power or plant isolated. Make sure it is isolated and proved before work starts.',
  confined: 'The task mentions a confined space. Entry needs its own controls and permit.',
  water: 'The work is near water. Make sure drowning risks are controlled.',
  power: 'The work is near power lines. Make sure approach distances are kept.',
  propping: 'The work needs temporary support. Make sure the structure is propped before it is cut or loaded.',
  trench: 'The work involves a trench. Make sure the trench is supported or kept shallow before anyone enters it.',
  inTrench: 'The work is in a trench deeper than 1.5 m. Make sure the trench is supported before anyone enters it.',
};

// Changing the steps asks the questions again, keeping what has been filled in.
async function refreshSteps() {
  await loadQuestions({ stay: true, keepTicked: true }).catch((error) => { document.getElementById('facts-error').textContent = error.message; return false; });
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
  // The steps for the work around it come back with the first step added for the work itself.
  const current = stepPicks || [...document.querySelectorAll('[data-step]:checked')].map((el) => el.value).concat(stepsAround);
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

// Job steps suggested from a written methodology (method-read.js) change the SWMS only through
// these, when the user accepts one: library job steps added as the step picker adds them, and the
// user's own steps as "Write a step for this" adds them.
const methodSteps = {
  methodRow: (id) => designRow(id),
  libraryGroups: () => stepLibrary.groups,
  libraryKind: (id) => stepById.get(id) || null,
  addKinds(ids) {
    const current = stepPicks || [...document.querySelectorAll('[data-step]:checked')].map((el) => el.value).concat(stepsAround);
    const added = ids.filter((id) => !current.includes(id));
    if (!added.length) return [];
    stepPicks = [...new Set([...current, ...added])];
    refreshSteps();
    return added;
  },
  removeKinds(ids) {
    if (!stepPicks) return;
    stepPicks = stepPicks.filter((id) => !ids.includes(id));
    refreshSteps();
  },
  ownNames: () => (ownSteps || []).map((item) => item.name),
  addOwnStep(item) { ownSteps = [...(ownSteps || []), item]; },
  removeOwnStep(name) {
    ownSteps = (ownSteps || []).filter((item) => item.name !== name);
    if (!ownSteps.length) ownSteps = null;
  },
};

// The answers given for this SWMS, by question, so a question asked again (after Continue, a change
// of steps, or an answer that brings in another question) keeps its answer, and one that goes and
// comes back has it again. A new SWMS starts blank (freshFacts).
let factMemory = {};
let siteMemory = {};
let freshFacts = false;

function shownAnswers(selector, key) {
  const out = {};
  document.querySelectorAll(selector).forEach((el) => {
    if (el.type === 'radio') { if (el.checked) out[el.dataset[key]] = el.value; } else out[el.dataset[key]] = el.value;
  });
  return out;
}

// One question, as the page shows it.
function factHtml(item) {
  const extra = item.prompt && item.prompt.replace(/\.$/, '') !== item.label
    ? `<span class="hint">${esc(item.prompt)}</span>` : '';
  if (item.choices) {
    // A choice with a default starts on it. One shown only after another answer (showIf) starts hidden.
    const showIf = item.showIf ? Object.entries(item.showIf)[0] : null;
    return `<fieldset class="field choice${showIf ? ' hidden' : ''}" data-q="${esc(item.id)}"${showIf ? ` data-show-if="${esc(showIf[0])}" data-show-value="${esc(showIf[1])}"` : ''}>
        <legend>${esc(item.label)}</legend>${extra}
        ${item.choices.map((choice) => `<label style="display:flex;margin:0 0 8px"><input type="radio" name="fact-${esc(item.id)}" data-fact="${esc(item.id)}" value="${esc(choice.value)}"${choice.value === item.default ? ' checked' : ''}> ${esc(choice.label)}</label>`).join('')}
      </fieldset>`;
  }
  const picks = (item.suggestions || []).length
    ? `<div class="picks"><span class="picks-label">Standard answers:</span>${item.suggestions.map((pick, index) => `<button type="button" class="pick-button" data-pick-for="${esc(item.id)}" data-pick="${index}">${esc(pick.label)}</button>`).join('')}</div>`
    : '';
  return `<div class="field" data-q="${esc(item.id)}">
        <label for="fact-${esc(item.id)}">${esc(item.label)}${extra}</label>
        ${picks}
        <textarea id="fact-${esc(item.id)}" data-fact="${esc(item.id)}" spellcheck="true" autocorrect="on" autocapitalize="sentences"></textarea>
      </div>`;
}

// Draws the questions. A question already on the page stays as it is, with its answer, the cursor
// and the scroll where they were; a new one is put in its place with any answer it had before; one
// no longer asked goes, its answer remembered.
function drawRequired(required) {
  const block = document.getElementById('required-block');
  Object.assign(factMemory, shownAnswers('#required-block [data-fact]', 'fact'));
  if (!required.length) {
    block.innerHTML = '<p class="lede">No further fact is required for this task.</p>';
    return;
  }
  let lede = block.querySelector('.required-lede');
  if (!lede) {
    block.innerHTML = '';
    lede = document.createElement('p');
    lede.className = 'lede required-lede';
    lede.style.marginBottom = '12px';
    lede.textContent = 'If a required fact is blank, the task is stood down. A method is not written.';
    block.appendChild(lede);
  }
  const shown = new Map([...block.querySelectorAll('[data-q]')].map((el) => [el.dataset.q, el]));
  let before = lede;
  for (const item of required) {
    const sig = JSON.stringify(item);
    let el = shown.get(item.id);
    shown.delete(item.id);
    if (!el || el.dataset.sig !== sig) {
      const holder = document.createElement('div');
      holder.innerHTML = factHtml(item);
      const made = holder.firstElementChild;
      made.dataset.sig = sig;
      const value = factMemory[item.id];
      if (value !== undefined) {
        made.querySelectorAll('[data-fact]').forEach((input) => {
          if (input.type === 'radio') input.checked = input.value === value;
          else input.value = value;
        });
      }
      if (el) el.replaceWith(made);
      el = made;
    }
    if (before.nextElementSibling !== el) before.after(el);
    before = el;
  }
  shown.forEach((el) => el.remove());
  applyShowIf();
  required.forEach((item) => markPicks(item.id));
}

// Asks the questions again with the answers given so far, so a question an answer brings in (a
// harness named in the fall control, a harness or life jacket ticked) shows straight away. Only the
// questions change. A later ask wins over an earlier one still on its way.
let askSeq = 0;
let askTimer = null;
let asking = null;
function askAgain() {
  asking = askOnce();
  return asking;
}
async function askOnce() {
  clearTimeout(askTimer);
  askTimer = null;
  if (factsForm.classList.contains('hidden') || !questions) return;
  const seq = ++askSeq;
  try {
    const response = await fetch(api('/api/draft/questions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload()),
    });
    if (!response.ok || seq !== askSeq) return;
    const data = await response.json();
    if (seq !== askSeq || !Array.isArray(data.required)) return;
    questions = { ...questions, required: data.required };
    drawRequired(data.required);
    drawDesigns(data.designs || []);
  } catch {
    // With no signal the questions stay as they are; Prepare the statement says what is missing.
  }
}
function askAgainSoon() {
  clearTimeout(askTimer);
  askTimer = setTimeout(askAgain, 700);
}

async function loadQuestions(options = {}) {
  document.getElementById('start-error').textContent = '';
  resultEl.classList.add('hidden');
  // The answers on the page stay, unless this is a new SWMS.
  const fresh = freshFacts;
  const sent = payload();
  // A new SWMS is asked with the PPE SiteReady suggests for it, not the last task's.
  if (fresh) delete sent.ppe;
  // An ask already on its way is out of date once this one is sent.
  askSeq += 1;
  const response = await fetch(api('/api/draft/questions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sent),
  });
  const data = await response.json();
  if (!response.ok) {
    document.getElementById('start-error').textContent = data.message || 'That state is not available.';
    return false;
  }
  questions = data;
  freshFacts = false;
  // Spelling SiteReady fixed in the task, shown so the user can check it.
  const note = document.getElementById('spelling-note');
  const fixes = data.spellingFixes || [];
  note.textContent = fixes.length ? `Spelling fixed in the SWMS: ${fixes.map((fix) => `${fix.from} to ${fix.to}`).join(', ')}.` : '';
  note.classList.toggle('hidden', !fixes.length);
  const warning = document.getElementById('fall-warning');
  warning.textContent = (data.fall && data.fall.warning) || '';
  warning.classList.toggle('hidden', !warning.textContent);
  // Work SiteReady has no job steps for is stood down: the user hears it here, not only at the draft.
  const notice = document.getElementById('steps-notice');
  notice.textContent = (data.standDown && data.standDown.message) || '';
  notice.classList.toggle('hidden', !notice.textContent);
  if (fresh) {
    factMemory = {};
    siteMemory = {};
    document.getElementById('required-block').innerHTML = '';
  } else {
    Object.assign(siteMemory, shownAnswers('[data-site]', 'site'));
  }
  drawRequired(data.required || []);
  // PPE the user ticked or unticked stays as they set it. The rest follows the new suggestion, and
  // when only the steps changed, what was ticked stays ticked.
  const ppeShown = !fresh && document.querySelector('[data-ppe]');
  const ticked = new Set(Array.isArray(sent.ppe) ? sent.ppe : []);
  document.getElementById('ppe-block').innerHTML = (data.ppe || []).map((group) => `
    <fieldset class="ppe-group">
      <legend>${esc(group.area)}</legend>
      ${group.items.map((item) => `<label><input type="checkbox" data-ppe value="${esc(item.id)}"${item.ticked ? ' checked' : ''}> ${esc(item.label)}</label>`).join('')}
    </fieldset>
  `).join('');
  if (ppeShown) {
    document.querySelectorAll('[data-ppe]').forEach((el) => {
      if (ppeTouched.has(el.value)) el.checked = ticked.has(el.value);
      else if (options.keepTicked && ticked.has(el.value)) el.checked = true;
    });
  }
  document.getElementById('site-block').innerHTML = (data.site || []).map((item) => `
    <div class="field">
      <label for="site-${esc(item.id)}">${esc(item.label)}${item.hint ? `<span class="hint">${esc(item.hint)}</span>` : ''}</label>
      ${lastUsed(`site-${item.id}`) ? `<button type="button" class="pick-button" data-same-as-last="site-${esc(item.id)}">Same as last SWMS</button>` : ''}
      <textarea id="site-${esc(item.id)}" data-site="${esc(item.id)}" spellcheck="true" autocorrect="on" autocapitalize="sentences"></textarea>
    </div>
  `).join('');
  document.querySelectorAll('[data-site]').forEach((el) => { if (siteMemory[el.dataset.site] !== undefined) el.value = siteMemory[el.dataset.site]; });
  drawDesigns(data.designs || []);
  renderSteps(data.steps || { suggested: [], chosen: [], locked: [] });
  factsForm.classList.remove('hidden');
  if (!options.stay) factsForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // The questions were asked with the PPE ticked before; if the new suggestion ticks a harness or a
  // life jacket, its questions are asked for too.
  const now = [...document.querySelectorAll('[data-ppe]:checked')].map((el) => el.value);
  if (Array.isArray(sent.ppe) && (now.length !== ticked.size || now.some((id) => !ticked.has(id)))) await askAgain();
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

// The task and site details of a SWMS, without asking the server for its questions.
function fillStart(input) {
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
  leaveOut = Array.isArray(input.leaveOut) ? [...input.leaveOut] : null;
  scopeUnmatched = Array.isArray(input.unmatched) ? [...input.unmatched] : null;
  pickGaps = Array.isArray(input.pickGaps) ? [...input.pickGaps] : null;
  coverTicked = Array.isArray(input.notCoveredConfirmed) ? JSON.stringify(input.notCoveredConfirmed) : null;
  choicesTask = String(input.task || '').trim();
  stepOrder = Array.isArray(input.stepOrder) ? [...input.stepOrder] : null;
  controlEdits = input.controlEdits && typeof input.controlEdits === 'object' ? JSON.parse(JSON.stringify(input.controlEdits)) : null;
  hazardEdits = input.hazardEdits && typeof input.hazardEdits === 'object' ? JSON.parse(JSON.stringify(input.hazardEdits)) : null;
  whoEdits = input.whoEdits && typeof input.whoEdits === 'object' ? { ...input.whoEdits } : null;
  ownSteps = Array.isArray(input.ownSteps) && input.ownSteps.length ? JSON.parse(JSON.stringify(input.ownSteps)) : null;
  fills = input.fills && typeof input.fills === 'object' ? JSON.parse(JSON.stringify(input.fills)) : null;
  plantChoice = input.plantChoice && typeof input.plantChoice === 'object' ? JSON.parse(JSON.stringify(input.plantChoice)) : null;
  plantPending = null;
  emergencyAnswers = input.emergency && typeof input.emergency === 'object' ? { ...input.emergency } : null;
  designAnswers = Array.isArray(input.designs) && input.designs.length ? JSON.parse(JSON.stringify(input.designs)) : null;
  designsFound = [];
  designsKept = new Map();
  // This SWMS's own answers are drawn fresh, even for the same designs as the last one shown.
  designsDrawn = '';
  // The answers are this SWMS's own, shown once its questions are asked (on Continue).
  factMemory = input.facts && typeof input.facts === 'object' ? { ...input.facts } : {};
  siteMemory = input.site && typeof input.site === 'object' ? { ...input.site } : {};
  freshFacts = false;
  ['required-block', 'site-block', 'ppe-block'].forEach((id) => { document.getElementById(id).innerHTML = ''; });
  showFallExplanation();
}

async function fillForm(input, options = {}) {
  fillStart(input);
  if (!(await loadQuestions(options))) return false;
  document.querySelectorAll('[data-fact]').forEach((el) => {
    const value = (input.facts || {})[el.dataset.fact] || '';
    if (el.type === 'radio') el.checked = el.value === value || (!value && el.defaultChecked);
    else el.value = value;
  });
  applyShowIf();
  document.querySelectorAll('[data-site]').forEach((el) => { el.value = (input.site || {})[el.dataset.site] || ''; });
  (questions && questions.required || []).forEach((item) => markPicks(item.id));
  if (Array.isArray(input.ppe)) {
    document.querySelectorAll('[data-ppe]').forEach((el) => { el.checked = input.ppe.includes(el.value); });
    // The questions follow the SWMS's own PPE (a harness or life jacket brings its questions).
    await askAgain();
  }
  return true;
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
    askAgain();
    box.focus();
    return;
  }
  box.value = box.value.trim() ? `${box.value.trim()} ${pick.text}` : pick.text;
  markPicks(item.id);
  // A standard answer can bring in another question (a harness named in the fall control).
  askAgain();
  box.focus();
  const blank = box.value.indexOf('____');
  if (blank >= 0) box.setSelectionRange(blank, blank + 4);
});

document.getElementById('required-block').addEventListener('input', (event) => {
  const id = event.target.id && event.target.id.startsWith('fact-') ? event.target.id.slice(5) : '';
  if (id) markPicks(id);
  // An answer can bring in another question, asked for once the typing pauses.
  if (event.target.dataset && event.target.dataset.fact) askAgainSoon();
});

// A question asked only after another answer (such as the transformer's oil, once the pole has a
// transformer) shows when that answer is chosen.
function applyShowIf() {
  document.querySelectorAll('#required-block [data-show-if]').forEach((el) => {
    const chosen = document.querySelector(`input[data-fact="${el.dataset.showIf}"]:checked`);
    el.classList.toggle('hidden', !chosen || chosen.value !== el.dataset.showValue);
  });
}
document.getElementById('required-block').addEventListener('change', (event) => {
  applyShowIf();
  if (event.target.dataset && event.target.dataset.fact) askAgain();
});

// Trade and task pick lists fill in the task, its job steps, the fall question and who runs the
// crane. The trades are shown in groups (site and plant, civil, structure, services, finishes),
// with access, handling and tools for any trade as a pick of its own.
let trades = [];
const tradeEl = document.getElementById('trade');
const presetEl = document.getElementById('preset');
const presetNote = document.getElementById('preset-note');

async function loadPresets() {
  try {
    const response = await fetch(api('/api/presets'));
    if (!response.ok) return;
    trades = (await response.json()).trades || [];
    const groups = [...new Set(trades.map((trade) => trade.group || ''))];
    const option = (trade) => `<option value="${trades.indexOf(trade)}">${esc(trade.name)}</option>`;
    tradeEl.innerHTML = '<option value="">Choose a trade</option>' + groups.map((group) => {
      const list = trades.filter((trade) => (trade.group || '') === group).map(option).join('');
      return group ? `<optgroup label="${esc(group)}">${list}</optgroup>` : list;
    }).join('');
  } catch {
    // The pick lists are a convenience. Without them the task is written by hand.
  }
}

// What SiteReady cannot draft for a picked task, said before Continue, so it is no surprise.
function showPresetNote(item) {
  const gaps = (item && item.gaps) || [];
  let text = '';
  if (item && item.coverage === 'none' && !(item.kinds || []).length) text = 'SiteReady has no job steps for this task yet. Pick the job steps that cover it under Job steps, or write this SWMS yourself.';
  else if (gaps.length) text = `SiteReady has no job steps yet for: ${gaps.join('; ')}. You will be asked to add your own steps for this, or cover it in a separate SWMS.`;
  presetNote.textContent = text;
  presetNote.classList.toggle('hidden', !text);
}

tradeEl.addEventListener('change', () => {
  const trade = trades[Number(tradeEl.value)];
  presetEl.innerHTML = '<option value="">Choose a task</option>' + (trade ? trade.tasks.map((item, index) => `<option value="${index}">${esc(item.title)}</option>`).join('') : '');
  presetEl.disabled = !trade;
  showPresetNote(null);
});

presetEl.addEventListener('change', () => {
  const trade = trades[Number(tradeEl.value)];
  const item = trade && trade.tasks[Number(presetEl.value)];
  if (!item) return;
  const taskEl = document.getElementById('task');
  if (taskEl.value.trim() && taskEl.value.trim() !== taskEl.dataset.preset && !confirm('Replace the task you have written?')) return;
  newSwms();
  taskEl.value = item.task;
  taskEl.dataset.preset = item.task;
  pickedTask = { task: item.task, kinds: item.kinds || [], leaveOut: item.leaveOut || [], gaps: item.gaps || [] };
  showPresetNote(item);
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

// The revision, as the Word and PDF files print it (docx-draft.js revisionText): a draft not yet
// saved is revision 1, dated with the SWMS date.
function revisionText(draft) {
  const date = draft.revisionDate || draft.date;
  return `Revision ${draft.revision || 1}${date ? `, ${date}` : ''}`;
}

// ---- The download gate (goal 2) ----

// A control line with a box in each blank. The first box for a line is where the list above the
// download buttons takes the user.
function fillBox(line, key, gate, anchored) {
  const gap = (gate || []).find((item) => item.kind === 'line' && item.key === key);
  if (!gap) return esc(line);
  const rest = String(line).replace(/\s+/g, ' ').trim().slice(key.length);
  const answers = (fills || {})[key] || [];
  const first = !anchored.has(key);
  anchored.add(key);
  const boxes = gap.parts.map((part, n) => `${esc(part)}${n < gap.parts.length - 1 ? `<input type="text" class="blank-input" data-fill-key="${esc(key)}" data-fill-n="${n}" value="${esc(answers[n] || '')}" aria-label="Blank ${n + 1} of ${gap.parts.length - 1} in this control"${first && n === 0 ? ` id="gap-${esc(gap.id)}"` : ''}>` : ''}`).join('');
  return `<span class="blank-fill">${boxes}${esc(rest)}</span><span class="gate-need" data-gate-line="${esc(key)}">Fill in the blank before download.</span>`;
}

// The page box each item is answered in, and the marks beside each one. A note is changed only
// where it differs, as this runs while the user types.
const gateTarget = (gap) => (gap.kind === 'line' ? document.getElementById(`gap-${gap.id}`) : gap.field ? document.getElementById(gap.field) : null);
function markGaps(gaps) {
  const byField = new Map(gaps.filter((gap) => gap.kind !== 'line' && gap.field).map((gap) => [gap.field, gap]));
  document.querySelectorAll('.gate-need[data-gate-for]').forEach((note) => {
    if (byField.has(note.dataset.gateFor) && document.getElementById(note.dataset.gateFor)) return;
    const el = document.getElementById(note.dataset.gateFor);
    if (el) { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); }
    note.remove();
  });
  for (const gap of byField.values()) {
    const el = document.getElementById(gap.field);
    if (!el) continue;
    let note = document.getElementById(`need-${gap.field}`);
    if (!note) {
      note = document.createElement('p');
      note.className = 'gate-need';
      note.dataset.gateFor = gap.field;
      note.id = `need-${gap.field}`;
      const holder = el.closest('.field') || el.parentElement;
      if (holder) holder.appendChild(note);
    }
    const text = `Needed before download: ${gap.need}`;
    if (note.textContent !== text) note.textContent = text;
    el.setAttribute('aria-invalid', 'true');
    el.setAttribute('aria-describedby', note.id);
  }
  // A control line's note shows while any of its blanks is still empty.
  const lines = new Set(gaps.filter((gap) => gap.kind === 'line').map((gap) => gap.key));
  document.querySelectorAll('.gate-need[data-gate-line]').forEach((note) => { note.hidden = !lines.has(note.dataset.gateLine); });
}

// Each check the server made on the draft shown (download-gate.js gateChecks), judged again by the
// same rule (gate-rules.js) against what is in its box now, so an item drops off as soon as it is
// answered and comes back if the answer is taken out. The server checks again before any download.
// Items it judges alone (the plant, anything else left open) wait for the draft to be prepared again.
let shownChecks = [];
function liveNeed(check) {
  const rules = window.SiteReadyGate;
  // A design is judged from its card as it is now.
  if (check.kind === 'design' && rules && rules.designNeed) return designShown(check.design) ? rules.designNeed(designRow(check.design)) : check.need;
  if (!check.rule || !rules) return check.need;
  if (check.kind === 'line') return rules.answerNeed(check.rule, (fills || {})[check.key] || []);
  const el = check.field ? document.getElementById(check.field) : null;
  return el ? rules.answerNeed(check.rule, el.value) : check.need;
}

// The answers the SWMS prints as given (gate-rules.js AS_GIVEN): these go with a download as they
// are now. A change to anything else since the draft was prepared needs the draft prepared again.
const asGiven = () => (window.SiteReadyGate ? window.SiteReadyGate.AS_GIVEN : []);
// What the user changes in their own flows, which prepare the draft again or update what is saved,
// and the business details, which a download takes from the account's company profile.
const OWN_FLOWS = ['controlEdits', 'hazardEdits', 'whoEdits', 'ownSteps', 'notCoveredConfirmed', 'company', 'companyAbn', 'companyAddress', 'companyPhone', 'companyEmail'];
function redrawKey(input) {
  const rest = { ...input };
  for (const key of [...asGiven(), ...OWN_FLOWS]) delete rest[key];
  return JSON.stringify(rest);
}
function currentAnswers() {
  const now = payload();
  return Object.fromEntries(asGiven().map((key) => [key, now[key]]));
}
const draftStale = () => Boolean(shownSent && shownDraft && shownDraft.kind === 'draft' && redrawKey(payload()) !== redrawKey(shownSent));

// Everything still outstanding before download, in one list: the site questions and blanks the
// server found (goal 2), judged again as the user answers, and the tick for work SiteReady has no
// job steps for (D184), counted from the box above the draft as the user ticks it.
function outstanding(data) {
  if (!data || data.kind !== 'draft') return [];
  const gaps = shownChecks.filter((check) => check.kind !== 'cover').map((check) => ({ ...check, need: liveNeed(check) })).filter((check) => check.need);
  // A part the user wrote a step for needs no tick. Work that is all the task's work (D211) needs the
  // user's own step: a tick does not cover it.
  const unwritten = coverUnwritten(data);
  if (unwritten.length) gaps.unshift({ id: 'notCovered', kind: 'cover', label: 'Your own step for work SiteReady has no job steps for', need: `SiteReady has no job steps for: ${unwritten.join('; ')}. This is the work of the task, so write your own step for it with "Write a step for this" above the draft.` });
  const parts = coverLeft(data);
  if (parts.length && !coverDone(parts)) {
    gaps.unshift({ id: 'notCovered', kind: 'cover', label: 'Work SiteReady has no job steps for', need: `SiteReady has no job steps for: ${parts.join('; ')}. Write a step for it, or cover it in a separate SWMS, then tick the box above the draft.` });
  }
  return gaps;
}

// What is still needed, listed above the download buttons, each with a link that goes to it.
function gateBlock(gaps) {
  if (!gaps.length) return '';
  const answers = gaps.some((gap) => gap.kind !== 'cover');
  return `<div class="panel gate" id="gate-panel" role="region" aria-labelledby="gate-title">
    <h3 id="gate-title">Before you can download this SWMS</h3>
    <p>SiteReady does not produce a SWMS until the site questions are answered, the plant is confirmed, the emergency response is given,${gaps.some((gap) => gap.kind === 'design') ? ' the designs it relies on are named,' : ''} no blank is left in it, and any work it has no job steps for is dealt with. You can keep looking at the draft. Deal with ${gaps.length === 1 ? 'this' : `these ${gaps.length}`}. Each one comes off this list as soon as it is answered:</p>
    <ul class="gate-list">${gaps.map((gap, i) => `<li><button type="button" class="link" ${gap.kind === 'cover' ? 'data-cover-jump' : `data-gate-go="${i}"`}>${esc(gap.label)}</button><span class="meta">${esc(gap.need)}</span></li>`).join('')}</ul>
    ${answers ? '<div class="actions"><button type="button" id="gate-update">Update the draft</button></div>' : ''}
  </div>`;
}

// The list and the line above the draft, drawn again when the draft or the tick changes, and as
// the user answers. Each is changed only where it differs, so a phone does not jump while typing.
let shownGaps = [];
const setHtml = (el, html) => { if (el && el.innerHTML !== html) el.innerHTML = html; };
// The list as last drawn, cleared with each new draft.
let gateDrawn = '';
function showGate() {
  shownGaps = outstanding(shownDraft);
  const S = window.SiteReady || {};
  const drawn = JSON.stringify(shownGaps.map((gap) => [gap.label, gap.need]));
  if (drawn !== gateDrawn) {
    gateDrawn = drawn;
    setHtml(document.getElementById('result-gate'), gateBlock(shownGaps));
  }
  setHtml(document.getElementById('result-gate-top'), shownGaps.length ? `<p class="warning gate-top">This SWMS cannot be downloaded yet: ${shownGaps.length === 1 ? 'one item needs' : `${shownGaps.length} items need`} dealing with. <button type="button" class="link" data-gate-list>See what is needed</button></p>` : '');
  markGaps(shownGaps.filter((gap) => gap.kind !== 'cover'));
  // The buttons under the draft (account.js), and a SWMS in a project (scope.js).
  if (S.onGateChange) S.onGateChange();
  if (S.onAnswers && shownDraft && shownDraft.kind === 'draft' && shownSent) {
    S.onAnswers({ task: shownSent.task, needs: [...new Set(shownGaps.filter((gap) => gap.kind !== 'cover').map((gap) => gap.label))], answers: currentAnswers(), stale: draftStale() });
  }
}
// What the buttons under the draft wait for: the items still outstanding, and whether the draft must
// be prepared again to print what was typed since.
const liveGate = () => ({ waiting: shownGaps.length, stale: draftStale() });
// Judged again as the user types or ticks anywhere on the page, once per frame.
let gateFrame = 0;
['input', 'change'].forEach((type) => document.addEventListener(type, (event) => {
  if (!shownDraft || shownDraft.kind !== 'draft' || resultEl.classList.contains('hidden') || (event.target.closest && event.target.closest('.confirm'))) return;
  if (gateFrame) return;
  const later = window.requestAnimationFrame || ((fn) => setTimeout(fn, 16));
  gateFrame = later(() => { gateFrame = 0; showGate(); });
}));

// ---- A shorter draft on a phone (goal 7) ----

// On a phone the draft was about 45 screens long, mostly the job steps' controls with a Change and
// Remove beside every line. On a phone (the same width the tables stack at) each step's tools show
// after Change this step, a step with many controls shows its first few with a button for the rest,
// and the forms printed for others to fill in (legislation list, principal contractor review,
// worker sign-on lines) start folded under their heading. Only the screen changes: the Word and PDF
// files, and the SWMS saved, are the same. On a computer everything shows as before.
const PHONE_WIDTH = '(max-width: 640px)';
const onPhone = () => Boolean(window.matchMedia && window.matchMedia(PHONE_WIDTH).matches);
// A step with more than this many controls shows the first FEW_CONTROLS on a phone.
const MANY_CONTROLS = 8;
const FEW_CONTROLS = 6;
// The steps being changed, and those showing all their controls, by job step name, so they stay
// so when the draft is prepared again after a change.
const stepsEditing = new Set();
const stepsOpen = new Set();

// A section that starts folded on a phone, under a heading that says what is in it.
function folded(heading, body, note = '') {
  return `<details class="sheet-fold"${onPhone() ? '' : ' open'}><summary><h4>${esc(heading)}</h4>${note ? `<span class="fold-note">${esc(note)}</span>` : ''}</summary>${body}</details>`;
}

resultEl.addEventListener('click', (event) => {
  const edit = event.target.closest('[data-step-edit]');
  const more = event.target.closest('[data-ctl-more]');
  if (!edit && !more) return;
  const row = (edit || more).closest('tr[data-step-row]');
  const step = shownDraft && (shownDraft.jobSteps || [])[Number(row.dataset.stepRow)];
  if (!step) return;
  if (more) {
    stepsOpen.add(step.step);
    row.classList.add('open-all');
    return;
  }
  const on = !stepsEditing.has(step.step);
  if (on) stepsEditing.add(step.step); else stepsEditing.delete(step.step);
  row.classList.toggle('editing', on);
  edit.setAttribute('aria-expanded', String(on));
  edit.textContent = on ? 'Done changing this step' : 'Change this step';
});

// ---- The designs the job steps rely on (designs.js, owner, 11 October 2026) ----

// Asked once, under the site questions: for each design a step is done to, what it is, who prepared
// it, its number, revision and date, and the file if the user has it. "Not issued yet" prints a hold
// point in the steps that use it; "Not needed for this work" is recorded as the user's choice. The
// download waits until each one is answered (download-gate.js).
const designRow = (id) => (designAnswers || []).find((row) => row.id === id) || null;
const designShown = (id) => Boolean(document.getElementById(`design-${id}`));
// A written method or sequence of works the work follows (owner, D224): optional, on every draft,
// kept with the designs as "method-1" and so on. SiteReady can read a typed one and suggest job steps
// for the user to accept (method-read.js, D230).
const isMethodRow = (row) => Boolean(row && /^method-\d+$/.test(row.id || ''));
const ownRow = (row) => Boolean(row && /^(?:added|method)-\d+$/.test(row.id || ''));
const methodTyped = (row) => ['what', 'by', 'number', 'revision', 'date'].some((key) => String(row[key] || '').trim()) || Boolean(row.file);
function designsPayload() {
  const rows = (designAnswers || []).filter((row) => row.id && (isMethodRow(row) ? methodTyped(row) : (!/^added-/.test(row.id) || String(row.what || '').trim())));
  return rows.length ? rows.map((row) => ({ ...row })) : undefined;
}
// Whether files can be attached here (the storage bucket, or a local run), and the size limit.
let designFileConfig = null;
async function designFilesOn() {
  if (!designFileConfig) {
    designFileConfig = fetch(api('/api/config')).then((response) => response.json()).then((data) => data.designFiles || { enabled: false, maxMb: 10 }).catch(() => ({ enabled: false, maxMb: 10 }));
  }
  return designFileConfig;
}
const fileSize = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
let designsDrawn = '';
function designCard(row, found) {
  const id = esc(row.id);
  const added = /^added-/.test(row.id);
  const status = row.status || '';
  const radio = (value, label) => `<label><input type="radio" name="design-status-${id}" value="${value}" data-design-field="status"${status === value ? ' checked' : ''}> ${label}</label>`;
  const box = (key, label, hint, type = 'text', max = 120) => `<div class="field"><label for="design-${id}-${key}">${label}${hint ? `<span class="hint">${hint}</span>` : ''}</label><input id="design-${id}-${key}" type="${type}" data-design-field="${key}" maxlength="${max}" autocomplete="off" value="${esc(row[key] || '')}"></div>`;
  return `<fieldset class="field design-card" id="design-${id}" data-design="${id}" data-status="${esc(status)}" tabindex="-1">
    <legend>${esc(row.what || (added ? 'Another design' : (found && found.label) || 'Design'))}</legend>
    ${found && found.steps.length ? `<p class="meta">Used in: ${esc(found.steps.join('; '))}.</p>` : '<p class="meta">Prints in the designs table near the top of the SWMS.</p>'}
    <div class="choice design-status">${radio('given', 'I have it')}${radio('notIssued', 'Not issued yet')}${radio('notNeeded', 'Not needed for this work')}</div>
    <div class="design-given">
      ${box('what', 'What it is', 'As the design is titled, for example Shoring design or Formwork design.', 'text', 200)}
      ${box('by', 'Who prepared it', 'The engineer or firm, for example Smith Engineering.', 'text', 200)}
      <div class="design-pair">${box('number', 'Document or drawing number', 'From the title block, for example ABC-S-101.')}${box('revision', 'Revision', 'For example C. Leave it empty if it has none.', 'text', 40)}</div>
      <p class="warning design-same" id="design-${id}-same" hidden></p>
      ${box('date', 'Date on the design', '', 'date', 60)}
      ${designFileBox(row, 'drawing')}
    </div>
    <p class="note design-hold">The steps that use it print a hold point: "Do not start this step until the design is issued and this SWMS is updated." When the design arrives, add its details here and save a new revision.</p>
    <p class="note design-skip">Choose this only if the work in these steps is not done to a design on this job. The SWMS records it as your business's choice, and a reviewer may ask why.</p>
    ${added ? `<p><button type="button" class="link" data-design-remove="${id}">Remove this design</button></p>` : ''}
  </fieldset>`;
}
// The file box of a card: attached, with Open and Remove, or the button to attach one.
function designFileBox(row, what) {
  const id = esc(row.id);
  const file = row.file
    ? `<p class="design-file">Attached: <strong>${esc(row.file.name)}</strong> <span class="meta">(${esc(fileSize(row.file.size || 0))})</span> <button type="button" class="link" data-design-open="${id}">Open</button> <button type="button" class="link" data-design-unfile="${id}">Remove the file</button></p>`
    : `<label class="secondary small design-attach" for="design-${id}-file">Attach the file</label><input id="design-${id}-file" class="visually-hidden" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" data-design-file="${id}">`;
  return `<div class="field design-file-box"><p class="design-file-label">The file <span class="meta">(optional)</span></p>
        <p class="meta">A PDF, or a photo of the ${what}, up to 10 MB. It stays with this SWMS in SiteReady, for you and your reviewer to open. It does not print.</p>
        ${file}<p class="meta design-file-msg" data-design-msg="${id}" role="status"></p></div>`;
}
// A written method's card: the same details and file as a design, with no status to choose (the
// user adds one only when they have it), and plainly said: SiteReady reads typed words only, and the
// user makes the job steps match it. The reading and its suggestions are drawn by method-read.js.
const METHOD_CAUTION = 'SiteReady reads only the typed words of a methodology, never drawings or scanned pages, and its suggestions can be wrong: check every one against the methodology. It is up to you to make sure the job steps match it. Where they differ, change the steps on the draft with "Change this step", or write your own with "Write a step for this" or "Write a step of your own".';
function methodCard(row) {
  const id = esc(row.id);
  const box = (key, label, hint, type = 'text', max = 120) => `<div class="field"><label for="design-${id}-${key}">${label}${hint ? `<span class="hint">${hint}</span>` : ''}</label><input id="design-${id}-${key}" type="${type}" data-design-field="${key}" maxlength="${max}" autocomplete="off" value="${esc(row[key] || '')}"></div>`;
  const rules = window.SiteReadyGate;
  const need = rules && rules.methodNeed ? rules.methodNeed(row) : '';
  return `<fieldset class="field design-card method-card" id="design-${id}" data-design="${id}" data-status="given" tabindex="-1">
    <legend>${esc(String(row.what || '').trim() || 'Written methodology or sequence of works')}</legend>
    <p class="warning method-caution">${esc(METHOD_CAUTION)}</p>
    <p class="meta">Prints in the table near the top of the SWMS. Nothing is added to the job steps unless you accept a suggested step.</p>
    <div class="design-given">
      ${box('what', 'What it is', 'As the document is titled, for example Jump lift machine platform raising methodology.', 'text', 200)}
      ${box('by', 'Who prepared it', 'The company or person, for example the lift company.', 'text', 200)}
      <div class="design-pair">${box('number', 'Document number', 'From the document, for example LC-MS-014.')}${box('revision', 'Revision', 'For example C. Leave it empty if it has none.', 'text', 40)}</div>
      <p class="warning design-same" id="design-${id}-same" hidden></p>
      ${box('date', 'Date on the document', '', 'date', 60)}
      ${designFileBox(row, 'document')}
    </div>
    <p class="method-need" id="design-${id}-need" role="status"${need ? '' : ' hidden'}>${esc(need)}</p>
    ${window.SiteReadyMethodRead ? window.SiteReadyMethodRead.boxHtml(row) : ''}
    <p><button type="button" class="link" data-design-remove="${id}">Remove this methodology</button></p>
  </fieldset>`;
}
// What a method still needs before it prints, said on its card as the user types.
function showMethodNeed(row) {
  const note = document.getElementById(`design-${row.id}-need`);
  const rules = window.SiteReadyGate;
  if (!note || !rules || !rules.methodNeed) return;
  const text = rules.methodNeed(row);
  if (note.textContent !== text) note.textContent = text;
  note.hidden = !text;
}
// Draws the cards for the designs the server found, keeping what the user has typed. Drawn again only
// when the designs or their steps change, so a phone does not jump while the user types.
function drawDesigns(list) {
  designsFound = (list || []).filter((row) => row.needed);
  const answers = designAnswers || [];
  for (const row of answers) if (row && row.id && !ownRow(row)) designsKept.set(row.id, row);
  const rows = designsFound.map((found) => {
    const mine = designsKept.get(found.id);
    return mine || { id: found.id, what: found.what, status: found.status || '', by: found.by || '', number: found.number || '', revision: found.revision || '', date: found.date || '', ...(found.file ? { file: found.file } : {}) };
  });
  // The designs the user added, then the written methods, each kept as typed.
  const added = [...answers.filter((row) => /^added-/.test(row.id)), ...answers.filter(isMethodRow)];
  designAnswers = rows.length || added.length ? [...rows, ...added] : null;
  const section = document.getElementById('designs-section');
  if (!section) return;
  const shape = JSON.stringify([designsFound.map((row) => [row.id, row.label, row.steps]), added.map((row) => row.id)]);
  const designs = (designAnswers || []).filter((row) => !isMethodRow(row));
  const methods = (designAnswers || []).filter(isMethodRow);
  section.classList.toggle('hidden', !designs.length);
  // The written methods: optional, on every draft, under the designs (D224).
  const methodsHead = document.getElementById('methods-head');
  if (methodsHead) methodsHead.classList.toggle('hidden', !methods.length);
  const methodAdd = document.getElementById('method-add');
  if (methodAdd) methodAdd.textContent = methods.length ? 'Add another written methodology or sequence of works (optional)' : 'Add a written methodology or sequence of works (optional)';
  if (shape === designsDrawn) { showSameNumbers(); return; }
  designsDrawn = shape;
  document.getElementById('designs-block').innerHTML = designs.map((row) => designCard(row, designsFound.find((found) => found.id === row.id))).join('');
  const methodsBlock = document.getElementById('methods-block');
  if (methodsBlock) methodsBlock.innerHTML = methods.map((row) => methodCard(row)).join('');
  showSameNumbers();
  designFilesOn().then((config) => { if (!config.enabled) document.querySelectorAll('.design-file-box').forEach((el) => { el.innerHTML = '<p class="meta">Attaching the file is not switched on yet. The reference is what prints.</p>'; }); });
}
// Two designs answered "I have it" with the same document or drawing number (D223): a note on each
// card, as the user types. Advice only: one drawing can cover two designs, so the download and the
// printed SWMS do not change (gate-rules.js sameDesignNumbers).
function showSameNumbers() {
  const rules = window.SiteReadyGate;
  const groups = rules && rules.sameDesignNumbers ? rules.sameDesignNumbers(designAnswers || []) : [];
  const said = new Map();
  for (const group of groups) for (const id of group.ids) said.set(id, [...(said.get(id) || []), group.text]);
  for (const row of designAnswers || []) {
    const note = document.getElementById(`design-${row.id}-same`);
    if (!note) continue;
    const text = (said.get(row.id) || []).join(' ');
    if (note.textContent !== text) note.textContent = text;
    note.hidden = !text;
    const box = document.getElementById(`design-${row.id}-number`);
    if (box) { if (text) box.setAttribute('aria-describedby', note.id); else box.removeAttribute('aria-describedby'); }
  }
}
function redrawDesigns() {
  designsDrawn = '';
  drawDesigns(designsFound);
}
const designsBlock = document.getElementById('designs-block');
// The written methods' cards work as the designs' do.
const designBlocks = [designsBlock, document.getElementById('methods-block')].filter(Boolean);
// What the user types or picks in a card is kept as they go.
['input', 'change'].forEach((type) => designBlocks.forEach((block) => block.addEventListener(type, (event) => {
  const field = event.target.dataset && event.target.dataset.designField;
  const card = event.target.closest && event.target.closest('[data-design]');
  if (!field || !card) return;
  const row = designRow(card.dataset.design);
  if (!row) return;
  if (field === 'status' && !event.target.checked) return;
  row[field] = event.target.value;
  if (field === 'status') card.dataset.status = event.target.value;
  if (field === 'what') card.querySelector('legend').textContent = event.target.value.trim() || (isMethodRow(row) ? 'Written methodology or sequence of works' : 'Another design');
  if (['what', 'status', 'number', 'revision'].includes(field)) showSameNumbers();
  if (isMethodRow(row)) showMethodNeed(row);
})));
document.getElementById('design-add') && document.getElementById('design-add').addEventListener('click', () => {
  const used = new Set((designAnswers || []).map((row) => row.id));
  let n = 1;
  while (used.has(`added-${n}`)) n += 1;
  designAnswers = [...(designAnswers || []), { id: `added-${n}`, what: '', status: 'given', by: '', number: '', revision: '', date: '' }];
  redrawDesigns();
  const box = document.getElementById(`design-added-${n}-what`);
  if (box) box.focus();
});
// A written method added to any draft: its card, with the caution, ready to fill in.
document.getElementById('method-add') && document.getElementById('method-add').addEventListener('click', () => {
  const used = new Set((designAnswers || []).map((row) => row.id));
  let n = 1;
  while (used.has(`method-${n}`)) n += 1;
  designAnswers = [...(designAnswers || []), { id: `method-${n}`, what: '', status: 'given', by: '', number: '', revision: '', date: '' }];
  redrawDesigns();
  const box = document.getElementById(`design-method-${n}-what`);
  if (box) box.focus();
});
designBlocks.forEach((block) => block.addEventListener('click', async (event) => {
  const remove = event.target.closest('[data-design-remove]');
  if (remove) {
    designAnswers = (designAnswers || []).filter((row) => row.id !== remove.dataset.designRemove);
    if (!designAnswers.length) designAnswers = null;
    redrawDesigns();
    keepUnsaved();
    return;
  }
  const unfile = event.target.closest('[data-design-unfile]');
  if (unfile) {
    const row = designRow(unfile.dataset.designUnfile);
    if (row) delete row.file;
    redrawDesigns();
    keepUnsaved();
    return;
  }
  const open = event.target.closest('[data-design-open]');
  if (open) {
    const row = designRow(open.dataset.designOpen);
    const S = window.SiteReady || {};
    if (row && row.file && S.openFile) S.openFile(`/api/designs/files/${encodeURIComponent(row.file.id)}`, row.file.name).catch((error) => { const msg = block.querySelector(`[data-design-msg="${row.id}"]`); if (msg) msg.textContent = error.message; });
  }
}));
// A file is checked here for its type and size, then sent; the server checks its content again.
designBlocks.forEach((block) => block.addEventListener('change', async (event) => {
  const input = event.target.closest && event.target.closest('[data-design-file]');
  if (!input || !input.files || !input.files[0]) return;
  const id = input.dataset.designFile;
  const file = input.files[0];
  const msg = block.querySelector(`[data-design-msg="${id}"]`);
  const say = (text) => { if (msg) msg.textContent = text; };
  const config = await designFilesOn();
  const S = window.SiteReady || {};
  if (!S.isSignedIn || !S.isSignedIn()) { say('Sign in to attach the file. You can give the reference now and attach the file later.'); input.value = ''; return; }
  if (!/\.(pdf|png|jpe?g)$/i.test(file.name) && !/^(application\/pdf|image\/png|image\/jpeg)$/.test(file.type)) { say('Attach a PDF, PNG or JPEG.'); input.value = ''; return; }
  if (file.size > config.maxMb * 1024 * 1024) { say(`The file is larger than ${config.maxMb} MB. Attach a smaller copy${isMethodRow(designRow(id)) ? '' : ', such as the drawing sheets only'}.`); input.value = ''; return; }
  say('Attaching...');
  try {
    const data = await S.sendFile('/api/designs/files', file);
    const row = designRow(id);
    if (row) row.file = data.file;
    redrawDesigns();
    keepUnsaved();
    if (typeof showGate === 'function' && shownDraft) showGate();
  } catch (error) {
    say(error.message);
    input.value = '';
  }
}));

// ---- The plant and the emergency response, asked in the draft (goal 2) ----

// The plant SiteReady lists, as a tick list the user confirms before download: what the crew uses
// is ticked, plant SiteReady is not sure of starts unticked, and the user adds their own with the
// licence or ticket to operate it. Only the plant confirmed prints.
function plantTicked(item) {
  if (plantPending && plantPending.ticks && item.item in plantPending.ticks) return plantPending.ticks[item.item];
  if (plantChoice && (plantChoice.used || []).includes(item.item)) return true;
  if (plantChoice && (plantChoice.notUsed || []).includes(item.item)) return false;
  return !item.maybe;
}
const plantOwn = () => (plantPending && plantPending.own) || (plantChoice && plantChoice.added) || [];
function plantBlock(draft) {
  const listed = draft.plantInferred || [];
  const gap = (draft.gate || []).find((item) => item.kind === 'plant');
  const done = plantChoice && !gap && !plantPending;
  const status = plantPending ? 'You have changes. Press Confirm the plant to use them.'
    : !plantChoice ? 'Not confirmed yet. The download waits for it.'
      : gap ? gap.need : 'Confirmed. Only the plant ticked here prints on the SWMS.';
  const ticks = listed.length
    ? listed.map((item) => `<label class="check"><input type="checkbox" data-plant-item="${esc(item.item)}"${plantTicked(item) ? ' checked' : ''}><span>${esc(item.item)}${item.maybe ? ' <span class="meta">SiteReady is not sure this is used. Tick it only if it is.</span>' : ''}</span></label>`).join('')
    : '<p class="meta">SiteReady found no plant in this task. Add the plant and equipment your crew uses, if any.</p>';
  const own = plantOwn().map((item, i) => `<p class="plant-own"><strong>${esc(item.item)}</strong>: ${item.licence ? esc(item.licence) : 'licence or ticket not given'} <button type="button" class="link" data-plant-remove="${i}">Remove</button></p>`).join('');
  return `<div class="panel answer-panel${done ? ' done' : ''}" id="plant-panel">
    <fieldset class="field" id="plant-ticks" tabindex="-1"><legend>Confirm the plant and equipment for this job</legend>
      <p class="meta">SiteReady listed these from the task and the job steps. Tick what your crew will use, untick what it will not, and add anything missing. Only the plant you confirm prints on the SWMS. The job steps stay as they are: change them under Job steps if the method changes.</p>
      ${ticks}${own}
    </fieldset>
    <div class="field"><label for="plant-own-item">Add your own plant or equipment</label><input id="plant-own-item" type="text" maxlength="200" placeholder="For example: 1.7 t mini excavator"></div>
    <div class="field"><label for="plant-own-licence">Licence or ticket to operate it<span class="hint">Write No if none is needed.</span></label><input id="plant-own-licence" type="text" maxlength="300"></div>
    <div class="actions"><button type="button" class="secondary" id="plant-add">Add this item</button><button type="button" id="plant-confirm">Confirm the plant</button></div>
    <p class="meta plant-status" id="plant-status" role="status">${esc(status)}</p>
  </div>`;
}

// The emergency questions for the high risk work in this SWMS (emergency.js), answered on the page
// and printed in the emergency arrangements.
function emergencyBlock(draft) {
  const asked = draft.emergencyQuestions || [];
  if (!asked.length) return '';
  const answer = (item) => (emergencyAnswers && typeof emergencyAnswers[item.id] === 'string' ? emergencyAnswers[item.id] : item.answer || '');
  return `<div class="panel answer-panel" id="emergency-panel">
    <p><strong>Emergency response for this work</strong></p>
    <p class="meta">A reviewer looks for how your crew responds to an emergency in this work, not only the heading. Answer each question for this site. The answers print in the emergency arrangements above. Not applicable is not an answer here: SiteReady asks only about work this SWMS involves.</p>
    ${asked.map((item) => `<div class="field"><label for="emg-${esc(item.id)}">${esc(item.ask)}<span class="hint">${esc(item.hint)}</span></label><textarea id="emg-${esc(item.id)}" data-emergency="${esc(item.id)}" maxlength="600">${esc(answer(item))}</textarea></div>`).join('')}
    <div class="actions"><button type="button" id="emergency-update">Update the draft</button></div>
  </div>`;
}

// The note printed under a step's controls where its rating counts controls in an earlier step
// (docx-draft.js sharedNote).
function sharedNote(step, steps) {
  if (!step.seeAlso || !step.seeAlso.length) return '';
  return `The controls in ${step.seeAlso.map((name) => `step ${steps.findIndex((other) => other.step === name) + 1} (${name})`).join(' and ')} also apply here.`;
}

// Printing the page prints every section, folded or not.
if (typeof window.addEventListener === 'function') {
  window.addEventListener('beforeprint', () => document.querySelectorAll('details.sheet-fold').forEach((el) => { el.open = true; }));
}

// The designs the job steps rely on, as the SWMS prints them (designs.js tableRows), with a button
// to open an attached file: on the page from the business's own upload, on a saved SWMS from the
// SWMS itself. Only signed-in users of the business can open it.
function designsTable(draft, swmsId) {
  const rows = draft.designs || [];
  if (!rows.length) return '';
  const rev = (value) => String(value || '').replace(/^(?:rev(?:ision)?\.?\s*)/i, '');
  const opener = (row) => (row.file && row.status === 'given'
    ? `<br><button type="button" class="link" data-design-file-open="${esc(swmsId ? `/api/swms/${encodeURIComponent(swmsId)}/designs/${encodeURIComponent(row.file.id)}` : `/api/designs/files/${encodeURIComponent(row.file.id)}`)}" data-design-file-name="${esc(row.file.name)}">Open the file</button>` : '');
  const cells = (row) => [row.what, row.status === 'given' ? row.by : '', row.status === 'given' ? [row.number, rev(row.revision) ? `rev ${rev(row.revision)}` : ''].filter(Boolean).join(' ') : '', row.status === 'given' ? designDate(row.date) : ''];
  // With a written method listed (D224), the title, first column and note say so (designs.js).
  const methods = rows.filter((row) => row.kind === 'method').length;
  const designs = rows.length - methods;
  const first = !methods ? 'Design' : designs ? 'Design or methodology' : 'Methodology';
  const title = !methods ? 'Designs this SWMS relies on' : designs ? 'Designs and methodologies this SWMS relies on' : 'Written methodologies this SWMS relies on';
  const note = `${designs ? 'Each step that relies on a design names it. ' : ''}${methods ? 'The work follows each methodology listed here. ' : ''}Work to the revision listed here. If a new revision is issued, check this SWMS against it and update it before work continues.`;
  const labels = [first, 'Prepared by', 'Document or drawing, revision', 'Date', 'Status'];
  return `<h4>${title}</h4><p class="meta">${note}</p>
    <table class="stack"><thead><tr>${labels.map((label) => `<th>${label}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${cells(row).map((value, i) => `<td data-label="${labels[i]}">${esc(value)}</td>`).join('')}<td data-label="Status">${esc(`${row.statusText}${row.steps.length ? ` Used in: ${row.steps.join('; ')}.` : ''}`)}${opener(row)}</td></tr>`).join('')}</tbody></table>`;
}
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function designDate(value) {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  return iso && Number(iso[2]) >= 1 && Number(iso[2]) <= 12 ? `${Number(iso[3])} ${MONTH_NAMES[Number(iso[2]) - 1]} ${iso[1]}` : String(value || '');
}

function render(draft, { movable = false, swmsId = '' } = {}) {
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
        <tr><th>Revision</th><td>${esc(revisionText(draft))}</td></tr>
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
  // A control with a blank (____) has a box in each blank for the user's answer (goal 2).
  const blankKeys = draft.blankKeys || { steps: [], controls: [] };
  const anchored = new Set();
  const lineText = (line, key) => (movable && key ? fillBox(line, key, draft.gate, anchored) : esc(line));
  const controls = `<table><thead><tr><th>Hierarchy</th><th>Control</th></tr></thead><tbody>${draft.controls.map((item, i) => `<tr><td>${esc(item.level)}</td><td>${lineText(item.text, blankKeys.controls[i])}</td></tr>`).join('')}</tbody></table>`;
  const site = draft.site.map((field) => `<p><strong>${esc(field.label)}</strong></p><div class="blank">${esc(field.text)}</div>`).join('');
  const list = (items) => `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`;
  // In the preview each control can be changed or removed, and the user can add their own.
  // Lines that are a legal requirement, or that SiteReady recommends keeping, say why before the
  // user goes ahead. A removed or weakened line asks why, which the user can leave blank.
  const report = draft.controlEdits || {};
  const shared = (step) => sharedNote(step, draft.jobSteps || []);
  const controlCell = (step, index) => {
    if (!movable) return `<ul>${step.controls.map((line) => `<li${/^Hold point:/.test(line) ? ' class="design-hold-line"' : ''}>${esc(line)}</li>`).join('')}</ul>${shared(step) ? `<p class="ctl-shared">${esc(shared(step))}</p>` : ''}`;
    const legal = (draft.controlLegal || [])[index] || [];
    const warn = (draft.controlWarn || [])[index] || [];
    const removed = ((controlEdits || {})[step.step] || {}).removed || [];
    const warned = (report.warned || []).filter((item) => item.step === step.step);
    const asks = (report.applied || []).filter((item) => item.step === step.step && (item.kind === 'removed' || warned.some((other) => other.text === item.from)));
    // On a phone, a long list shows its first lines; a line with a blank to fill in always shows.
    const folds = (i) => step.controls.length > MANY_CONTROLS && i >= FEW_CONTROLS && !(blankKeys.steps[index] || [])[i];
    const hidden = step.controls.filter((_line, i) => folds(i)).length;
    // A design's reference or hold point is changed under Designs this work relies on, not here.
    const fromDesign = new Set(step.designLines || []);
    const designItem = (line, i) => `<li data-ctl-step="${index}" data-ctl-line="${i}" class="design-line${/^Hold point:/.test(line) ? ' design-hold-line' : ''}">${esc(line)}<span class="meta"> From the designs this work relies on. Change it there.</span></li>`;
    return `<ul>${step.controls.map((line, i) => (fromDesign.has(line) ? designItem(line, i) : `<li data-ctl-step="${index}" data-ctl-line="${i}"${folds(i) ? ' class="ctl-more"' : ''}${legal[i] ? ` data-legal="${esc(legal[i])}"` : ''}${warn[i] ? ` data-warn="${esc(warn[i])}"` : ''}>${lineText(line, (blankKeys.steps[index] || [])[i])}<span class="ctl-tools"><button type="button" class="link" data-ctl="change">Change</button><button type="button" class="link" data-ctl="remove">Remove</button></span></li>`)).join('')}${removed.map((line, r) => `<li class="ctl-removed" data-ctl-step="${index}"><s>${esc(line)}</s><span class="ctl-tools"><button type="button" class="link" data-ctl="restore" data-removed="${r}">Put back</button></span></li>`).join('')}</ul>
      ${shared(step) ? `<p class="ctl-shared">${esc(shared(step))}</p>` : ''}
      ${warned.map((item) => `<p class="warning ctl-warn">${esc(`${item.kind === 'removed' ? 'Removed' : item.kind === 'changed' ? 'Changed' : 'Added'}: ${item.kind === 'added' ? item.to : item.text}. ${item.warnings.join(' ')}`)}</p>`).join('')}
      ${hidden ? `<button type="button" class="secondary ctl-show" data-ctl-more="${index}">Show all ${step.controls.length} controls</button>` : ''}
      ${asks.map((item) => whyBox(index, item)).join('')}
      <button type="button" class="link" data-ctl="add" data-ctl-step="${index}">Add your own control</button><p class="meta ctl-msg" data-ctl-msg="${index}" role="status"></p>`;
  };
  // Hazards can be reworded and added; SiteReady's own are marked "does not apply", never deleted.
  const hazardCell = (step, index) => {
    if (!movable) return list(step.hazards);
    const asks = (report.applied || []).filter((item) => item.step === step.step && item.kind === 'hazardNotApplicable');
    return `<ul>${step.hazards.map((line, i) => {
      const own = line.endsWith(HAZARD_MARK);
      const off = line.endsWith(NOT_APPLICABLE);
      const tools = off
        ? '<button type="button" class="link" data-hz="applies">It applies</button>'
        : `<button type="button" class="link" data-hz="change">Change</button>${own ? '<button type="button" class="link" data-hz="remove">Remove</button>' : '<button type="button" class="link" data-hz="na">Does not apply</button>'}`;
      return `<li data-hz-step="${index}" data-hz-line="${i}"${off ? ' class="ctl-removed"' : ''}>${esc(line)}<span class="ctl-tools">${tools}</span></li>`;
    }).join('')}</ul>
      ${asks.map((item) => whyBox(index, item, 'hazard')).join('')}
      <button type="button" class="link" data-hz="add" data-hz-step="${index}">Add a hazard</button>`;
  };
  const whoCell = (step, index) => (movable
    ? `<span data-who-step="${index}">${esc(step.responsible || '')}<span class="ctl-tools"><button type="button" class="link" data-who="change">Change</button></span></span>`
    : esc(step.responsible || ''));
  const stepRowClass = (step) => {
    const names = [stepsEditing.has(step.step) ? 'editing' : '', stepsOpen.has(step.step) ? 'open-all' : ''].filter(Boolean);
    return names.length ? ` class="${names.join(' ')}"` : '';
  };
  // A rating still High after the controls says what happens before the step starts, as printed.
  const riskCell = (risk) => (risk ? `Before: <strong>${esc(risk.before.level)}</strong><br>${esc(risk.before.label)}<br>After: <strong>${esc(risk.after.level)}</strong><br>${esc(risk.after.label)}${risk.response ? `<span class="risk-response">${esc(risk.response)}</span>` : ''}` : '');
  const libraryRow = (step, index, all) => `<tr${movable ? ` draggable="true" data-step-row="${index}"${stepRowClass(step)}` : ''}><td data-label="Job step"><strong>${index + 1}. ${esc(step.step)}</strong>${movable ? `<button type="button" class="secondary step-edit" data-step-edit="${index}" aria-expanded="${stepsEditing.has(step.step)}">${stepsEditing.has(step.step) ? 'Done changing this step' : 'Change this step'}</button><span class="step-move"><button type="button" data-move="-1" data-index="${index}" aria-label="Move ${esc(step.step)} up"${index === 0 ? ' disabled' : ''}>&#9650;</button><button type="button" data-move="1" data-index="${index}" aria-label="Move ${esc(step.step)} down"${index === all.length - 1 ? ' disabled' : ''}>&#9660;</button></span>` : ''}</td><td data-label="Hazards and risks">${hazardCell(step, index)}</td><td data-label="Controls">${controlCell(step, index)}</td><td data-label="Risk rating">${riskCell(step.risk)}</td><td data-label="Who">${whoCell(step, index)}</td></tr>`;
  // A step the user wrote (owner, 11 October 2026): its lines as written, with what a reviewer would
  // mark down said beside it, changed or removed in the form it was written in, and moved like any step.
  let ownSeen = 0;
  const ownRow = (step, index, all) => {
    ownSeen += 1;
    const name = step.step.replace(/\s*\(Our own step\)$/, '');
    const notes = ((draft.ownStepNotes || []).find((item) => item.name === name) || {}).notes || [];
    const moves = `<span class="step-move"><button type="button" data-move="-1" data-index="${index}" aria-label="Move ${esc(step.step)} up"${index === 0 ? ' disabled' : ''}>&#9650;</button><button type="button" data-move="1" data-index="${index}" aria-label="Move ${esc(step.step)} down"${index === all.length - 1 ? ' disabled' : ''}>&#9660;</button></span>`;
    return `<tr draggable="true" data-step-row="${index}" data-own-row="${esc(name)}" class="own-step"><td data-label="Job step"><strong>${index + 1}. ${esc(step.step)}</strong>
      <span class="own-tools" data-own-tools="${esc(name)}"><button type="button" class="link" id="own-step-${ownSeen}" data-own-change="${esc(name)}">Change your step</button><button type="button" class="link" data-own-remove="${esc(name)}">Remove your step</button></span>${moves}
      ${notes.map((note) => `<p class="warning ctl-warn">${esc(note)}</p>`).join('')}</td><td data-label="Hazards and risks">${list(step.hazards)}</td><td data-label="Controls">${list(step.controls)}</td><td data-label="Risk rating">${riskCell(step.risk)}</td><td data-label="Who">${esc(step.responsible || '')}</td></tr>`;
  };
  const steps = `<table class="stack"><thead><tr><th>Job step</th><th>Hazards and risks</th><th>Controls</th><th>Risk rating</th><th>Who</th></tr></thead><tbody>${(draft.jobSteps || []).map((step, index, all) => (movable && step.own ? ownRow(step, index, all) : libraryRow(step, index, all))).join('')}</tbody></table>
    <p class="meta">Suggested ratings, before and after the controls. The supervisor checks them and changes them to suit the site. Where a rating after the controls is still High, add controls or have the supervisor accept the risk before work starts.</p>`;
  const grid = (labels, rows) => `<table class="stack"><thead><tr>${labels.map((label) => `<th>${esc(label)}</th>`).join('')}</tr></thead><tbody>${rows.map((cells) => `<tr>${cells.map((value, index) => `<td data-label="${esc(labels[index] || '')}">${esc(value).replace(/\n/g, '<br>')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const plantTable = (draft.plant || []).length ? grid(['Item', 'Inspection and maintenance', 'Licence or ticket to operate'], draft.plant.map((item) => [item.item, item.inspection, item.licence])) : '';
  const registers = `${plantTable || movable ? `<h4>Plant and equipment</h4>${movable ? plantBlock(draft) : ''}${plantTable || '<p class="meta">No plant prints on this SWMS.</p>'}` : ''}
    ${draft.substances && draft.substances.items.length ? `<h4>Hazardous substances</h4>${grid(['Type of product', 'Product name', 'Safety data sheet attached', 'Quantity'], draft.substances.items.map((item) => [item.product, '', 'Yes / No', '']))}` : ''}
    ${(draft.qualifications || []).length ? `<h4>Licences, tickets and training</h4>${list(draft.qualifications)}` : ''}
    ${(draft.emergency || []).length ? `<h4>Emergency arrangements</h4>${grid(['Emergency', 'Equipment and arrangements', 'Location, contact or detail'], draft.emergency.map((item) => [item.type, item.equipment, item.detail]))}${movable ? emergencyBlock(draft) : ''}` : ''}
    ${draft.sources && (draft.sources.legislation.length || draft.sources.codes.length) ? folded('Legislation and codes of practice', grid(['Legislation', 'Codes of practice and guidance'], [[draft.sources.legislation.join('\n'), draft.sources.codes.join('\n')]]), `${draft.sources.legislation.length + draft.sources.codes.length} listed`) : ''}`;
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
    ${designsTable(draft, swmsId)}
    <h4>Controls</h4>${controls}
    <h4>Job steps</h4>${movable ? '<p class="meta">Use the arrows, or drag a row, to put the job steps in the order the work is done. Every control and hazard is kept unless you change it. Lines you write or change are marked as your own. A hazard that does not apply is marked so, not deleted. SiteReady warns you before you remove or weaken a legal requirement or a line it recommends keeping, and you can say why.<span class="phone-only"> On a phone, tap Change this step to move a step or change its lines.</span></p>' : ''}${steps}
    ${movable ? '<p class="own-new"><button type="button" class="secondary small" data-own-new>Write a step of your own</button> <span class="meta">For work SiteReady has no job step for. It prints marked as your own.</span></p>' : ''}
    <h4>Personal protective equipment</h4>${ppe}
    ${registers}
    <h4>${esc(draft.reviewHeading)}</h4>
    <p>${esc(draft.review)}</p>
    <h4>Site-specific</h4>${site}
    ${(draft.references || []).length ? `<h4>Documents to keep on site with this SWMS</h4><table><tbody>${draft.references.map((item) => `<tr><th>${esc(item.label)}</th><td>${esc(item.text)}</td></tr>`).join('')}</tbody></table>` : ''}
    <h4>Prepared by</h4>
    <table><tbody>${[['Name and position', draft.preparedBy], ['Signature', ''], ['Date', draft.preparedBy ? draft.date : ''], ['Date given to the principal contractor', '']].map(([label, value]) => `<tr><th>${label}</th><td>${esc(value)}</td></tr>`).join('')}</tbody></table>
    ${folded('Principal contractor review', `<p class="meta">Completed by the principal contractor before the work starts.</p>
    <table><tbody>
      <tr><th>Principal contractor</th><td>${esc(draft.principalContractor)}</td></tr>
      ${['Date SWMS received', 'Reviewed by (name and position)'].map((label) => `<tr><th>${label}</th><td></td></tr>`).join('')}
      <tr><th>Outcome</th><td>&#9744; Accepted &nbsp; &#9744; Accepted with changes &nbsp; &#9744; Not accepted: revise and resubmit</td></tr>
      ${['Comments or changes', 'Signature', 'Date'].map((label) => `<tr><th>${label}</th><td></td></tr>`).join('')}
    </tbody></table>`, 'Filled in by the principal contractor')}
    ${folded('Worker sign-on', `<p>By signing, I confirm this SWMS has been explained to me, I understand it, and I will follow it. If the work changes or a control is not working, I will stop and tell my supervisor.</p>
    <div class="sign"><div>Name</div><div>Signature</div><div>Date</div></div>
    <div class="sign"><div></div><div></div><div></div></div>
    <p class="meta">The Word file has two pages of lines for workers to sign.</p>`, 'Lines for workers to sign')}`;
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
let shownDraft = null;
// What was sent for the draft shown, for its buttons once the user signs in.
let shownSent = null;

// Parts of the task with no job steps (owner decision D184, 6 October 2026): named above the
// draft, not printed in the SWMS, with a tick that the user has dealt with them. Saving and the
// downloads wait for the tick (account.js, and the server). The tick holds for the list it was
// given for (coverTicked), so a changed list needs ticking again.
//
// Each part has a button to write a step for it (owner, 11 October 2026): the step prints in the
// SWMS marked as the user's own, and a part with a step written for it needs no tick.
const coverParts = (data) => (data && data.kind === 'draft' && Array.isArray(data.notCovered) ? data.notCovered : []);
// The parts the tick can cover: not those the user wrote a step for, nor those that are all the task's
// work (D211), which need the user's own step.
function coverLeft(data) {
  const written = new Set(Array.isArray(data.notCoveredWritten) ? data.notCoveredWritten : []);
  const main = new Set(Array.isArray(data.notCoveredMain) ? data.notCoveredMain : []);
  return coverParts(data).filter((part) => !written.has(part) && !main.has(part));
}
function coverUnwritten(data) {
  const written = new Set(Array.isArray(data.notCoveredWritten) ? data.notCoveredWritten : []);
  return (Array.isArray(data.notCoveredMain) ? data.notCoveredMain : []).filter((part) => !written.has(part));
}
// The tick covers the parts it was given for: a part added since needs ticking again.
function coverDone(parts) {
  const ticked = coverTicked ? JSON.parse(coverTicked) : [];
  return parts.every((part) => ticked.includes(part));
}
const sameWords = (text) => String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
const ownFor = (part) => (ownSteps || []).find((item) => sameWords(item.part) === sameWords(part));
function notCoveredBlock(data) {
  const parts = coverParts(data);
  if (!parts.length) return '';
  const one = parts.length === 1;
  const written = new Set(Array.isArray(data.notCoveredWritten) ? data.notCoveredWritten : []);
  const left = coverLeft(data);
  const rows = parts.map((part, index) => {
    const mine = ownFor(part);
    const tools = mine && written.has(part)
      ? `<span class="cover-done">Your step "${esc(mine.name)}" is in the job steps below.</span> <button type="button" class="link" data-own-change="${esc(mine.name)}">Change your step</button>`
      : `<button type="button" class="small" data-own-write="${index}">${mine ? 'Finish your step for this' : 'Write a step for this'}</button>`;
    return `<li data-cover-part="${index}"><strong>${esc(part)}</strong><span class="cover-tools">${tools}</span></li>`;
  }).join('');
  const many = left.length > 1;
  const unwritten = coverUnwritten(data);
  const mainOnly = !left.length && Array.isArray(data.notCoveredMain) && data.notCoveredMain.length === parts.length;
  return `<div class="warning not-covered"><p>SiteReady has no job steps for: ${esc(parts.join('; '))}. ${mainOnly ? (one ? 'Add your own step and controls for it.' : 'Add your own steps and controls for each.') : one ? 'Add your own step and controls for it, or cover it in a separate SWMS.' : 'Add your own steps and controls for each, or cover them in a separate SWMS.'}</p>
    <p>You must enter the specific steps for this work yourself: SiteReady cannot write them for you.</p>
    ${unwritten.length ? `<p>${esc(unwritten.length === 1 ? `"${unwritten[0]}" is` : `${unwritten.map((part) => `"${part}"`).join(' and ')} are`)} the work of this task, so the SWMS needs your own step for ${unwritten.length === 1 ? 'it' : 'each'} before you save or download. A tick is not enough.</p>` : ''}
    <ul class="cover-parts">${rows}</ul>
    ${left.length ? `<label class="check"><input type="checkbox" id="not-covered-confirm" data-parts="${esc(JSON.stringify(left))}"${coverDone(left) ? ' checked' : ''}><span>${left.length < parts.length ? `For ${many ? 'the rest' : `"${esc(left[0])}"`}: ` : ''}${many ? 'I have added my own steps and controls for these, or they are covered in a separate SWMS.' : 'I have added my own step and controls for this, or it is covered in a separate SWMS.'}</span></label>` : ''}</div>`;
}
// "Go to the box", beside the buttons that wait for it: the box is brought into view and focused.
document.addEventListener('click', (event) => {
  if (!event.target.closest('[data-cover-jump]')) return;
  // With no box (work that needs the user's own step), the first "Write a step for this" button.
  const box = document.getElementById('not-covered-confirm') || document.querySelector('.not-covered [data-own-write]');
  if (!box) return;
  box.closest('.not-covered').scrollIntoView({ behavior: 'smooth', block: 'center' });
  box.focus({ preventScroll: true });
});
document.addEventListener('change', (event) => {
  if (event.target.id !== 'not-covered-confirm') return;
  coverTicked = event.target.checked ? event.target.dataset.parts : null;
  const confirmed = coverTicked ? JSON.parse(coverTicked) : undefined;
  const S = window.SiteReady;
  if (S.actionInput) S.actionInput = { ...S.actionInput, notCoveredConfirmed: confirmed };
  // A SWMS in a project is ready once ticked.
  if (S.onCoverTick) S.onCoverTick(confirmed);
  // The list above the buttons drops the tick, or puts it back.
  showGate();
});
async function prepareDraft({ scroll = true } = {}) {
  const button = document.getElementById('prepare');
  button.disabled = true;
  document.getElementById('facts-error').textContent = '';
  try {
    // Questions an answer just brought in are on the page before the draft is asked for.
    if (askTimer) await askAgain();
    else if (asking) await asking;
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
    // Answers that contradict the task's words are shown above the SWMS, not printed on it.
    const report = data.controlEdits || {};
    followRewords(report.remapped);
    shownReport = report;
    const warnings = [...(data.warnings || []).map((text) => `<p class="warning">${esc(text)}</p>`), notCoveredBlock(data), editNotes(report, { discard: true })].join('');
    shownDraft = data;
    if (data.kind === 'draft') drawDesigns(data.designs || []);
    shownChecks = data.gateChecks || data.gate || [];
    // The scaffold supervisor is asked for only where this SWMS involves a scaffold.
    const scaffoldField = document.getElementById('scaffold-supervisor-field');
    if (scaffoldField) scaffoldField.classList.toggle('hidden', !shownChecks.some((check) => check.id === 'scaffoldSupervisor'));
    gateDrawn = '';
    resultEl.innerHTML = `${warnings}<div id="result-gate-top"></div><div id="result-translate"></div><div class="sheet">${render(data, { movable: true })}</div><div id="result-gate"></div><div id="result-actions"></div>`;
    resultEl.classList.remove('hidden');
    // A stood down draft names the facts still needed; each is asked for on the page.
    if (data.kind === 'stand-down') askAgain();
    // What is saved: the input sent, with changes moved onto any line SiteReady has reworded.
    const sent = { ...JSON.parse(body), controlEdits: controlEdits || undefined, hazardEdits: hazardEdits || undefined };
    shownSent = sent;
    showGate();
    // Downloading and saving need an account; the account script adds those buttons.
    window.SiteReady.showActions(data, sent);
    if (data.kind === 'draft') showTranslate(sent);
    // A SWMS in a project is recorded against its task.
    if (window.SiteReady.onDraft) window.SiteReady.onDraft(data, sent);
    keepUnsaved();
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

// The gate's list: each item goes to where it is answered; Update the draft checks again.
document.addEventListener('click', async (event) => {
  if (event.target.closest('[data-gate-list]')) {
    const panel = document.getElementById('gate-panel');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const go = event.target.closest('[data-gate-go]');
  if (go && shownDraft) {
    const gap = shownGaps[Number(go.dataset.gateGo)];
    const el = gap && gateTarget(gap);
    if (!el) return;
    // A box in a closed section is opened first.
    const closed = el.closest('details:not([open])');
    if (closed) closed.open = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus({ preventScroll: true });
    return;
  }
  if (event.target.closest('#gate-update, [data-gate-update]')) {
    await prepareDraft({ scroll: false });
    const panel = document.getElementById('gate-panel');
    (panel || document.getElementById('result-actions') || resultEl).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

// The plant box (goal 2): ticks and items of the user's own are kept until Confirm the plant, which
// prepares the draft again with only the plant confirmed.
function plantTicksNow() {
  const ticks = {};
  resultEl.querySelectorAll('[data-plant-item]').forEach((box) => { ticks[box.dataset.plantItem] = box.checked; });
  return ticks;
}
function plantChanged(own) {
  plantPending = { ticks: plantTicksNow(), own };
  const panel = document.getElementById('plant-panel');
  if (panel && shownDraft) panel.outerHTML = plantBlock(shownDraft);
}
resultEl.addEventListener('change', (event) => {
  const box = event.target.closest && event.target.closest('[data-plant-item]');
  if (!box) return;
  plantPending = { ticks: plantTicksNow(), own: [...plantOwn()] };
  const status = document.getElementById('plant-status');
  if (status) status.textContent = 'You have changes. Press Confirm the plant to use them.';
});
resultEl.addEventListener('click', async (event) => {
  const status = document.getElementById('plant-status');
  const itemBox = document.getElementById('plant-own-item');
  const licenceBox = document.getElementById('plant-own-licence');
  const typed = () => (itemBox && itemBox.value.trim() ? [{ item: itemBox.value.trim(), licence: licenceBox ? licenceBox.value.trim() : '' }] : []);
  if (event.target.closest('#plant-add')) {
    if (!typed().length) {
      if (status) status.textContent = 'Type the plant or equipment first.';
      if (itemBox) itemBox.focus();
      return;
    }
    plantChanged([...plantOwn(), ...typed()]);
    const box = document.getElementById('plant-own-item');
    if (box) box.focus();
    return;
  }
  const remove = event.target.closest('[data-plant-remove]');
  if (remove) {
    const own = [...plantOwn()];
    own.splice(Number(remove.dataset.plantRemove), 1);
    plantChanged(own);
    return;
  }
  if (event.target.closest('#plant-confirm')) {
    // An item typed but not added yet is added with the rest.
    const ticks = plantTicksNow();
    const names = Object.keys(ticks);
    plantChoice = { used: names.filter((name) => ticks[name]), notUsed: names.filter((name) => !ticks[name]), added: [...plantOwn(), ...typed()] };
    plantPending = null;
    await prepareDraft({ scroll: false });
    const panel = document.getElementById('plant-panel');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (event.target.closest('#emergency-update')) {
    await prepareDraft({ scroll: false });
    const panel = document.getElementById('emergency-panel');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});
// An emergency answer is kept for the next draft as it is typed.
resultEl.addEventListener('input', (event) => {
  const box = event.target.closest && event.target.closest('[data-emergency]');
  if (!box) return;
  emergencyAnswers = { ...(emergencyAnswers || {}), [box.dataset.emergency]: box.value };
});

// An answer typed in a blank is kept for the next draft, and shown in the same blank wherever the line prints.
resultEl.addEventListener('input', (event) => {
  const box = event.target.closest && event.target.closest('.blank-input');
  if (!box) return;
  const key = box.dataset.fillKey;
  const n = Number(box.dataset.fillN);
  fills = fills || {};
  const answers = [...(fills[key] || [])];
  answers[n] = box.value;
  fills[key] = answers;
  resultEl.querySelectorAll('.blank-input').forEach((other) => {
    if (other !== box && other.dataset.fillKey === key && Number(other.dataset.fillN) === n) other.value = box.value;
  });
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

// ---- Changing, removing and adding controls (task #102) ----

// Why a line was removed or weakened (owner decision, 6 October 2026): a short pick list and a
// note, both optional. Kept with the change, so the saved record and SiteReady's learning have it.
const WHY = [['notNeeded', 'Not needed for this job'], ['anotherWay', 'Done another way on this job'], ['othersCover', 'Another contractor or the site covers it'], ['wording', 'The wording does not fit the job'], ['other', 'Other']];
function whyBox(index, item, about = 'control') {
  const store = about === 'hazard' ? hazardEdits : controlEdits;
  const given = (((store || {})[item.step] || {}).reasons || []).find((entry) => entry.line === item.from) || {};
  const label = about === 'hazard' ? 'Does not apply' : item.kind === 'removed' ? 'Removed' : 'Changed';
  return `<div class="ctl-why">${label}: ${esc(plainLine(item.from).slice(0, 80))}${plainLine(item.from).length > 80 ? '…' : ''}<br>
    <select data-ctl-reason data-ctl-about="${about}" data-ctl-step="${index}" data-ctl-from="${esc(item.from)}" aria-label="Why (optional)"><option value="">Why? (optional)</option>${WHY.map(([id, text]) => `<option value="${id}"${given.reason === id ? ' selected' : ''}>${esc(text)}</option>`).join('')}</select>
    <input type="text" maxlength="300" data-ctl-note data-ctl-about="${about}" data-ctl-step="${index}" data-ctl-from="${esc(item.from)}" placeholder="Note (optional)" aria-label="Note (optional)" value="${esc(given.note || '')}"></div>`;
}
function setReason(stepName, line, values, about = 'control') {
  const edit = about === 'hazard' ? hazardEditFor(stepName) : editsFor(stepName);
  const reasons = (edit.reasons || []).filter((entry) => entry.line !== line);
  const next = { line, reason: '', note: '', ...(edit.reasons || []).find((entry) => entry.line === line), ...values };
  edit.reasons = next.reason || next.note ? [...reasons, next] : reasons;
  if (!edit.reasons.length) delete edit.reasons;
  if (about === 'hazard') tidyHazards(); else tidyEdits();
}

// ---- The user's own hazards and Who (owner decision, 6 October 2026) ----

const HAZARD_MARK = '(Our own hazard)';
const NOT_APPLICABLE = '(Does not apply to this job)';
const hazardText = (line) => line.replace(/\s*\((?:Our own hazard|Does not apply to this job)\)$/, '');
function hazardEditFor(name) {
  hazardEdits = hazardEdits || {};
  hazardEdits[name] = hazardEdits[name] || { changed: [], added: [], notApplicable: [] };
  return hazardEdits[name];
}
function tidyHazards() {
  if (!hazardEdits) return;
  for (const [name, edit] of Object.entries(hazardEdits)) {
    if (edit.reasons) edit.reasons = edit.reasons.filter((entry) => edit.notApplicable.includes(entry.line));
    if (edit.reasons && !edit.reasons.length) delete edit.reasons;
    if (!edit.changed.length && !edit.added.length && !edit.notApplicable.length) delete hazardEdits[name];
  }
  if (!Object.keys(hazardEdits).length) hazardEdits = null;
}
// A hazard line as shown: SiteReady's, one the user reworded or added, or one marked as not applying.
function applyHazardEdit(step, line, action, next = '') {
  const edit = hazardEditFor(step.step);
  const text = hazardText(line);
  if (action === 'na') edit.notApplicable.push(line);
  if (action === 'applies') edit.notApplicable = edit.notApplicable.filter((item) => item !== text);
  if (line.endsWith(HAZARD_MARK)) {
    // The user's own: an added one, or one of SiteReady's they reworded.
    const added = edit.added.indexOf(text);
    const change = edit.changed.find((item) => item.to === text);
    if (added >= 0) {
      if (action === 'remove') edit.added.splice(added, 1); else if (next) edit.added[added] = next;
    } else if (change) {
      if (action === 'remove') edit.changed.splice(edit.changed.indexOf(change), 1); else if (next) change.to = next;
    }
  } else if (action === 'change' && next) {
    edit.changed = [...edit.changed.filter((item) => item.from !== line), { from: line, to: next }];
  }
  tidyHazards();
  prepareDraft({ scroll: false });
}
function setWho(step, text) {
  whoEdits = whoEdits || {};
  if (text) whoEdits[step.step] = text; else delete whoEdits[step.step];
  if (!Object.keys(whoEdits).length) whoEdits = null;
  prepareDraft({ scroll: false });
}
resultEl.addEventListener('click', (event) => {
  const button = event.target.closest('[data-hz], [data-who]');
  if (!button || !shownDraft) return;
  if (button.dataset.who) {
    const holder = button.closest('[data-who-step]');
    const step = (shownDraft.jobSteps || [])[Number(holder.dataset.whoStep)];
    if (step) lineEditor(holder, step.responsible || '', (text) => setWho(step, text.slice(0, 120)));
    return;
  }
  const holder = button.closest('[data-hz-step]');
  const step = (shownDraft.jobSteps || [])[Number(holder.dataset.hzStep)];
  if (!step) return;
  const action = button.dataset.hz;
  if (action === 'add') {
    lineEditor(button, '', (text) => { hazardEditFor(step.step).added.push(text); tidyHazards(); prepareDraft({ scroll: false }); });
    return;
  }
  const line = step.hazards[Number(holder.dataset.hzLine)];
  if (action === 'change') lineEditor(holder, hazardText(line), (text) => applyHazardEdit(step, line, 'change', text));
  else applyHazardEdit(step, line, action);
});

// ---- Steps the user writes for work SiteReady does not cover (owner, 11 October 2026) ----

// A short form: the step's name (the part of the task, to start), its hazards and controls, one on
// each line, with the hierarchy of control to write them in, and who is responsible. Saved, it goes
// with the draft like the user's other changes, and prints in the job steps marked as their own.
const OWN_HIERARCHY = 'Write them in hierarchy order: first remove the hazard, then a safer way of doing the work, then barriers, guards or isolation, then procedures, permits and training, and PPE last. Say what is done, by whom, or to what standard.';
const linesOf = (text) => String(text || '').split(/\n+/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
const startName = (part) => String(part || '').replace(/\s+/g, ' ').trim().replace(/^[a-z]/, (letter) => letter.toUpperCase());
function closeOwnForm() {
  resultEl.querySelectorAll('.own-step-form, .own-form-row').forEach((el) => el.remove());
}
// holder: the element the form goes after. item: the step being changed, or null for a new one for part.
function ownStepForm(holder, item, part) {
  closeOwnForm();
  const value = item || { part, name: startName(part), hazards: [], controls: [], who: 'Supervisor' };
  const form = document.createElement('div');
  form.className = 'own-step-form';
  form.setAttribute('role', 'group');
  form.setAttribute('aria-labelledby', 'own-form-title');
  const title = value.part ? `${item ? 'Change your step' : 'Write a step'} for: ${value.part}` : item ? `Change your step: ${value.name}` : 'Write a step of your own';
  form.innerHTML = `<p class="own-form-title" id="own-form-title"><strong>${esc(title)}</strong></p>
    <p class="meta">Write what is done, what could go wrong and how it is controlled on this job. The step prints in the SWMS marked as your own.</p>
    <div class="field"><label for="own-name">Job step</label><input id="own-name" type="text" maxlength="300" value="${esc(value.name)}"></div>
    <div class="field"><label for="own-hazards">Hazards, one on each line</label><textarea id="own-hazards" rows="4">${esc((value.hazards || []).join('\n'))}</textarea></div>
    <div class="field"><label for="own-controls">Controls, one on each line</label><p class="meta" id="own-controls-hint">${esc(OWN_HIERARCHY)}</p><textarea id="own-controls" rows="6" aria-describedby="own-controls-hint">${esc((value.controls || []).join('\n'))}</textarea></div>
    <div class="field"><label for="own-who">Who is responsible</label><input id="own-who" type="text" maxlength="120" value="${esc(value.who || '')}"></div>
    <div class="actions"><button type="button" data-own-save>Save your step</button><button type="button" class="secondary" data-own-cancel>Cancel</button></div>
    <p class="error" role="alert" data-own-error></p>`;
  form.dataset.ownPart = value.part || '';
  form.dataset.ownWas = item ? item.name : '';
  if (holder.closest('tr')) {
    // From a row of the job steps: the form takes the table's full width under the row.
    const row = document.createElement('tr');
    row.className = 'own-form-row';
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.appendChild(form);
    row.appendChild(cell);
    holder.closest('tr').after(row);
  } else if (holder.tagName === 'LI') holder.appendChild(form);
  else holder.after(form);
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  form.querySelector('#own-name').focus({ preventScroll: true });
}
function saveOwnStep(form) {
  const error = form.querySelector('[data-own-error]');
  const was = form.dataset.ownWas;
  const next = {
    part: form.dataset.ownPart,
    name: form.querySelector('#own-name').value.replace(/\s+/g, ' ').trim().slice(0, 300),
    hazards: linesOf(form.querySelector('#own-hazards').value).slice(0, 20),
    controls: linesOf(form.querySelector('#own-controls').value).slice(0, 30),
    who: form.querySelector('#own-who').value.replace(/\s+/g, ' ').trim().slice(0, 120),
  };
  const wrong = !next.name ? ['own-name', 'Give the job step a name.']
    : !next.hazards.length ? ['own-hazards', 'Write at least one hazard. A step needs a hazard and a control to print.']
      : !next.controls.length ? ['own-controls', 'Write at least one control. A step needs a hazard and a control to print.']
        : (ownSteps || []).some((other) => other.name !== was && sameWords(other.name) === sameWords(next.name)) ? ['own-name', 'You already have a step with this name. Give this one another name.'] : null;
  if (wrong) {
    error.textContent = wrong[1];
    form.querySelector(`#${wrong[0]}`).focus();
    return;
  }
  const list = [...(ownSteps || [])];
  const at = list.findIndex((other) => other.name === was);
  if (at >= 0) list[at] = next; else list.push(next);
  ownSteps = list;
  // A renamed step keeps its place in the order the user chose.
  if (was && was !== next.name && stepOrder) stepOrder = stepOrder.map((name) => (name === `${was} (Our own step)` ? `${next.name} (Our own step)` : name));
  afterOwnChange(next.name);
}
function removeOwnStep(name) {
  ownSteps = (ownSteps || []).filter((other) => other.name !== name);
  if (!ownSteps.length) ownSteps = null;
  afterOwnChange('');
}
// The draft is prepared again with the change, and the step, or the warning, is brought into view.
async function afterOwnChange(name) {
  await prepareDraft({ scroll: false });
  const row = name && [...resultEl.querySelectorAll('[data-own-row]')].find((el) => el.dataset.ownRow === name);
  const target = row || resultEl.querySelector('.not-covered') || resultEl;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const button = row && row.querySelector('[data-own-change]');
  if (button) button.focus({ preventScroll: true });
}
resultEl.addEventListener('click', (event) => {
  if (!shownDraft) return;
  if (event.target.closest('[data-own-new]')) {
    ownStepForm(event.target.closest('.own-new'), null, '');
    return;
  }
  const write = event.target.closest('[data-own-write]');
  if (write) {
    const part = (shownDraft.notCovered || [])[Number(write.dataset.ownWrite)];
    if (part) ownStepForm(write.closest('li') || write, ownFor(part) || null, part);
    return;
  }
  const change = event.target.closest('[data-own-change]');
  if (change) {
    const item = (ownSteps || []).find((other) => other.name === change.dataset.ownChange);
    if (item) ownStepForm(change.closest('li') || change, item, item.part);
    return;
  }
  const remove = event.target.closest('[data-own-remove]');
  if (remove) {
    // Asked once more, in place, before the step goes.
    const tools = remove.closest('[data-own-tools]');
    tools.dataset.ownWere = tools.innerHTML;
    tools.innerHTML = `<span class="ctl-msg">Remove this step from the SWMS?</span> <button type="button" class="link" data-own-remove-yes="${esc(remove.dataset.ownRemove)}">Remove it</button><button type="button" class="link" data-own-keep>Keep it</button>`;
    tools.querySelector('[data-own-keep]').focus();
    return;
  }
  const yes = event.target.closest('[data-own-remove-yes]');
  if (yes) { removeOwnStep(yes.dataset.ownRemoveYes); return; }
  const keep = event.target.closest('[data-own-keep]');
  if (keep) {
    const tools = keep.closest('[data-own-tools]');
    tools.innerHTML = tools.dataset.ownWere || '';
    const again = tools.querySelector('[data-own-remove]');
    if (again) again.focus();
    return;
  }
  const form = event.target.closest('.own-step-form');
  if (form && event.target.closest('[data-own-save]')) { saveOwnStep(form); return; }
  if (form && event.target.closest('[data-own-cancel]')) closeOwnForm();
});

// What the server did with the user's changes: those refused, those made on a line SiteReady has
// since reworded (now applied to the new wording), and those that no longer match a line in the
// SWMS (kept, not applied, until the user makes them again or discards them).
let shownReport = {};
function describeEdit(item) {
  if (item.kind === 'removed') return `You removed "${item.text}"`;
  if (item.kind === 'changed') return `You changed "${item.text}" to "${item.to}"`;
  if (item.kind === 'hazardChanged') return `You changed the hazard "${item.text}" to "${item.to}"`;
  if (item.kind === 'hazardNotApplicable') return `You marked the hazard "${item.text}" as not applying`;
  if (item.kind === 'hazardAdded') return `You added the hazard "${item.to}"`;
  if (item.kind === 'whoChanged') return `You set Who to "${item.to}"`;
  return `You added "${item.to}"`;
}
function editNotes(report, { discard = false } = {}) {
  const out = (report.refused || []).map((item) => `<p class="warning">${esc(`${item.step}: ${item.reason}`)}</p>`);
  if ((report.remapped || []).some((item) => item.kind !== 'step')) {
    out.push(`<div class="note"><p>SiteReady has reworded lines you changed since you made the changes. Your changes now apply to the new wording. Check them in the job steps below.</p><ul>${report.remapped.filter((item) => item.kind !== 'step').map((item) => `<li>${esc(item.step)}: "${esc(item.from)}" now reads "${esc(item.line)}"</li>`).join('')}</ul></div>`);
  }
  // In the saved view, the warnings given when the SWMS was saved, with the reasons.
  if (!discard) {
    for (const item of report.warned || []) out.push(`<p class="warning">${esc(`${item.step}: ${item.kind === 'removed' ? 'Removed' : item.kind === 'changed' ? 'Changed' : 'Added'} "${item.kind === 'added' ? item.to : item.text}". ${item.warnings.join(' ')}${item.reason ? ` Reason given: ${(WHY.find(([id]) => id === item.reason) || [])[1] || item.reason}${item.note ? `, ${item.note}` : ''}.` : ''}`)}</p>`);
  }
  (report.unmatched || []).forEach((item, index) => {
    const why = item.reason === 'step' ? 'That job step is no longer in this SWMS' : 'That line is no longer in this step';
    out.push(`<p class="warning">${esc(`${item.step}: ${describeEdit(item)}. ${why}, as SiteReady's wording, the steps or your answers have changed, so the change is not applied. Make the change again on the line as it now reads, or discard it.`)}${discard ? ` <button type="button" class="link" data-ctl-discard="${index}">Discard this change</button>` : ''}</p>`);
  });
  return out.join('');
}
// A change made on a line SiteReady has since reworded is kept against the new wording.
function followRewords(remapped) {
  for (const item of remapped || []) {
    if (!/^hazard/.test(item.kind)) continue;
    const hz = hazardEdits && hazardEdits[item.step];
    if (!hz) continue;
    if (item.kind === 'hazardChanged') hz.changed.forEach((change) => { if (change.from === item.from) change.from = item.line; });
    if (item.kind === 'hazardNotApplicable') hz.notApplicable = hz.notApplicable.map((line) => (line === item.from ? item.line : line));
  }
  if (!controlEdits || !(remapped || []).length) return;
  for (const item of remapped) {
    if (item.kind === 'step' && controlEdits[item.from] && !controlEdits[item.line]) {
      controlEdits[item.line] = controlEdits[item.from];
      delete controlEdits[item.from];
      continue;
    }
    const edit = controlEdits[item.step];
    if (!edit) continue;
    if (item.kind === 'removed') edit.removed = edit.removed.map((line) => (line === item.from ? item.line : line));
    if (item.kind === 'changed') edit.changed.forEach((change) => { if (change.from === item.from) change.from = item.line; });
  }
}
// Discarding a change that no longer matches takes it out of the user's changes.
function discardEdit(item) {
  if (/^hazard/.test(item.kind)) {
    const hz = hazardEdits && hazardEdits[item.step];
    if (!hz) return;
    if (item.kind === 'hazardChanged') hz.changed = hz.changed.filter((change) => change.from !== item.text);
    if (item.kind === 'hazardNotApplicable') hz.notApplicable = hz.notApplicable.filter((line) => line !== item.text);
    if (item.kind === 'hazardAdded') hz.added = hz.added.filter((line) => line !== item.to);
    tidyHazards();
    return;
  }
  if (item.kind === 'whoChanged') {
    if (whoEdits) delete whoEdits[item.step];
    if (whoEdits && !Object.keys(whoEdits).length) whoEdits = null;
    return;
  }
  const edit = controlEdits && controlEdits[item.step];
  if (!edit) return;
  if (item.kind === 'removed') edit.removed = edit.removed.filter((line) => line !== item.text);
  if (item.kind === 'changed') edit.changed = edit.changed.filter((change) => change.from !== item.text);
  if (item.kind === 'added') edit.added = edit.added.filter((line) => line !== item.to);
  tidyEdits();
}

const OWN_MARK = ' (Our own control)';
const isOwn = (line) => line.endsWith(OWN_MARK);
// The line's words without its source in brackets or the own-control mark, to start an edit from.
function plainLine(line) {
  const text = isOwn(line) ? line.slice(0, -OWN_MARK.length) : line;
  if (!text.endsWith(')')) return text;
  let depth = 0;
  for (let i = text.length - 1; i >= 0; i -= 1) {
    if (text[i] === ')') depth += 1;
    else if (text[i] === '(' && (depth -= 1) === 0) return /\b(?:Code|Regulations?|Act|Standard|Guide)\b|\d{4}/.test(text.slice(i)) ? text.slice(0, i).trim() : text;
  }
  return text;
}
function editsFor(name) {
  controlEdits = controlEdits || {};
  controlEdits[name] = controlEdits[name] || { removed: [], changed: [], added: [] };
  return controlEdits[name];
}
// Drops steps with no changes left, so an unchanged SWMS sends nothing.
function tidyEdits() {
  if (!controlEdits) return;
  for (const [name, edit] of Object.entries(controlEdits)) {
    // A reason goes with its change.
    if (edit.reasons) edit.reasons = edit.reasons.filter((entry) => edit.removed.includes(entry.line) || edit.changed.some((item) => item.from === entry.line));
    if (edit.reasons && !edit.reasons.length) delete edit.reasons;
    if (!edit.removed.length && !edit.changed.length && !edit.added.length) delete controlEdits[name];
  }
  if (!Object.keys(controlEdits).length) controlEdits = null;
}
function controlMessage(index, text) {
  const el = resultEl.querySelector(`[data-ctl-msg="${index}"]`);
  if (el) el.textContent = text;
}
// A warning before removing or changing a line SiteReady recommends keeping, with a way to go ahead.
let pendingLine = null;
function warnFirst(index, warning, label) {
  const el = resultEl.querySelector(`[data-ctl-msg="${index}"]`);
  if (!el) return;
  el.innerHTML = `${esc(warning)} <span class="ctl-tools" data-ctl-step="${index}"><button type="button" class="link" data-ctl="go">${esc(label)}</button><button type="button" class="link" data-ctl="keep">Keep the line</button></span>`;
}
function applyLineEdit(step, line, next) {
  const edit = editsFor(step.step);
  if (isOwn(line)) {
    // The user's own line: an added one, or a library line they reworded.
    const own = line.slice(0, -OWN_MARK.length);
    const added = edit.added.indexOf(own);
    const change = edit.changed.find((item) => item.to === own);
    if (added >= 0) {
      if (next) edit.added[added] = next; else edit.added.splice(added, 1);
    } else if (change) {
      if (next) change.to = next;
      else { edit.changed.splice(edit.changed.indexOf(change), 1); edit.removed.push(change.from); }
    }
  } else if (next) {
    edit.changed = [...edit.changed.filter((item) => item.from !== line), { from: line, to: next }];
  } else if (!edit.removed.includes(line)) {
    edit.removed.push(line);
  }
  tidyEdits();
  prepareDraft({ scroll: false });
}
// A box to write a line in, in place of the line or under the step's controls.
function lineEditor(holder, value, onSave) {
  const box = document.createElement('div');
  box.className = 'ctl-edit';
  box.innerHTML = `<textarea maxlength="600" aria-label="Control">${esc(value)}</textarea><span class="ctl-tools"><button type="button" class="link" data-save>Save</button><button type="button" class="link" data-cancel>Cancel</button></span>`;
  holder.after(box);
  holder.classList.add('hidden');
  const area = box.querySelector('textarea');
  area.focus();
  box.querySelector('[data-cancel]').addEventListener('click', () => { box.remove(); holder.classList.remove('hidden'); });
  box.querySelector('[data-save]').addEventListener('click', () => {
    const text = area.value.replace(/\s+/g, ' ').trim();
    if (!text) { area.focus(); return; }
    onSave(text);
  });
}
resultEl.addEventListener('click', (event) => {
  const discard = event.target.closest('[data-ctl-discard]');
  if (discard) {
    const item = (shownReport.unmatched || [])[Number(discard.dataset.ctlDiscard)];
    if (item) { discardEdit(item); prepareDraft({ scroll: false }); }
    return;
  }
  const button = event.target.closest('[data-ctl]');
  if (!button || !shownDraft) return;
  const holder = button.closest('[data-ctl-step]');
  const index = Number(holder.dataset.ctlStep);
  const step = (shownDraft.jobSteps || [])[index];
  if (!step) return;
  const action = button.dataset.ctl;
  if (action === 'add') {
    lineEditor(button, '', (text) => { editsFor(step.step).added.push(text); tidyEdits(); prepareDraft({ scroll: false }); });
    return;
  }
  if (action === 'restore') {
    editsFor(step.step).removed.splice(Number(button.dataset.removed), 1);
    tidyEdits();
    prepareDraft({ scroll: false });
    return;
  }
  const line = step.controls[Number(holder.dataset.ctlLine)];
  if (action === 'go') {
    // The user has read the warning and goes ahead.
    const next = pendingLine;
    pendingLine = null;
    if (next && next.index === index) {
      if (next.action === 'remove') applyLineEdit(next.step, next.line, '');
      else lineEditor(next.holder, plainLine(next.line), (text) => applyLineEdit(next.step, next.line, text));
    }
    return;
  }
  if (action === 'keep') { pendingLine = null; controlMessage(index, ''); return; }
  // A line that is a legal requirement, or that SiteReady recommends keeping, says why first.
  // The user can still go ahead (owner decision, 6 October 2026).
  if (holder.dataset.warn && !isOwn(line)) {
    pendingLine = { index, action, step, line, holder };
    warnFirst(index, holder.dataset.warn, action === 'remove' ? 'Remove anyway' : 'Change anyway');
    return;
  }
  if (action === 'remove') applyLineEdit(step, line, '');
  if (action === 'change') lineEditor(holder, plainLine(line), (text) => applyLineEdit(step, line, text));
});
// The reason for a removed or weakened line is kept as it is picked or typed.
resultEl.addEventListener('change', (event) => {
  const field = event.target.closest && event.target.closest('[data-ctl-reason], [data-ctl-note]');
  if (!field || !shownDraft) return;
  const step = (shownDraft.jobSteps || [])[Number(field.dataset.ctlStep)];
  if (!step) return;
  setReason(step.step, field.dataset.ctlFrom, field.matches('[data-ctl-reason]') ? { reason: field.value } : { note: field.value.trim() }, field.dataset.ctlAbout);
  // The buttons below the SWMS save what is now chosen.
  if (window.SiteReady.actionInput) window.SiteReady.actionInput = { ...window.SiteReady.actionInput, controlEdits: controlEdits || undefined, hazardEdits: hazardEdits || undefined };
});

// ---- Reading the draft in another language (task #94) ----

// Signed-in users can read the draft translated, with the English under each line. The SWMS,
// its Word and PDF files, and what the builder sees stay in English.
const LANGUAGE_KEY = 'siteready.readLanguage';
let translateConfig = null;
async function showTranslate(input) {
  const S = window.SiteReady;
  const box = document.getElementById('result-translate');
  if (!box || !S.call || !S.isSignedIn || !S.isSignedIn()) return;
  if (!translateConfig) translateConfig = await fetch(api('/api/draft/translation')).then((response) => response.json()).catch(() => null);
  if (!translateConfig || !translateConfig.enabled || !translateConfig.languages.length) { translateConfig = null; return; }
  let chosen = '';
  try { chosen = localStorage.getItem(LANGUAGE_KEY) || ''; } catch { /* not kept */ }
  box.innerHTML = `<div class="panel translate"><div class="field"><label for="translate-lang">Read this SWMS in my language</label>
    <select id="translate-lang" class="plain">${translateConfig.languages.map((item) => `<option value="${esc(item.code)}"${item.code === chosen ? ' selected' : ''}>${esc(item.label)}</option>`).join('')}</select></div>
    <div class="actions"><button type="button" class="secondary" id="translate-go">Read this SWMS in my language</button></div>
    <p class="note hidden" id="translate-status"></p><div id="translate-out"></div></div>`;
  const status = document.getElementById('translate-status');
  document.getElementById('translate-go').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const language = document.getElementById('translate-lang').value;
    try { localStorage.setItem(LANGUAGE_KEY, language); } catch { /* not kept */ }
    button.disabled = true;
    status.textContent = 'Translating. This can take a minute the first time.';
    status.classList.remove('hidden', 'error-note');
    try {
      const translated = await S.call('POST', '/api/draft/translation', { input, language });
      status.classList.add('hidden');
      document.getElementById('translate-out').innerHTML = renderTranslation(translated);
    } catch (error) {
      status.textContent = error.message;
      status.classList.add('error-note');
    } finally {
      button.disabled = false;
    }
  });
}
resultEl.addEventListener('click', (event) => {
  if (!event.target.closest('[data-translate-close]')) return;
  document.getElementById('translate-out').innerHTML = '';
});
// Each translated item with its English beneath. Arabic reads right to left.
function renderTranslation(tr) {
  const { language, english } = tr;
  const dir = language.rtl ? 'rtl' : 'ltr';
  const both = (en, other) => `<span class="tr" lang="${esc(language.code)}" dir="${dir}">${esc(other)}</span><span class="en" lang="en" dir="ltr">${esc(en)}</span>`;
  const list = (items, others) => `<ul>${items.map((item, i) => `<li>${both(item, others[i])}</li>`).join('')}</ul>`;
  return `<div class="banner"><p><strong>This is a translation to help you read the SWMS. The English version applies.</strong></p>
    ${language.lessReliable ? `<p>Machine translation of ${esc(language.name)} is less reliable. Check anything unclear with the English.</p>` : ''}</div>
    <h4>${both(english.title, tr.title)}</h4>
    <h4>High risk construction work</h4>${english.highRisk.length ? list(english.highRisk, tr.highRisk) : '<p>This task is not identified as high risk construction work.</p>'}
    <h4>Job steps</h4>${english.steps.map((step, i) => `<h5>${i + 1}. ${both(step.step, tr.steps[i].step)}</h5>
      <p class="meta">Hazards</p>${list(step.hazards, tr.steps[i].hazards)}
      <p class="meta">Controls</p>${list(step.controls, tr.steps[i].controls)}`).join('')}
    <h4>Personal protective equipment</h4>${english.ppe.length ? list(english.ppe, tr.ppe) : '<p>None listed.</p>'}
    <div class="actions"><button type="button" class="secondary" data-translate-close>Close the translation</button></div>`;
}

// ---- Unsaved work kept on this device (goal 7) ----

// What the user has typed for a SWMS not yet saved (the task, the answers, the site details and their
// changes to the draft) is kept in this browser, so a reload or a lost signal does not lose it. It
// is cleared when the SWMS is saved, on Start again, on sign out, and after 14 days. Nothing about
// workers is on this page, so none is kept. Storage can be off (private browsing): then nothing is.
const UNSAVED_KEY = 'siteready.unsaved';
const UNSAVED_DAYS = 14;
// The business details come from the company profile, which is kept on its own.
const PROFILE_PARTS = ['companyAbn', 'companyAddress', 'companyPhone', 'companyEmail'];
let keepTimer = null;
let restoring = false;
// Set once the user types on this page, so work brought back never overwrites it.
let typedHere = false;

function unsavedStage() {
  if (!resultEl.classList.contains('hidden') && document.getElementById('result-actions')) return 'draft';
  return factsForm.classList.contains('hidden') ? 'start' : 'facts';
}

function keepUnsaved() {
  clearTimeout(keepTimer);
  if (restoring) return;
  const input = payload();
  PROFILE_PARTS.forEach((key) => { delete input[key]; });
  if (!input.task && !input.workplace && !input.principalContractor) return;
  const editing = window.SiteReady && window.SiteReady.editing;
  try {
    localStorage.setItem(UNSAVED_KEY, JSON.stringify({ at: Date.now(), stage: unsavedStage(), input, editing: editing || null }));
  } catch { /* not kept */ }
}

function clearUnsaved() {
  clearTimeout(keepTimer);
  try { localStorage.removeItem(UNSAVED_KEY); } catch { /* nothing kept */ }
}

// Kept a moment after the typing stops. Boxes in the company profile, sign-in and team panels are
// not part of a SWMS.
const KEPT_IN = '#job-details, #start, #facts, #result';
['input', 'change'].forEach((type) => document.addEventListener(type, (event) => {
  if (restoring || !event.target.closest || !event.target.closest(KEPT_IN) || event.target.closest('.confirm, .review-box, #result-translate')) return;
  if (event.isTrusted) typedHere = true;
  clearTimeout(keepTimer);
  keepTimer = setTimeout(keepUnsaved, 400);
}));

async function restoreUnsaved() {
  let kept = null;
  try { kept = JSON.parse(localStorage.getItem(UNSAVED_KEY) || 'null'); } catch { kept = null; }
  if (!kept || typeof kept !== 'object' || !kept.input || typeof kept.input !== 'object') return false;
  if (!(Date.now() - Number(kept.at) < UNSAVED_DAYS * 24 * 60 * 60 * 1000)) { clearUnsaved(); return false; }
  // Something typed or opened since the page loaded is not overwritten.
  if (document.getElementById('task').value.trim()) return false;
  // The download and save buttons depend on whether the user is signed in.
  if (window.SiteReady && window.SiteReady.accountReady) await window.SiteReady.accountReady;
  if (typedHere || document.getElementById('task').value.trim()) return false;
  const input = { ...kept.input };
  // Signed in, the company is the account's own.
  if (document.getElementById('company').value.trim()) delete input.company;
  restoring = true;
  try {
    if (kept.stage === 'start') fillStart(input);
    else if (await fillForm(input, { stay: true }).catch(() => false)) {
      if (kept.editing && window.SiteReady) window.SiteReady.editing = kept.editing;
      if (kept.stage === 'draft') await prepareDraft({ scroll: false });
    } else fillStart(input);
  } finally {
    restoring = false;
  }
  const when = new Date(Number(kept.at));
  const today = when.toDateString() === new Date().toDateString();
  const note = document.createElement('p');
  note.className = 'note';
  note.id = 'unsaved-note';
  note.innerHTML = `Your unsaved work from ${esc(when.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }))}${today ? ' today' : `, ${esc(when.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' }))}`} is back, as you left it on this phone. <button type="button" class="link" id="unsaved-clear">Start again</button>`;
  const stage = kept.stage === 'draft' && !resultEl.classList.contains('hidden') ? resultEl : kept.stage !== 'start' && !factsForm.classList.contains('hidden') ? factsForm : document.getElementById('start');
  stage.before(note);
  note.scrollIntoView({ block: 'start' });
  return true;
}

document.addEventListener('click', (event) => {
  if (!event.target.closest('#unsaved-clear')) return;
  clearUnsaved();
  window.location.reload();
});

// A draft shown before the user signed in (such as one brought back after the sign-in link opened
// the page again) gets its download and save buttons once signed in.
function redrawActions() {
  const box = document.getElementById('result-actions');
  if (!box || !shownDraft || !shownSent || !box.querySelector('[data-open="signin"]')) return;
  window.SiteReady.showActions(shownDraft, shownSent);
  if (shownDraft.kind === 'draft') showTranslate(shownSent);
}

window.SiteReady = Object.assign(window.SiteReady || {}, {
  keepUnsaved, clearUnsaved, restoreUnsaved, redrawActions, liveGate, currentAnswers,
  api, esc, payload, render, fillForm, fillFields, setProfile, newSwms, editNotes, prepare: prepareDraft, getProfile: () => profile, resultEl, addPrincipals, methodSteps,
  // Signed in, the account name fills Prepared by when it is empty.
  setPreparedBy: (name) => { if (name && !preparedEl.value.trim()) preparedEl.value = name; },
});

addPrincipals([], false);
document.getElementById('principal').addEventListener('change', (event) => addPrincipals([event.target.value], true));

// Work left unsaved on this device comes back once the states are in and the page's other scripts
// (the account's buttons) have run: with the states kept by the phone, they can be in first.
const scriptsRun = document.readyState === 'loading'
  ? new Promise((resolve) => { document.addEventListener('DOMContentLoaded', resolve, { once: true }); })
  : Promise.resolve();
loadStates().then(() => scriptsRun.then(() => restoreUnsaved()).catch(() => false), () => {
  document.getElementById('start-error').textContent = 'The state list could not be loaded.';
});
