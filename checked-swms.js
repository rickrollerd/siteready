// SWMS checked with the builder check, kept to improve the library (owner, 11 October 2026: "this is
// the highest priority data we could get, large contractors uploading real world examples"). Off
// unless KEEP_CHECKED_SWMS=on (pilot mode, decision D214: switched on now, the privacy policy and
// terms updated before launch). With it off, nothing is kept and nothing changes for the user.
//
// When on, each uploaded or pasted SWMS that is checked is kept once, found again by its content
// fingerprint:
// - the original file (or the pasted text), in the storage bucket in production (file-store.js);
// - the text read from it, with worker sign-on pages taken out as for the check (signon-strip.js);
// - the check result and score, the state, the trade where it can be told from the steps, and the month;
// - the account and person who uploaded it, in a table of their own (checked_swms_uploaders), so a
//   business's documents go when it is deleted, and one document can be deleted on request.
// The original keeps its names: it is the evidence, and only the owner opens it, from the admin page,
// each look logged in the admin access log.
//
// For learning, a second copy is made with names, phone numbers, emails, ABNs and addresses taken out
// (the control learning scrubber, with extra address and number patterns), and the job steps, hazards
// and controls are pulled out as lines, each with the library step it is most like and whether the
// library already has it. The document's own business is kept only as a keyed fingerprint, so the
// monthly report can count how many different organisations' documents a line appears in.
//
// The user is told at upload, and may tick "Do not keep this document". A business that opted out of
// industry data is left out. Documents are deleted after 3 years from their last check, unless
// KEEP_CHECKED_SWMS_YEARS says otherwise.
const crypto = require('crypto');
const db = require('./db');
const { checkedSwmsKey } = require('./secret-keys');
const { scrub, deidentify, gapKey, accountTerms } = require('./control-learning');
const store = require('./file-store');

const enabled = () => String(process.env.KEEP_CHECKED_SWMS || '').trim().toLowerCase() === 'on' && Boolean(checkedSwmsKey());
const RETENTION_YEARS = 3;
const retentionYears = () => {
  const years = Number(process.env.KEEP_CHECKED_SWMS_YEARS);
  return Number.isFinite(years) && years > 0 ? years : RETENTION_YEARS;
};
// The builder check takes a request of up to 15 MB (server.js), which carries the file in base64:
// about 11 MB of file. Nothing larger is kept.
const MAX_UPLOAD_BYTES = Math.floor((15 * 1024 * 1024 * 3) / 4);
// Months are counted in Queensland time, as the other learning tables are.
const monthOf = (date) => new Date(date.getTime() + 10 * 3600000).toISOString().slice(0, 7);
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

// The wording shown at upload while keeping is on. For the owner's approval (decision list).
const NOTICE = (years) => `SiteWrite keeps a copy of each SWMS you check, with its result, to improve its library. Names are not used outside SiteWrite. Copies are kept for ${years} years, or until your business asks us to delete them.`;
const NOT_KEPT_ASKED = 'This document was not kept, as you asked.';
const KEPT = 'A copy of this document was kept to improve SiteWrite\'s library.';
const NOT_KEPT_OPTED_OUT = 'This document was not kept: your business opted out of industry data.';

function uploadNotice() {
  return enabled() ? { keeping: true, years: retentionYears(), notice: NOTICE(retentionYears()), choice: 'Do not keep this document' } : { keeping: false };
}

// ---- The document's own business, as a keyed fingerprint ----

const COMPANY_TAIL = /\b(?:pty\.?|ltd\.?|limited|proprietary|the|and|&|co\.?|inc\.?|group|australia|aust\.?)(?=\s|$)/g;
const plainCompany = (name) => String(name || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9& ]+/g, ' ').replace(COMPANY_TAIL, ' ').replace(/\s+/g, '').slice(0, 80);
const LABELLED = /^\s*(?:company(?: name)?|contractor(?: name)?|sub-?contractor(?: name)?|business(?: name)?|employer|organisation|organization|prepared for)\s*[:\-–]\s*(.{3,80})$/im;
const PTY = /\b((?:[A-Z][\w&'.-]*[ \t]+){1,5}(?:(?:Pty|PTY)\.?\s*(?:Ltd|LTD)\.?|(?:Pty|PTY)\.?\s+(?:Limited|LIMITED)|Limited|LIMITED|Ltd\.?|LTD\.?))(?![\w])/g;
const ABN_NUMBER = /\bABN\s*:?\s*(\d{2}\s?\d{3}\s?\d{3}\s?\d{3})\b/i;

// Who wrote the SWMS, read from the top of its text: a "Company:" line, the first "... Pty Ltd" that is
// not the principal contractor, or else the first ABN. '' when none is found. Never stored: only its
// fingerprint is (orgKey).
function documentCompany(text, swms = {}) {
  const top = String(text || '').slice(0, 4000);
  const builder = plainCompany(swms.principalContractor);
  const labelled = LABELLED.exec(top);
  if (labelled && plainCompany(labelled[1]) && plainCompany(labelled[1]) !== builder) return { name: labelled[1].trim(), key: plainCompany(labelled[1]) };
  for (const match of top.matchAll(PTY)) {
    const key = plainCompany(match[1]);
    if (key && key !== builder) return { name: match[1].trim(), key };
  }
  const abn = ABN_NUMBER.exec(top);
  return abn ? { name: '', key: `abn:${abn[1].replace(/\D/g, '')}` } : { name: '', key: '' };
}
const orgKey = (company) => (company.key ? crypto.createHmac('sha256', checkedSwmsKey()).update(company.key).digest('hex') : '');

// ---- De-identifying ----

// What the control learning scrubber does not catch in a whole document: a suburb with its state and
// postcode, post office boxes, ACN and ABN numbers, licence and card numbers, and web addresses.
const STATES = 'QLD|NSW|VIC|SA|WA|TAS|NT|ACT|Qld|Vic|Tas|Queensland|Victoria|Tasmania';
const POSTAL = new RegExp(`\\b(?:[A-Z][A-Za-z'-]+\\s+){0,3}(?:${STATES})\\.?,?\\s+\\d{4}\\b`, 'g');
const PO_BOX = /\b(?:PO|P\.O\.|Post Office)\s*Box\s+\d+\b/gi;
const COMPANY_NUMBER = /\b(A[BC]N|ARBN)\s*:?\s*\d[\d\s]{7,13}\d\b/g;
const LICENCE = /\b(licen[cs]e|lic\.?|ticket|card|registration|reg\.?)(\s*(?:no\.?|number|#)?\s*:?\s*)[A-Z]{0,4}\d[\dA-Z-]{3,}\b/gi;
const WEB = /\b(?:https?:\/\/|www\.)[^\s|,;]+/gi;
function extraPatterns(text) {
  return String(text || '')
    .replace(WEB, '[web]')
    .replace(PO_BOX, '[address]')
    .replace(COMPANY_NUMBER, '$1 [number]')
    .replace(LICENCE, '$1$2[number]')
    .replace(POSTAL, '[address]');
}

// The names the document itself gives: its business, the principal contractor, the people responsible,
// and the site, with the uploading business's own, taken out wherever they appear.
function documentTerms(swms, company, uploader) {
  const people = [swms.responsiblePerson, ...(swms.steps || []).map((step) => step.responsible)];
  return accountTerms({
    businesses: [company.name, swms.principalContractor, uploader && uploader.name].map((v) => String(v || '').trim()).filter(Boolean),
    people: people.map((v) => String(v || '').trim()).filter(Boolean),
    places: [swms.siteAddress, uploader && uploader.address].map((v) => String(v || '').trim()).filter(Boolean),
  });
}

// The whole text, line by line, with personal details taken out.
function deidentifyText(text, terms) {
  return String(text || '').split('\n').map((line) => deidentify(extraPatterns(line), '', terms)).join('\n');
}
const deidentifyLine = (text, terms) => scrub(extraPatterns(text), '', terms);

// ---- How a line compares with the library ----

const STOP = new Set(('the a an and or to of for in on at by with from into onto all any new existing then its their is are be been being '
  + 'must will shall should may can as that this these those they it if when where while before after during not no only each every other '
  + 'such than there here have has had our your we you use used using work works working worker workers person persons people site area '
  + 'name address phone email number web').split(' '));
const stem = (word) => word.replace(/(?:ies)$/, 'y').replace(/(?:ing|ed|es|s)$/, '').replace(/e$/, '');
const wordsOf = (text) => new Set((String(text || '').toLowerCase().match(/[a-z][a-z'-]*/g) || []).filter((word) => word.length > 2 && !STOP.has(word)).map(stem));
const likeness = (a, b) => {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return (2 * shared) / (a.size + b.size);
};
// A line is taken as one the library has when it shares at least half its words with one library
// line (Dice). Set by reading lines either side of it from the 79 real SWMS readings held: at 0.5,
// "Wear high visibility vests" and "Keep clear of machinery" match their library lines; below it,
// most are different controls on the same topic. 17% of those SWMS's control lines reach it.
const IN_LIBRARY = 0.5;
// Below this, the nearest library step is not shown: the line is like nothing in the library.
const NEAR_STEP = 0.25;

let library = null;
function libraryIndex() {
  if (library) return library;
  const { ACTIVITIES } = require('./activities');
  const { TRADES } = require('./trades');
  const tradeOf = new Map();
  for (const trade of TRADES) if (trade && trade.kinds) for (const kind of trade.kinds) if (!tradeOf.has(kind)) tradeOf.set(kind, trade.id);
  const entries = [];
  const postings = new Map();
  const seen = new Set();
  for (const activity of ACTIVITIES) {
    for (const step of activity.steps || []) {
      const texts = [step.step, ...(step.hazards || []), ...(step.controls || []).map((item) => (typeof item === 'string' ? item : item && item.text))];
      for (const text of texts) {
        if (typeof text !== 'string' || !text.trim()) continue;
        const key = `${step.step}\n${text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const index = entries.length;
        const words = wordsOf(text);
        entries.push({ words, step: step.step, trade: tradeOf.get(activity.when) || '' });
        for (const word of words) {
          if (!postings.has(word)) postings.set(word, []);
          postings.get(word).push(index);
        }
      }
    }
  }
  library = { entries, postings };
  return library;
}

// The library line most like this one: how alike (0 to 1), its step and its trade.
function nearest(text) {
  const { entries, postings } = libraryIndex();
  const words = wordsOf(text);
  const candidates = new Set();
  for (const word of words) for (const index of postings.get(word) || []) candidates.add(index);
  let best = { likeness: 0, step: '', trade: '' };
  for (const index of candidates) {
    const score = likeness(words, entries[index].words);
    if (score > best.likeness) best = { likeness: score, step: entries[index].step, trade: entries[index].trade };
  }
  return best;
}

// Each step, hazard and control of the check's reading as a de-identified line, with its nearest
// library step. A line the document repeats is kept once.
function linesOf(swms, terms) {
  const out = [];
  const seen = new Set();
  for (const step of swms.steps || []) {
    const stepName = deidentifyLine(step.step, terms).slice(0, 300);
    const items = [['step', step.step], ...(step.hazards || []).map((text) => ['hazard', text]), ...(step.controls || []).map((text) => ['control', text])];
    for (const [kind, raw] of items) {
      const line = deidentifyLine(raw, terms);
      const key = gapKey(line);
      if (!key || seen.has(`${kind}\n${key}`)) continue;
      seen.add(`${kind}\n${key}`);
      const near = nearest(line);
      out.push({ kind, step: stepName, line, key, libraryStep: near.likeness >= NEAR_STEP ? near.step : '', likeness: Math.round(near.likeness * 100) / 100, inLibrary: near.likeness >= IN_LIBRARY, trade: near.trade });
    }
  }
  return out;
}

// The trade, where most of the lines like library lines belong to one trade's kinds of work.
function tradeOf(lines) {
  const counts = new Map();
  const near = lines.filter((line) => line.trade && line.likeness >= 0.4);
  for (const line of near) counts.set(line.trade, (counts.get(line.trade) || 0) + 1);
  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return top && top[1] >= 3 && top[1] / near.length >= 0.4 ? top[0] : '';
}

// ---- Keeping a checked document ----

const TYPES = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword', txt: 'text/plain; charset=utf-8', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

// The original as uploaded: the file's bytes, or the pasted text.
function originalOf(body) {
  if (typeof body.text === 'string' && body.text.trim()) {
    const text = body.text.replace(/\r\n?/g, '\n').trim();
    return { source: 'pasted', name: 'pasted.txt', type: TYPES.txt, data: Buffer.from(text, 'utf8') };
  }
  const file = body.file && typeof body.file === 'object' ? body.file : {};
  const name = String(file.name || 'document').replace(/[\r\n"\\/]+/g, ' ').trim().slice(0, 200) || 'document';
  const extension = (/\.([a-z0-9]+)$/i.exec(name) || [])[1];
  return { source: 'file', name, type: TYPES[String(extension || '').toLowerCase()] || 'application/octet-stream', data: Buffer.from(String(file.data || ''), 'base64') };
}

// What is kept of the check's result: the score, band, findings and lines not found. Not the email,
// which carries the names typed for it.
const resultKept = (result) => ({
  score: result.score, band: result.band, hardFails: result.hardFails || [], state: result.state || '', task: result.task || '',
  findings: (result.findings || []).map((item) => ({ rule: item.rule, title: item.title, hard: item.hard, pass: item.pass, points: item.points, max: item.max, message: item.message })),
  notFound: result.notFound || [],
});

// Keeps one checked document. body: the request (file or text, and keep: false for "Do not keep");
// text: the text read, sign-ons taken out; swms: the check's reading; result: the check. Returns null
// when keeping is off (the check's answer then says nothing about it), else { kept, note }.
// Never throws: a failure to keep does not fail the check.
async function keepChecked({ body = {}, text = '', swms = {}, result = {}, company = null, user = null, now = new Date() } = {}) {
  if (!enabled() || !db.enabled()) return null;
  if (body.keep === false || body.keep === 'no') return { kept: false, note: NOT_KEPT_ASKED };
  if (!company || company.industry_opt_out) return { kept: false, note: NOT_KEPT_OPTED_OUT };
  try {
    const original = originalOf(body);
    if (!original.data.length || original.data.length > MAX_UPLOAD_BYTES) return { kept: false, note: 'This document was not kept: it is too large.' };
    const hash = sha256(original.data);
    const uploader = async (id) => db.query('INSERT INTO checked_swms_uploaders (swms_id, company_id, user_id, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT (swms_id, company_id) DO NOTHING', [id, company.id, user ? String(user.id) : '', now]);
    const again = async () => {
      const found = await db.one('SELECT id FROM checked_swms WHERE content_hash = $1', [hash]);
      if (!found) return null;
      await db.query('UPDATE checked_swms SET checks = checks + 1, last_checked_at = $1 WHERE id = $2', [now, found.id]);
      await uploader(found.id);
      return { kept: true, duplicate: true, note: KEPT };
    };
    const known = await again();
    if (known) return known;

    const id = crypto.randomBytes(16).toString('hex');
    const author = documentCompany(text, swms);
    const terms = documentTerms(swms, author, company);
    const lines = linesOf(swms, terms);
    const state = String(result.state || swms.state || '').toLowerCase().slice(0, 10);
    const trade = tradeOf(lines);
    const month = monthOf(now);
    try {
      await db.query(
        `INSERT INTO checked_swms (id, content_hash, source, file_name, file_type, file_bytes, storage, storage_note, text, result, score, band, state, trade, month, checks, created_at, last_checked_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'none', '', $7, $8, $9, $10, $11, $12, $13, 1, $14, $14)`,
        [id, hash, original.source, original.name, original.type, original.data.length, String(text).slice(0, 400000), JSON.stringify(resultKept(result)),
          Number.isFinite(result.score) ? Math.round(result.score) : null, String(result.band || ''), state, trade, month, now],
      );
    } catch (error) {
      // The same document kept at the same moment by another check.
      const raced = await again();
      if (raced) return raced;
      throw error;
    }
    await uploader(id);
    let stored;
    try {
      stored = await store.putFile(id, original.data, original.type);
    } catch (error) {
      stored = { storage: 'none', note: `Original not kept: ${error.message}` };
    }
    await db.query('UPDATE checked_swms SET storage = $1, storage_note = $2 WHERE id = $3', [stored.storage, stored.note, id]);

    const org = orgKey(author);
    await db.query('INSERT INTO checked_swms_learning (swms_id, month, state, trade, org_key, text, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, month, state, trade, org, deidentifyText(text, terms).slice(0, 400000), now]);
    for (const [index, line] of lines.entries()) {
      await db.query(
        `INSERT INTO checked_swms_lines (id, swms_id, month, org_key, kind, step, line, line_key, library_step, likeness, in_library)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [`${id}-${index}`, id, month, org, line.kind, line.step, line.line, line.key, line.libraryStep, line.likeness, line.inLibrary],
      );
    }
    return { kept: true, duplicate: false, note: KEPT };
  } catch (error) {
    // Logged by its message only: never a name, a line or the document.
    console.warn(`Keeping a checked SWMS failed: ${error.message}`);
    return { kept: false, note: 'This document could not be kept just now.' };
  }
}

// ---- The owner's view (admin.js): list, open, download, delete ----

async function list({ limit = 100 } = {}) {
  const rows = await db.query('SELECT id, source, file_name, file_type, file_bytes, storage, score, band, state, trade, month, checks, created_at, last_checked_at FROM checked_swms ORDER BY created_at DESC LIMIT $1', [limit]);
  const uploaders = await db.query('SELECT swms_id, company_id FROM checked_swms_uploaders');
  const count = new Map();
  for (const row of uploaders) count.set(row.swms_id, (count.get(row.swms_id) || 0) + 1);
  const total = await db.one('SELECT COUNT(*) AS n, COALESCE(SUM(file_bytes), 0) AS bytes FROM checked_swms');
  return {
    keeping: enabled(),
    bucket: store.bucketConfigured(),
    years: retentionYears(),
    total: Number(total.n),
    bytes: Number(total.bytes),
    documents: rows.map((row) => ({
      id: row.id, source: row.source, fileName: row.file_name, fileType: row.file_type, bytes: row.file_bytes, storage: row.storage,
      score: row.score, band: row.band, state: row.state, trade: row.trade, month: row.month, checks: row.checks,
      businesses: count.get(row.id) || 0, keptAt: row.created_at, lastCheckedAt: row.last_checked_at,
    })),
  };
}

async function view(id) {
  const row = await db.one('SELECT * FROM checked_swms WHERE id = $1', [id]);
  if (!row) return null;
  const uploaders = await db.query('SELECT u.company_id, u.user_id, u.created_at, c.id AS company_found, c.name AS company_name, p.email FROM checked_swms_uploaders u LEFT JOIN companies c ON c.id = u.company_id LEFT JOIN users p ON p.id = u.user_id WHERE u.swms_id = $1 ORDER BY u.created_at', [id]);
  const learning = await db.one('SELECT text, org_key FROM checked_swms_learning WHERE swms_id = $1', [id]);
  const lines = await db.query('SELECT kind, step, line, library_step, likeness, in_library FROM checked_swms_lines WHERE swms_id = $1', [id]);
  return {
    id: row.id, source: row.source, fileName: row.file_name, fileType: row.file_type, bytes: row.file_bytes, storage: row.storage, storageNote: row.storage_note,
    score: row.score, band: row.band, state: row.state, trade: row.trade, month: row.month, checks: row.checks, keptAt: row.created_at, lastCheckedAt: row.last_checked_at,
    result: JSON.parse(row.result || '{}'),
    text: row.text,
    uploaders: uploaders.map((item) => ({ companyId: item.company_id, companyName: item.company_found ? item.company_name || '(no name)' : '(account deleted)', email: item.email || '', uploadedAt: item.created_at })),
    learning: { text: learning ? learning.text : '', organisationKnown: Boolean(learning && learning.org_key) },
    lines: lines.sort((a, b) => Number(a.in_library) - Number(b.in_library)).map((line) => ({ kind: line.kind, step: line.step, line: line.line, libraryStep: line.library_step, likeness: Number(line.likeness), inLibrary: Boolean(line.in_library) })),
  };
}

async function original(id) {
  const row = await db.one('SELECT id, file_name, file_type, storage FROM checked_swms WHERE id = $1', [id]);
  if (!row) return null;
  const data = await store.getFile(row.id, row.storage);
  return data ? { name: row.file_name, type: row.file_type, data } : { name: row.file_name, type: row.file_type, data: null };
}

// Deletes one kept document and everything kept for it: its original, uploaders, learning copy and
// lines, and the owner's access log entries about it. Safe to run again.
async function removeDocument(id) {
  const row = await db.one('SELECT id, storage FROM checked_swms WHERE id = $1', [id]);
  if (!row) return false;
  await store.removeFile(row.id, row.storage);
  await db.query('DELETE FROM checked_swms_lines WHERE swms_id = $1', [id]);
  await db.query('DELETE FROM checked_swms_learning WHERE swms_id = $1', [id]);
  await db.query('DELETE FROM checked_swms_uploaders WHERE swms_id = $1', [id]);
  await db.query("DELETE FROM admin_access_log WHERE action IN ('checked_swms_view', 'checked_swms_original') AND target = $1", [id]);
  await db.query('DELETE FROM checked_swms WHERE id = $1', [id]);
  return true;
}

// A deleted business's documents: its uploads go, and each document no other business uploaded too.
// Returns how many documents were deleted.
async function removeForCompany(companyId) {
  const ids = (await db.query('SELECT swms_id FROM checked_swms_uploaders WHERE company_id = $1', [companyId])).map((row) => row.swms_id);
  let removed = 0;
  // Each document first, then the uploads, so a delete stopped part way still finds them when run again.
  for (const id of ids) {
    const others = await db.one('SELECT swms_id FROM checked_swms_uploaders WHERE swms_id = $1 AND company_id <> $2 LIMIT 1', [id, companyId]);
    if (!others && await removeDocument(id)) removed += 1;
  }
  await db.query('DELETE FROM checked_swms_uploaders WHERE company_id = $1', [companyId]);
  return removed;
}

// Documents last checked longer ago than the retention period are deleted, whatever the setting is now.
async function removeOld(now = new Date()) {
  if (!db.enabled()) return 0;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - Math.round(retentionYears() * 12));
  const old = await db.query('SELECT id FROM checked_swms WHERE last_checked_at < $1', [cutoff]);
  for (const row of old) await removeDocument(row.id);
  return old.length;
}

// ---- The monthly learning report's section (goal 11, and goal 5 evidence) ----

const GROUPS_SHOWN = 40;
const LINES_SHOWN = 15;
const NO_STEP = '(like no library step)';

// Real SWMS checked in the month, and the lines in them SiteWrite's library does not have, grouped by
// the library step each is most like. Each line is counted by the different documents and the different
// organisations (by fingerprint) it appears in, from every document up to the end of the month.
// null when keeping is off and nothing was ever kept, so the report is as before.
async function monthSection(month) {
  const docs = await db.query('SELECT swms_id, month, org_key FROM checked_swms_learning WHERE month <= $1', [month]);
  if (!enabled() && !docs.length) return null;
  const thisMonth = docs.filter((row) => row.month === month);
  const rows = await db.query('SELECT swms_id, month, org_key, kind, line, line_key, library_step, in_library FROM checked_swms_lines WHERE month <= $1', [month]);
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.kind}\n${row.line_key}`;
    const entry = groups.get(key) || { kind: row.kind, docs: new Set(), orgs: new Set(), thisMonth: new Set(), wordings: new Map(), steps: new Map(), inLibrary: false };
    entry.docs.add(row.swms_id);
    if (row.org_key) entry.orgs.add(row.org_key);
    if (row.month === month) entry.thisMonth.add(row.swms_id);
    entry.wordings.set(row.line, (entry.wordings.get(row.line) || 0) + 1);
    entry.steps.set(row.library_step || NO_STEP, (entry.steps.get(row.library_step || NO_STEP) || 0) + 1);
    entry.inLibrary = entry.inLibrary || row.in_library === true;
    groups.set(key, entry);
  }
  const most = (counts) => [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0][0];
  const candidates = [...groups.values()].filter((entry) => entry.thisMonth.size && !entry.inLibrary).map((entry) => ({
    kind: entry.kind,
    line: deidentify(most(entry.wordings)),
    libraryStep: most(entry.steps),
    documents: entry.docs.size,
    organisations: entry.orgs.size,
    twoOrganisations: entry.orgs.size >= 2,
  }));
  const byStep = new Map();
  for (const item of candidates) {
    if (!byStep.has(item.libraryStep)) byStep.set(item.libraryStep, []);
    byStep.get(item.libraryStep).push(item);
  }
  const order = (a, b) => b.organisations - a.organisations || b.documents - a.documents || a.kind.localeCompare(b.kind) || a.line.localeCompare(b.line);
  const stepGroups = [...byStep.entries()].map(([step, items]) => ({ step, total: items.length, lines: items.sort(order).slice(0, LINES_SHOWN) }))
    .sort((a, b) => (a.step === NO_STEP) - (b.step === NO_STEP) || b.total - a.total || a.step.localeCompare(b.step));
  return {
    title: 'Real SWMS checked',
    recording: enabled(),
    recordingNote: enabled() ? 'Keeping checked SWMS is on.' : 'Keeping checked SWMS is off: nothing new is kept.',
    checkedThisMonth: thisMonth.length,
    organisationsThisMonth: new Set(thisMonth.map((row) => row.org_key).filter(Boolean)).size,
    documentsToDate: docs.length,
    organisationsToDate: new Set(docs.map((row) => row.org_key).filter(Boolean)).size,
    newLines: candidates.length,
    twoOrganisationLines: candidates.filter((item) => item.twoOrganisations).length,
    groups: stepGroups.slice(0, GROUPS_SHOWN),
    groupsNotShown: Math.max(0, stepGroups.length - GROUPS_SHOWN),
    method: [
      `Real SWMS checked this month: documents first kept in ${month} (a document checked again is kept once). Lines that SiteWrite's library does not have: each job step, hazard and control in those documents that shares less than ${Math.round(IN_LIBRARY * 100)}% of its words with every library line.`,
      'Lines are grouped by the same words whatever their order, endings and small words, and placed under the library step whose line they are most like.',
      'Documents and organisations count every kept document up to the end of the month. An organisation is the business the SWMS names as its own, known only by a keyed fingerprint; a document whose business cannot be read counts as a document but not as an organisation.',
      'A line in two or more organisations\' documents meets the two-organisation part of the goal 5 evidence rule. It becomes a library line only with a person\'s check that the documents genuinely say it (D181), the goal 5 evidence test and the line check. This report never changes the library.',
      'Every line has names, phone numbers, emails, ABNs and addresses taken out, and is passed through the scrubber again before it is shown.',
    ],
  };
}

function sectionMarkdown(section) {
  const cell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
  const out = [`## ${section.title}`, '', `**${section.recordingNote}**`, ''];
  out.push(`Real SWMS checked this month: ${section.checkedThisMonth} (from ${section.organisationsThisMonth} organisation${section.organisationsThisMonth === 1 ? '' : 's'}). Kept to date: ${section.documentsToDate} from ${section.organisationsToDate} organisation${section.organisationsToDate === 1 ? '' : 's'}.`, '');
  out.push(`Lines that SiteWrite's library does not have: ${section.newLines}, of which ${section.twoOrganisationLines} appear in two or more organisations' documents.`, '');
  for (const group of section.groups) {
    out.push(`### ${group.step} (${group.total})`, '');
    out.push('| Kind | Line | Documents | Organisations | Two organisations |', '|---|---|---|---|---|');
    for (const item of group.lines) out.push(`| ${cell(item.kind)} | ${cell(item.line)} | ${item.documents} | ${item.organisations} | ${item.twoOrganisations ? 'Yes' : 'No'} |`);
    if (group.total > group.lines.length) out.push('', `${group.total - group.lines.length} more not shown.`);
    out.push('');
  }
  if (section.groupsNotShown) out.push(`${section.groupsNotShown} more library steps not shown.`, '');
  for (const line of section.method) out.push(`- ${line}`);
  out.push('');
  return out.join('\n');
}

module.exports = {
  enabled, uploadNotice, keepChecked, list, view, original, removeDocument, removeForCompany, removeOld, monthSection, sectionMarkdown,
  documentCompany, deidentifyText, linesOf, nearest, retentionYears, NOTICE, RETENTION_YEARS, MAX_UPLOAD_BYTES, IN_LIBRARY,
};
