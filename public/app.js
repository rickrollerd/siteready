// The web page calls the server it was loaded from. The native app sets
// <meta name="sitewrite-api"> to the server address.
const API_BASE = (document.querySelector('meta[name="sitewrite-api"]')?.content || '').replace(/\/+$/, '');
const api = (route) => `${API_BASE}${route}`;
// In the phone app the page is the app's own copy, so the SiteLink tab goes to the server (D303).
if (API_BASE && document.getElementById('sitelink-tab')) document.getElementById('sitelink-tab').href = api('/sitelink');

// A reply that is not SiteWrite's own (a 502 from the host, a page of HTML) or no reply at all says so
// plainly, never as raw JSON text (messy round 3: "Unexpected token 'u', "upstream r"... is not valid JSON").
const SERVER_DOWN = 'SiteWrite could not reach the server. Try again.';
async function readJson(response) {
  const type = (response.headers && response.headers.get && response.headers.get('content-type')) || '';
  try {
    if (type && !/json/i.test(type)) throw new Error('not JSON');
    return await response.json();
  } catch {
    throw Object.assign(new Error(SERVER_DOWN), { serverDown: true });
  }
}
// Asking for the questions or a draft changes nothing on the server, so a host's error (502, 503, 504)
// or a reply that is not SiteWrite's is asked again twice before the page says so (messy round 4,
// A fault 5: a 502 on the questions sent a prepared SWMS back to its task form).
const RETRIED = new Set(['/api/draft/questions', '/api/draft']);
const pause = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
async function postJson(route, body, { tries = RETRIED.has(route) ? 3 : 1, onRetry = null } = {}) {
  const sent = typeof body === 'string' ? body : JSON.stringify(body);
  for (let attempt = 1; ; attempt += 1) {
    let response;
    try {
      response = await fetch(api(route), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: sent });
    } catch (error) {
      if (attempt < tries && !(error && error.noSignal)) { if (onRetry) onRetry(attempt); await pause(attempt * 700); continue; }
      throw Object.assign(new Error(SERVER_DOWN), { serverDown: true });
    }
    if (attempt < tries && [502, 503, 504].includes(response.status)) { if (onRetry) onRetry(attempt); await pause(attempt * 700); continue; }
    try {
      return { response, data: await readJson(response) };
    } catch (error) {
      if (attempt < tries) { if (onRetry) onRetry(attempt); await pause(attempt * 700); continue; }
      throw error;
    }
  }
}

// ---- What is typed is never cut short by the page drawing a box again (messy round 6) ----
// A box drawn again while the person types in it (its note changed, or the questions were asked again)
// lost the focus, so the rest of what they typed went nowhere and the answer was saved cut short
// ("premix c", "road shoulde"). The box drawn in its place takes the whole text, the cursor and the
// focus, and its answer is saved from it again.
const TYPED_BOX = (el) => Boolean(el && el.id && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(?:text|search|email|tel|url|number|)$/.test(el.type || ''))));
let typingIn = null;
function noteTyping(el) {
  if (!TYPED_BOX(el)) return;
  let start = null;
  let end = null;
  try { start = el.selectionStart; end = el.selectionEnd; } catch { /* no cursor */ }
  typingIn = { el, id: el.id, value: el.value, start, end };
}
function keepTyping() {
  if (!typingIn || typingIn.el.isConnected) return;
  const was = typingIn;
  const next = document.getElementById(was.id);
  const active = document.activeElement;
  if (!TYPED_BOX(next) || (active && active !== document.body && active !== next)) { typingIn = null; return; }
  const value = was.el.value;
  if (next.value !== value) {
    next.value = value;
    next.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (active !== next) next.focus({ preventScroll: true });
  try { if (was.start !== null) next.setSelectionRange(was.start, was.end); } catch { /* no cursor */ }
  noteTyping(next);
}
if (typeof MutationObserver === 'function' && document.body) {
  document.addEventListener('focusin', (event) => noteTyping(event.target));
  document.addEventListener('input', (event) => noteTyping(event.target), true);
  document.addEventListener('keyup', (event) => { if (typingIn && event.target === typingIn.el) noteTyping(event.target); });
  // Left for another box or button, the box is no longer being typed in. Taken off the page, it is.
  document.addEventListener('focusout', (event) => {
    const el = event.target;
    setTimeout(() => { if (typingIn && typingIn.el === el && el.isConnected && document.activeElement !== el) typingIn = null; }, 0);
  });
  new MutationObserver(keepTyping).observe(document.body, { childList: true, subtree: true });
}

const statesEl = document.getElementById('states');
const factsForm = document.getElementById('facts');
const resultEl = document.getElementById('result');
let questions = null;

// The company profile is kept in this browser only. It is not sent anywhere
// until a statement is prepared, and the server does not keep it.
const PROFILE_KEY = 'sitewrite.profile';
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
  // Details typed in the profile but not saved come back after a reload, said so (messy-user testing).
  const typed = keptProfileTyping();
  if (typed && profileDiffers(typed)) {
    Object.entries(PROFILE_FIELDS).forEach(([key, id]) => { if (typeof typed[key] === 'string') document.getElementById(id).value = typed[key]; });
    profileStatus('Your company details are back as you typed them. Press Save profile to keep them.');
  }
  const preview = document.getElementById('profile-logo-preview');
  preview.src = pendingLogo || '';
  preview.classList.toggle('hidden', !pendingLogo);
  document.getElementById('profile-summary').textContent = profile.name ? `· ${profile.name}` : '';
  document.getElementById('profile').open = !profile.name;
  const company = document.getElementById('company');
  if (!company.value && profile.name) company.value = profile.name;
}

// What is typed in the profile, kept on this device until it is saved, so a reload does not lose it.
const PROFILE_TYPING_KEY = 'sitewrite.profileTyping';
const profileTyped = () => Object.fromEntries(Object.entries(PROFILE_FIELDS).map(([key, id]) => [key, document.getElementById(id).value.trim()]));
const profileDiffers = (typed) => Object.keys(PROFILE_FIELDS).some((key) => String(typed[key] || '').trim() !== String(profile[key] || '').trim());
function keptProfileTyping() {
  try { const kept = JSON.parse(localStorage.getItem(PROFILE_TYPING_KEY) || 'null'); return kept && typeof kept === 'object' ? kept : null; } catch { return null; }
}
function keepProfileTyping() {
  const typed = profileTyped();
  try {
    if (profileDiffers(typed)) localStorage.setItem(PROFILE_TYPING_KEY, JSON.stringify(typed));
    else localStorage.removeItem(PROFILE_TYPING_KEY);
  } catch { /* not kept */ }
}
const forgetProfileTyping = () => { try { localStorage.removeItem(PROFILE_TYPING_KEY); } catch { /* nothing kept */ } };

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
    if (!nameBox.value.trim() && names.length) {
      nameBox.value = names[0];
      // The name found for the ABN completes the profile, which then saves itself.
      keepProfileTyping();
      autoSaveProfile();
    }
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

async function saveProfile({ auto = false } = {}) {
  const next = {};
  Object.entries(PROFILE_FIELDS).forEach(([key, id]) => { next[key] = document.getElementById(id).value.trim(); });
  if (pendingLogo) next.logo = pendingLogo;
  // Signed in, the profile is the company's and is kept on the server for the whole team.
  if (window.SiteWrite && window.SiteWrite.saveCompany && window.SiteWrite.signedIn()) {
    try {
      window.SiteWrite.lastCompanyNotice = '';
      const saved = await window.SiteWrite.saveCompany(next);
      forgetProfileTyping();
      // Saved as it is filled in, the profile stays open where the user is typing, and what was typed
      // while it saved stays in its box, to be saved in turn.
      const open = document.getElementById('profile').open;
      const typedSince = profileTyped();
      setProfile(saved);
      if (auto) {
        document.getElementById('profile').open = open;
        Object.entries(PROFILE_FIELDS).forEach(([key, id]) => { if (typedSince[key] !== String(next[key] || '')) document.getElementById(id).value = typedSince[key]; });
        keepProfileTyping();
      }
      profileStatus(window.SiteWrite.lastCompanyNotice || (auto ? 'Saved for your company as you filled it in.' : 'Saved for your company.'));
    } catch (error) {
      profileStatus(auto ? `Not saved yet: ${error.message} Fix it, then press Save profile.` : error.message);
    }
    if (shownDraft) showGate();
    draftWithProfile();
    return;
  }
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  } catch {
    profileStatus('The profile could not be saved on this device. Private browsing can stop this.');
    return;
  }
  forgetProfileTyping();
  const company = document.getElementById('company');
  if (!company.value || company.value === profile.name) company.value = next.name;
  profile = next;
  const open = document.getElementById('profile').open;
  const typedSince = profileTyped();
  showProfile();
  if (auto) {
    document.getElementById('profile').open = open;
    Object.entries(PROFILE_FIELDS).forEach(([key, id]) => { if (typedSince[key] !== String(next[key] || '')) document.getElementById(id).value = typedSince[key]; });
    keepProfileTyping();
  }
  profileStatus(auto ? 'Saved on this device as you filled it in.' : 'Saved on this device.');
  if (shownDraft) showGate();
  draftWithProfile();
}
// A draft on the page shows the company details just saved, without a reload (messy round 6, run 1: the
// header kept "Stainles" after the name was fixed, with no Update button).
function draftWithProfile() {
  if (!shownDraft || !shownSent || resultEl.classList.contains('hidden')) return;
  const now = payload();
  const before = ['company', 'companyAbn', 'companyAddress', 'companyPhone'].map((key) => String(shownSent[key] || '')).join('|');
  const after = ['company', 'companyAbn', 'companyAddress', 'companyPhone'].map((key) => String(now[key] || '')).join('|');
  if (before !== after) prepareDraft({ scroll: false, keep: '.sheet' });
}
document.getElementById('profile-save').addEventListener('click', () => saveProfile());

// The profile saves itself once its company name and an 11 digit ABN are filled in and the user
// moves on from the box (messy-user testing, 13 October 2026: the download failed far below, with the
// details typed but never saved). Until then, what is typed is kept on this device, and leaving the
// profile with changes not saved says to press Save profile.
const profileBox = document.getElementById('profile');
profileBox.addEventListener('input', (event) => { if (event.target.closest('#profile-company, #profile-abn, #profile-address, #profile-phone, #profile-email')) keepProfileTyping(); });
function autoSaveProfile() {
  const typed = profileTyped();
  if (typed.name && typed.abn.replace(/\D/g, '').length === 11 && profileDiffers(typed)) saveProfile({ auto: true });
}
profileBox.addEventListener('change', (event) => {
  if (event.target.closest('#profile-company, #profile-abn, #profile-address, #profile-phone, #profile-email')) autoSaveProfile();
});
profileBox.addEventListener('focusout', (event) => {
  if (event.relatedTarget && profileBox.contains(event.relatedTarget)) return;
  setTimeout(() => {
    if (profileBox.contains(document.activeElement)) return;
    const typed = profileTyped();
    if (profileDiffers(typed) && !(typed.name && typed.abn.replace(/\D/g, '').length === 11)) profileStatus('Your company details are not saved yet. Fill in the company name and ABN, then press Save profile.');
  }, 0);
});

document.getElementById('profile-clear').addEventListener('click', () => {
  try { localStorage.removeItem(PROFILE_KEY); } catch { /* nothing saved */ }
  forgetProfileTyping();
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

// Signing in: the company details typed on this device before signing in fill the account's empty
// ones and are saved to the company, so the sign-in link does not empty the profile (messy round 5,
// runs 5 and 7). A detail the company already has is kept: a blank never replaces it, and the device's
// copy never overwrites it. Returns the company as saved, or null when nothing was saved.
async function signedInProfile(company) {
  const saved = company || {};
  const typed = keptProfileTyping() || {};
  const device = { ...loadProfile() };
  for (const key of Object.keys(PROFILE_FIELDS)) if (String(typed[key] || '').trim()) device[key] = String(typed[key]).trim();
  const fill = {};
  for (const key of Object.keys(PROFILE_FIELDS)) if (!String(saved[key] || '').trim() && String(device[key] || '').trim()) fill[key] = String(device[key]).trim();
  if (!saved.logo && device.logo) fill.logo = device.logo;
  setProfile(saved);
  if (!Object.keys(fill).length) return null;
  const next = { ...Object.fromEntries(Object.keys(PROFILE_FIELDS).map((key) => [key, String(saved[key] || '')])), ...fill };
  // The boxes show what will be saved, and stay so if it cannot be saved yet.
  Object.entries(PROFILE_FIELDS).forEach(([key, id]) => { document.getElementById(id).value = next[key] || ''; });
  if (fill.logo) pendingLogo = fill.logo;
  keepProfileTyping();
  if (!next.name || String(next.abn || '').replace(/\D/g, '').length !== 11) {
    // Not complete enough to save: they show as typed, said so (showProfile), until the name and ABN are in.
    document.getElementById('profile').open = true;
    profileStatus('Your company details are back as you typed them. Press Save profile to keep them.');
    return null;
  }
  try {
    window.SiteWrite.lastCompanyNotice = '';
    const kept = await window.SiteWrite.saveCompany(fill.logo ? next : (({ logo, ...rest }) => rest)(next));
    forgetProfileTyping();
    // The device's copy has gone to the company: it is not offered to the next account on this device.
    try { localStorage.removeItem(PROFILE_KEY); } catch { /* nothing kept */ }
    setProfile(kept);
    profileStatus(window.SiteWrite.lastCompanyNotice || 'Your company details from before you signed in are saved for your company.');
    if (shownDraft) showGate();
    return kept;
  } catch (error) {
    document.getElementById('profile').open = true;
    profileStatus(`Your company details from before you signed in are back, but not saved yet: ${error.message} Fix it, then press Save profile.`);
    return null;
  }
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
// The review date fills itself: three months on, as My SWMS shows a saved SWMS's next review (D289).
// The user can change it.
function isoReviewDate() {
  const now = new Date();
  const day = now.getDate();
  const next = new Date(now.getFullYear(), now.getMonth() + 3, 1);
  const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}
if (!reviewDateEl.value) reviewDateEl.value = isoReviewDate();
// The calendar opens on a click anywhere in the box, not only on its icon.
[reviewDateEl, draftDateEl].forEach((el) => el.addEventListener('click', () => {
  try { el.showPicker(); } catch { /* the browser opens its own picker */ }
}));

// Prepared by is remembered on this device. Signed in, the account name fills it.
const PREPARED_KEY = 'sitewrite.preparedBy';
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
const PRINCIPALS_KEY = 'sitewrite.principals';
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
    // Unanswered until the user answers (messy-user test, 14 October 2026): no crane company is assumed.
    crane: (document.querySelector('input[name="crane"]:checked') || {}).value || '',
    // D258: with a crane company, who slings the loads and directs the crane.
    slinging: (document.querySelector('input[name="crane"]:checked') || {}).value === 'company' ? (document.querySelector('input[name="slinging"]:checked') || {}).value || '' : '',
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
    // The PPE ticked for all work and for particular steps, and where the user put items (D247).
    ppe: document.querySelector('[data-ppe]') ? ppeTicked() : undefined,
    ppeSteps: Object.keys(ppePlaced).length ? ppePlaced : undefined,
    // The items the user unticked by hand: plant they confirm or add does not tick them again.
    ppeOff: ppeUnticked(),
    // The job steps picked, or none to use the ones SiteWrite finds in the task.
    kinds: stepPicks || undefined,
    stepOrder: stepOrder || undefined,
    leaveOut: leaveOut || undefined,
    // The rows of a scope reading that the reader matched to no job steps, for the task as read,
    // and the parts with no job steps the user ticked as dealt with (owner decision D184).
    unmatched: scopeUnmatched || undefined,
    scopeTask: scopeWordsNow || undefined,
    // The parts of a task picked from the pick list that SiteWrite has no job steps for (goal 1).
    pickGaps: pickGaps || undefined,
    notCoveredConfirmed: coverTicked ? JSON.parse(coverTicked) : undefined,
    // The SWMS the user named for each part another SWMS covers, kept with the record.
    notCoveredElsewhere: coverElsewhereSent(),
    // The job step of this SWMS the user said covers each part (messy round 6).
    notCoveredInStep: Object.keys(coverInStep).length ? { ...coverInStep } : undefined,
    // Of those, the work moved into another SWMS of the project: it comes off this Task line (D291).
    movedOut: coverMovedSent(),
    // Work another SWMS of the project named this one as covering (D289, scope.js).
    movedIn: (window.SiteWrite && window.SiteWrite.projectMovedIn && window.SiteWrite.projectMovedIn()) || undefined,
    controlEdits: controlEdits || undefined,
    hazardEdits: hazardEdits || undefined,
    whoEdits: whoEdits || undefined,
    ownSteps: ownSteps || undefined,
    highRiskAdded: highRiskAdded && highRiskAdded.length ? highRiskAdded : undefined,
    highRiskOff: highRiskOff && highRiskOff.length ? highRiskOff : undefined,
    stepRatings: stepRatings && Object.keys(stepRatings).length ? stepRatings : undefined,
    fills: fills || undefined,
    plantChoice: plantChoice || undefined,
    emergency: emergencyAnswers || undefined,
    designs: designsPayload(),
    // Each hazardous product the user listed, from its safety data sheet (substances.js, D256).
    substances: window.SiteWriteSubstances ? window.SiteWriteSubstances.payload() : undefined,
    substancesNotUsed: window.SiteWriteSubstances ? window.SiteWriteSubstances.notUsedPayload() : undefined,
    substancesNotUsedWhy: window.SiteWriteSubstances && window.SiteWriteSubstances.notUsedWhyPayload ? window.SiteWriteSubstances.notUsedWhyPayload() : undefined,
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
  // No state is ticked on a fresh page (owner, D292 item 1: Queensland was ticked before any address was
  // typed, and a Canberra job printed Queensland law). It is set by picking the job address from its
  // list, or by ticking it; Continue and the download wait for it.
  statesEl.querySelectorAll('input').forEach((input) => input.addEventListener('change', () => { showFallExplanation(); stateChosen(); }));
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

// The state the user's earlier answers or profile point to (messy-user testing, 13 October 2026: an
// address suggestion in Victoria silently switched a Brisbane job to Victorian law). The state of a job
// address given before on this page, else the company profile's address, else the last job address.
// The state ticked when the page opens is not one the user chose, so it is never used (messy round 3,
// 14 October 2026: it put Queensland addresses first for a Darwin, Perth or Hobart job).
let addressStateBefore = '';
const STATE_LAW = { act: 'ACT law', nsw: 'New South Wales law', vic: 'Victorian law', qld: 'Queensland law', sa: 'South Australian law', wa: 'Western Australian law', tas: 'Tasmanian law', nt: 'Northern Territory law' };
function expectedState() {
  const A = window.SiteWriteAddress;
  if (!A) return '';
  return addressStateBefore || A.stateFromAddress(profile.address || '').state || A.stateFromAddress(((readMemory().workplace || [])[0]) || '').state || '';
}
// A state the user said to keep for this address, so it is not asked again.
let stateKept = '';

// Ticks the state the address is in, and says so plainly every time, with a button to change the
// address (messy round 3: "State set to Queensland from the job address" was missed, and a Hobart job
// nearly used Queensland law). A state other than the one expected is never set without a word: the
// note asks, with a button to keep it.
// The state ticked, or ''.
const stateNow = () => (document.querySelector('input[name="state"]:checked') || {}).value || '';
// The plain question when the address typed does not say its state and none is ticked (D292 item 1).
const STATE_ASK = 'Which state or territory is this job in? Pick the job address from the list under the box, or tick the state below.';
function stateChosen() {
  const note = document.getElementById('state-ask');
  if (note && stateNow()) { note.textContent = ''; note.classList.add('hidden'); }
  if (stateNow() && !window.SiteWriteAddress?.stateFromAddress(workplaceEl.value).state && workplaceEl.value.trim()) applyAddressState();
}
function applyAddressState() {
  const found = window.SiteWriteAddress ? window.SiteWriteAddress.stateFromAddress(workplaceEl.value) : { state: '' };
  workplaceState.classList.remove('state-warning', 'state-said');
  if (!found.state) {
    // Typed with no state and not picked from the list: the state is asked plainly, or the one ticked
    // is said so it can be checked (messy round 4, run 7: "12 london circut canbera" kept Queensland).
    const ticked = stateNow();
    if (!workplaceEl.value.trim()) { workplaceState.textContent = ''; return; }
    if (ticked) {
      workplaceState.innerHTML = `<strong>This SWMS uses ${esc(STATE_LAW[ticked] || `${stateName(ticked)} law`)}.</strong> The address does not say its state: check the state ticked below is where the job is, or pick the address from the list.`;
      workplaceState.classList.add('state-said');
      return;
    }
    workplaceState.innerHTML = `<strong>${esc(STATE_ASK)}</strong>`;
    workplaceState.classList.add('state-warning');
    return;
  }
  const expected = expectedState();
  const radio = document.querySelector(`input[name="state"][value="${found.state}"]`);
  if (radio && !radio.disabled && !radio.checked) {
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
  }
  // "in the Northern Territory", "in the Australian Capital Territory".
  const inName = (id) => `${['nt', 'act'].includes(id) ? 'the ' : ''}${stateName(id)}`;
  const law = `This address is in ${esc(inName(found.state))}, so the SWMS uses ${esc(STATE_LAW[found.state] || `${stateName(found.state)} law`)}.`;
  if (expected && expected !== found.state && stateKept !== `${found.state}|${workplaceEl.value.trim()}`) {
    // The state expected holds until the user keeps the new one or changes the address.
    addressStateBefore = expected;
    workplaceState.innerHTML = `<strong>${law} Change it?</strong> <button type="button" class="link" data-state-change>Change the address</button> <button type="button" class="link" data-state-keep>Keep ${esc(inName(found.state))}</button>`;
    workplaceState.classList.add('state-warning');
    return;
  }
  addressStateBefore = found.state;
  workplaceState.innerHTML = `<strong>${law}</strong>${found.from === 'postcode' ? ' Read from the postcode: check it is right.' : ''} <button type="button" class="link" data-state-change>Change the address</button>`;
  workplaceState.classList.add('state-said');
}
// "Change the address" does something the user can see (messy round 3, run 4: it seemed to do
// nothing): the box is brought into view, outlined, its words selected, and the note says what to do.
workplaceState.addEventListener('click', (event) => {
  if (event.target.closest('[data-state-change]')) {
    workplaceState.classList.remove('state-said');
    workplaceState.classList.add('state-warning');
    workplaceState.textContent = 'Type the job address again, with its suburb and state (for example 12 Smith St, Darwin NT), then pick it from the list.';
    workplaceEl.classList.add('address-change');
    workplaceEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    workplaceEl.focus({ preventScroll: true });
    if (workplaceEl.select) workplaceEl.select();
    return;
  }
  if (event.target.closest('[data-state-keep]')) {
    const found = window.SiteWriteAddress.stateFromAddress(workplaceEl.value);
    stateKept = `${found.state}|${workplaceEl.value.trim()}`;
    addressStateBefore = found.state;
    applyAddressState();
  }
});
workplaceEl.addEventListener('input', () => workplaceEl.classList.remove('address-change'));

function checkStateMatchesAddress() {
  const found = window.SiteWriteAddress ? window.SiteWriteAddress.stateFromAddress(workplaceEl.value) : { state: '' };
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
function addressLookup(input, list, onPick = () => {}, recent = () => [], near = () => '') {
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
    // Suggestions that arrive after the user has left the box are not shown over the next box (messy
    // round 5, run 6: they stayed open over the Phone box after a Tab).
    if (!picks.length || document.activeElement !== input) return close();
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
    // A pick is kept like typing, so leaving and coming back brings back the address picked, not the
    // words typed (messy round 5, run 4).
    input.dispatchEvent(new Event('change', { bubbles: true }));
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
      const home = near();
      const response = await fetch(api(`/api/address?q=${encodeURIComponent(text)}${home ? `&near=${encodeURIComponent(home)}` : ''}`));
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

addressLookup(workplaceEl, workplaceList, applyAddressState, () => readMemory().workplace || [], expectedState);
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

// The crane question starts unanswered. Left unanswered, a task that names no crane is "No crane";
// one that names a crane is asked. With "A crane company", who slings the loads is asked too (D258).
const NAMES_CRANE = /\b(?:cranes?|cranage|craneage|franna|hiabs?|crane trucks?)\b/i;
const TRUCK_CRANE = /\b(?:hiabs?|crane trucks?|vehicle loading cranes?|truck loading cranes?|loader cranes?)\b/i;
function showSlinging() {
  const company = (document.querySelector('input[name="crane"]:checked') || {}).value === 'company';
  const question = document.getElementById('slinging-question');
  if (question) question.classList.toggle('hidden', !company);
}
document.querySelectorAll('input[name="crane"]').forEach((input) => input.addEventListener('change', showSlinging));
// The message shows under the question it is about, as well as by Continue.
function askAt(id, message) {
  document.getElementById('start-error').textContent = message;
  const question = document.getElementById(id);
  if (!question) return;
  let note = question.querySelector('.error');
  if (!note) { note = document.createElement('p'); note.className = 'error'; note.setAttribute('role', 'alert'); question.appendChild(note); }
  note.textContent = message;
  question.focus();
}
function craneAnswered() {
  document.querySelectorAll('#crane-question .error, #slinging-question .error').forEach((note) => { note.textContent = ''; });
  const crane = document.querySelector('input[name="crane"]:checked');
  if (!crane) {
    if (!NAMES_CRANE.test(document.getElementById('task').value)) {
      document.querySelector('input[name="crane"][value="none"]').checked = true;
      showSlinging();
      return true;
    }
    askAt('crane-question', 'The task names a crane. Say whether a crane is used, and who operates it.');
    return false;
  }
  if (crane.value === 'company' && !document.querySelector('input[name="slinging"]:checked')) {
    askAt('slinging-question', 'Say who slings the loads and directs the crane: the crane company\'s dogman, or our crew.');
    return false;
  }
  return true;
}

// "Continue" with a scope attached and no task (messy round 4, run 3: the browser said only "Please fill
// out this field"): the scope is read with its own button.
const scopeWaiting = () => {
  const file = document.getElementById('scope-file');
  const text = document.getElementById('scope-text');
  return Boolean((file && file.files && file.files.length) || (text && text.value.trim()) || (window.SiteWrite && window.SiteWrite.scopeDropped && window.SiteWrite.scopeDropped()));
};
document.getElementById('continue').addEventListener('click', (event) => {
  if (document.getElementById('task').value.trim() || !scopeWaiting()) return;
  event.preventDefault();
  const panel = document.getElementById('scope-panel');
  if (panel) panel.open = true;
  const read = document.getElementById('scope-read');
  document.getElementById('start-error').innerHTML = `You attached a scope. To have it read, press <button type="button" class="link" data-go-scope-read>Find the tasks that need a SWMS</button> under it. For one task, write it in the Task box instead.`;
  if (read) read.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
document.addEventListener('click', (event) => {
  if (!event.target.closest || !event.target.closest('[data-go-scope-read]')) return;
  const read = document.getElementById('scope-read');
  if (read) { read.scrollIntoView({ behavior: 'smooth', block: 'center' }); read.focus({ preventScroll: true }); }
});
// No state ticked: asked plainly at the state list, which Continue waits for (D292 item 1).
function stateAnswered() {
  if (stateNow()) return true;
  applyAddressState();
  if (stateNow()) return true;
  let note = document.getElementById('state-ask');
  if (!note) {
    note = document.createElement('p');
    note.id = 'state-ask';
    note.className = 'error';
    note.setAttribute('role', 'alert');
    statesEl.after(note);
  }
  note.textContent = STATE_ASK;
  note.classList.remove('hidden');
  document.getElementById('start-error').textContent = STATE_ASK;
  statesEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const first = statesEl.querySelector('input:not(:disabled)');
  if (first) first.focus({ preventScroll: true });
  return false;
}

document.getElementById('start').addEventListener('submit', (event) => {
  event.preventDefault();
  document.getElementById('start-error').textContent = '';
  // The state always follows the job address; with none, it is asked for.
  if (!stateAnswered()) return;
  if (!craneAnswered()) return;
  applyAddressState();
  // A new task starts from the steps found in it, or the steps the scope reader found for it.
  // The steps picked or left out for this same task are kept, so Continue on a reopened SWMS
  // does not undo them.
  const scope = window.siteWriteScopeTask;
  const task = document.getElementById('task').value.trim();
  if (task !== choicesTask) {
    stepPicks = scope && scope.task === task && Array.isArray(scope.kinds) ? [...scope.kinds] : null;
    leaveOut = scope && scope.task === task && Array.isArray(scope.leaveOut) ? [...scope.leaveOut] : null;
    scopeUnmatched = scope && scope.task === task && Array.isArray(scope.unmatched) ? [...scope.unmatched] : null;
    // A task picked from the pick list, still as picked, starts from its own job steps and names
    // the parts SiteWrite has no job steps for. Changed words start from the steps found in them.
    const picked = !(scope && scope.task === task) && pickedTask && pickedTask.task === task ? pickedTask : null;
    if (picked) {
      stepPicks = [...picked.kinds];
      leaveOut = picked.leaveOut && picked.leaveOut.length ? [...picked.leaveOut] : null;
    }
    pickGaps = picked && picked.gaps && picked.gaps.length ? [...picked.gaps] : null;
    choicesTask = task;
  }
  // The scope's words go with a task from a scope, changed by the user or not.
  if (scope && scope.scope) scopeWordsNow = scope.scope;
  else if (!scope) scopeWordsNow = null;
  // With no signal the plain message shows here, not nothing (goal 7).
  loadQuestions().catch((error) => {
    const said = document.getElementById('start-error');
    if (error.serverDown) said.innerHTML = `${esc(error.message)} <button type="button" class="link" data-retry-continue>Try again</button>`;
    else said.textContent = error.message;
  });
});
document.addEventListener('click', (event) => {
  if (!event.target.closest || !event.target.closest('[data-retry-continue]')) return;
  document.getElementById('start').requestSubmit(document.getElementById('continue'));
});

// Job steps: null follows the steps SiteWrite finds in the task; a list is the user's own picks.
let stepPicks = null;
// Steps for work the scope gives to others, which the user chose to leave out.
let leaveOut = null;
// Rows of the scope reading with no job steps, while the task is the one read from the scope.
let scopeUnmatched = null;
// A task from a scope: the scope's words it is read from, kept while its SWMS is open (D251, D252).
let scopeWordsNow = null;
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
// The job steps the user wrote for work SiteWrite has no job steps for: [{ part, name, hazards,
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
// The designs SiteWrite found, as the server last said, with the steps that rely on each.
let designAnswers = null;
let designsFound = [];
// Each design's answer by id, kept while the server does not list that design, so it comes back
// when the design does: a reopened SWMS is first asked before its answers to the questions are on
// the page, when the steps that rely on a design may not be listed yet.
let designsKept = new Map();
// The task the step picks and steps left out were made for.
let choicesTask = null;
// High risk construction work the user added on the draft, by its id in the regulation's list (messy
// round 5), and the note under the box after an item is added or taken off.
let highRiskAdded = null;
let hrcwNote = '';
// High risk work SiteWrite found that the user marked "Does not apply", each { id, reason } (D311), and
// the note said after one is marked or put back.
let highRiskOff = null;
let hrcwOffNote = '';
// The rating after the controls the supervisor set for a job step, by its name (messy round 5, run 4),
// and the steps whose rating form is open.
let stepRatings = null;
const ratingOpen = new Set();

// A task picked from the list in place of the one in the box keeps the answers that still apply: the
// site answers, the plant confirmed, the user's own controls, steps and hazards, the substances, the
// emergency answers and the answers to questions asked again (messy round 5: replacing a written task
// emptied the site answers, the plant, an own control and the hot work answer). What belonged to the
// old task's words goes, and the page says what: here, and under the questions once they are asked.
let replaced = null;
function replaceTask(written, answered = {}) {
  const dropped = [written ? 'the task you wrote' : 'the task picked before'];
  if (stepPicks || stepOrder || leaveOut) dropped.push('the job steps you ticked, added or moved for it');
  if (coverTicked || Object.keys(coverElsewhere || {}).length || Object.keys(coverInStep).length) dropped.push('what you said about its work SiteWrite had no job steps for');
  // The new task's own work decides what high risk work it has, so "Does not apply" is asked again.
  if (highRiskOff && highRiskOff.length) dropped.push('the high risk work you marked as not applying');
  highRiskOff = null;
  // The answers on the page now, so the questions asked again for the new task show them.
  if (document.querySelector('#required-block [data-fact]')) Object.assign(factMemory, shownAnswers('#required-block [data-fact]', 'fact'));
  if (document.querySelector('[data-site]')) Object.assign(siteMemory, shownAnswers('[data-site]', 'site'));
  replaced = { labels: new Map(((questions && questions.required) || []).map((item) => [item.id, item.label])) };
  stepPicks = null;
  leaveOut = null;
  scopeUnmatched = null;
  scopeWordsNow = null;
  pickGaps = null;
  coverTicked = null;
  coverElsewhere = {};
  coverInStep = {};
  coverMovedKept = new Set();
  coverTyping.clear();
  stepOrder = null;
  choicesTask = null;
  // As a new SWMS was, it saves as a new SWMS, not as the next revision of one being changed.
  if (window.SiteWrite) window.SiteWrite.editing = null;
  // What is kept, as given: only what the user has answered or changed is named.
  const given = (map) => Object.values(map || {}).some((value) => String(value || '').trim());
  const substances = window.SiteWriteSubstances && ((window.SiteWriteSubstances.payload() || []).length || (window.SiteWriteSubstances.notUsedPayload() || []).length);
  const kept = [
    given(siteMemory) && 'your site answers',
    plantChoice && 'the plant you confirmed',
    (controlEdits || hazardEdits || whoEdits || ownSteps) && 'your own controls, steps and hazards',
    substances && 'your hazardous substance answers',
    given(emergencyAnswers) && 'your emergency answers',
    highRiskAdded && 'the high risk work you added',
    given(factMemory) && 'your answers to questions this task asks too',
    answered.fall && `your fall answer (${answered.fall === 'yes' ? 'Yes' : 'No'})`,
    answered.crane && 'your crane answer',
  ].filter(Boolean);
  sayReplaced(`Task replaced. ${kept.length ? `Kept: ${kept.join(', ')}. ` : ''}Dropped: ${dropped.join('; ')}. Press Continue to see this task's job steps and questions.`);
}
function sayReplaced(text) {
  let note = document.getElementById('task-replaced');
  if (!note) {
    note = document.createElement('p');
    note.id = 'task-replaced';
    note.className = 'note';
    note.setAttribute('role', 'status');
    presetNote.after(note);
  }
  note.textContent = text;
  note.classList.toggle('hidden', !text);
}
// Once the new task's questions are asked: answers given before that it does not ask for, so not used.
function sayUnasked(required) {
  if (!replaced) return;
  const asked = new Set((required || []).map((item) => item.id));
  const unused = [...replaced.labels].filter(([id]) => !asked.has(id) && String(factMemory[id] || '').trim()).map(([, label]) => label);
  replaced = null;
  let note = document.getElementById('replaced-unasked');
  if (!note) {
    note = document.createElement('p');
    note.id = 'replaced-unasked';
    note.className = 'note';
    note.setAttribute('role', 'status');
    document.getElementById('required-block').before(note);
  }
  note.textContent = unused.length ? `This task does not ask ${unused.length === 1 ? 'this question' : 'these questions'}, so ${unused.length === 1 ? 'its answer is' : 'their answers are'} not used: ${unused.join('; ')}. ${unused.length === 1 ? 'It comes' : 'They come'} back if you add the work to the task.` : '';
  note.classList.toggle('hidden', !unused.length);
}

// A new SWMS starts from SiteWrite's steps, order, controls and PPE, and is saved as a new SWMS.
// Typing in the task box keeps the user's changes: those that no longer match are reported.
function newSwms() {
  stepPicks = null;
  leaveOut = null;
  scopeUnmatched = null;
  scopeWordsNow = null;
  pickGaps = null;
  coverTicked = null;
  coverElsewhere = {};
  coverInStep = {};
  coverMovedKept = new Set();
  coverTyping.clear();
  stepOrder = null;
  controlEdits = null;
  hazardEdits = null;
  whoEdits = null;
  ownSteps = null;
  fills = null;
  plantChoice = null;
  plantPending = null;
  emergencyAnswers = null;
  highRiskAdded = null;
  hrcwNote = '';
  highRiskOff = null;
  hrcwOffNote = '';
  stepRatings = null;
  ratingOpen.clear();
  designAnswers = null;
  designsFound = [];
  designsKept = new Map();
  if (window.SiteWriteMethodRead) window.SiteWriteMethodRead.clear();
  if (window.SiteWriteSubstances) window.SiteWriteSubstances.clear();
  drawDesigns([]);
  choicesTask = null;
  ppeTouched.clear();
  ppePlaced = {};
  weakNotes = new Map();
  missingNotes = new Map();
  replaced = null;
  ['task-replaced', 'replaced-unasked'].forEach((id) => { const note = document.getElementById(id); if (note) note.classList.add('hidden'); });
  // Its questions start blank.
  freshFacts = true;
  if (window.SiteWrite) window.SiteWrite.editing = null;
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
      // The task's trade ranks that trade's steps first (messy round 4).
      const trade = (document.getElementById('task-trade') || {}).value || (document.getElementById('trade') || {}).value || '';
      const response = await fetch(api(`/api/steps/search?q=${encodeURIComponent(search)}${trade ? `&trade=${encodeURIComponent(trade)}` : ''}`));
      const data = await response.json();
      if (seq !== stepSearchSeq) return;
      stepSearchIds = data.ids || [];
    } catch {
      stepSearchIds = null;
    }
    fillStepAdd();
  }, 200);
}

// Steps for where the work is done, for a task SiteWrite has no job steps for: shown, not ticked.
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

// Changing the steps asks the questions again, keeping what has been filled in. With a draft shown, the
// draft stays, with the principal contractor's review it is being fixed for, and is updated in place once
// nothing new is left to answer, as ticking PPE does (messy round 6, runs 6 and 8: unticking a step group or
// adding a step sent the page back to "Prepare the statement" and hid the review banner).
async function refreshSteps() {
  const drafted = Boolean(shownDraft) && !resultEl.classList.contains('hidden');
  const asked = await loadQuestions({ stay: true, keepTicked: true, keepDraft: drafted }).catch((error) => { document.getElementById('facts-error').textContent = error.message; return false; });
  if (!drafted || !asked) return undefined;
  return updateInPlace();
}
// The draft prepared again where it is, or, where the change brings a new question with no answer yet,
// the page goes to that question and the draft stays as it is until it is answered.
async function updateInPlace() {
  const open = ((questions && questions.required) || []).filter((item) => !item.choices && !String((document.getElementById(`fact-${item.id}`) || {}).value || '').trim());
  if (open.length) {
    goToAnswer(open[0].id);
    return undefined;
  }
  return prepareDraft({ scroll: false });
}

// PPE for all work and PPE for particular steps (D246, D247). ppePlaced holds where the user put
// items: an item id to 'all' (moved to all work) or to the steps it is worn in. It is sent with the
// SWMS, which prints it and learns from it.
let ppePlaced = {};
let ppeShown = { groups: [], steps: [] };
const ppeTouched = new Set();
function ppeUnticked() {
  const off = [...ppeTouched].filter((id) => !document.querySelector(`[data-ppe][value="${CSS.escape(id)}"]:checked, [data-ppe-step][value="${CSS.escape(id)}"]:checked`));
  return off.length ? off : undefined;
}
// Every item ticked, for all work or for a step.
function ppeTicked() {
  return [...new Set([...document.querySelectorAll('[data-ppe]:checked, [data-ppe-step]:checked')].map((el) => el.value))];
}
// The items for particular steps as shown, with their steps.
function ppeStepItems() {
  return ppeShown.groups.flatMap((group) => group.items).filter((item) => Array.isArray(item.steps) && item.steps.length);
}
function setPpe(id, on) {
  const row = document.querySelector(`[data-ppe-step][value="${CSS.escape(id)}"]`);
  const box = row || document.querySelector(`[data-ppe][value="${CSS.escape(id)}"]`);
  if (box) box.checked = on;
}
function drawPpe(groups, steps) {
  ppeShown = { groups: groups || [], steps: steps || [] };
  const stepItems = ppeStepItems();
  const forSteps = new Set(stepItems.map((item) => item.id));
  const choices = ppeShown.groups.flatMap((group) => group.items).filter((item) => item.forSteps);
  document.getElementById('ppe-block').innerHTML = `
    <h3 class="ppe-head">For all work</h3>
    ${ppeShown.groups.map((group) => `
    <fieldset class="ppe-group">
      <legend>${esc(group.area)}</legend>
      ${group.items.map((item) => `<label><input type="checkbox" data-ppe value="${esc(item.id)}"${item.ticked && !forSteps.has(item.id) ? ' checked' : ''}> ${esc(item.label)}${forSteps.has(item.id) ? ' <span class="meta">(steps below)</span>' : ''}</label>`).join('')}
    </fieldset>`).join('')}
    <h3 class="ppe-head">For particular steps</h3>
    <p class="meta ppe-note">Extra items only some steps need. Each one prints in its steps and in the PPE table.</p>
    ${stepItems.length ? `<ul class="ppe-steps">${stepItems.map((item) => `
      <li>
        <label><input type="checkbox" data-ppe-step value="${esc(item.id)}"${item.ticked ? ' checked' : ''}> ${esc(item.label)}</label>
        <span class="step-names">${esc(item.steps.join('; '))}</span>
        <button type="button" class="secondary small" data-ppe-all="${esc(item.id)}">Move to all work</button>
      </li>`).join('')}</ul>` : '<p class="meta">None. Every item ticked is for all work.</p>'}
    ${choices.length && ppeShown.steps.length ? `<div class="field ppe-add">
      <label for="ppe-add-item">Add an item to a step</label>
      <select id="ppe-add-item"><option value="">Choose an item</option>${choices.map((item) => `<option value="${esc(item.id)}">${esc(item.label)}</option>`).join('')}</select>
      <select id="ppe-add-step"><option value="">Choose a step</option>${ppeShown.steps.map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join('')}</select>
      <button type="button" class="secondary" id="ppe-add">Add to the step</button>
    </div>` : ''}`;
}
// Redraws the PPE as the user has it now: their ticks stay as they are.
function redrawPpe() {
  const ticked = new Set(ppeTicked());
  drawPpe(ppeShown.groups, ppeShown.steps);
  for (const group of ppeShown.groups) for (const item of group.items) setPpe(item.id, ticked.has(item.id));
}
// Ticking a harness or life jacket asks about it; unticking one takes the question away.
document.getElementById('ppe-block').addEventListener('change', (event) => {
  const id = event.target.value;
  if (event.target.matches('[data-ppe], [data-ppe-step]')) ppeTouched.add(id);
  // An item for particular steps ticked for all work is moved there.
  if (event.target.matches('[data-ppe]') && event.target.checked && ppeStepItems().some((item) => item.id === id)) {
    ppePlaced[id] = 'all';
    for (const group of ppeShown.groups) for (const item of group.items) if (item.id === id) { delete item.steps; item.ticked = true; }
    redrawPpe();
  }
  if (['harness', 'lifeJacket'].includes(id) && event.target.matches('[data-ppe], [data-ppe-step]')) ppeQuestions();
});
// A harness or life jacket ticked or unticked asks its questions again. With a draft shown, the draft
// stays, as it does for any other answer, and is updated in place once nothing new is left to answer
// (messy round 5, run 8: ticking a harness sent the page back to the task form and the draft went).
async function ppeQuestions() {
  if (!shownDraft || resultEl.classList.contains('hidden')) return refreshSteps();
  await askAgain();
  return updateInPlace();
}
document.getElementById('ppe-block').addEventListener('click', (event) => {
  const move = event.target.closest('[data-ppe-all]');
  if (move) {
    const id = move.dataset.ppeAll;
    ppePlaced[id] = 'all';
    ppeTouched.add(id);
    for (const group of ppeShown.groups) for (const item of group.items) if (item.id === id) { delete item.steps; item.ticked = true; }
    const ticked = new Set([...ppeTicked(), id]);
    drawPpe(ppeShown.groups, ppeShown.steps);
    for (const group of ppeShown.groups) for (const item of group.items) setPpe(item.id, ticked.has(item.id));
    return;
  }
  if (event.target.id !== 'ppe-add') return;
  const id = document.getElementById('ppe-add-item').value;
  const step = document.getElementById('ppe-add-step').value;
  if (!id || !step) return;
  const item = ppeShown.groups.flatMap((group) => group.items).find((other) => other.id === id);
  if (!item) return;
  const ticked = new Set([...ppeTicked(), id]);
  item.steps = [...new Set([...(Array.isArray(item.steps) ? item.steps : []), step])].sort((a, b) => ppeShown.steps.indexOf(a) - ppeShown.steps.indexOf(b));
  item.ticked = true;
  ppePlaced[id] = item.steps;
  ppeTouched.add(id);
  drawPpe(ppeShown.groups, ppeShown.steps);
  for (const group of ppeShown.groups) for (const other of group.items) setPpe(other.id, ticked.has(other.id));
  if (['harness', 'lifeJacket'].includes(id)) ppeQuestions();
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
        ${questionDesign(item.id) ? `<div class="question-design" data-question-design="${esc(item.id)}"></div>` : ''}
      </div>`;
}

// ---- Designs given at their question, and blanks made plain (design-fill.js, D243, D241, D245) ----

const fillRules = () => window.SiteWriteDesignFill || null;
// The design a question's answer refers to: { id, label }, or null.
const questionDesign = (questionId) => { const rules = fillRules(); return (rules && rules.QUESTION_DESIGNS[questionId]) || null; };
// The questions on the page with a design, by the design's id.
function questionsWithDesigns() {
  const out = new Map();
  document.querySelectorAll('#required-block [data-question-design]').forEach((el) => {
    const design = questionDesign(el.dataset.questionDesign);
    if (design) out.set(design.id, el.dataset.questionDesign);
  });
  return out;
}
// What each answer has filled from its design, so a change of the design replaces it.
const designFilled = new Map();
// Draws the design's card at each question that asks for it: the same design row as the designs
// table, entered once. A card already drawn stays as it is while the user types.
function drawQuestionDesigns(force = false) {
  const rules = fillRules();
  if (!rules) return;
  document.querySelectorAll('#required-block [data-question-design]').forEach((holder) => {
    const questionId = holder.dataset.questionDesign;
    const design = questionDesign(questionId);
    if (!design) return;
    let row = designRow(design.id);
    if (!row) {
      row = designsKept.get(design.id) || { id: design.id, what: design.label, status: '', by: '', number: '', revision: '', date: '' };
      designAnswers = [...(designAnswers || []), row];
    }
    if (!force && holder.querySelector(`#design-${design.id}`)) return;
    holder.innerHTML = designCard(row, designsFound.find((found) => found.id === design.id), { question: true });
    const box = document.getElementById(`fact-${questionId}`);
    if (box && !designFilled.has(questionId)) designFilled.set(questionId, rules.filledFrom(box.value, row));
  });
  showSameNumbers();
}
// Fills the design blanks in a question's answer from its design, as the design is given or changed.
function fillFromDesign(questionId) {
  const rules = fillRules();
  const design = questionDesign(questionId);
  const box = document.getElementById(`fact-${questionId}`);
  const row = design && designRow(design.id);
  if (!rules || !box || !row) return;
  const result = rules.fillDesign(box.value, row, designFilled.get(questionId) || []);
  designFilled.set(questionId, result.applied);
  if (result.text !== box.value) {
    box.value = result.text;
    markPicks(questionId);
    showBlanks(box);
  }
}
// A blank (____) left in an answer box: the box outlined red and a bold red warning under it naming
// what to fill, as the user types. The download still waits for every blank (download-gate.js).
function showBlanks(box) {
  const rules = fillRules();
  if (!rules || !box || !box.id) return;
  const text = rules.blankWarning(box.value);
  let note = document.getElementById(`${box.id}-blanks`);
  if (!note && text) {
    note = document.createElement('p');
    note.id = `${box.id}-blanks`;
    note.className = 'blank-warning';
    note.setAttribute('role', 'status');
    box.after(note);
  }
  if (note && note.textContent !== text) note.textContent = text;
  if (note) note.hidden = !text;
  box.classList.toggle('has-blank', Boolean(text));
  if (text) { box.setAttribute('aria-invalid', 'true'); box.setAttribute('aria-describedby', note.id); } else { box.removeAttribute('aria-invalid'); if (note) box.removeAttribute('aria-describedby'); }
  drawBlankForm(box);
}

// D261 (owner, 13 October 2026): "where the blanks are are boxes that need to be filled or a button
// that says something like write your own description and then the box goes blank and the user does
// the input." An answer with blanks (____) shows as its sentence with a labelled box in each blank,
// red while empty; what is typed goes into the answer in its place, as if typed there. "Write your own"
// clears the answer to a plain box. The answer box itself stays the record (the gate, the draft and
// the design fill read it): the form follows it, so a design given at the question (D243) fills its
// boxes, and the bold red warning under it (D241, D245) still names each blank left.
const blankForms = new Map();
const BLANK_SPLIT = /_{3,}/;
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// What fills each blank of the sentence in the answer, or null where the answer is no longer that sentence.
function blankValues(template, text) {
  const parts = template.split(BLANK_SPLIT);
  // A blank's hint is there until the blank is filled (blankText), so it may or may not be in the text.
  const partRe = (part, i) => { const hint = i > 0 && BLANK_HINT.exec(part.replace(/\s+/g, ' ')); return hint ? `(?:${escapeRe(hint[0])})?${escapeRe(part.replace(/\s+/g, ' ').slice(hint[0].length))}` : escapeRe(part.replace(/\s+/g, ' ')); };
  const found = new RegExp(`^${parts.map(partRe).join('([^]*?)')}$`).exec(String(text).replace(/\s+/g, ' ').trim());
  return found ? found.slice(1).map((value) => (/^_{3,}$/.test(value.trim()) ? '' : value)) : null;
}
// A bracket straight after a blank that only says what goes in it ("(for example clean fill)", "(a site
// or facility able to receive it)", "(backup supply, such as cylinders)") is a hint: once the blank is
// filled, the hint leaves the answer (messy round 5, run 2: the hint words stayed in the spoil answer).
const BLANK_HINT = /^\s?\((?:for example|e\.g\.|such as|an? |[^()_]*\bsuch as\b)[^()_]*\)/i;
const blankText = (template, values) => template.split(BLANK_SPLIT).map((part, i, all) => {
  const filled = i > 0 && String(values[i - 1] || '').trim();
  const text = filled ? part.replace(BLANK_HINT, '') : part;
  return `${text}${i < all.length - 1 ? (String(values[i] || '').trim() ? values[i] : '____') : ''}`;
}).join('');
function drawBlankForm(box) {
  const rules = fillRules();
  if (!rules || !box || !box.id || !rules.blankLabels) return;
  let kept = blankForms.get(box.id);
  // "Write your own": a plain box until a standard answer is chosen again.
  if (kept && kept.own) { if (!/_{3,}/.test(box.value)) return; kept = null; }
  let values = kept ? blankValues(kept.template, box.value) : null;
  if (!values && /_{3,}/.test(box.value)) {
    kept = { template: box.value.replace(/\s+/g, ' ').trim() };
    values = blankValues(kept.template, box.value) || [];
  }
  let form = document.getElementById(`${box.id}-form`);
  if (!values) {
    blankForms.delete(box.id);
    if (form) { form.remove(); box.classList.remove('hidden'); }
    return;
  }
  blankForms.set(box.id, kept);
  if (!form || form.dataset.template !== kept.template) {
    const parts = kept.template.split(BLANK_SPLIT);
    const labels = rules.blankLabels(kept.template);
    const slots = parts.map((part, n) => `${esc(part)}${n < parts.length - 1 ? `<label class="blank-slot"><span class="blank-label">${esc(labels[n] || 'fill in')}</span><input type="text" maxlength="200" class="blank-slot-input" data-blank-for="${esc(box.id)}" data-blank-n="${n}" aria-label="${esc(labels[n] || 'fill in')}"></label>` : ''}`).join('');
    const made = document.createElement('div');
    made.className = 'blank-form';
    made.id = `${box.id}-form`;
    made.dataset.template = kept.template;
    made.innerHTML = `<p class="blank-sentence">${slots}</p><p class="blank-form-tools"><button type="button" class="link" data-blank-own="${esc(box.id)}">Write your own</button><span class="meta"> Clears this answer so you can write it in your own words.</span></p>`;
    if (form) form.replaceWith(made); else box.before(made);
    form = made;
  }
  box.classList.add('hidden');
  // A blank filled with no answer ("me", "dont no", "TBC") is refused at its box, by its label (messy
  // round 4, runs 7 and 9: "trained by me" printed).
  const said = [];
  form.querySelectorAll('[data-blank-n]').forEach((input) => {
    const value = values[Number(input.dataset.blankN)] || '';
    if (document.activeElement !== input && input.value !== value) input.value = value;
    input.classList.toggle('empty', !input.value.trim());
    const why = input.value.trim() && window.SiteWriteGate ? window.SiteWriteGate.notAnswer(input.value) : '';
    input.classList.toggle('bad', Boolean(why));
    if (why) said.push(`${input.getAttribute('aria-label') || 'This blank'}: ${why}`);
  });
  let note = form.querySelector('.blank-slot-note');
  if (!note && said.length) { note = document.createElement('p'); note.className = 'blank-slot-note'; note.setAttribute('role', 'status'); form.appendChild(note); }
  if (note) { const text = said.join(' '); if (note.textContent !== text) note.textContent = text; note.hidden = !said.length; }
}
// A box in the sentence: the answer gets what is typed in that blank's place.
document.addEventListener('input', (event) => {
  const input = event.target.closest && event.target.closest('[data-blank-for]');
  if (!input) return;
  const box = document.getElementById(input.dataset.blankFor);
  const kept = box && blankForms.get(box.id);
  if (!kept || kept.own) return;
  const values = [...input.closest('.blank-form').querySelectorAll('[data-blank-n]')].map((el) => el.value.replace(/_{3,}/g, ''));
  box.value = blankText(kept.template, values);
  box.dispatchEvent(new Event('input', { bubbles: true }));
});
document.addEventListener('click', (event) => {
  const own = event.target.closest('[data-blank-own]');
  if (!own) return;
  const box = document.getElementById(own.dataset.blankOwn);
  if (!box) return;
  blankForms.set(box.id, { own: true });
  const form = document.getElementById(`${box.id}-form`);
  if (form) form.remove();
  box.value = '';
  box.classList.remove('hidden');
  box.dispatchEvent(new Event('input', { bubbles: true }));
  box.focus();
});
// A box shown as its sentence is reached at its first empty blank.
function answerTarget(el) {
  const form = el && el.id ? document.getElementById(`${el.id}-form`) : null;
  if (!form || !el.classList.contains('hidden')) return el;
  return form.querySelector('.blank-slot-input.bad') || form.querySelector('.blank-slot-input.empty') || form.querySelector('.blank-slot-input') || el;
}
function showAllBlanks() {
  document.querySelectorAll('#required-block textarea[data-fact], #site-block textarea[data-site]').forEach(showBlanks);
}
['required-block', 'site-block'].forEach((id) => document.getElementById(id).addEventListener('input', (event) => {
  if (event.target.matches && event.target.matches('textarea[data-fact], textarea[data-site]')) showBlanks(event.target);
}));

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
    lede.textContent = 'Answer each question for this job. SiteWrite says under a box if an answer is too thin to print, and what would do.';
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
  drawQuestionDesigns();
  showAllBlanks();
  showAnswerNotes();
}

// ---- Answers too thin to print, said on the spot (messy-user testing, 13 October 2026) ----

// The server names each answer given that is too thin to print (draft.js weakAnswers), and a
// stood-down draft names each answer still needed (missingHelp), each with what would do and an
// accepted example (answer-help.js). The note sits under the box, so the user sees it where they type.
let weakNotes = new Map();
// What each thin answer's note says: why, as the download check says it ("dont know" is not an
// answer yet), or that it is too thin to print, then what would do (answer-help.js).
const weakText = (item) => `${item.why || 'Too thin to print.'} ${item.help}`;
const weakMap = (list) => new Map((Array.isArray(list) ? list : []).map((item) => [item.id, weakText(item)]));
let missingNotes = new Map();
function showAnswerNotes() {
  document.querySelectorAll('#required-block [data-q]').forEach((holder) => {
    const id = holder.dataset.q;
    const box = document.getElementById(`fact-${id}`);
    const anchor = box || holder.querySelector('legend') || holder.firstElementChild;
    if (!anchor) return;
    const weak = weakNotes.get(id);
    const missing = !weak && missingNotes.get(id);
    // One message per answer: a blank left in it is said by the red warning, or the download check, alone.
    const need = box && document.getElementById(`need-${box.id}`);
    const blanked = box && (box.classList.contains('has-blank') || (need && !need.hidden));
    const text = blanked ? '' : weak || missing || '';
    let note = document.getElementById(`answer-note-${id}`);
    if (!note && text) {
      note = document.createElement('p');
      note.id = `answer-note-${id}`;
      note.className = 'answer-note';
      note.setAttribute('role', 'status');
      if (box) box.after(note); else holder.appendChild(note);
    }
    if (note && note.textContent !== text) note.textContent = text;
    if (note) note.hidden = !text;
    if (box) {
      if (text) { box.classList.add('answer-thin'); box.setAttribute('aria-describedby', note.id); } else { box.classList.remove('answer-thin'); if (note && box.getAttribute('aria-describedby') === note.id) box.removeAttribute('aria-describedby'); }
    }
  });
}
function setWeak(list) {
  weakNotes = weakMap(list);
  showAnswerNotes();
}
// Typing in a box named as still needed takes its note off; the server says again if it is too thin.
document.getElementById('required-block').addEventListener('input', (event) => {
  const id = event.target.id && event.target.id.startsWith('fact-') ? event.target.id.slice(5) : '';
  if (id && missingNotes.has(id)) { missingNotes.delete(id); showAnswerNotes(); }
});
// "Go to" beside an answer a stood-down draft still needs: the box is brought into view and focused.
function goToAnswer(id) {
  const found = document.getElementById(`fact-${id}`) || document.querySelector(`#required-block [data-q="${id}"] input, #required-block [data-q="${id}"]`);
  if (!found) return;
  factsForm.classList.remove('hidden');
  // An answer shown as its sentence with boxes (D261) is reached at its first empty blank: the answer
  // box itself is hidden, so the phone did not move (messy round 4, run 9).
  const box = answerTarget(found);
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (box.focus) box.focus({ preventScroll: true });
}
document.addEventListener('click', (event) => {
  const go = event.target.closest('[data-answer-go]');
  if (!go) return;
  const id = go.dataset.answerGo === 'first' ? [...missingNotes.keys()][0] : go.dataset.answerGo;
  if (id) goToAnswer(id);
});

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
    const { response, data } = await postJson('/api/draft/questions', payload());
    if (!response.ok || seq !== askSeq) return;
    if (seq !== askSeq || !Array.isArray(data.required)) return;
    questions = { ...questions, required: data.required, weak: data.weak || [], standDown: data.standDown, notCovered: data.notCovered, notCoveredLeft: data.notCoveredLeft };
    showStandDown(data);
    weakNotes = weakMap(data.weak);
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
  if (!options.keepDraft) resultEl.classList.add('hidden');
  // The answers on the page stay, unless this is a new SWMS.
  const fresh = freshFacts;
  const sent = payload();
  // A new SWMS is asked with the PPE SiteWrite suggests for it, not the last task's.
  if (fresh) delete sent.ppe;
  // An ask already on its way is out of date once this one is sent.
  askSeq += 1;
  const { response, data } = await postJson('/api/draft/questions', sent);
  if (!response.ok) {
    document.getElementById('start-error').textContent = data.message || 'That state is not available.';
    return false;
  }
  questions = data;
  freshFacts = false;
  // Spelling SiteWrite fixed in the task, shown so the user can check it.
  const note = document.getElementById('spelling-note');
  const fixes = data.spellingFixes || [];
  note.textContent = fixes.length ? `Spelling fixed in the SWMS: ${fixes.map((fix) => `${fix.from} to ${fix.to}`).join(', ')}.` : '';
  note.classList.toggle('hidden', !fixes.length);
  const warning = document.getElementById('fall-warning');
  warning.textContent = (data.fall && data.fall.warning) || '';
  warning.classList.toggle('hidden', !warning.textContent);
  // Work SiteWrite has no job steps for is stood down: the user hears it here, not only at the draft.
  showStandDown(data);
  weakNotes = weakMap(data.weak);
  if (fresh) {
    factMemory = {};
    siteMemory = {};
    missingNotes = new Map();
    document.getElementById('required-block').innerHTML = '';
  } else {
    Object.assign(siteMemory, shownAnswers('[data-site]', 'site'));
  }
  drawRequired(data.required || []);
  sayUnasked(data.required);
  // PPE the user ticked or unticked stays as they set it. The rest follows the new suggestion, and
  // when only the steps changed, what was ticked stays ticked. The server has already put each item
  // where the user put it (ppeSteps).
  const ppeWasShown = !fresh && document.querySelector('[data-ppe]');
  const ticked = new Set(Array.isArray(sent.ppe) ? sent.ppe : []);
  drawPpe(data.ppe || [], data.ppeSteps || []);
  if (ppeWasShown) {
    const rows = new Set([...document.querySelectorAll('[data-ppe-step]')].map((el) => el.value));
    document.querySelectorAll('[data-ppe], [data-ppe-step]').forEach((el) => {
      // An item for particular steps is ticked in its row, not in the all work list.
      if (el.matches('[data-ppe]') && rows.has(el.value)) return;
      // An item the user did not touch follows the new suggestion: one ticked only for steps taken off
      // goes with them, and so does its question (messy round 5, run 3: the harness ticked for steel
      // erection stayed, with its question, after steel erection was unticked).
      if (ppeTouched.has(el.value)) el.checked = ticked.has(el.value);
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
  showAllBlanks();
  drawDesigns(data.designs || []);
  renderSteps(data.steps || { suggested: [], chosen: [], locked: [] });
  factsForm.classList.remove('hidden');
  if (!options.stay) { factsForm.scrollIntoView({ behavior: 'smooth', block: 'start' }); markStage('questions'); }
  // The questions stage is kept, so a reload brings the user back to the questions, not the start.
  keepUnsaved();
  // The questions were asked with the PPE ticked before; if the new suggestion ticks a harness or a
  // life jacket, its questions are asked for too.
  const now = ppeTicked();
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
    if (DATE_FIELDS.has(id)) el.value = isoDate(values[key]) || (id === 'draft-date' ? isoToday() : isoReviewDate());
    else el.value = values[key] || '';
  });
  applyAddressState();
  showSameName();
}

// The task and site details of a SWMS, without asking the server for its questions.
function fillStart(input) {
  const pick = (name, value) => {
    const el = value && document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (el) el.checked = true;
  };
  pick('state', input.state);
  pick('residential', input.residential);
  document.querySelectorAll('input[name="crane"], input[name="slinging"]').forEach((el) => { el.checked = false; });
  pick('crane', input.crane);
  pick('slinging', input.slinging);
  showSlinging();
  pick('fallRisk', input.fallRisk);
  fillFields(input);
  document.getElementById('task-trade').value = input.trade || '';
  stepPicks = Array.isArray(input.kinds) ? [...input.kinds] : null;
  leaveOut = Array.isArray(input.leaveOut) ? [...input.leaveOut] : null;
  scopeUnmatched = Array.isArray(input.unmatched) ? [...input.unmatched] : null;
  scopeWordsNow = input.scopeTask && typeof input.scopeTask === 'object' ? { ...input.scopeTask } : null;
  pickGaps = Array.isArray(input.pickGaps) ? [...input.pickGaps] : null;
  coverTicked = Array.isArray(input.notCoveredConfirmed) ? JSON.stringify(input.notCoveredConfirmed) : null;
  coverElsewhere = input.notCoveredElsewhere && typeof input.notCoveredElsewhere === 'object' ? { ...input.notCoveredElsewhere } : {};
  coverInStep = input.notCoveredInStep && typeof input.notCoveredInStep === 'object' ? { ...input.notCoveredInStep } : {};
  coverMovedKept = new Set(Array.isArray(input.movedOut) ? input.movedOut : []);
  coverTyping.clear();
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
  highRiskAdded = Array.isArray(input.highRiskAdded) && input.highRiskAdded.length ? [...input.highRiskAdded] : null;
  hrcwNote = '';
  highRiskOff = Array.isArray(input.highRiskOff) && input.highRiskOff.length ? input.highRiskOff.filter((item) => item && typeof item.id === 'string').map((item) => ({ id: item.id, reason: String(item.reason || '') })) : null;
  hrcwOffNote = '';
  stepRatings = input.stepRatings && typeof input.stepRatings === 'object' ? JSON.parse(JSON.stringify(input.stepRatings)) : null;
  ratingOpen.clear();
  ppePlaced = input.ppeSteps && typeof input.ppeSteps === 'object' ? JSON.parse(JSON.stringify(input.ppeSteps)) : {};
  // PPE the user unticked by hand stays unticked when the plant changes (messy round 6).
  ppeTouched.clear();
  if (Array.isArray(input.ppeOff)) input.ppeOff.filter((id) => typeof id === 'string').forEach((id) => ppeTouched.add(id));
  designAnswers = Array.isArray(input.designs) && input.designs.length ? JSON.parse(JSON.stringify(input.designs)) : null;
  if (window.SiteWriteSubstances) window.SiteWriteSubstances.load(input.substances, input.substancesNotUsed, input.substancesNotUsedWhy);
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
    // Clothing ticked before one garment went to each tick box (D248) is read as the new items.
    const OLD = { siteClothing: ['sleevesLong', 'pantsLong'], longs: ['sleevesLong', 'pantsLong'], sleevesShorts: ['sleevesLong', 'shorts'] };
    const saved = input.ppe.flatMap((id) => OLD[id] || [id]);
    const rows = new Set([...document.querySelectorAll('[data-ppe-step]')].map((el) => el.value));
    document.querySelectorAll('[data-ppe], [data-ppe-step]').forEach((el) => { el.checked = saved.includes(el.value) && !(el.matches('[data-ppe]') && rows.has(el.value)); });
  }
  // The questions follow the SWMS's own answers and PPE: a harness named in the fall control answer, or
  // ticked, brings its question, with the answer it was given (messy round 4, A fault 3: the harness
  // answer given on the project page showed "Not answered yet" once the SWMS was opened, as the draft
  // was asked for before the question was on the page).
  await askAgain();
  return true;
}

// Testing live equipment needs arc-rated clothing and insulated gloves (Model Code s 9.5).
factsForm.addEventListener('change', (event) => {
  if (event.target.dataset.fact !== 'energisedWork' || event.target.value !== 'testing') return;
  ['arcRated', 'gloveInsulated'].forEach((id) => { setPpe(id, true); ppeTouched.add(id); });
});

// A standard answer's wording as a pattern: blanks (____) match whatever was filled in.
function pickPattern(text) {
  // A blank's hint leaves the answer once the blank is filled (blankText), so it is optional here.
  const parts = String(text).split('____').map((part, i) => {
    const hint = i > 0 && BLANK_HINT.exec(part);
    const esc = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return hint ? `(?:${esc(hint[0])})?${esc(part.slice(hint[0].length))}` : esc(part);
  });
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
    showBlanks(box);
    markPicks(item.id);
    askAgain();
    answerTarget(box).focus();
    return;
  }
  // A refused or thin answer is replaced, not added to (messy round 3: "harnes Work is done from a
  // scaffold..."); a full answer is kept and the standard answer added after it.
  const now = box.value.trim();
  const thin = !now || (window.SiteWriteGate && window.SiteWriteGate.notAnswer(now)) || now.split(/\s+/).length < 3 || weakNotes.has(item.id) || missingNotes.has(item.id);
  box.value = thin ? pick.text : `${now} ${pick.text}`;
  // A standard answer chosen after "Write your own" shows as its sentence again (D261).
  if ((blankForms.get(box.id) || {}).own) blankForms.delete(box.id);
  if (questionDesign(item.id)) fillFromDesign(item.id);
  showBlanks(box);
  markPicks(item.id);
  // A standard answer can bring in another question (a harness named in the fall control).
  askAgain();
  const target = answerTarget(box);
  target.focus();
  const blank = box.value.indexOf('____');
  if (target === box && blank >= 0) box.setSelectionRange(blank, blank + 4);
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

// What SiteWrite cannot draft for a picked task, said before Continue, so it is no surprise.
function showPresetNote(item) {
  const gaps = (item && item.gaps) || [];
  let text = '';
  if (item && item.coverage === 'none' && !(item.kinds || []).length) text = 'SiteWrite has no job steps for this task yet. Pick the job steps that cover it under Job steps, or write your own step for it with "Write a step for this" after Continue.';
  else if (gaps.length) text = `SiteWrite has no job steps yet for: ${gaps.join('; ')}. You will be asked to add your own steps for this, or cover it in a separate SWMS.`;
  presetNote.textContent = text;
  presetNote.classList.toggle('hidden', !text);
}

function listTasks(trade) {
  presetEl.innerHTML = '<option value="">Choose a task</option>' + (trade ? trade.tasks.map((item, index) => `<option value="${index}">${esc(item.title)}</option>`).join('') : '');
  presetEl.disabled = !trade;
}

tradeEl.addEventListener('change', () => {
  listTasks(trades[Number(tradeEl.value)]);
  showPresetNote(null);
});

// A SWMS from a scope shows the pick list trade, and the task where one fits, that match its work
// (owner testing, 13 October 2026: "No Trade comes up and its clear it formwork"). The task box keeps
// the scope's own words and the scope's job steps; picking another task from the list replaces them.
async function showPick(pick) {
  await presetsLoaded;
  const at = pick ? trades.findIndex((trade) => trade.id === pick.trade) : -1;
  tradeEl.value = at >= 0 ? String(at) : '';
  listTasks(trades[at]);
  const task = at >= 0 && pick.task ? trades[at].tasks.findIndex((item) => item.id === pick.task) : -1;
  presetEl.value = task >= 0 ? String(task) : '';
  showPresetNote(null);
}

presetEl.addEventListener('change', () => {
  const trade = trades[Number(tradeEl.value)];
  const item = trade && trade.tasks[Number(presetEl.value)];
  if (!item) return;
  const taskEl = document.getElementById('task');
  const written = Boolean(taskEl.value.trim()) && taskEl.value.trim() !== taskEl.dataset.preset;
  if (written && !confirm('Replace the task you have written? Your answers that still apply are kept.')) return;
  // A task picked once the questions have been shown replaces only the old task's words and steps: the
  // answers that still apply stay (messy round 5). A first pick starts a new SWMS as before.
  // Replacing a task keeps the fall and crane answers already given (messy round 6: the fall answer went
  // from Yes to No and the crane answer was emptied, and neither was named).
  const replacing = Boolean(questions || written);
  const fallGiven = replacing ? (document.querySelector('input[name="fallRisk"]:checked') || {}).value || '' : '';
  const craneGiven = replacing ? (document.querySelector('input[name="crane"]:checked') || {}).value || '' : '';
  if (replacing) replaceTask(written, { fall: fallGiven, crane: craneGiven }); else newSwms();
  taskEl.value = item.task;
  taskEl.dataset.preset = item.task;
  pickedTask = { task: item.task, kinds: item.kinds || [], leaveOut: item.leaveOut || [], gaps: item.gaps || [] };
  showPresetNote(item);
  document.getElementById('task-trade').value = '';
  const fall = !fallGiven && document.querySelector(`input[name="fallRisk"][value="${item.fallRisk}"]`);
  if (fall) { fall.checked = true; fall.dispatchEvent(new Event('change', { bubbles: true })); }
  if (craneGiven) { showSlinging(); return; }
  // A task that names no crane leaves the crane question unanswered (Continue makes it "No crane").
  document.querySelectorAll('input[name="crane"], input[name="slinging"]').forEach((el) => { el.checked = false; });
  // A truck loading crane (crane truck, HIAB) is often the crew's own, so who runs it is left for the user
  // to answer (messy round 5: "A crane company" was set for a landscaper's own HIAB).
  const crane = (item.crane === 'own' || (NAMES_CRANE.test(item.task) && !TRUCK_CRANE.test(item.task))) && document.querySelector(`input[name="crane"][value="${item.crane}"]`);
  if (crane) crane.checked = true;
  showSlinging();
});

const presetsLoaded = loadPresets();

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
    // A need that starts with its own name and a colon ("Cement product: add ...") follows a full stop,
    // so the note does not read with two colons (owner, D282).
    const text = `Needed before download${/^[^.:]{1,60}: /.test(gap.need) ? '.' : ':'} ${gap.need}`;
    if (note.textContent !== text) note.textContent = text;
    // An answer's blank is said once, by the red warning under it (D241); the list above still has it.
    note.hidden = gap.kind === 'fact' && el.classList.contains('has-blank') && Boolean(document.getElementById(`${el.id}-blanks`));
    el.setAttribute('aria-invalid', 'true');
    if (!note.hidden) el.setAttribute('aria-describedby', note.id);
  }
  showAnswerNotes();
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
  const rules = window.SiteWriteGate;
  // A design is judged from its card as it is now.
  if (check.kind === 'design' && rules && rules.designNeed) return designShown(check.design) ? rules.designNeed(designRow(check.design)) : check.need;
  // A hazardous product is judged from its card as it is now (substances.js).
  if (check.kind === 'substance' && window.SiteWriteSubstances) { const need = window.SiteWriteSubstances.need(check.substance); return need === null ? check.need : need; }
  if (check.kind === 'substanceType' && window.SiteWriteSubstances) return window.SiteWriteSubstances.typeNeed(check.substanceType);
  if (!check.rule || !rules) return check.need;
  if (check.kind === 'line') return rules.answerNeed(check.rule, (fills || {})[check.key] || []);
  const el = check.field ? document.getElementById(check.field) : null;
  return el ? rules.answerNeed(check.rule, el.value) : check.need;
}

// The answers the SWMS prints as given (gate-rules.js AS_GIVEN): these go with a download as they
// are now. A change to anything else since the draft was prepared needs the draft prepared again.
const asGiven = () => (window.SiteWriteGate ? window.SiteWriteGate.AS_GIVEN : []);
// What the user changes in their own flows, which prepare the draft again or update what is saved,
// and the business details, which a download takes from the account's company profile.
const OWN_FLOWS = ['controlEdits', 'hazardEdits', 'whoEdits', 'ownSteps', 'notCoveredConfirmed', 'notCoveredElsewhere', 'notCoveredInStep', 'company', 'companyAbn', 'companyAddress', 'companyPhone', 'companyEmail'];
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
// server found (goal 2), judged again as the user answers, and the tick for work SiteWrite has no
// job steps for (D184), counted from the box above the draft as the user ticks it.
// Signed in, every download prints the company's own name and ABN from the saved Company profile, so
// they are on the list before download, with a button that opens the profile at the empty box
// (messy-user testing, 13 October 2026: they were checked only at the final press, far from the profile).
function companyGap() {
  const S = window.SiteWrite || {};
  if (!S.signedIn || !S.signedIn()) return null;
  const name = String(profile.name || '').trim();
  const abn = String(profile.abn || '').replace(/\D/g, '');
  if (name && abn) return null;
  const typed = profileTyped();
  const field = !name ? 'profile-company' : 'profile-abn';
  const missing = !name && !abn ? 'company name and ABN' : !name ? 'company name' : 'ABN';
  // "Company name and ABN", not "Company company name and ABN" (messy round 3).
  // The profile saves itself once both are in (messy round 4: "press Save profile" was said of it).
  return { id: 'company', kind: 'company', field, label: `${missing.charAt(0).toUpperCase()}${missing.slice(1)}`, need: `Add your ${missing} under Company profile.${profileDiffers(typed) ? ' It saves itself once the company name and the 11 digit ABN are both filled in.' : ''} They print on every SWMS.` };
}

// Questions about plant the user has unticked, but not yet confirmed, are not asked (messy round 4, run
// 4: the scaffold supervisor and two EWP emergency answers were asked with the EWP unticked). The
// server asks again once the plant is confirmed.
const EWP_PLANT = /elevating work platform|^Scissor lift/i;
function plantUnticked(check) {
  if (!document.getElementById('plant-panel') || !plantPending) return false;
  const ticks = plantPending.ticks || plantTicksNow();
  const names = Object.keys(ticks);
  if (!names.length) return false;
  const anyTicked = (pattern) => names.some((name) => pattern.test(name) && ticks[name]) || plantOwn().some((item) => pattern.test(item.item));
  if (/^emergency\.ewp/.test(check.id || '')) return names.some((name) => EWP_PLANT.test(name)) && !anyTicked(EWP_PLANT);
  if (check.id === 'scaffoldSupervisor') return names.some((name) => /\bscaffold/i.test(name)) && !anyTicked(/\bscaffold/i);
  return false;
}
function outstanding(data) {
  if (!data || data.kind !== 'draft') return [];
  const gaps = shownChecks.filter((check) => check.kind !== 'cover' && !plantUnticked(check)).map((check) => ({ ...check, need: liveNeed(check) })).filter((check) => check.need);
  const company = companyGap();
  if (company) gaps.unshift(company);
  // A part the user wrote a step for needs no tick. Work that is all the task's work (D211) needs the
  // user's own step: a tick does not cover it.
  const unwritten = coverUnwritten(data);
  if (unwritten.length) gaps.unshift({ id: 'notCovered', kind: 'cover', label: 'Your own step for work SiteWrite has no job steps for', need: `SiteWrite has no job steps for: ${unwritten.join('; ')}. This is the work of the task, so write your own step for it with "Write a step for this" above the draft.` });
  const parts = coverLeft(data);
  if (parts.length && !coverDone(parts)) {
    gaps.unshift({ id: 'notCovered', kind: 'cover', label: 'Work SiteWrite has no job steps for', need: `SiteWrite has no job steps for: ${parts.join('; ')}. Above the draft, write a step for it, say which step in this SWMS covers it, or say which SWMS covers it.` });
  }
  return gaps;
}

// What is still needed, listed above the download buttons, each with a link that goes to it.
function gateBlock(gaps) {
  if (!gaps.length) return '';
  const answers = gaps.some((gap) => gap.kind !== 'cover');
  return `<div class="panel gate" id="gate-panel" role="region" aria-labelledby="gate-title">
    <h3 id="gate-title">Before you can download this SWMS</h3>
    <p>SiteWrite does not produce a SWMS until the site questions are answered, the plant is confirmed, the emergency response is given,${gaps.some((gap) => gap.kind === 'design') ? ' the designs it relies on are named,' : ''}${gaps.some((gap) => gap.kind === 'substance' || gap.kind === 'substanceType') ? ' each hazardous product is listed and checked against its safety data sheet,' : ''} no blank is left in it, and any work it has no job steps for is dealt with. You can keep looking at the draft. Deal with ${gaps.length === 1 ? 'this' : `these ${gaps.length}`}. Each one comes off this list as soon as it is answered:</p>
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
  // The EWP's emergency questions are put away while the EWP is unticked.
  document.querySelectorAll('[data-emergency^="ewp"]').forEach((el) => { const field = el.closest('.field'); if (field) field.classList.toggle('hidden', plantUnticked({ id: `emergency.${el.dataset.emergency}` })); });
  const S = window.SiteWrite || {};
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
// kept with the designs as "method-1" and so on. SiteWrite can read a typed one and suggest job steps
// for the user to accept (method-read.js, D230).
const isMethodRow = (row) => Boolean(row && /^method-\d+$/.test(row.id || ''));
const ownRow = (row) => Boolean(row && /^(?:added|method)-\d+$/.test(row.id || ''));
const methodTyped = (row) => ['what', 'by', 'number', 'revision', 'date'].some((key) => String(row[key] || '').trim()) || Boolean(row.file);
function designsPayload() {
  // A design shown only at its question (D243) and not answered there is not sent.
  const askedIds = Object.values((fillRules() || {}).QUESTION_DESIGNS || {}).map((item) => item.id);
  const onlyAsked = (row) => !row.status && askedIds.includes(row.id) && !designsFound.some((found) => found.id === row.id);
  const rows = (designAnswers || []).filter((row) => row.id && !onlyAsked(row) && (isMethodRow(row) ? methodTyped(row) : (!/^added-/.test(row.id) || String(row.what || '').trim())));
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
// Details read from the drawing's typed words (D249, D250): an amber note until the user ticks that
// they match the title block, which the download waits for (gate-rules.js designNeed).
const readFields = (row) => (row && row.read && Array.isArray(row.read.fields) ? row.read.fields : []);
function readNote(row) {
  if (!readFields(row).length) return '';
  const checked = row.read.checked === true;
  return `<div class="design-read${checked ? ' checked' : ''}">${checked ? '' : '<p class="warning design-read-note">Read from the drawing: check it matches the title block.</p>'}
    <label class="check"><input type="checkbox" data-design-read-check="${esc(row.id)}"${checked ? ' checked' : ''}> These match the drawing</label></div>`;
}
function designCard(row, found, { question = false } = {}) {
  const id = esc(row.id);
  const added = /^added-/.test(row.id);
  const status = row.status || '';
  const radio = (value, label) => `<label><input type="radio" name="design-status-${id}" value="${value}" data-design-field="status"${status === value ? ' checked' : ''}> ${label}</label>`;
  const read = (key) => (readFields(row).includes(key) && row.read.checked !== true ? ' class="design-read-field"' : '');
  const box = (key, label, hint, type = 'text', max = 120) => `<div class="field"><label for="design-${id}-${key}">${label}${hint ? `<span class="hint">${hint}</span>` : ''}</label><input id="design-${id}-${key}" type="${type}" data-design-field="${key}" maxlength="${max}" autocomplete="off" value="${esc(row[key] || '')}"${read(key)}></div>`;
  return `<fieldset class="field design-card" id="design-${id}" data-design="${id}" data-status="${esc(status)}" tabindex="-1">
    <legend>${esc(row.what || (added ? 'Another design' : (found && found.label) || 'Design'))}</legend>
    ${question ? '<p class="meta">Give the design once here. Its number and revision fill the answer above, and it prints in the designs table near the top of the SWMS.</p>' : ''}
    ${found && found.steps.length ? `<p class="meta">Used in: ${esc(found.steps.join('; '))}.</p>` : question ? '' : '<p class="meta">Prints in the designs table near the top of the SWMS.</p>'}
    <div class="choice design-status">${radio('given', 'I have it')}${radio('notIssued', 'Not issued yet')}${radio('notNeeded', 'Not needed for this work')}</div>
    <div class="design-given">
      ${readNote(row)}
      ${box('what', 'What it is', 'As the design is titled, for example Shoring design or Formwork design.', 'text', 200)}
      ${box('by', 'Who prepared it', 'The engineer or firm, for example Smith Engineering.', 'text', 200)}
      <div class="design-pair">${box('number', 'Document or drawing number', 'From the title block, for example ABC-S-101.')}${box('revision', 'Revision', 'For example C. Leave it empty if it has none.', 'text', 40)}</div>
      <p class="warning design-same" id="design-${id}-same" hidden></p>
      ${box('date', 'Date on the design', '', 'date', 60)}
      ${designFileBox(row, 'drawing')}
    </div>
    <p class="note design-hold">${question ? 'The answer above prints as a hold point: the work it covers does not start until the design is issued and this SWMS is updated. You can leave the answer empty.' : 'The steps that use it print a hold point: "Do not start this step until the design is issued and this SWMS is updated."'} When the design arrives, add its details here and save a new revision.</p>
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
        <p class="meta">A PDF, or a photo of the ${what}, up to 10 MB. It stays with this SWMS in SiteWrite, for you and your reviewer to open. It does not print.${what === 'drawing' ? ' SiteWrite reads the typed words of a PDF\'s title block to fill in the details above for you to check. It does not read the drawing itself, a scan or a photo.' : ''}</p>
        ${file}<p class="meta design-file-msg" data-design-msg="${id}" role="status"></p></div>`;
}
// A written method's card: the same details and file as a design, with no status to choose (the
// user adds one only when they have it), and plainly said: SiteWrite reads typed words only, and the
// user makes the job steps match it. The reading and its suggestions are drawn by method-read.js.
const METHOD_CAUTION = 'SiteWrite reads only the typed words of a methodology, never drawings or scanned pages, and its suggestions can be wrong: check every one against the methodology. It is up to you to make sure the job steps match it. Where they differ, change the steps on the draft with "Change this step", or write your own with "Write a step for this" or "Write a step of your own".';
function methodCard(row) {
  const id = esc(row.id);
  const box = (key, label, hint, type = 'text', max = 120) => `<div class="field"><label for="design-${id}-${key}">${label}${hint ? `<span class="hint">${hint}</span>` : ''}</label><input id="design-${id}-${key}" type="${type}" data-design-field="${key}" maxlength="${max}" autocomplete="off" value="${esc(row[key] || '')}"></div>`;
  const rules = window.SiteWriteGate;
  const need = rules && rules.methodNeed ? rules.methodNeed(row) : '';
  return `<fieldset class="field design-card method-card" id="design-${id}" data-design="${id}" data-status="given" tabindex="-1">
    <legend>${esc(String(row.what || '').trim() || 'Written methodology or sequence of works')}</legend>
    <p class="warning method-caution">${esc(METHOD_CAUTION)}</p>
    <p class="meta">Prints in the table near the top of the SWMS. Nothing is added to the job steps unless you accept a suggested step.</p>
    <div class="design-given">
      ${box('what', 'What it is', 'As the document is titled, for example Jump lift machine platform raising methodology.', 'text', 200)}
      ${box('by', 'Who prepared it', 'The company or person, for example the lift company.', 'text', 200)}
      <div class="design-pair">${box('number', 'Document number', 'Optional. From the document, for example LC-MS-014.')}${box('revision', 'Revision', 'For example C. Leave it empty if it has none.', 'text', 40)}</div>
      <p class="warning design-same" id="design-${id}-same" hidden></p>
      ${box('date', 'Date on the document', '', 'date', 60)}
      ${designFileBox(row, 'document')}
    </div>
    <p class="method-need" id="design-${id}-need" role="status"${need ? '' : ' hidden'}>${esc(need)}</p>
    ${window.SiteWriteMethodRead ? window.SiteWriteMethodRead.boxHtml(row) : ''}
    <p><button type="button" class="link" data-design-remove="${id}">Remove this methodology</button></p>
  </fieldset>`;
}
// What a method still needs before it prints, said on its card as the user types.
function showMethodNeed(row) {
  const note = document.getElementById(`design-${row.id}-need`);
  const rules = window.SiteWriteGate;
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
  // A design given at its question (D243) and not in the steps, kept as typed.
  const atQuestions = questionsWithDesigns();
  const asked = [...atQuestions.keys()].filter((id) => !rows.some((row) => row.id === id)).map((id) => designsKept.get(id) || answers.find((row) => row.id === id)).filter(Boolean);
  // The designs the user added, then the written methods, each kept as typed.
  const added = [...asked, ...answers.filter((row) => /^added-/.test(row.id)), ...answers.filter(isMethodRow)];
  designAnswers = rows.length || added.length ? [...rows, ...added] : null;
  const section = document.getElementById('designs-section');
  if (!section) return;
  const shape = JSON.stringify([designsFound.map((row) => [row.id, row.label, row.steps]), added.map((row) => row.id), [...atQuestions.keys()]]);
  const designs = (designAnswers || []).filter((row) => !isMethodRow(row) && !atQuestions.has(row.id));
  const methods = (designAnswers || []).filter(isMethodRow);
  section.classList.toggle('hidden', !designs.length);
  // The written methods: optional, on every draft, under the designs (D224).
  const methodsHead = document.getElementById('methods-head');
  if (methodsHead) methodsHead.classList.toggle('hidden', !methods.length);
  const methodAdd = document.getElementById('method-add');
  if (methodAdd) methodAdd.textContent = methods.length ? 'Add another written methodology or sequence of works (optional)' : 'Add a written methodology or sequence of works (optional)';
  if (shape === designsDrawn) { showSameNumbers(); return; }
  designsDrawn = shape;
  drawQuestionDesigns(true);
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
  const rules = window.SiteWriteGate;
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
  drawQuestionDesigns(true);
}
const designsBlock = document.getElementById('designs-block');
// The written methods' cards work as the designs' do.
const designBlocks = [designsBlock, document.getElementById('methods-block'), document.getElementById('required-block')].filter(Boolean);
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
  // The answer at the design's question follows it (D243).
  if (['status', 'number', 'revision'].includes(field)) {
    const questionId = questionsWithDesigns().get(row.id);
    if (questionId) fillFromDesign(questionId);
  }
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
    const S = window.SiteWrite || {};
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
  const S = window.SiteWrite || {};
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
    if (row && !isMethodRow(row)) await readDrawing(id);
  } catch (error) {
    say(error.message);
    input.value = '';
  }
}));

// The drawing just attached is read for its title block (D249): its typed words only. What is found
// fills the card, marked as read until the user ticks that it matches; a scan or a photo is typed.
async function readDrawing(id) {
  const S = window.SiteWrite || {};
  const row = designRow(id);
  if (!row || !row.file || !S.call) return;
  const fileId = row.file.id;
  const say = (text) => { const msg = document.querySelector(`[data-design-msg="${id}"]`); if (msg) msg.textContent = text; };
  say('Reading the typed words on the drawing...');
  let data;
  try {
    data = await S.call('POST', '/api/designs/read', { fileId });
  } catch (error) {
    say(error.message);
    return;
  }
  const now = designRow(id);
  if (!now || !now.file || now.file.id !== fileId) return;
  // What it is is filled only when empty: a design SiteWrite named keeps its name.
  const fields = (data.read || []).filter((key) => key !== 'what' || !String(now.what || '').trim());
  for (const key of fields) now[key] = data.details[key];
  if (fields.length) {
    now.status = 'given';
    now.read = { fields, checked: false };
  }
  redrawDesigns();
  const questionId = questionsWithDesigns().get(id);
  if (questionId) fillFromDesign(questionId);
  keepUnsaved();
  if (typeof showGate === 'function' && shownDraft) showGate();
  const msg = document.querySelector(`[data-design-msg="${id}"]`);
  if (msg) msg.textContent = fields.length ? '' : 'SiteWrite found none of the details in the drawing\'s typed words. Type them.';
}
// Ticking that the details read match the drawing; untick to check again.
designBlocks.forEach((block) => block.addEventListener('change', (event) => {
  const tick = event.target.closest && event.target.closest('[data-design-read-check]');
  if (!tick) return;
  const row = designRow(tick.dataset.designReadCheck);
  if (!row || !row.read) return;
  row.read.checked = tick.checked;
  redrawDesigns();
  const questionId = questionsWithDesigns().get(row.id);
  if (questionId) fillFromDesign(questionId);
  keepUnsaved();
  if (typeof showGate === 'function' && shownDraft) showGate();
}));

// ---- The plant and the emergency response, asked in the draft (goal 2) ----

// The plant SiteWrite lists, as a tick list the user confirms before download: what the crew uses
// is ticked, plant SiteWrite is not sure of starts unticked, and the user adds their own with the
// licence or ticket to operate it. Only the plant confirmed prints.
function plantTicked(item) {
  if (plantPending && plantPending.ticks && item.item in plantPending.ticks) return plantPending.ticks[item.item];
  if (plantChoice && (plantChoice.used || []).includes(item.item)) return true;
  if (plantChoice && (plantChoice.notUsed || []).includes(item.item)) return false;
  // Plant listed only since the plant was confirmed starts unticked, as its note says ("Tick it if your
  // crew uses it"). Unticking one item never brings its alternative back ticked (messy round 6, run 6:
  // unticking the line pump re-offered the placing boom ticked, and the other way round).
  if (plantChoice) return false;
  return !item.maybe;
}
// The plant confirmed: what is ticked now, and what is unticked now or was unticked before, though it is
// not listed now. An item the user said is not used stays said, so its alternative is never asked again
// in its place, and the plant can be confirmed with neither.
function confirmedPlant(ticks, added) {
  const names = Object.keys(ticks);
  const used = names.filter((name) => ticks[name]);
  const before = ((plantChoice && plantChoice.notUsed) || []).filter((name) => !names.includes(name));
  return { used, notUsed: [...new Set([...names.filter((name) => !ticks[name]), ...before])], added };
}
const NOTHING_TO_ADD = /^(?:no|none|no other|nothing|nothing else|nil|n\/?a|not applicable)[.!]?$/i;
const plantOwn = () => (plantPending && plantPending.own) || (plantChoice && plantChoice.added) || [];
function plantBlock(draft) {
  const listed = draft.plantInferred || [];
  const gap = (draft.gate || []).find((item) => item.kind === 'plant');
  const done = plantChoice && !gap && !plantPending;
  const status = plantPending ? 'You have changes. Press Confirm the plant to use them.'
    : !plantChoice ? 'Not confirmed yet. The download waits for it.'
      : gap ? gap.need : 'Confirmed. Only the plant ticked here prints on the SWMS.';
  const ticks = listed.length
    ? listed.map((item) => `<label class="check"><input type="checkbox" data-plant-item="${esc(item.item)}"${plantTicked(item) ? ' checked' : ''}><span>${esc(item.item)}${item.maybe ? ' <span class="meta">SiteWrite is not sure this is used. Tick it only if it is.</span>' : ''}</span></label>`).join('')
    : '<p class="meta">SiteWrite found no plant in this task. Add the plant and equipment your crew uses, if any.</p>';
  const own = plantOwn().map((item, i) => (item.licence
    ? `<p class="plant-own"><strong>${esc(item.item)}</strong>: ${esc(item.licence)} <button type="button" class="link" data-plant-remove="${i}">Remove</button></p>`
    : `<div class="plant-own"><label for="plant-own-licence-${i}"><strong>${esc(item.item)}</strong>: licence or ticket to operate it <span class="hint">Write No if none is needed.</span></label><input id="plant-own-licence-${i}" type="text" maxlength="300" data-plant-own-licence="${i}"> <button type="button" class="link" data-plant-remove="${i}">Remove</button></div>`)).join('');
  return `<div class="panel answer-panel${done ? ' done' : ''}" id="plant-panel">
    <fieldset class="field" id="plant-ticks" tabindex="-1"><legend>Confirm the plant and equipment for this job</legend>
      <p class="meta">SiteWrite listed these from the task and the job steps. Tick what your crew will use, untick what it will not, and add anything missing. Only the plant you confirm prints on the SWMS. The job steps stay as they are: change them under Job steps if the method changes.</p>
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
    <p class="meta">A reviewer looks for how your crew responds to an emergency in this work, not only the heading. Answer each question for this site. The answers print in the emergency arrangements above. Not applicable is not an answer here: SiteWrite asks only about work this SWMS involves.</p>
    ${asked.map((item) => `<div class="field"><label for="emg-${esc(item.id)}">${esc(item.ask)}<span class="hint">${esc(item.hint)}</span></label>${emergencyPicks(item, answer(item))}<textarea id="emg-${esc(item.id)}" data-emergency="${esc(item.id)}" maxlength="600">${esc(answer(item))}</textarea></div>`).join('')}
    <div class="actions"><button type="button" id="emergency-update">Update the draft</button></div>
    <p class="done-note" id="emergency-done" role="status"${emergencyDone ? '' : ' hidden'}>Draft updated. Your answers are in the Emergency arrangements table above. <button type="button" class="link" data-emergency-show>Show me</button></p>
  </div>`;
}
// Standard answers for an emergency question, naming roles, not people (D259, emergency.js).
function emergencyPicks(item, given) {
  const picks = item.suggestions || [];
  if (!picks.length) return '';
  return `<div class="picks"><span class="picks-label">Standard answers:</span>${picks.map((pick, index) => `<button type="button" class="pick-button" data-emg-pick="${esc(item.id)}" data-pick="${index}" aria-pressed="${String(String(given || '').includes(pick.text))}">${esc(pick.label)}</button>`).join('')}</div>`;
}
// Set once Update the draft has drawn the answers into the table, until an answer changes (item 25).
let emergencyDone = false;

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

// The SWMS as the page shows it, with each load rating's mass after it (D263, public/mass.js), as the
// Word file and the PDF print it.
function render(draft, options = {}) {
  const html = renderSheet(draft, options);
  const mass = window.SiteWriteMass;
  return mass ? mass.withMassHtml(html) : html;
}
function renderSheet(draft, { movable = false, swmsId = '' } = {}) {
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
  // Answers missing or too thin to print: the SWMS is not finished. What each needs is said first, in
  // plain words with an accepted example, with a button to each question (answer-help.js).
  if (draft.kind === 'stand-down' && (draft.missingHelp || []).length) {
    const items = draft.missingHelp;
    return `<div class="panel gate not-finished" id="not-finished" role="region" aria-labelledby="not-finished-title">
      <h3 id="not-finished-title">This SWMS is not finished</h3>
      <p>SiteWrite cannot prepare it until ${items.length === 1 ? 'this answer says' : `these ${items.length} answers say`} enough to print. Fix ${items.length === 1 ? 'it' : 'each one'} in the questions above, then press Prepare the statement again.</p>
      <ul class="gate-list">${items.map((item) => `<li><button type="button" class="link" data-answer-go="${esc(item.id)}">${esc(item.label)}</button><span class="meta">${esc(item.state === 'vague' ? weakText(item) : `Not answered yet. ${item.help}`)}</span></li>`).join('')}</ul>
      <div class="actions"><button type="button" data-answer-go="first">Go to the first answer</button></div>
    </div>
    ${head}`;
  }
  if (draft.kind === 'stand-down') {
    // For want of job steps, the user can write their own (messy round 4, B fault 1).
    const noSteps = (draft.missing || []).some((item) => /^Job steps for this work:/.test(item));
    return `${head}
      <h4>Stood down</h4>
      <p>${esc(draft.statement)}</p>
      <p><strong>Missing</strong></p>
      <ul>${draft.missing.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
      ${noSteps && movable ? '<div class="actions"><button type="button" data-own-early-go>Write a step for this</button></div>' : ''}
      <p>No method is included.</p>`;
  }
  // The high risk construction work SiteWrite found prints as found. On the draft the user can add an
  // item from the regulation's list that applies, and take off only the ones they added (messy round 5:
  // SiteWrite's check asked for an item the page had no way to add).
  const ownRisk = new Map((draft.highRiskOwn || []).map((item) => [item.label, item.id]));
  // Where SiteWrite found each item is said beside it, so one from a site answer can be traced.
  const riskFrom = (item) => (movable && (draft.highRiskFrom || {})[item] ? ` <span class="meta">(from ${esc(draft.highRiskFrom[item])})</span>` : '');
  // An item SiteWrite found can be marked "Does not apply" with a short reason (D311). It then prints as
  // the user's call, and its permit, rescue row and the lines SiteWrite adds for it come off.
  const foundRisk = new Map((draft.highRiskFound || []).map((item) => [item.label, item.id]));
  const riskItem = (item) => (movable && ownRisk.has(item)
    ? `<li>${esc(item)} <span class="meta">(added by you)</span> <button type="button" class="link" data-hrcw-remove="${esc(ownRisk.get(item))}">Remove</button></li>`
    : `<li data-hrcw-item="${esc(foundRisk.get(item) || '')}">${esc(item)}${riskFrom(item)}${movable && foundRisk.has(item) ? ` <button type="button" class="link" data-hrcw-off="${esc(foundRisk.get(item))}">Does not apply</button>` : ''}</li>`);
  const notApply = draft.highRiskNotApply || [];
  const notApplyList = notApply.length
    ? `<ul class="hrcw-notapply">${notApply.map((item) => `<li>Does not apply (our call): ${esc(item.label)}. Reason: ${esc(String(item.reason).trim().replace(/[.\s]+$/, ''))}.${movable ? ` <button type="button" class="link" data-hrcw-back="${esc(item.id)}">Put back</button>` : ''}</li>`).join('')}</ul>` : '';
  const riskChoices = movable ? draft.highRiskChoices || [] : [];
  const risks = (draft.highRisk.length
    ? `<ul>${draft.highRisk.map(riskItem).join('')}</ul>`
    : notApply.length ? '' : '<p>This task is not identified as high risk construction work.</p>')
    + notApplyList
    + (movable && (notApply.length || foundRisk.size || hrcwOffNote) ? `<p class="meta" id="hrcw-off-note" role="status">${esc(hrcwOffNote)}</p>` : '')
    + (riskChoices.length ? `<div class="field hrcw-add" id="hrcw-add">
      <label for="hrcw-add-item">Add high risk construction work that applies<span class="hint">Choose from the list in the regulation. It prints on the SWMS, and SiteWrite adds its controls for it where it has them. Check the job steps cover it.</span></label>
      <select id="hrcw-add-item" class="plain"><option value="">Choose an item</option>${riskChoices.map((item) => `<option value="${esc(item.id)}">${esc(item.label)}</option>`).join('')}</select>
      <div class="actions"><button type="button" class="secondary small" id="hrcw-add-go">Add it to the SWMS</button></div>
      <p class="meta" id="hrcw-add-note" role="status">${esc(hrcwNote)}</p>
    </div>` : '');
  // A control with a blank (____) has a box in each blank for the user's answer (goal 2).
  const blankKeys = draft.blankKeys || { steps: [], controls: [] };
  const anchored = new Set();
  const lineText = (line, key) => (movable && key ? fillBox(line, key, draft.gate, anchored) : esc(line));
  const controls = `<table><thead><tr><th>Hierarchy</th><th>Control</th></tr></thead><tbody>${draft.controls.map((item, i) => `<tr><td>${esc(item.level)}</td><td>${lineText(item.text, blankKeys.controls[i])}</td></tr>`).join('')}</tbody></table>`;
  const site = draft.site.map((field) => `<p><strong>${esc(field.label)}</strong></p><div class="blank">${esc(field.text)}</div>`).join('');
  const list = (items) => `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`;
  // In the preview each control can be changed or removed, and the user can add their own.
  // Lines that are a legal requirement, or that SiteWrite recommends keeping, say why before the
  // user goes ahead. A removed or weakened line asks why, which the user can leave blank.
  const report = draft.controlEdits || {};
  const shared = (step) => sharedNote(step, draft.jobSteps || []);
  const controlCell = (step, index) => {
    if (!movable) return `<ul>${step.controls.map((line) => `<li${/^Hold point:/.test(line) ? ' class="design-hold-line"' : ''}>${esc(line)}</li>`).join('')}</ul>${shared(step) ? `<p class="ctl-shared">${esc(shared(step))}</p>` : ''}`;
    const legal = (draft.controlLegal || [])[index] || [];
    const warn = (draft.controlWarn || [])[index] || [];
    const removed = ((controlEdits || {})[step.step] || {}).removed || [];
    const warned = (report.warned || []).filter((item) => item.step === step.step);
    // A changed line SiteWrite warned about asks why, under the line itself; a removed line was asked
    // why when it was removed (D253).
    const asks = (report.applied || []).filter((item) => item.step === step.step && item.kind === 'changed' && warned.some((other) => other.text === item.from));
    const askFor = (line) => asks.filter((item) => `${item.to}${OWN_MARK}` === line).map((item) => whyBox(index, item)).join('');
    // On a phone, a long list shows its first lines; a line with a blank to fill in always shows.
    const folds = (i) => step.controls.length > MANY_CONTROLS && i >= FEW_CONTROLS && !(blankKeys.steps[index] || [])[i];
    const hidden = step.controls.filter((_line, i) => folds(i)).length;
    // A design's reference or hold point is changed under Designs this work relies on, not here.
    const fromDesign = new Set(step.designLines || []);
    const designItem = (line, i) => `<li data-ctl-step="${index}" data-ctl-line="${i}" class="design-line${/^Hold point:/.test(line) ? ' design-hold-line' : ''}">${esc(line)}<span class="meta"> From the designs this work relies on. Change it there.</span></li>`;
    // The step's PPE line (D246) is changed under Personal protective equipment, as design lines are under Designs.
    const fromPpe = new Set(step.ppeLines || []);
    const ppeItem = (line, i) => `<li data-ctl-step="${index}" data-ctl-line="${i}" class="ppe-line">${esc(line)}<span class="meta"> PPE for this step. Change it under Personal protective equipment.</span></li>`;
    // A control for a hazard the user added (D254) is changed under that hazard, below the step.
    const fromHazard = new Set(step.hazardLines || []);
    const hazardItem = (line, i) => `<li data-ctl-step="${index}" data-ctl-line="${i}" class="hazard-line">${esc(line)}<span class="meta"> For your own hazard. Change it under the hazard, below this step.</span></li>`;
    // A hazardous product's line (D257) is changed under Hazardous substances, from its safety data sheet.
    const fromSubstance = new Set(step.substanceLines || []);
    const substanceItem = (line, i) => `<li data-ctl-step="${index}" data-ctl-line="${i}" class="substance-line">${esc(line)}<span class="meta"> From the product's safety data sheet. Change it under Hazardous substances.</span></li>`;
    return `<ul>${step.controls.map((line, i) => (fromDesign.has(line) ? designItem(line, i) : fromPpe.has(line) ? ppeItem(line, i) : fromHazard.has(line) ? hazardItem(line, i) : fromSubstance.has(line) ? substanceItem(line, i) : `<li data-ctl-step="${index}" data-ctl-line="${i}"${folds(i) ? ' class="ctl-more"' : ''}${legal[i] ? ` data-legal="${esc(legal[i])}"` : ''}${warn[i] ? ` data-warn="${esc(warn[i])}"` : ''}>${lineText(line, (blankKeys.steps[index] || [])[i])}<span class="ctl-tools"><button type="button" class="link" data-ctl="change">Change</button><button type="button" class="link" data-ctl="remove">Remove</button></span>${askFor(line)}</li>`)).join('')}${removed.map((line, r) => `<li class="ctl-removed" data-ctl-step="${index}" data-removed-line="${r}"><s>${esc(line)}</s><span class="ctl-tools"><button type="button" class="link" data-ctl="restore" data-removed="${r}">Put back</button></span></li>`).join('')}</ul>
      ${shared(step) ? `<p class="ctl-shared">${esc(shared(step))}</p>` : ''}
      ${warned.map((item) => `<p class="warning ctl-warn">${esc(`${item.kind === 'removed' ? 'Removed' : item.kind === 'changed' ? 'Changed' : 'Added'}: ${item.kind === 'added' ? item.to : item.text}. ${item.warnings.join(' ')}`)}</p>`).join('')}
      ${hidden ? `<button type="button" class="secondary ctl-show" data-ctl-more="${index}">Show all ${step.controls.length} controls</button>` : ''}
      <button type="button" class="link" data-ctl="add" data-ctl-step="${index}">Add your own control</button><p class="meta ctl-msg" data-ctl-msg="${index}" role="status"></p>`;
  };
  // Hazards can be reworded and added; SiteWrite's own are marked "does not apply", never deleted.
  // Hazard and control lines both have Change and Remove (D253). SiteWrite's own hazard, removed,
  // stays on the SWMS marked "Does not apply to this job", so a reviewer sees it was considered.
  const hazardCell = (step, index) => {
    if (!movable) return list(step.hazards);
    return `<ul>${step.hazards.map((line, i) => {
      const own = line.endsWith(HAZARD_MARK);
      const off = line.endsWith(NOT_APPLICABLE);
      if (off) return `<li data-hz-step="${index}" data-hz-line="${i}" class="ctl-removed"><s>${esc(hazardText(line))}</s><span class="meta"> Removed. It prints marked "Does not apply to this job".</span><span class="ctl-tools"><button type="button" class="link" data-hz="applies">Put back</button></span></li>`;
      const mine = own && (draft.ownHazards || []).findIndex((item) => item.stepIndex === index && `${item.hazard} ${HAZARD_MARK}` === line);
      const note = own && mine >= 0 ? `<span class="meta"> Its controls and rating are <a href="#own-hazard-${mine + 1}" data-oh-jump="${mine + 1}">below this step</a>.</span>` : '';
      return `<li data-hz-step="${index}" data-hz-line="${i}">${esc(line)}<span class="ctl-tools"><button type="button" class="link" data-hz="change">Change</button><button type="button" class="link" data-hz="remove">Remove</button></span>${note}</li>`;
    }).join('')}</ul>
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
  // One line each on screen (D260): "Before: Moderate (Likely x Moderate)".
  const riskCell = (risk) => (risk ? `<span class="risk-line">Before: <strong>${esc(risk.before.level)}</strong> (${esc(risk.before.label)})</span><span class="risk-line">After: <strong>${esc(risk.after.level)}</strong> (${esc(risk.after.label)})</span>${risk.response ? `<span class="risk-response">${esc(risk.response)}</span>` : ''}` : '');
  // A step still High after its controls has a way out on the page (messy round 5, run 4): the
  // supervisor rates it again after the controls, or the step is taken off the SWMS. Before starting
  // and Finish and clean up stay on every SWMS.
  const fixedStep = (step) => ['Before starting', 'Finish and clean up'].includes(step.step);
  // On its own line under the arrows.
  const removeButton = (step, index) => (fixedStep(step) ? '' : `<span class="step-remove-row" style="display:block;margin-top:6px"><button type="button" class="link step-remove" data-step-remove="${index}">Remove this step</button></span>`);
  const rateTools = (step, index) => {
    if (!movable || !step.risk) return '';
    const mine = (stepRatings || {})[step.step];
    if (!ratingOpen.has(step.step)) return `<span class="rate-tools"><button type="button" class="link" data-rate-open="${index}">Change the rating</button></span>`;
    const value = mine || step.risk.after;
    const select = (part, list, label) => `<label class="rate-pick">${label} <select data-rate-part="${part}">${list.map(([n, text]) => `<option value="${n}"${n === Number(value[part]) ? ' selected' : ''}>${text}</option>`).join('')}</select></label>`;
    return `<div class="rate-form" data-rate-step="${index}"><p class="meta">Rate it after the controls, as it is on this site. It prints as your rating.</p>${select('likelihood', LIKELIHOODS, 'How likely')}${select('consequence', CONSEQUENCES, 'How bad')}<div class="actions"><button type="button" class="small" data-rate-save="${index}">Save the rating</button>${mine ? `<button type="button" class="small secondary" data-rate-reset="${index}">Use SiteWrite's rating</button>` : ''}<button type="button" class="small secondary" data-rate-cancel="${index}">Cancel</button></div></div>`;
  };
  const libraryRow = (step, index, all) => `<tr${movable ? ` draggable="true" data-step-row="${index}"${stepRowClass(step)}` : ''}><td data-label="Job step"><strong>${index + 1}. ${esc(step.step)}</strong>${movable ? `<button type="button" class="secondary step-edit" data-step-edit="${index}" aria-expanded="${stepsEditing.has(step.step)}">${stepsEditing.has(step.step) ? 'Done changing this step' : 'Change this step'}</button><span class="step-move"><button type="button" data-move="-1" data-index="${index}" aria-label="Move ${esc(step.step)} up"${index === 0 ? ' disabled' : ''}>&#9650;</button><button type="button" data-move="1" data-index="${index}" aria-label="Move ${esc(step.step)} down"${index === all.length - 1 ? ' disabled' : ''}>&#9660;</button></span>${removeButton(step, index)}` : ''}</td><td data-label="Hazards and risks">${hazardCell(step, index)}</td><td data-label="Controls">${controlCell(step, index)}</td><td data-label="Risk rating">${riskCell(step.risk)}${rateTools(step, index)}</td><td data-label="Who">${whoCell(step, index)}</td></tr>`;
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
      ${notes.map((note) => `<p class="warning ctl-warn">${esc(note)}</p>`).join('')}</td><td data-label="Hazards and risks">${list(step.hazards)}</td><td data-label="Controls">${list(step.controls)}</td><td data-label="Risk rating">${riskCell(step.risk)}${rateTools(step, index)}</td><td data-label="Who">${esc(step.responsible || '')}</td></tr>`;
  };
  const ownHazardRows = (index) => (draft.ownHazards || []).map((item, n) => (item.stepIndex === index ? ownHazardRow(item, n) : '')).join('');
  // Steps the user took off, each with Put back.
  const shownNames = new Set((draft.jobSteps || []).map((step) => step.step));
  const offSteps = movable ? (leaveOut || []).filter((name) => !shownNames.has(name)) : [];
  const removedSteps = offSteps.length ? `<p class="meta steps-removed">Steps you took off: ${offSteps.map((name) => `${esc(name)} <button type="button" class="link" data-step-back="${esc(name)}">Put back</button>`).join('; ')}</p>` : '';
  const steps = `${removedSteps}<table class="stack steps-table"><thead><tr><th>Job step</th><th>Hazards and risks</th><th>Controls</th><th>Risk rating</th><th>Who</th></tr></thead><tbody>${(draft.jobSteps || []).map((step, index, all) => (movable && step.own ? ownRow(step, index, all) : `${libraryRow(step, index, all)}${movable ? ownHazardRows(index) : ''}`)).join('')}</tbody></table>
    <p class="meta">Suggested ratings, before and after the controls. The supervisor checks them and changes them to suit the site. Where a rating after the controls is still High, add controls or have the supervisor accept the risk before work starts.</p>`;
  const grid = (labels, rows) => `<table class="stack"><thead><tr>${labels.map((label) => `<th>${esc(label)}</th>`).join('')}</tr></thead><tbody>${rows.map((cells) => `<tr>${cells.map((value, index) => `<td data-label="${esc(labels[index] || '')}">${esc(value).replace(/\n/g, '<br>')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const plantTable = (draft.plant || []).length ? grid(['Item', 'Inspection and maintenance', 'Licence or ticket to operate'], draft.plant.map((item) => [item.item, item.inspection, item.licence])) : '';
  const registers = `${plantTable || movable ? `<h4>Plant and equipment</h4>${movable ? plantBlock(draft) : ''}${plantTable || '<p class="meta">No plant prints on this SWMS.</p>'}` : ''}
    ${window.SiteWriteSubstances ? window.SiteWriteSubstances.section(draft, { movable }) : ''}
    ${(draft.qualifications || []).length ? `<h4>Licences, tickets and training</h4>${list(draft.qualifications)}` : ''}
    ${(draft.emergency || []).length ? `<h4 id="emergency-table" tabindex="-1">Emergency arrangements</h4>${grid(['Emergency', 'Equipment and arrangements', 'Location, contact or detail'], draft.emergency.map((item) => [item.type, item.equipment, item.detail]))}${movable ? emergencyBlock(draft) : ''}` : ''}
    ${draft.sources && (draft.sources.legislation.length || draft.sources.codes.length) ? folded('Legislation and codes of practice', grid(['Legislation', 'Codes of practice and guidance'], [[draft.sources.legislation.join('\n'), draft.sources.codes.join('\n')]]), `${draft.sources.legislation.length + draft.sources.codes.length} listed`) : ''}`;
  // PPE for all work, then the extra items for particular steps with their steps (D246).
  const forSteps = (draft.ppe || []).flatMap((group) => group.items.filter((item) => item.ticked && Array.isArray(item.steps) && item.steps.length));
  const ppe = `${forSteps.length ? '<p class="ppe-sub"><strong>For all work</strong></p>' : ''}<table><tbody>${(draft.ppe || []).map((group) => `<tr><th>${esc(group.area)}</th><td>${group.items.filter((item) => !(item.ticked && Array.isArray(item.steps))).map((item) => `${item.ticked ? '&#9745;' : '&#9744;'} ${esc(item.label)}`).join(' &nbsp; ')}${group.items.some((item) => item.ticked && Array.isArray(item.steps)) ? ` <em class="meta">For particular steps (below): ${esc(group.items.filter((item) => item.ticked && Array.isArray(item.steps)).map((item) => item.label).join(', '))}</em>` : ''}</td></tr>`).join('')}</tbody></table>`
    + (forSteps.length ? `<p class="ppe-sub"><strong>For particular steps</strong> <span class="meta">Worn as well as the PPE for all work, in the steps listed. Each step says so.</span></p><table><tbody>${forSteps.map((item) => `<tr><th>&#9745; ${esc(item.label)}</th><td>${esc(item.steps.join('; '))}</td></tr>`).join('')}</tbody></table>` : '');
  const people = `<table><tbody>
      ${row('Works manager', draft.worksManager) || '<tr><th>Works manager</th><td></td></tr>'}
      ${row('Contact phone', draft.worksManagerPhone) || '<tr><th>Contact phone</th><td></td></tr>'}
      ${row('Person responsible for ensuring compliance', draft.complianceResponsible) || '<tr><th>Person responsible for ensuring compliance</th><td></td></tr>'}
      ${row('Person responsible for reviewing the controls', draft.reviewer) || '<tr><th>Person responsible for reviewing the controls</th><td></td></tr>'}
      ${row('Review date', draft.reviewDate) || '<tr><th>Review date</th><td></td></tr>'}
    </tbody></table>`;
  return `${head}
    <h4>Responsibilities</h4>${people}
    <h4${movable ? ' id="hrcw-head" tabindex="-1"' : ''}>High risk construction work</h4>${risks}
    ${designsTable(draft, swmsId)}
    <h4>Controls</h4>${controls}
    <h4${movable ? ' id="steps-head" tabindex="-1"' : ''}>Job steps</h4>${movable ? '<p class="meta">Use the arrows, or drag a row, to put the job steps in the order the work is done. Every control and hazard is kept unless you change or remove it. Lines you write or change are marked as your own. A hazard of SiteWrite&#39;s that you remove still prints, marked &quot;Does not apply to this job&quot;. SiteWrite warns you before you remove or weaken a legal requirement or a line it recommends keeping, and you can say why. A hazard you add needs at least one control.<span class="phone-only"> On a phone, tap Change this step to move a step or change its lines.</span></p>' : ''}${steps}
    ${movable ? '<p class="own-new"><button type="button" class="secondary small" data-own-new>Write a step of your own</button> <span class="meta">For work SiteWrite has no job step for. It prints marked as your own.</span></p>' : ''}
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
  const hospital = document.getElementById('hospital');
  hospital.value = button.dataset.care;
  document.getElementById('hospital-list').classList.add('hidden');
  // The hospital is needed before download (D292): the list before download, and the project page's
  // list of details still to give, follow it at once.
  hospital.dispatchEvent(new Event('input', { bubbles: true }));
  hospital.dispatchEvent(new Event('change', { bubbles: true }));
});

// Each box remembers what was typed in the last few SWMS on this device, and offers it
// again. Nothing leaves the device. Storage can be off (private browsing): then nothing is kept.
const MEMORY_KEY = 'sitewrite.fieldMemory';
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
// Each part SiteWrite has no job steps for is dealt with on its own line (messy-user testing, 13 October
// 2026: one tick "or it is covered in a separate SWMS" was the easy way out). Saving your own step for a
// part clears it by itself. Otherwise the user says which SWMS covers it: one of the project's other
// SWMS, or one they name. Work that is all the task's work (D211) needs the user's own step.
let coverElsewhere = {};
// The job step of this SWMS that covers a part, by its name (messy round 6: the only answers were a step
// of your own or another SWMS, so work a ticked step already covered was written again).
let coverInStep = {};
const coverTyping = new Set();
const COVER_TYPED = '__typed';
const namedElsewhere = (part) => String((coverElsewhere || {})[part] || '').replace(/\s+/g, ' ').trim();
const coverNamed = (part) => namedElsewhere(part).length >= 3;
// The other SWMS in the project, by title, to choose from (scope.js).
const otherSwms = () => {
  const S = window.SiteWrite || {};
  return S.projectOthers ? S.projectOthers().filter(Boolean) : [];
};
// The parts named as covered elsewhere count as dealt with, as the tick did (notCoveredConfirmed).
function syncCoverTicked() {
  const named = Object.keys(coverElsewhere || {}).filter(coverNamed);
  coverTicked = named.length ? JSON.stringify(named) : null;
  const confirmed = coverTicked ? JSON.parse(coverTicked) : undefined;
  const S = window.SiteWrite || {};
  if (S.actionInput) S.actionInput = { ...S.actionInput, notCoveredConfirmed: confirmed, notCoveredElsewhere: coverElsewhereSent() };
  if (S.onCoverTick) S.onCoverTick(confirmed, coverElsewhereSent());
}
// The work moved into another SWMS of the project (D289): named as covered in one of the project's
// other SWMS, or moved when this SWMS was saved and not changed since (opened again from My SWMS).
let coverMovedKept = new Set();
function coverMovedSent() {
  const others = otherSwms();
  const moved = Object.keys(coverElsewhere || {}).filter((part) => coverNamed(part) && (others.includes(namedElsewhere(part)) || coverMovedKept.has(part)));
  return moved.length ? moved : undefined;
}
function coverElsewhereSent() {
  const named = Object.entries(coverElsewhere || {}).filter(([part]) => coverNamed(part)).map(([part]) => [part, namedElsewhere(part)]);
  return named.length ? Object.fromEntries(named) : undefined;
}
function coverWhere(part, index) {
  const others = otherSwms();
  const named = namedElsewhere(part);
  const listed = Boolean(named) && others.includes(named);
  const typing = !others.length || coverTyping.has(part) || (named && !listed);
  const box = typing ? `<input type="text" id="cover-name-${index}" data-cover-name="${index}" maxlength="200" autocomplete="off" placeholder="Name of the SWMS that covers it" value="${esc(listed ? '' : named)}"${others.length ? '' : ` aria-labelledby="cover-where-label-${index}"`}>` : '';
  const pick = others.length
    ? `<select id="cover-where-${index}" data-cover-where="${index}" class="plain"><option value="">Not covered in another SWMS</option>${others.map((title) => `<option value="${esc(title)}"${listed && named === title ? ' selected' : ''}>${esc(title)}</option>`).join('')}<option value="${COVER_TYPED}"${typing ? ' selected' : ''}>Another SWMS: I will type its name</option></select>`
    : '';
  // In a project, the work moves into the SWMS named, which must then give its steps (D289).
  const done = !coverNamed(part) ? '' : listed ? `<span class="cover-done">Moved to: ${esc(named)}. Write its steps in that SWMS: it now lists this work as needing your own step.</span>` : `<span class="cover-done">Covered in: ${esc(named)}</span>`;
  return `<div class="cover-where"><label id="cover-where-label-${index}" for="${others.length ? `cover-where-${index}` : `cover-name-${index}`}">Or, if another SWMS covers it, say which one</label>${pick}${box}${done}</div>`;
}
// The work moved into this SWMS from another of the project (D289), by part.
const movedHere = () => {
  const S = window.SiteWrite || {};
  return new Map(((S.projectMovedIn && S.projectMovedIn()) || []).map((item) => [sameWords(item.part), item.from]));
};
// The step of this SWMS named as covering a part, while that step is in the draft: { step, number }.
function stepCovering(data, part) {
  const named = coverInStep[part];
  const covered = (data.notCoveredInStep || []).find((item) => item.part === part);
  const step = named || (covered && covered.step);
  if (!step) return null;
  const at = (data.jobSteps || []).findIndex((other) => other.step === step && !other.own);
  return at < 0 ? null : { step, number: at + 1 };
}
// "A step in this SWMS covers it": the SWMS's own job steps to choose from, by number and name.
function coverStep(data, part, index) {
  const steps = (data.jobSteps || []).map((step, at) => ({ step: step.step, number: at + 1, own: step.own })).filter((item) => !item.own && !['Before starting', 'Finish and clean up'].includes(item.step));
  if (!steps.length) return '';
  return `<div class="cover-where cover-step"><label for="cover-step-${index}">A step in this SWMS covers it</label><select id="cover-step-${index}" data-cover-step="${index}" class="plain"><option value="">Choose the step that covers it</option>${steps.map((item) => `<option value="${esc(item.step)}">Step ${item.number}: ${esc(item.step)}</option>`).join('')}</select></div>`;
}
function notCoveredBlock(data) {
  const parts = coverParts(data);
  if (!parts.length) return '';
  const written = new Set(Array.isArray(data.notCoveredWritten) ? data.notCoveredWritten : []);
  const main = new Set(Array.isArray(data.notCoveredMain) ? data.notCoveredMain : []);
  const moved = movedHere();
  // Only the work still to deal with is named at the top: a part with your own step, or named as
  // covered elsewhere, comes off (messy round 3: the banner kept listing items already dealt with).
  const left = parts.filter((part) => !(ownFor(part) && written.has(part)) && !stepCovering(data, part) && (main.has(part) || !coverNamed(part)));
  const one = left.length === 1;
  const others = otherSwms();
  const rows = parts.map((part, index) => {
    const mine = ownFor(part);
    const from = moved.get(sameWords(part));
    // Work moved in can be sent back to the SWMS it came from, which undoes the move: it is never
    // passed on again (messy round 4, A fault 4: work went back and forth between SWMS).
    const fromNote = from ? `<span class="meta"> Moved here from ${esc(from)}, which you said this SWMS covers. <button type="button" class="link" data-cover-return="${index}">Not covered here: send it back to ${esc(from.replace(/ \(.*$/, ''))}</button></span>` : '';
    if (mine && written.has(part)) return `<li data-cover-part="${index}"><strong>${esc(part)}</strong>${fromNote}<span class="cover-tools"><span class="cover-done">Done: your step "${esc(mine.name)}" is in the job steps below.</span> <button type="button" class="link" data-own-change="${esc(mine.name)}">Change your step</button></span></li>`;
    // Work moved to another SWMS of the project is written there, not here: no "Write a step for this"
    // (messy round 4: a step was written under a moved item by mistake). It can be moved back.
    const movedTo = !main.has(part) && coverNamed(part) && others.includes(namedElsewhere(part)) ? namedElsewhere(part) : '';
    if (movedTo) return `<li data-cover-part="${index}"><strong>${esc(part)}</strong><span class="cover-tools"><span class="cover-done">Moved to: ${esc(movedTo)}. Its steps are written in that SWMS.</span> <button type="button" class="link" data-cover-back="${index}">Move it back here</button></span></li>`;
    const inStep = stepCovering(data, part);
    if (inStep) return `<li data-cover-part="${index}"><strong>${esc(part)}</strong><span class="cover-tools"><span class="cover-done">Covered by step ${inStep.number}: ${esc(inStep.step)}.</span> <button type="button" class="link" data-cover-step-undo="${index}">Not covered by that step</button></span></li>`;
    const write = `<button type="button" class="small" data-own-write="${index}">${mine ? 'Finish your step for this' : 'Write a step for this'}</button>`;
    return `<li data-cover-part="${index}"><strong>${esc(part)}</strong>${fromNote}<span class="cover-tools">${write}</span>${main.has(part) ? '' : `${coverStep(data, part, index)}${coverWhere(part, index)}`}</li>`;
  }).join('');
  const unwritten = coverUnwritten(data);
  const movedWork = unwritten.filter((part) => moved.has(sameWords(part)));
  const ownWork = unwritten.filter((part) => !moved.has(sameWords(part)));
  if (!left.length) {
    return `<div class="note not-covered"><p>Each piece of work SiteWrite has no job steps for is dealt with.</p><ul class="cover-parts">${rows}</ul></div>`;
  }
  const mainOnly = left.every((part) => main.has(part));
  return `<div class="warning not-covered"><p>SiteWrite has no job steps for: ${esc(left.join('; '))}. ${mainOnly ? (one ? 'Add your own step and controls for it.' : 'Add your own steps and controls for each.') : one ? 'Write your own step for it, say which step in this SWMS covers it, or say which SWMS covers it.' : 'For each one, write your own step, say which step in this SWMS covers it, or say which SWMS covers it.'}</p>
    <p>You must enter the specific steps for this work yourself: SiteWrite cannot write them for you. Saving your step deals with it.</p>
    ${ownWork.length ? `<p>${esc(ownWork.length === 1 ? `"${ownWork[0]}" is` : `${ownWork.map((part) => `"${part}"`).join(' and ')} are`)} the work of this task, so the SWMS needs your own step for ${ownWork.length === 1 ? 'it' : 'each'} before you save or download. Another SWMS does not cover it.</p>` : ''}
    ${movedWork.length ? `<p>${esc(movedWork.length === 1 ? `"${movedWork[0]}" was` : `${movedWork.map((part) => `"${part}"`).join(' and ')} were`)} moved here from another SWMS of this project, which you said this one covers. Write its steps here before you save or download.</p>` : ''}
    <ul class="cover-parts">${rows}</ul></div>`;
}
function redrawCover(focusId) {
  const block = resultEl.querySelector('.not-covered');
  if (!block || !shownDraft) return;
  block.outerHTML = notCoveredBlock(shownDraft);
  const back = focusId && document.getElementById(focusId);
  if (back) back.focus();
}
// "Move it back here" undoes a move, and "send it back" undoes a move made from another SWMS of the
// project (D289): the work returns to the SWMS it came from, with any step written for it.
document.addEventListener('click', async (event) => {
  const back = event.target.closest && event.target.closest('[data-cover-back]');
  const ret = event.target.closest && event.target.closest('[data-cover-return]');
  if ((!back && !ret) || !shownDraft) return;
  const part = coverParts(shownDraft)[Number((back || ret).dataset.coverBack || (back || ret).dataset.coverReturn)];
  if (!part) return;
  const S = window.SiteWrite || {};
  if (back) {
    const was = namedElsewhere(part);
    coverElsewhere = { ...(coverElsewhere || {}) };
    delete coverElsewhere[part];
    coverMovedKept.delete(part);
    carryOwnStep(part, was, '');
    syncCoverTicked();
  } else if (S.projectSendBack) {
    const mine = ownFor(part);
    if (!S.projectSendBack(part, mine || null)) return;
    if (mine) { ownSteps = (ownSteps || []).filter((item) => item !== mine); if (!ownSteps.length) ownSteps = null; }
  }
  keepUnsaved();
  await prepareDraft({ scroll: false, keep: '.not-covered' });
  const block = resultEl.querySelector('.not-covered');
  if (block) block.insertAdjacentHTML('afterbegin', `<p class="meta" role="status">${esc(back ? `"${part}" is back in this SWMS. Write its step here, or say which SWMS covers it.` : `"${part}" is sent back to the SWMS it came from, and comes off this SWMS.`)}</p>`);
});

// "Go to the box", beside the buttons that wait for it: the first part still to deal with.
document.addEventListener('click', (event) => {
  if (!event.target.closest('[data-cover-jump]')) return;
  const box = document.querySelector('.not-covered [data-own-write]') || document.querySelector('.not-covered [data-cover-where], .not-covered [data-cover-name]');
  if (!box) return;
  box.closest('.not-covered').scrollIntoView({ behavior: 'smooth', block: 'center' });
  box.focus({ preventScroll: true });
});
// A step written here for work then moved to another SWMS of the project goes with it, and comes back
// with it, so one piece of work is never written twice (messy round 4, A fault 4).
function carryOwnStep(part, from, to) {
  const S = window.SiteWrite || {};
  if (from && otherSwms().includes(from) && !ownFor(part) && S.projectTakeStep) {
    const back = S.projectTakeStep(from, part);
    if (back) ownSteps = [...(ownSteps || []), back];
  }
  if (to && otherSwms().includes(to)) {
    const mine = ownFor(part);
    if (mine && S.projectGiveStep && S.projectGiveStep(to, mine)) {
      ownSteps = (ownSteps || []).filter((item) => item !== mine);
      if (!ownSteps.length) ownSteps = null;
    }
  }
}
document.addEventListener('change', (event) => {
  const pick = event.target.closest && event.target.closest('[data-cover-where]');
  if (!pick || !shownDraft) return;
  const part = coverParts(shownDraft)[Number(pick.dataset.coverWhere)];
  if (!part) return;
  const movedBefore = JSON.stringify(coverMovedSent() || []);
  const was = namedElsewhere(part);
  coverElsewhere = { ...(coverElsewhere || {}) };
  coverMovedKept.delete(part);
  if (pick.value === COVER_TYPED) {
    coverTyping.add(part);
    if (otherSwms().includes(namedElsewhere(part))) delete coverElsewhere[part];
  } else {
    coverTyping.delete(part);
    if (pick.value) coverElsewhere[part] = pick.value; else delete coverElsewhere[part];
  }
  carryOwnStep(part, was !== namedElsewhere(part) ? was : '', namedElsewhere(part) !== was ? namedElsewhere(part) : '');
  syncCoverTicked();
  redrawCover(pick.value === COVER_TYPED ? `cover-name-${pick.dataset.coverWhere}` : pick.id);
  showGate();
  keepUnsaved();
  // Work moved into another SWMS of the project, or moved back, changes this SWMS's Task line (D291):
  // the draft is prepared again where it is on the screen, so it shows as it will print.
  if (JSON.stringify(coverMovedSent() || []) !== movedBefore) {
    prepareDraft({ scroll: false, keep: '.not-covered' }).then(() => {
      const back = document.getElementById(pick.id);
      if (back) back.focus({ preventScroll: true });
    });
  }
});
// The step named as covering a part, or taken back: the draft is prepared again, so the list and the
// download check agree with it.
document.addEventListener('change', (event) => {
  const pick = event.target.closest && event.target.closest('[data-cover-step]');
  if (!pick || !shownDraft || !pick.value) return;
  const part = coverParts(shownDraft)[Number(pick.dataset.coverStep)];
  if (!part) return;
  coverInStep = { ...coverInStep, [part]: pick.value };
  keepUnsaved();
  prepareDraft({ scroll: false, keep: '.not-covered' }).then(() => {
    const block = resultEl.querySelector('.not-covered');
    if (block) block.insertAdjacentHTML('afterbegin', `<p class="meta" role="status">${esc(`Dealt with: the step "${pick.value}" covers "${part}".`)}</p>`);
  });
});
document.addEventListener('click', (event) => {
  const undo = event.target.closest && event.target.closest('[data-cover-step-undo]');
  if (!undo || !shownDraft) return;
  const part = coverParts(shownDraft)[Number(undo.dataset.coverStepUndo)];
  if (!part) return;
  coverInStep = { ...coverInStep };
  delete coverInStep[part];
  keepUnsaved();
  prepareDraft({ scroll: false, keep: '.not-covered' }).then(() => {
    const box = document.getElementById(`cover-step-${undo.dataset.coverStepUndo}`);
    if (box) box.focus({ preventScroll: true });
  });
});
document.addEventListener('input', (event) => {
  const box = event.target.closest && event.target.closest('[data-cover-name]');
  if (!box || !shownDraft) return;
  const part = coverParts(shownDraft)[Number(box.dataset.coverName)];
  if (!part) return;
  coverElsewhere = { ...(coverElsewhere || {}), [part]: box.value };
  coverMovedKept.delete(part);
  if (!box.value.trim()) delete coverElsewhere[part];
  syncCoverTicked();
  showGate();
});
// A part of the draft kept where it was on the screen while the draft is drawn again, so a button
// pressed in a job step does not jump the page (owner feedback item 19). keep: a selector in the draft.
function screenSpot(keep) {
  const el = keep && resultEl.querySelector(keep);
  return el ? { keep, top: el.getBoundingClientRect().top } : null;
}
function backToSpot(spot) {
  const el = spot && resultEl.querySelector(spot.keep);
  if (!el) return;
  const moved = el.getBoundingClientRect().top - spot.top;
  if (Math.abs(moved) >= 1) window.scrollTo(0, window.scrollY + moved);
}
// The principal contractor's conditions or changes, above the draft while it is fixed (messy round 4,
// A fault 11: they were not on screen while fixing), each numbered one on its own line.
function fixingHtml() {
  const S = window.SiteWrite || {};
  const review = S.editing && S.editing.review;
  if (!review || !review.text) return '';
  const text = S.conditionLines ? S.conditionLines(review.text) : review.text;
  return `<div class="pc-review pc-back" id="fix-review-top" role="region" aria-label="The principal contractor's review"><p><strong>Fixing for the principal contractor's review:</strong> ${esc(review.label)}, ${esc(review.name)}, ${esc(review.company)}, ${esc(review.date)}.</p><div class="pc-text"><strong>${review.response === 'changes' ? 'Changes needed' : 'Conditions'}:</strong>\n${esc(text)}</div><p class="meta">Make the changes in the draft below, then save it as a new revision at the bottom and send the principal contractor its new reference.</p></div>`;
}
// What the page is doing with the draft, said under the button pressed on the draft ("Update the draft",
// "Confirm the plant"), where the person is looking (messy round 6, run 2: a 502 on Update the draft said
// nothing there, and the draft was not updated). The draft and the answers stay as they are.
let lastPressed = null;
document.addEventListener('click', (event) => {
  const button = event.target.closest && event.target.closest('button');
  lastPressed = button ? { button, at: Date.now() } : null;
}, true);
let lastOrigin = null;
function pressedOnDraft() {
  const button = lastPressed && Date.now() - lastPressed.at < 3000 ? lastPressed.button : null;
  // Try again beside the note goes back to the button the note was for.
  if (button && button.matches && button.matches('[data-retry-prepare]') && button.closest('[data-draft-note]')) return lastOrigin && lastOrigin.isConnected ? lastOrigin : null;
  lastOrigin = button && button.isConnected && resultEl.contains(button) ? button : null;
  return lastOrigin;
}
function draftNote(origin, text, failed = false) {
  document.querySelectorAll('[data-draft-note]').forEach((el) => el.remove());
  if (!text || !origin || !origin.isConnected) return;
  const tag = origin.closest('.actions') || origin;
  tag.insertAdjacentHTML('afterend', `<p class="${failed ? 'error' : 'meta'}" role="${failed ? 'alert' : 'status'}" data-draft-note>${esc(text)}${failed ? ' <button type="button" class="link" data-retry-prepare>Try again</button>' : ''}</p>`);
}
const DRAFT_DOWN = 'SiteWrite could not reach the server, so the draft was not updated. Your answers and the draft are kept as they were.';
async function prepareDraft({ scroll = true, keep = '' } = {}) {
  const spot = screenSpot(keep);
  const origin = pressedOnDraft();
  draftNote(origin, origin ? 'Updating the draft.' : '');
  // Plant ticks or removals not yet confirmed are used, so "Update the draft" does not undo them.
  if (plantPending && document.getElementById('plant-panel')) {
    const ticks = plantTicksNow();
    plantChoice = confirmedPlant(ticks, plantOwn().map((item) => ({ ...item, licence: String(item.licence || '').trim() })));
    plantPending = null;
  }
  const button = document.getElementById('prepare');
  button.disabled = true;
  document.getElementById('facts-error').textContent = '';
  try {
    // Questions an answer just brought in are on the page before the draft is asked for.
    if (askTimer) await askAgain();
    else if (asking) await asking;
    const body = JSON.stringify(payload());
    const { response, data } = await postJson('/api/draft', body, { onRetry: () => draftNote(origin, 'The server did not answer straight away. Trying again.') });
    if (!response.ok) throw new Error(data.message || 'The statement could not be prepared.');
    draftNote(null, '');
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
    resultEl.innerHTML = `${fixingHtml()}${warnings}<div id="result-gate-top"></div><div id="result-translate"></div><div class="sheet">${render(data, { movable: true })}</div><div id="result-gate"></div><div id="result-actions"></div>`;
    // The note under the high risk work box is said once, by the draft drawn after the change.
    hrcwNote = '';
    hrcwOffNote = '';
    resultEl.classList.remove('hidden');
    // A stood down draft names the facts still needed; each is asked for on the page, with what it
    // needs said under its box.
    missingNotes = new Map(data.kind === 'stand-down' ? (data.missingHelp || []).map((item) => [item.id, item.state === 'vague' ? weakText(item) : `Still needed. ${item.help}`]) : []);
    if (data.kind === 'stand-down') askAgain(); else showAnswerNotes();
    // What is saved: the input sent, with changes moved onto any line SiteWrite has reworded.
    const sent = { ...JSON.parse(body), controlEdits: controlEdits || undefined, hazardEdits: hazardEdits || undefined };
    shownSent = sent;
    showGate();
    // Downloading and saving need an account; the account script adds those buttons.
    window.SiteWrite.showActions(data, sent);
    backToSpot(spot);
    // The translation box above the draft can arrive a moment later: the part kept stays where it was.
    if (data.kind === 'draft') Promise.resolve(showTranslate(sent)).then(() => backToSpot(spot), () => {});
    // A SWMS in a project is recorded against its task.
    if (window.SiteWrite.onDraft) window.SiteWrite.onDraft(data, sent);
    keepUnsaved();
    backToSpot(spot);
    if (scroll && !spot) resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (scroll) markStage('draft');
  } catch (error) {
    // A server that could not be reached gets a plain message and a button to try again.
    const said = document.getElementById('facts-error');
    if (error.serverDown) said.innerHTML = `${esc(error.message)} <button type="button" class="link" data-retry-prepare>Try again</button>`;
    else said.textContent = error.message;
    // Said where the button was pressed too, when the draft is shown below the questions.
    if (origin && error.serverDown) draftNote(origin, DRAFT_DOWN, true);
    else if (origin) draftNote(origin, error.message, true);
  } finally {
    button.disabled = false;
  }
}
document.addEventListener('click', (event) => {
  if (!event.target.closest || !event.target.closest('[data-retry-prepare]')) return;
  document.getElementById('facts-error').textContent = '';
  // Asked again from beside the draft, the draft is updated where it is.
  const inDraft = resultEl.contains(event.target);
  prepareDraft(inDraft ? { scroll: false } : {});
});

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
    const el = gap && answerTarget(gateTarget(gap));
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
// A licence typed for an item the user added is kept with it, and used when the plant is confirmed.
resultEl.addEventListener('input', (event) => {
  const box = event.target.closest && event.target.closest('[data-plant-own-licence]');
  if (!box) return;
  const own = plantOwn().map((item) => ({ ...item }));
  const i = Number(box.dataset.plantOwnLicence);
  if (!own[i]) return;
  own[i].licence = box.value;
  plantPending = { ticks: plantTicksNow(), own };
  const status = document.getElementById('plant-status');
  if (status) status.textContent = 'You have changes. Press Confirm the plant to use them.';
});
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
  // "No", "None", "No other", "Nil", "N/A" typed in the box mean nothing to add.
  const typed = () => (itemBox && itemBox.value.trim() && !NOTHING_TO_ADD.test(itemBox.value.trim()) ? [{ item: itemBox.value.trim(), licence: licenceBox ? licenceBox.value.trim() : '' }] : []);
  if (event.target.closest('#plant-add')) {
    if (itemBox && NOTHING_TO_ADD.test(itemBox.value.trim())) {
      itemBox.value = '';
      if (status) status.textContent = 'Nothing to add. Press Confirm the plant when the ticks are right.';
      return;
    }
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
    // Removing an item the user added applies at once: the draft is prepared again without it.
    const own = [...plantOwn()];
    own.splice(Number(remove.dataset.plantRemove), 1);
    const ticks = plantTicksNow();
    plantChoice = confirmedPlant(ticks, own);
    plantPending = null;
    await prepareDraft({ scroll: false });
    const panel = document.getElementById('plant-panel');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (event.target.closest('#plant-confirm')) {
    // An item typed but not added yet is added with the rest.
    const ticks = plantTicksNow();
    plantChoice = confirmedPlant(ticks, [...plantOwn().map((item) => ({ ...item, licence: String(item.licence || '').trim() })), ...typed()]);
    plantPending = null;
    await prepareDraft({ scroll: false });
    const panel = document.getElementById('plant-panel');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  // A step's rating after the controls, set by the supervisor, and a library step taken off or put back.
  const rateOpen = event.target.closest('[data-rate-open]');
  const rateCancel = event.target.closest('[data-rate-cancel]');
  const rateSave = event.target.closest('[data-rate-save]');
  const rateReset = event.target.closest('[data-rate-reset]');
  const rateAt = rateOpen || rateCancel || rateSave || rateReset;
  if (rateAt && shownDraft) {
    const index = Number(rateAt.dataset.rateOpen ?? rateAt.dataset.rateCancel ?? rateAt.dataset.rateSave ?? rateAt.dataset.rateReset);
    const step = (shownDraft.jobSteps || [])[index];
    if (!step) return;
    if (rateOpen) ratingOpen.add(step.step); else ratingOpen.delete(step.step);
    if (rateSave) {
      const form = resultEl.querySelector(`[data-rate-step="${index}"]`);
      const pick = (part) => Number(form.querySelector(`[data-rate-part="${part}"]`).value);
      stepRatings = { ...(stepRatings || {}), [step.step]: { likelihood: pick('likelihood'), consequence: pick('consequence') } };
    }
    if (rateReset && stepRatings) { delete stepRatings[step.step]; if (!Object.keys(stepRatings).length) stepRatings = null; }
    await prepareDraft({ scroll: false, keep: `[data-step-row="${index}"]` });
    const focus = resultEl.querySelector(rateOpen ? `[data-rate-step="${index}"] select` : `[data-rate-open="${index}"]`);
    if (focus) focus.focus({ preventScroll: true });
    return;
  }
  const stepOff = event.target.closest('[data-step-remove]');
  if (stepOff && shownDraft) {
    const step = (shownDraft.jobSteps || [])[Number(stepOff.dataset.stepRemove)];
    if (!step || !confirm(`Take "${step.step}" off this SWMS? You can put it back.`)) return;
    leaveOut = [...new Set([...(leaveOut || []), step.step])];
    await prepareDraft({ scroll: false, keep: '#steps-head' });
    return;
  }
  const stepBack = event.target.closest('[data-step-back]');
  if (stepBack) {
    leaveOut = (leaveOut || []).filter((name) => name !== stepBack.dataset.stepBack);
    if (!leaveOut.length) leaveOut = null;
    await prepareDraft({ scroll: false, keep: '#steps-head' });
    return;
  }
  // High risk construction work the user adds, or takes off again, goes into the draft at once.
  if (event.target.closest('#hrcw-add-go')) {
    const select = document.getElementById('hrcw-add-item');
    const id = select ? select.value : '';
    const note = document.getElementById('hrcw-add-note');
    if (!id) {
      if (note) note.textContent = 'Choose an item from the list first.';
      if (select) select.focus();
      return;
    }
    const label = select.options[select.selectedIndex].textContent;
    highRiskAdded = [...new Set([...(highRiskAdded || []), id])];
    hrcwNote = `Added: ${label}. It prints under High risk construction work, and SiteWrite checks the draft again.`;
    await prepareDraft({ scroll: false, keep: '#hrcw-head' });
    const head = document.getElementById('hrcw-head');
    if (head) head.focus({ preventScroll: true });
    return;
  }
  // "Does not apply" on an item SiteWrite found: a short reason is asked for in place (D311).
  const offOpen = event.target.closest('[data-hrcw-off]');
  if (offOpen) {
    const li = offOpen.closest('li');
    document.querySelectorAll('.hrcw-off').forEach((form) => form.remove());
    document.querySelectorAll('[data-hrcw-off]').forEach((button) => { button.hidden = false; });
    offOpen.hidden = true;
    li.insertAdjacentHTML('beforeend', `<div class="field hrcw-off" data-hrcw-form="${esc(offOpen.dataset.hrcwOff)}"><label for="hrcw-off-why">Why does it not apply to this work?<span class="hint">A few words, for example "the trench is no deeper than 1.2 m". It prints as your call, with your reason. Its permit, its rescue row and the lines SiteWrite adds for it come off. The job steps for that work stay: take off any that are not part of this job.</span></label><input id="hrcw-off-why" type="text" maxlength="200" autocomplete="off"><p class="answer-note" id="hrcw-off-need" role="alert" hidden></p><div class="actions"><button type="button" class="secondary small" data-hrcw-off-go="${esc(offOpen.dataset.hrcwOff)}">Mark it as not applying</button> <button type="button" class="link" data-hrcw-off-cancel>Cancel</button></div></div>`);
    document.getElementById('hrcw-off-why').focus();
    return;
  }
  if (event.target.closest('[data-hrcw-off-cancel]')) {
    const form = event.target.closest('.hrcw-off');
    const button = form && form.parentElement.querySelector('[data-hrcw-off]');
    if (form) form.remove();
    if (button) { button.hidden = false; button.focus(); }
    return;
  }
  const offGo = event.target.closest('[data-hrcw-off-go]');
  if (offGo) {
    const why = document.getElementById('hrcw-off-why');
    const need = document.getElementById('hrcw-off-need');
    const reason = why ? why.value.replace(/\s+/g, ' ').trim() : '';
    const rules = window.SiteWriteSubstanceRules;
    const weak = rules && rules.reasonNeed ? rules.reasonNeed(reason) : (reason.split(' ').length < 2 ? 'weak' : '');
    if (weak) {
      if (need) { need.hidden = false; need.textContent = weak === 'missing' ? 'Say in a few words why it does not apply to this work.' : `"${reason.slice(0, 60)}" does not say why. Say in a few words why it does not apply to this work.`; }
      if (why) why.focus();
      return;
    }
    const id = offGo.dataset.hrcwOffGo;
    const li = offGo.closest('li');
    const label = li ? li.firstChild.textContent.trim() : 'it';
    highRiskOff = [...(highRiskOff || []).filter((item) => item.id !== id), { id, reason }];
    await prepareDraft({ scroll: false, keep: '#hrcw-head' });
    hrcwOffNote = `Marked as not applying: ${label}. It prints as your call, with your reason. Put it back if it does apply.`;
    const note = document.getElementById('hrcw-off-note');
    if (note) note.textContent = hrcwOffNote;
    const head = document.getElementById('hrcw-head');
    if (head) head.focus({ preventScroll: true });
    return;
  }
  const offBack = event.target.closest('[data-hrcw-back]');
  if (offBack) {
    highRiskOff = (highRiskOff || []).filter((item) => item.id !== offBack.dataset.hrcwBack);
    if (!highRiskOff.length) highRiskOff = null;
    await prepareDraft({ scroll: false, keep: '#hrcw-head' });
    hrcwOffNote = 'Put back. It prints under High risk construction work again, with its controls.';
    const note = document.getElementById('hrcw-off-note');
    if (note) note.textContent = hrcwOffNote;
    return;
  }
  const hrcwOff = event.target.closest('[data-hrcw-remove]');
  if (hrcwOff) {
    highRiskAdded = (highRiskAdded || []).filter((id) => id !== hrcwOff.dataset.hrcwRemove);
    hrcwNote = 'Taken off. Only items you added can be taken off.';
    await prepareDraft({ scroll: false, keep: '#hrcw-head' });
    return;
  }
  if (event.target.closest('#emergency-update')) {
    // The draft is prepared again with the answers, the button stays where it was on the screen, and
    // a note under it says where the answers went, with a link to them (owner feedback item 25).
    emergencyDone = true;
    await prepareDraft({ scroll: false, keep: '#emergency-update' });
    const button = document.getElementById('emergency-update');
    if (button) button.focus({ preventScroll: true });
    return;
  }
  if (event.target.closest('[data-emergency-show]')) {
    const table = document.getElementById('emergency-table');
    if (table) {
      table.scrollIntoView({ behavior: 'smooth', block: 'start' });
      table.classList.add('flash');
      setTimeout(() => table.classList.remove('flash'), 2000);
    }
    return;
  }
  const pick = event.target.closest('[data-emg-pick]');
  if (pick && shownDraft) {
    // A standard answer goes in the box, where it can be changed; pressed again, it comes out.
    const item = (shownDraft.emergencyQuestions || []).find((entry) => entry.id === pick.dataset.emgPick);
    const chosen = item && (item.suggestions || [])[Number(pick.dataset.pick)];
    const box = item && document.getElementById(`emg-${item.id}`);
    if (!chosen || !box) return;
    const now = box.value.trim();
    const others = (item.suggestions || []).map((entry) => entry.text);
    // An answer the gate refused, or a word or two ("call 000"), is replaced, not added to.
    const weak = now.split(/\s+/).length < 4 || Boolean(document.getElementById(`need-emg-${item.id}`));
    box.value = now.includes(chosen.text) ? now.replace(chosen.text, '').replace(/\s{2,}/g, ' ').trim()
      : !now || others.includes(now) || weak ? chosen.text : `${now} ${chosen.text}`;
    box.dispatchEvent(new Event('input', { bubbles: true }));
    pick.closest('.picks').querySelectorAll('[data-emg-pick]').forEach((button) => {
      const text = ((item.suggestions || [])[Number(button.dataset.pick)] || {}).text || '';
      button.setAttribute('aria-pressed', String(Boolean(text) && box.value.includes(text)));
    });
    box.focus();
  }
});
// An emergency answer is kept for the next draft as it is typed.
resultEl.addEventListener('input', (event) => {
  const box = event.target.closest && event.target.closest('[data-emergency]');
  if (!box) return;
  emergencyAnswers = { ...(emergencyAnswers || {}), [box.dataset.emergency]: box.value };
  // The note that the draft has the answers goes until the draft is updated again.
  emergencyDone = false;
  const done = document.getElementById('emergency-done');
  if (done) done.hidden = true;
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
// note, both optional. Kept with the change, so the saved record and SiteWrite's learning have it.
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
    // An added hazard's controls and rating go with it.
    if (edit.own) for (const hazard of Object.keys(edit.own)) if (!edit.added.includes(hazard)) delete edit.own[hazard];
    if (edit.own && !Object.keys(edit.own).length) delete edit.own;
    if (!edit.changed.length && !edit.added.length && !edit.notApplicable.length) delete hazardEdits[name];
  }
  if (!Object.keys(hazardEdits).length) hazardEdits = null;
}
// A hazard line as shown: SiteWrite's, one the user reworded or added, or one marked as not applying.
// why: the reason picked and the note, for a hazard of SiteWrite's the user removed (kept as before
// for "Does not apply"). keep: the part of the draft kept where it is on the screen.
function applyHazardEdit(step, line, action, next = '', { why = null, keep = '' } = {}) {
  const edit = hazardEditFor(step.step);
  const text = hazardText(line);
  if (action === 'na') edit.notApplicable.push(line);
  if (action === 'applies') edit.notApplicable = edit.notApplicable.filter((item) => item !== text);
  if (line.endsWith(HAZARD_MARK)) {
    // The user's own: an added one, or one of SiteWrite's they reworded.
    const added = edit.added.indexOf(text);
    const change = edit.changed.find((item) => item.to === text);
    if (added >= 0) {
      if (action === 'remove') edit.added.splice(added, 1);
      else if (next) {
        edit.added[added] = next;
        // Its controls and rating stay with it under its new words.
        if (edit.own && edit.own[text]) { edit.own[next] = edit.own[text]; delete edit.own[text]; }
      }
    } else if (change) {
      if (action === 'remove') edit.changed.splice(edit.changed.indexOf(change), 1); else if (next) change.to = next;
    }
  } else if (action === 'change' && next) {
    edit.changed = [...edit.changed.filter((item) => item.from !== line), { from: line, to: next }];
  }
  if (action === 'na' && why && (why.reason || why.note)) edit.reasons = [...(edit.reasons || []).filter((entry) => entry.line !== line), { line, reason: why.reason || '', note: why.note || '' }];
  tidyHazards();
  prepareDraft({ scroll: false, keep });
}
function setWho(step, text) {
  whoEdits = whoEdits || {};
  if (text) whoEdits[step.step] = text; else delete whoEdits[step.step];
  if (!Object.keys(whoEdits).length) whoEdits = null;
  const index = (shownDraft.jobSteps || []).indexOf(step);
  prepareDraft({ scroll: false, keep: index >= 0 ? `[data-step-row="${index}"]` : '' });
}
resultEl.addEventListener('click', (event) => {
  const button = event.target.closest('[data-hz], [data-who]');
  if (!button || !shownDraft) return;
  if (button.dataset.who) {
    const holder = button.closest('[data-who-step]');
    const step = (shownDraft.jobSteps || [])[Number(holder.dataset.whoStep)];
    if (step) lineEditor(holder, step.responsible || '', (text) => setWho(step, text.slice(0, 120)), 'Who');
    return;
  }
  const holder = button.closest('[data-hz-step]');
  const index = Number(holder.dataset.hzStep);
  const step = (shownDraft.jobSteps || [])[index];
  if (!step) return;
  const keep = `[data-step-row="${index}"]`;
  const action = button.dataset.hz;
  if (action === 'add') {
    lineEditor(button, '', (text) => {
      hazardEditFor(step.step).added.push(text);
      tidyHazards();
      // The new hazard's controls and rating show under the step: the page goes there.
      prepareDraft({ scroll: false, keep }).then(() => {
        const n = (shownDraft.ownHazards || []).findIndex((item) => item.stepIndex === index && item.hazard === text);
        const box = n >= 0 && document.getElementById(`own-hazard-${n + 1}`);
        if (box) { box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); box.focus({ preventScroll: true }); }
      });
    }, 'Hazard');
    return;
  }
  const line = step.hazards[Number(holder.dataset.hzLine)];
  if (action === 'change') { lineEditor(holder, hazardText(line), (text) => applyHazardEdit(step, line, 'change', text, { keep }), 'Hazard'); return; }
  // Remove asks once, under the line (D253). SiteWrite's own hazard asks why, as "Does not apply" did.
  if (action === 'remove') {
    const own = line.endsWith(HAZARD_MARK);
    confirmLine(holder, { reasons: !own }, (why) => applyHazardEdit(step, line, own ? 'remove' : 'na', '', { why, keep }));
    return;
  }
  applyHazardEdit(step, line, action, '', { keep });
});

// "Remove this line?" with Remove and Keep, under the line itself (D253, owner feedback items 18 and
// 19): nothing moves on the page. A line SiteWrite recommends keeping says why first, and a line of
// SiteWrite's asks why it goes, as before; both are optional.
let pendingConfirm = null;
function confirmLine(holder, { reasons = false, warning = '', title = 'Remove this line?', yes = 'Remove' } = {}, onYes) {
  resultEl.querySelectorAll('.line-confirm').forEach((box) => box.remove());
  const box = document.createElement('div');
  box.className = 'line-confirm';
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', title);
  box.innerHTML = `<p class="line-confirm-title"><strong>${esc(title)}</strong></p>${warning ? `<p class="warning ctl-warn">${esc(warning)}</p>` : ''}
    ${reasons ? `<div class="ctl-why"><select data-confirm-reason aria-label="Why? (optional)"><option value="">Why? (optional)</option>${WHY.map(([id, text]) => `<option value="${id}">${esc(text)}</option>`).join('')}</select><input type="text" maxlength="300" data-confirm-note placeholder="Note (optional)" aria-label="Note (optional)"></div>` : ''}
    <span class="ctl-tools line-confirm-tools"><button type="button" class="small" data-confirm-yes>${esc(yes)}</button><button type="button" class="small secondary" data-confirm-keep>Keep</button></span>`;
  holder.appendChild(box);
  pendingConfirm = { box, holder, onYes };
  const keep = box.querySelector('[data-confirm-keep]');
  if (keep) keep.focus({ preventScroll: true });
}
resultEl.addEventListener('click', (event) => {
  const yes = event.target.closest('[data-confirm-yes]');
  const keep = event.target.closest('[data-confirm-keep]');
  if ((!yes && !keep) || !pendingConfirm) return;
  const { box, holder, onYes } = pendingConfirm;
  pendingConfirm = null;
  if (keep) {
    box.remove();
    const again = holder.querySelector && holder.querySelector('.ctl-tools button');
    if (again) again.focus({ preventScroll: true });
    return;
  }
  const reason = box.querySelector('[data-confirm-reason]');
  const note = box.querySelector('[data-confirm-note]');
  box.remove();
  onYes({ reason: reason ? reason.value : '', note: note ? note.value.trim() : '' });
});

// ---- A hazard the user adds: its controls and its rating (D254, D255, own-hazards.js) ----

// Under the step, the full width of the table: the library lines that may fit, to tick; the user's
// own controls, with a box to write one; and the likelihood and consequence before and after the
// controls, suggested until chosen. At least one control is needed before download.
const LIKELIHOODS = [[5, 'Almost certain'], [4, 'Likely'], [3, 'Possible'], [2, 'Unlikely'], [1, 'Rare']];
const CONSEQUENCES = [[1, 'Negligible'], [2, 'Minor'], [3, 'Moderate'], [4, 'Major'], [5, 'Catastrophic']];
function ownHazardRow(item, n) {
  const id = `own-hazard-${n + 1}`;
  const ticked = new Set(item.controls || []);
  const offers = (item.offers || []).map((offer, i) => `<label class="check"><input type="checkbox" data-oh-offer="${n}" data-oh-key="${i}"${ticked.has(offer.key) ? ' checked' : ''}><span>${esc(offer.text)}</span></label>`).join('');
  const written = (item.written || []).map((line, i) => `<li>${esc(line)} <span class="meta">(Our own control)</span> <button type="button" class="link" data-oh-unwrite="${n}" data-oh-i="${i}">Remove</button></li>`).join('');
  const select = (when, part, value) => {
    const options = part === 'likelihood' ? LIKELIHOODS : CONSEQUENCES;
    return `<select data-oh-rate="${n}" data-oh-when="${when}" data-oh-part="${part}" aria-label="${when === 'before' ? 'Before' : 'After'} controls: ${part}">${options.map(([v, label]) => `<option value="${v}"${Number(value) === v ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
  };
  const rating = (when) => {
    const value = (item.rating || {})[when] || {};
    return `<p class="oh-rate"><span class="oh-when">${when === 'before' ? 'Before controls' : 'After controls'}:</span> ${select(when, 'likelihood', value.likelihood)} x ${select(when, 'consequence', value.consequence)} = <strong>${esc(value.level || '')}</strong></p>`;
  };
  return `<tr class="own-hazard-row"><td colspan="5" data-label="Your own hazard"><div class="own-hazard" id="${id}" tabindex="-1" data-oh="${n}">
    <p><strong>Your hazard:</strong> ${esc(item.hazard)}</p>
    <p class="oh-head"><strong>Controls for it</strong> <span class="meta">At least one is needed before download.</span></p>
    ${offers ? `<p class="meta">Lines from SiteWrite's library that may fit. Tick only those that do.</p><div class="oh-offers">${offers}</div>` : '<p class="meta">SiteWrite has no line that fits this hazard. Write your own below.</p>'}
    ${written ? `<ul class="oh-written">${written}</ul>` : ''}
    <div class="oh-write"><label for="${id}-write">Write your own control</label><div class="oh-write-row"><input type="text" id="${id}-write" maxlength="600" data-oh-write="${n}" placeholder="For example: walkways of duckboards over the wet areas"><button type="button" class="secondary small" data-oh-add="${n}">Add</button></div></div>
    <p class="oh-head"><strong>Risk rating for this hazard</strong> <span class="meta">${item.rated ? 'As you chose it.' : 'Suggested. Change it to suit the site.'} The step shows the higher of its rating and this one.</span></p>
    ${rating('before')}${rating('after')}
  </div></td></tr>`;
}
// The user's choices for each hazard they added, kept with the hazard (hazardEdits[step].own).
function ownDetail(item) {
  const edit = hazardEditFor(item.step);
  edit.own = edit.own || {};
  edit.own[item.hazard] = edit.own[item.hazard] || { controls: [...(item.controls || [])], written: [...(item.written || [])] };
  return edit.own[item.hazard];
}
function ownHazardChanged(n) {
  tidyHazards();
  prepareDraft({ scroll: false, keep: `#own-hazard-${n + 1}` }).then(() => {
    const box = document.getElementById(`own-hazard-${n + 1}`);
    if (box) box.focus({ preventScroll: true });
  });
}
resultEl.addEventListener('change', (event) => {
  if (!shownDraft) return;
  const offer = event.target.closest && event.target.closest('[data-oh-offer]');
  const rate = event.target.closest && event.target.closest('[data-oh-rate]');
  if (!offer && !rate) return;
  const n = Number((offer || rate).dataset[offer ? 'ohOffer' : 'ohRate']);
  const item = (shownDraft.ownHazards || [])[n];
  if (!item) return;
  const detail = ownDetail(item);
  if (offer) {
    const key = ((item.offers || [])[Number(offer.dataset.ohKey)] || {}).key;
    if (!key) return;
    detail.controls = offer.checked ? [...new Set([...(detail.controls || []), key])] : (detail.controls || []).filter((other) => other !== key);
  } else {
    const when = rate.dataset.ohWhen;
    const pair = [...resultEl.querySelectorAll(`[data-oh-rate="${n}"][data-oh-when="${when}"]`)];
    const value = Object.fromEntries(pair.map((el) => [el.dataset.ohPart, Number(el.value)]));
    detail[when] = { likelihood: value.likelihood, consequence: value.consequence };
    // The other half of the rating is kept as shown, so both are the user's from now on.
    const other = when === 'before' ? 'after' : 'before';
    if (!detail[other]) detail[other] = { likelihood: item.rating[other].likelihood, consequence: item.rating[other].consequence };
  }
  ownHazardChanged(n);
});
resultEl.addEventListener('click', (event) => {
  if (!shownDraft) return;
  const jump = event.target.closest('[data-oh-jump]');
  if (jump) {
    event.preventDefault();
    const box = document.getElementById(`own-hazard-${jump.dataset.ohJump}`);
    if (box) { box.scrollIntoView({ behavior: 'smooth', block: 'center' }); box.focus({ preventScroll: true }); }
    return;
  }
  const add = event.target.closest('[data-oh-add]');
  const unwrite = event.target.closest('[data-oh-unwrite]');
  if (!add && !unwrite) return;
  const n = Number((add || unwrite).dataset[add ? 'ohAdd' : 'ohUnwrite']);
  const item = (shownDraft.ownHazards || [])[n];
  if (!item) return;
  const detail = ownDetail(item);
  if (add) {
    const box = resultEl.querySelector(`[data-oh-write="${n}"]`);
    const text = box ? box.value.replace(/\s+/g, ' ').trim() : '';
    if (!text) { if (box) box.focus(); return; }
    detail.written = [...new Set([...(detail.written || []), text])];
  } else {
    detail.written = (detail.written || []).filter((_line, i) => i !== Number(unwrite.dataset.ohI));
  }
  ownHazardChanged(n);
});
// Enter in the box adds the control.
resultEl.addEventListener('keydown', (event) => {
  const box = event.target.closest && event.target.closest('[data-oh-write]');
  if (!box || event.key !== 'Enter') return;
  event.preventDefault();
  const button = resultEl.querySelector(`[data-oh-add="${box.dataset.ohWrite}"]`);
  if (button) button.click();
});

// ---- Steps the user writes for work SiteWrite does not cover (owner, 11 October 2026) ----

// A short form: the step's name (the part of the task, to start), its hazards and controls, one on
// each line, with the hierarchy of control to write them in, and who is responsible. Saved, it goes
// with the draft like the user's other changes, and prints in the job steps marked as their own.
const OWN_HIERARCHY = 'Write them in hierarchy order: first remove the hazard, then a safer way of doing the work, then barriers, guards or isolation, then procedures, permits and training, and PPE last. Say what is done, by whom, or to what standard.';
const linesOf = (text) => String(text || '').split(/\n+/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
const startName = (part) => String(part || '').replace(/\s+/g, ' ').trim().replace(/^[a-z]/, (letter) => letter.toUpperCase());
function closeOwnForm() {
  document.querySelectorAll('.own-step-form, .own-form-row').forEach((el) => el.remove());
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
// What keeps a step the user wrote from saving, as [box, message], or null. The project page uses it too.
function ownStepProblem(next, list, was) {
  // A line of a word or two ("Gloves") does not tell the crew what to do, and "TBC" or "dont know" is not
  // an answer (messy round 3). A short line naming a real control ("nitrile gloves") is enough, and one
  // that only points to another step ("as per step 2") is not (messy round 6). Said as the download check
  // says it (gate-rules.js ownLineProblem).
  const R = window.SiteWriteGate;
  const problem = (lines, kind) => lines.map((line) => [line, R ? R.ownLineProblem(line, kind) : '']).find(([, said]) => said) || null;
  const thinHazard = problem(next.hazards, 'hazard');
  const thinControl = problem(next.controls, 'control');
  const why = ([, said], what) => (/points to another step/.test(said) ? said : `${said} ${what}`);
  return !next.name ? ['own-name', 'Give the job step a name.']
    : !next.hazards.length ? ['own-hazards', 'Write at least one hazard. A step needs a hazard and a control to print.']
      : !next.controls.length ? ['own-controls', 'Write at least one control. A step needs a hazard and a control to print.']
        : thinHazard ? ['own-hazards', why(thinHazard, 'Say what could go wrong, for example "Hand cut on sharp mesh edges".')]
          : thinControl ? ['own-controls', why(thinControl, 'Say what is done and how, for example "Wear cut-resistant gloves when handling the mesh".')]
            : (list || []).some((other) => other.name !== was && sameWords(other.name) === sameWords(next.name)) ? ['own-name', 'You already have a step with this name. Give this one another name.'] : null;
}
function saveOwnStep(form, after = afterOwnChange) {
  const error = form.querySelector('[data-own-error]');
  const was = form.dataset.ownWas;
  const next = {
    part: form.dataset.ownPart,
    name: form.querySelector('#own-name').value.replace(/\s+/g, ' ').trim().slice(0, 300),
    hazards: linesOf(form.querySelector('#own-hazards').value).slice(0, 20),
    controls: linesOf(form.querySelector('#own-controls').value).slice(0, 30),
    who: form.querySelector('#own-who').value.replace(/\s+/g, ' ').trim().slice(0, 120),
  };
  const wrong = ownStepProblem(next, ownSteps, was);
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
  // So does its rating after the controls, where the supervisor changed it.
  if (was && was !== next.name && stepRatings && stepRatings[`${was} (Our own step)`]) {
    stepRatings = { ...stepRatings, [`${next.name} (Our own step)`]: stepRatings[`${was} (Our own step)`] };
    delete stepRatings[`${was} (Our own step)`];
  }
  after(next.name);
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

// ---- Steps the user writes before the SWMS is prepared (messy round 4, B fault 1) ----

// Work SiteWrite has no job steps for stood the SWMS down, and the user's own steps were offered only
// once a SWMS was prepared, so a SWMS of the user's own steps could never be prepared. Where the
// questions say the SWMS would be stood down for want of job steps, or the user has written steps,
// the questions page lists them and offers "Write a step for this": the steps go with the draft.
function showStandDown(data) {
  const notice = document.getElementById('steps-notice');
  const message = (data && data.standDown && data.standDown.message) || '';
  notice.textContent = message;
  notice.classList.toggle('hidden', !message);
  drawOwnEarly(data);
}
let ownEarlyNote = '';
function drawOwnEarly(data) {
  const box = document.getElementById('own-early');
  if (!box) return;
  const stood = Boolean(data && data.standDown);
  const mine = ownSteps || [];
  if (!stood && !mine.length) { if (box.innerHTML) box.innerHTML = ''; return; }
  // The work to write a step for: what SiteWrite has no job steps for, else the work as a whole.
  const parts = ((data && data.notCoveredLeft) || []).filter((part) => !ownFor(part));
  const writes = parts.length
    ? parts.map((part, n) => `<li><strong>${esc(part)}</strong> <button type="button" class="small" data-own-early="${n}">Write a step for this</button></li>`).join('')
    : `<li><button type="button" class="small" data-own-early="">Write a step for this</button><span class="meta"> Write what is done, what could go wrong and how it is controlled.</span></li>`;
  const html = `<div class="note own-early"><p><strong>Your own steps</strong></p>
    ${mine.length ? `<ul class="own-early-list">${mine.map((item) => `<li>${esc(item.name)}${item.part ? ` <span class="meta">(for: ${esc(item.part)})</span>` : ''} <button type="button" class="link" data-own-early-change="${esc(item.name)}">Change</button> <button type="button" class="link" data-own-early-remove="${esc(item.name)}">Remove</button></li>`).join('')}</ul>` : ''}
    ${stood ? `<p class="meta">${mine.length ? 'SiteWrite still has no job steps for this work.' : 'You can write the steps for this work yourself: a SWMS of your own steps is prepared like any other.'} Each step needs a hazard and a control. A step of a word or two is not enough.</p><ul class="own-early-writes">${writes}</ul>` : `<p class="meta">They go into the SWMS when you press Prepare the statement. <button type="button" class="link" data-own-early="">Write another step</button></p>`}
    <p class="meta own-early-status" role="status">${esc(ownEarlyNote)}</p></div>`;
  box.dataset.parts = JSON.stringify(parts);
  if (box.innerHTML !== html) box.innerHTML = html;
}
factsForm.addEventListener('click', (event) => {
  const box = document.getElementById('own-early');
  const write = event.target.closest('[data-own-early]');
  if (write) {
    event.preventDefault();
    const parts = JSON.parse((box && box.dataset.parts) || '[]');
    const part = write.dataset.ownEarly === '' ? '' : parts[Number(write.dataset.ownEarly)] || '';
    ownStepForm(write.closest('li') || write, ownFor(part) || null, part);
    return;
  }
  const change = event.target.closest('[data-own-early-change]');
  if (change) {
    const item = (ownSteps || []).find((other) => other.name === change.dataset.ownEarlyChange);
    if (item) ownStepForm(change.closest('li') || change, item, item.part);
    return;
  }
  const remove = event.target.closest('[data-own-early-remove]');
  if (remove) {
    ownSteps = (ownSteps || []).filter((other) => other.name !== remove.dataset.ownEarlyRemove);
    if (!ownSteps.length) ownSteps = null;
    ownEarlyNote = 'Step removed.';
    afterOwnEarly();
    return;
  }
  const form = event.target.closest('.own-step-form');
  if (form && event.target.closest('[data-own-save]')) { event.preventDefault(); saveOwnStep(form, (name) => { ownEarlyNote = `Saved your step "${name}". It goes into the SWMS when you press Prepare the statement.`; afterOwnEarly(); }); return; }
  if (form && event.target.closest('[data-own-cancel]')) closeOwnForm();
});
// The questions are asked again with the steps, so the notice that the SWMS would be stood down goes.
async function afterOwnEarly() {
  closeOwnForm();
  drawOwnEarly(questions);
  keepUnsaved();
  await askAgain();
  const box = document.getElementById('own-early');
  if (box) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
// The stood-down draft's button goes to the same place.
document.addEventListener('click', (event) => {
  if (!event.target.closest || !event.target.closest('[data-own-early-go]')) return;
  const first = document.querySelector('#own-early [data-own-early]');
  factsForm.classList.remove('hidden');
  if (first) { first.scrollIntoView({ behavior: 'smooth', block: 'center' }); first.focus({ preventScroll: true }); first.click(); }
});

// What the server did with the user's changes: those refused, those made on a line SiteWrite has
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
    out.push(`<div class="note"><p>SiteWrite has reworded lines you changed since you made the changes. Your changes now apply to the new wording. Check them in the job steps below.</p><ul>${report.remapped.filter((item) => item.kind !== 'step').map((item) => `<li>${esc(item.step)}: "${esc(item.from)}" now reads "${esc(item.line)}"</li>`).join('')}</ul></div>`);
  }
  // In the saved view, the warnings given when the SWMS was saved, with the reasons.
  if (!discard) {
    for (const item of report.warned || []) out.push(`<p class="warning">${esc(`${item.step}: ${item.kind === 'removed' ? 'Removed' : item.kind === 'changed' ? 'Changed' : 'Added'} "${item.kind === 'added' ? item.to : item.text}". ${item.warnings.join(' ')}${item.reason ? ` Reason given: ${(WHY.find(([id]) => id === item.reason) || [])[1] || item.reason}${item.note ? `, ${item.note}` : ''}.` : ''}`)}</p>`);
  }
  (report.unmatched || []).forEach((item, index) => {
    const why = item.reason === 'step' ? 'That job step is no longer in this SWMS' : 'That line is no longer in this step';
    out.push(`<p class="warning">${esc(`${item.step}: ${describeEdit(item)}. ${why}, as SiteWrite's wording, the steps or your answers have changed, so the change is not applied. Make the change again on the line as it now reads, or discard it.`)}${discard ? ` <button type="button" class="link" data-ctl-discard="${index}">Discard this change</button>` : ''}</p>`);
  });
  return out.join('');
}
// A change made on a line SiteWrite has since reworded is kept against the new wording.
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
// why: the reason picked and the note for a line removed or weakened. keep: the part of the draft kept
// where it is on the screen.
function applyLineEdit(step, line, next, { why = null, keep = '' } = {}) {
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
  if (why && (why.reason || why.note)) {
    const from = isOwn(line) ? line.slice(0, -OWN_MARK.length) : line;
    edit.reasons = [...(edit.reasons || []).filter((entry) => entry.line !== from), { line: from, reason: why.reason || '', note: why.note || '' }];
  }
  tidyEdits();
  prepareDraft({ scroll: false, keep });
}
// A box to write a line in, in place of the line or under the step's controls.
// label: what the box holds, said above it ("Hazard", "Control", "Who").
function lineEditor(holder, value, onSave, label = 'Control') {
  const box = document.createElement('div');
  box.className = 'ctl-edit';
  box.innerHTML = `<span class="ctl-edit-label">${esc(label)}</span><textarea maxlength="600" aria-label="${esc(label)}">${esc(value)}</textarea><span class="ctl-tools"><button type="button" class="link" data-save>Save</button><button type="button" class="link" data-cancel>Cancel</button></span>`;
  holder.after(box);
  holder.classList.add('hidden');
  const area = box.querySelector('textarea');
  // The box opens where the line was: the page does not move (owner feedback item 19).
  area.focus({ preventScroll: true });
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
  const keep = `[data-step-row="${index}"]`;
  if (action === 'add') {
    lineEditor(button, '', (text) => { editsFor(step.step).added.push(text); tidyEdits(); prepareDraft({ scroll: false, keep }); });
    return;
  }
  if (action === 'restore') {
    editsFor(step.step).removed.splice(Number(button.dataset.removed), 1);
    tidyEdits();
    prepareDraft({ scroll: false, keep });
    return;
  }
  const line = step.controls[Number(holder.dataset.ctlLine)];
  // Remove asks once, under the line (D253): "Remove this line?" with Remove and Keep. A line that is a
  // legal requirement, or that SiteWrite recommends keeping, says why in the same box, and SiteWrite's
  // own line asks why it goes (both optional, owner decision, 6 October 2026).
  const warning = holder.dataset.warn && !isOwn(line) ? holder.dataset.warn : '';
  if (action === 'remove') {
    confirmLine(holder, { reasons: !isOwn(line), warning }, (why) => applyLineEdit(step, line, '', { why, keep }));
    return;
  }
  if (action === 'change') {
    const edit = () => lineEditor(holder, plainLine(line), (text) => applyLineEdit(step, line, text, { keep }));
    if (warning) confirmLine(holder, { warning, title: 'Change this line?', yes: 'Change' }, edit); else edit();
  }
});
// The reason for a removed or weakened line is kept as it is picked or typed.
resultEl.addEventListener('change', (event) => {
  const field = event.target.closest && event.target.closest('[data-ctl-reason], [data-ctl-note]');
  if (!field || !shownDraft) return;
  const step = (shownDraft.jobSteps || [])[Number(field.dataset.ctlStep)];
  if (!step) return;
  setReason(step.step, field.dataset.ctlFrom, field.matches('[data-ctl-reason]') ? { reason: field.value } : { note: field.value.trim() }, field.dataset.ctlAbout);
  // The buttons below the SWMS save what is now chosen.
  if (window.SiteWrite.actionInput) window.SiteWrite.actionInput = { ...window.SiteWrite.actionInput, controlEdits: controlEdits || undefined, hazardEdits: hazardEdits || undefined };
});

// ---- Reading the draft in another language (task #94) ----

// Signed-in users can read the draft translated, with the English under each line. The SWMS,
// its Word and PDF files, and what the builder sees stay in English.
const LANGUAGE_KEY = 'sitewrite.readLanguage';
let translateConfig = null;
async function showTranslate(input) {
  const S = window.SiteWrite;
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
const UNSAVED_KEY = 'sitewrite.unsaved';
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
  const editing = window.SiteWrite && window.SiteWrite.editing;
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

// A standard answer, "Same as last SWMS" and the emergency picks fill a box with no typing, so no input
// event fires: the pick is kept the same way (content4 note: a fall control picked from a standard
// answer came back blank after a reload).
document.addEventListener('click', (event) => {
  const button = event.target.closest && event.target.closest('.pick-button');
  if (restoring || !button || !button.closest(KEPT_IN)) return;
  clearTimeout(keepTimer);
  keepTimer = setTimeout(keepUnsaved, 400);
});

async function restoreUnsaved() {
  let kept = null;
  try { kept = JSON.parse(localStorage.getItem(UNSAVED_KEY) || 'null'); } catch { kept = null; }
  if (!kept || typeof kept !== 'object' || !kept.input || typeof kept.input !== 'object') return false;
  if (!(Date.now() - Number(kept.at) < UNSAVED_DAYS * 24 * 60 * 60 * 1000)) { clearUnsaved(); return false; }
  // Something typed or opened since the page loaded is not overwritten. A phone's browser puts the
  // last task back in its box on a reload or Back: that is the same work, so it is brought back in full
  // (messy-user testing, 13 October 2026: the answers and the draft were lost on a reload).
  const sameTask = () => { const now = document.getElementById('task').value.trim(); return !now || now === String(kept.input.task || '').trim(); };
  if (!sameTask()) return false;
  // The download and save buttons depend on whether the user is signed in.
  if (window.SiteWrite && window.SiteWrite.accountReady) await window.SiteWrite.accountReady;
  if (typedHere || !sameTask()) return false;
  const input = { ...kept.input };
  // Signed in, the company is the account's own.
  if (document.getElementById('company').value.trim()) delete input.company;
  restoring = true;
  try {
    if (kept.stage === 'start') fillStart(input);
    else if (await fillForm(input, { stay: true }).catch(() => false)) {
      if (kept.editing && window.SiteWrite) window.SiteWrite.editing = kept.editing;
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
  note.setAttribute('role', 'status');
  note.innerHTML = `Your work is back as you left it (not saved yet, from ${esc(when.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }))}${today ? ' today' : `, ${esc(when.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' }))}`}). <button type="button" class="link" id="unsaved-clear">Start again</button>`;
  // A project being prepared in one go hides the SWMS form: the note goes above the details it brought back.
  const start = document.getElementById('start');
  const stage = kept.stage === 'draft' && !resultEl.classList.contains('hidden') ? resultEl : kept.stage !== 'start' && !factsForm.classList.contains('hidden') ? factsForm : start.classList.contains('hidden') ? document.getElementById('job-details') : start;
  stage.before(note);
  note.scrollIntoView({ block: 'start' });
  // The project list follows the details brought back.
  if (window.SiteWrite && window.SiteWrite.renderProject) window.SiteWrite.renderProject();
  return true;
}

// ---- The phone's Back button (messy-user testing, 13 October 2026) ----

// Moving on to the questions or the draft is a step in the browser's history, so Back goes to the
// last step on this page, with everything as it was, instead of leaving SiteWrite. Should Back leave
// the page anyway, the work kept on this device comes back when it is opened again (restoreUnsaved).
const STAGE_HASH = { start: '', questions: '#questions', draft: '#draft', review: '#review' };
function markStage(stage) {
  if (restoring || typeof history === 'undefined' || !history.pushState || !window.location) return;
  const hash = STAGE_HASH[stage] || '';
  if ((window.location.hash || '') === hash) return;
  try { history.pushState({ sitewrite: stage }, '', hash || `${window.location.pathname}${window.location.search}`); } catch { /* not kept */ }
}
function showStage(stage) {
  const S = window.SiteWrite || {};
  if (stage === 'review' && S.projectReview) { S.projectReview(); return; }
  const target = stage === 'draft' && !resultEl.classList.contains('hidden') ? resultEl
    : (stage === 'questions' || stage === 'draft') && !factsForm.classList.contains('hidden') ? factsForm
      : stage === 'review' && document.getElementById('project-panel') ? document.getElementById('project-panel')
        : document.getElementById('start');
  target.scrollIntoView({ block: 'start' });
}
if (typeof window.addEventListener === 'function') {
  window.addEventListener('popstate', (event) => {
    const stage = (event.state && event.state.sitewrite) || Object.keys(STAGE_HASH).find((key) => STAGE_HASH[key] && STAGE_HASH[key] === (window.location.hash || '')) || 'start';
    showStage(stage);
  });
}
window.SiteWrite = Object.assign(window.SiteWrite || {}, { markStage });

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
  window.SiteWrite.showActions(shownDraft, shownSent);
  if (shownDraft.kind === 'draft') showTranslate(shownSent);
}

// The first thing still needed before download, brought into view once and focused (owner, D287: "Go
// to it" on the project's not ready list goes straight to it, whatever it is). The page is not moved
// again after (item 19). Returns false when nothing is needed or it is not on the page.
// The work with no job steps, brought into view at its first "Write a step for this" (messy round 3:
// the project's list goes straight to it).
function goToCover() {
  const box = document.querySelector('.not-covered [data-own-write]') || document.querySelector('.not-covered [data-cover-where], .not-covered [data-cover-name]') || document.querySelector('.not-covered');
  if (!box) return false;
  (box.closest('.not-covered') || box).scrollIntoView({ block: 'center' });
  if (box.focus) box.focus({ preventScroll: true });
  return true;
}
function goToFirstNeed() {
  const gap = shownDraft && shownDraft.kind === 'draft' ? shownGaps[0] : null;
  if (!gap) return false;
  const el = gap.kind === 'cover' ? (document.getElementById('not-covered-confirm') || document.querySelector('.not-covered [data-own-write]')) : answerTarget(gateTarget(gap));
  if (!el) return false;
  const closed = el.closest('details:not([open])');
  if (closed) closed.open = true;
  el.scrollIntoView({ block: 'center' });
  el.focus({ preventScroll: true });
  return true;
}

// Where each must-fix item of SiteWrite's check is fixed on the page, with a "Go to" that opens it
// (messy round 5: "Fix it on the page" said nothing of where, and the page had no way to add a high
// risk item). Every must-fix rule of the check (builder-check.js H1 to H9) has its place here; any
// other goes to the job steps. On a saved SWMS, the place is Change, which opens it to fix.
function stepRowFor(item) {
  const steps = (shownDraft && shownDraft.jobSteps) || [];
  if (item.rule === 'H9' && window.SiteWrite && window.SiteWrite.highAfter) {
    const first = window.SiteWrite.highAfter(shownDraft)[0];
    if (first) return first.index;
  }
  // The step named in brackets in the message, as the check names it.
  const at = steps.findIndex((step) => String(item.message || '').includes(`(${step.step})`) || String(item.message || '').includes(`: ${step.step}`));
  return at;
}
function mustFixPlace(prefix, item) {
  if (prefix === 'saved') return { label: 'Go to Change, to fix it', target: () => document.getElementById('saved-edit') };
  const byId = (id) => () => document.getElementById(id);
  const steps = { label: 'Go to Job steps', target: byId('steps-head') };
  const step = (n) => ({ label: `Go to step ${n + 1}`, target: () => stepTarget(n) });
  switch (item && item.rule) {
    case 'H1': return { label: 'Go to High risk construction work', target: () => document.getElementById('hrcw-add-item') || document.getElementById('hrcw-head') };
    case 'H3': return document.getElementById('fact-fallControl') ? { label: 'Go to the fall control', target: () => answerTarget(document.getElementById('fact-fallControl')) } : steps;
    case 'H4': return /No site address/.test(item.message || '') ? { label: 'Go to Job address', target: byId('workplace') } : { label: 'Go to the site questions', target: () => document.querySelector('#site-block textarea') };
    case 'H6':
    case 'H7': return { label: 'Go to Person who makes sure the SWMS is followed', target: byId('compliance-responsible') };
    case 'H8': return { label: 'Go to the first blank', target: () => resultEl.querySelector('.blank-input') || document.querySelector('textarea.has-blank') || document.getElementById('steps-head') };
    case 'H2':
    case 'H5':
    case 'H9': { const n = stepRowFor(item); return n >= 0 ? step(n) : steps; }
    default: return steps;
  }
}
// A step's "Add your own control". On a phone the step's tools show once Change this step is pressed.
function stepTarget(n) {
  const row = resultEl.querySelector(`tr[data-step-row="${n}"]`);
  if (!row) return document.getElementById('steps-head');
  let add = row.querySelector('[data-ctl="add"]');
  if (add && !add.getClientRects().length) {
    const edit = row.querySelector('[data-step-edit]');
    if (edit && !row.classList.contains('editing')) edit.click();
    add = resultEl.querySelector(`tr[data-step-row="${n}"] [data-ctl="add"]`);
  }
  return add && add.getClientRects().length ? add : row;
}
function goToMustFix(prefix, item) {
  const place = mustFixPlace(prefix, item);
  return goToEl(place && place.target());
}
// "Show me" beside a step still High after its controls goes to that step (messy round 5, run 4: it went
// to the emergency arrangements).
document.addEventListener('click', (event) => {
  const high = event.target.closest && event.target.closest('[data-high-go]');
  if (high) goToEl(stepTarget(Number(high.dataset.highGo)));
});
function goToEl(el) {
  if (!el) return false;
  const closed = el.closest('details:not([open])');
  if (closed) closed.open = true;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (el.focus) el.focus({ preventScroll: true });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 2000);
  return true;
}

window.SiteWrite = Object.assign(window.SiteWrite || {}, {
  mustFixPlace, goToMustFix, signedInProfile,
  keepUnsaved, clearUnsaved, restoreUnsaved, redrawActions, liveGate, currentAnswers, goToFirstNeed, goToCover, readJson, postJson, SERVER_DOWN,
  api, esc, payload, render, fillForm, fillFields, setProfile, newSwms, showPick, editNotes, prepare: prepareDraft, getProfile: () => profile, resultEl, addPrincipals, methodSteps,
  // The labelled boxes for an answer's blanks (D261), for the project page's answers too.
  drawBlankForm, answerTarget, ownStepProblem, OWN_HIERARCHY, pickedAgain: (id) => { if ((blankForms.get(id) || {}).own) blankForms.delete(id); },
  // Signed in, the account name fills Prepared by when it is empty.
  setPreparedBy: (name) => { if (name && !preparedEl.value.trim()) preparedEl.value = name; },
});

addPrincipals([], false);
document.getElementById('principal').addEventListener('change', (event) => addPrincipals([event.target.value], true));

// One name in every person's box is said under them, as a warning (messy round 4, run 2).
function showSameName() {
  const note = document.getElementById('people-same');
  const rules = window.SiteWriteGate;
  if (!note || !rules || !rules.sameNameWarning) return;
  const now = payload();
  const text = rules.sameNameWarning(now);
  if (note.textContent !== text) note.textContent = text;
  note.classList.toggle('hidden', !text);
}
['works-manager', 'compliance-responsible', 'reviewer', 'first-aider'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('input', showSameName); });

// Work left unsaved on this device comes back once the states are in and the page's other scripts
// (the account's buttons) have run: with the states kept by the phone, they can be in first.
const scriptsRun = document.readyState === 'loading'
  ? new Promise((resolve) => { document.addEventListener('DOMContentLoaded', resolve, { once: true }); })
  : Promise.resolve();
loadStates().then(() => scriptsRun.then(() => restoreUnsaved()).catch(() => false), () => {
  document.getElementById('start-error').textContent = 'The state list could not be loaded.';
});
