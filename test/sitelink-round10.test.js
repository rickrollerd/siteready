// SiteLink fixes from messy round 10 (17 October 2026, staging 0e3e946). Made-up companies, people and
// sites only. No paid AI reading: the stand-in client answers with a made-up mechanical reading.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.RATE_LIMIT_HSE_REQUESTS = '5000';
process.env.RATE_LIMIT_AI_SCOPE_REQUESTS = '1000';
process.env.RATE_LIMIT_MAX_REQUESTS = '5000';
process.env.RATE_LIMIT_LIST_REQUESTS = '5000';
process.env.RATE_LIMIT_LIST_SENDS = '1000';
process.env.RATE_LIMIT_WORD_REQUESTS = '30000';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { app } = require('../server');
const db = require('../db');
const send = require('../sitelink-send');
const handover = require('../handover');
const subbieRoutes = require('../sitelink-subbie');
const aiScope = require('../ai-scope');
const abnRegister = require('../abn');
const { validAbn } = require('../accounts');
const draft = require('../draft');
const { prepareDraft } = require('../draft');
const { draftBody } = require('../input');
const { notApplyLines } = require('../docx-draft');
const { checkSwms, fromDraft } = require('../builder-check');
const { findState } = require('../legislation');
const { setupAccounts, mailbox, lastLinkToken, ANSWERED, ready, checked } = require('./helpers');

abnRegister.lookupAbn = async () => ({ enabled: false });
let abnSeed = 81729374000;
function nextAbn() {
  for (abnSeed += 89; ; abnSeed += 1) if (validAbn(String(abnSeed))) return String(abnSeed);
}
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

// A made-up mechanical reading, shaped like round 10's: a bare "Mechanical services" main SWMS, the
// switchroom work folded into it, discharge and intake points with no high risk work (set aside), and
// penetrations with a flashing note beside an access panels point.
const row = (activity, pack, clause, quote, unknowns = '', extra = {}) => ({ activity, type: 'Site work', package: pack, crew: 'Mechanical fitters', clause, quotes: [quote], where: '', plant: '', conditions: '', unknowns, matrixColumn: '', ...extra });
const READING = {
  activities: [
    row('Install ductwork, pipework and dampers', 'Mechanical services', 'Specific Inclusions 2b, 4', 'Install ductwork, pipework and dampers on levels 1 and 2.'),
    row('Install ductwork fittings and duct access doors', 'Mechanical services', 'Specific Inclusions 2c, 2d', 'Install ductwork fittings and duct access doors.'),
    row('Install access panels in ductwork', 'Mechanical services', 'Specific Inclusions 16', 'Install access panels in ductwork.'),
    row('Apply protective coating to copper pipework passing through concrete walls', 'Mechanical services', 'Specific Inclusions 7', 'Apply protective coating to copper pipework passing through concrete walls.'),
    row('Install air conditioning units in the switchroom and comms room', 'Trade installation: switchroom and comms room', 'Installation 5', 'Install air conditioning units in the switchroom and comms room.'),
    row('Install weather louvres at the discharge and intake points', 'Trade installation: discharge and intake points', 'Installation 9', 'Install weather louvres at the discharge and intake points.'),
    row('Install over flashings to penetrations through the building structure', 'Penetrations and core drilling', 'Installation 21', 'Install over flashings to penetrations through the building structure.', 'The flashing standard is to be directed by the Principal. Exclusion 6 excludes over flashing of mechanical penetrations through the roof.'),
    row('Cut and form penetrations and core holes in slabs and walls', 'Penetrations and core drilling', 'Installation 28', 'Cut and form penetrations and core holes in slabs and walls.', 'Access panels through ceilings and walls are excluded (Exclusion 1). Confirm who supplies and installs them.'),
  ],
  byOthers: [],
  conflicts: [],
};
const GROUPS = { 'Mechanical services': ['ductwork'], 'Trade installation: switchroom and comms room': ['ductwork'], 'Trade installation: discharge and intake points': [], 'Penetrations and core drilling': ['coreDrill'] };
const SCOPE = ['Subcontract scope of works: Mechanical services', ...READING.activities.map((one, i) => `1.${i + 1} ${one.quotes[0]}`),
  ...Array(4).fill('The Subcontractor shall carry out the works in accordance with the drawings and specifications, keep the work area tidy, and coordinate its work with other trades on the site at all times.')].join('\n');
const standIn = {
  beta: {
    messages: {
      stream(params) {
        const mapping = Boolean(params.output_config.format.schema.properties.packages);
        const content = params.messages[0].content;
        const body = mapping ? { packages: [...content.matchAll(/^Work package: (.*)$/gm)].map((m) => ({ package: m[1], groups: GROUPS[m[1]] || [], unmatched: [], byOthers: [] })) } : READING;
        return { finalMessage: async () => ({ stop_reason: 'end_turn', model: 'claude-opus-5-5', usage: { input_tokens: 1000, output_tokens: 500 }, content: [{ type: 'text', text: JSON.stringify(body) }] }) };
      },
    },
  },
};

let server;
let base;
test.before(async () => {
  await setupAccounts();
  process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
  aiScope.useClient(standIn);
  server = app.listen(0);
  server.keepAliveTimeout = 120000;
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => {
  aiScope.useClient(null);
  delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENROUTER_API_KEY;
  server.close();
});

async function call(method, route, { body, reviewer, session } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(reviewer ? { 'X-Reviewer-Token': reviewer } : {}), ...(session ? { Authorization: `Bearer ${session}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = response.headers.get('content-type') || '';
  return { status: response.status, data: type.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()) };
}
function inDays(days) {
  const day = new Date(`${send.todayIn('nsw')}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}
async function leadSignIn(email) {
  assert.equal((await call('POST', '/api/hse/email', { body: { email } })).status, 200);
  const text = [...mailbox].reverse().find((item) => item.to === email).text;
  const token = /\/sitelink\?login=([A-Za-z0-9_-]+)/.exec(text)[1];
  const { data } = await call('POST', '/api/hse/verify', { body: { token } });
  assert.equal((await call('PUT', '/api/hse/me', { reviewer: data.token, body: { name: 'Jessie Orde', position: 'HSE manager', phone: '0412 555 012' } })).status, 200);
  return data.token;
}
const WORKPLACE = '40 Wombat Street, Penrith NSW 2750';
const DETAILS = {
  musterPoint: 'Assembly area at the Wombat Street gate',
  firstAider: 'Priya Nair, site office, 0412 555 019',
  firstAidLocation: 'Site office, ground floor',
  hospital: 'Nepean Hospital, Emergency Department',
  siteManager: 'Ravi Patel, 0412 555 020',
  siteRules: ['Sign in at the site office before starting.'],
};

// A builder's project with a subcontract whose scope is read by the stand-in.
async function readScope(prefix) {
  const lead = await leadSignIn(`lead@${prefix}.example`);
  const org = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: 'Quokka Ridge Builders Pty Ltd', abn: nextAbn() } });
  await db.query("UPDATE orgs SET abn_check = 'verified', abn_verified_at = $1 WHERE id = $2", [new Date(), org.data.org.id]);
  const project = await call('POST', `/api/hse/orgs/${org.data.org.id}/projects`, { reviewer: lead, body: { name: 'Penrith Library Annexe', workplace: WORKPLACE, state: 'nsw' } });
  const projectId = project.data.project.id;
  assert.equal((await call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: lead, body: { baseRev: 0, details: DETAILS } })).status, 200);
  const email = `office@${prefix}-sub.example`;
  const added = await call('POST', `/api/hse/projects/${projectId}/subcontracts`, { reviewer: lead, body: { name: 'Numbat Air Pty Ltd', trade: 'Mechanical', email } });
  const subId = added.data.subcontract.id;
  const sent = await call('POST', `/api/hse/subcontracts/${subId}/scope`, { reviewer: lead, body: { file: { name: 'Mechanical scope.txt', data: Buffer.from(SCOPE).toString('base64') } } });
  assert.ok([200, 202].includes(sent.status), JSON.stringify(sent.data));
  for (let i = 0; i < 300; i += 1) {
    const page = await call('GET', `/api/hse/subcontracts/${subId}`, { reviewer: lead });
    if (page.data.reading.status !== 'reading') return { lead, projectId, subId, page: page.data, email };
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
  throw new Error('the reading did not finish');
}
async function subbie(email, name) {
  assert.equal((await call('POST', '/api/auth/email', { body: { email } })).status, 200);
  const { data } = await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } });
  assert.equal((await call('PUT', '/api/company', { session: data.token, body: { name, abn: nextAbn(), address: '4 Numbat Lane, Penrith NSW 2750', phone: '02 4555 0100', email } })).status, 200);
  return data.token;
}
// The list sent and taken up by the subcontractor.
async function claimed(prefix) {
  const s = await readScope(prefix);
  const due = inDays(14);
  const preview = await call('POST', `/api/hse/subcontracts/${s.subId}/send/preview`, { reviewer: s.lead, body: { due } });
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  assert.equal((await call('POST', `/api/hse/subcontracts/${s.subId}/send`, { reviewer: s.lead, body: { due, check: preview.data.preview.check } })).status, 200);
  const token = /\/list\.html\?t=([A-Za-z0-9_-]+)/.exec(mailbox.filter((item) => item.to === s.email).pop().text)[1];
  const office = await subbie(`admin@${prefix}-sub.example`, 'Numbat Air Pty Ltd');
  assert.equal((await call('POST', `/api/list/${token}/claim`, { session: office })).status, 200);
  const { list } = (await call('GET', `/api/from-builders/${s.subId}`, { session: office })).data;
  return { ...s, office, list };
}
const logOf = async (c) => (await call('GET', `/api/hse/subcontracts/${c.subId}`, { reviewer: c.lead })).data.sending.log.map((entry) => entry.text);

// ---- Blocker 1: high risk work the subcontractor marked "Does not apply", shown to the builder ----

const BALANCING = { state: 'nsw', task: 'Balance and commission the a/c systems, working from a scissor lift on level 2.', fallRisk: 'no', residential: 'no', crane: 'none', facts: { plantIsolation: 'Each unit is isolated at its local isolator and locked out.', energisedWork: 'none' } };
const PLANT_OFF = [{ id: 'plant', reason: 'no plant moves where we balance, scissor lift is parked' }];

test('high risk work marked "Does not apply" reaches the builder as the subcontractor\'s call, with its reason (blocker 1)', async () => {
  const input = ready({ ...ANSWERED, ...BALANCING, highRiskOff: PLANT_OFF });
  const out = prepareDraft(draftBody(input));
  assert.equal(out.kind, 'draft');
  assert.deepEqual(out.highRiskNotApply.map((item) => item.id), ['plant']);
  // The printed line starts its reason with a capital (wording 8).
  assert.match(notApplyLines(out)[0], /^Does not apply \(our call\): .*movement of powered mobile plant\. Reason: No plant moves where we balance, scissor lift is parked\.$/);
  // Builder check names it, with its reason, beside the work it does list.
  const check = checkSwms(fromDraft(out, { state: 'nsw' }), { state: 'nsw' });
  const h1 = check.findings.find((item) => item.rule === 'H1');
  assert.match(h1.message, /Marked "Does not apply" by the SWMS writer: .*movement of powered mobile plant \(reason: No plant moves where we balance, scissor lift is parked\)\./);
  // The builder's read-only view prints it the same way, named as the subcontractor's call.
  const review = read('public/review.js');
  assert.match(review, /Does not apply \(\$\{esc\(callBy\(draft\)\)\}'s call\):/);
  assert.match(review, /\$\{ourCall\(draft\)\}/);
  assert.match(review, /High risk work is marked "Does not apply" by the SWMS writer: see H1 under Findings\./);
});

// ---- Blocker 2: a note settled by an answer on another subject; the notes in the lead's preview ----

test('a scope note is settled only by an answer that shares its subject words, not filler or the work\'s own words (blocker 2)', () => {
  const said = [{ activity: 'Cut and form penetrations and core holes in slabs and walls', question: 'Access panels through ceilings and walls are excluded (Exclusion 1). Confirm who supplies and installs them.', answer: 'The ceiling contractor supplies and installs them.' }];
  const flashing = { text: 'The flashing standard is to be directed by the Principal. Exclusion 6 excludes over flashing of mechanical penetrations through the roof.', clause: '' };
  const panels = { text: 'The access panels in the ceilings are not shown on the drawings.', clause: '' };
  const out = subbieRoutes.withSettled({ draftNotes: [flashing, panels] }, said).draftNotes;
  assert.equal(out[0].settled, undefined, 'the flashing note is not settled by the access panels answer');
  assert.equal(out[1].settled, said[0].answer, 'a note on the access panels is');
  // Rounds 8 and 9 still settle as before.
  const cctv = subbieRoutes.withSettled({ draftNotes: [{ text: 'CCTV and Duress are listed as exclusions.', clause: '2.3' }] }, [{ activity: 'a', question: 'Whether cable management for access control, CCTV and duress is in this scope?', answer: 'Yes, it is in this scope.' }]);
  assert.equal(cctv.draftNotes[0].settled, 'Yes, it is in this scope.');
});

test('the lead\'s preview shows each SWMS\'s scope notes, with the answer that settles one (blocker 2)', async () => {
  const s = await readScope('r10notes');
  const point = s.page.points.find((one) => /Access panels/.test(one.question));
  assert.ok(point, JSON.stringify(s.page.points));
  const saved = await call('PUT', `/api/hse/subcontracts/${s.subId}/points/${point.id}`, { reviewer: s.lead, body: { answer: 'the ceiling contractor supplies and installs them' } });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  const pen = saved.data.preview.swms.find((item) => /Penetrations/.test(item.title));
  assert.ok(pen.notes.some((note) => /flashing standard/.test(note.text) && !note.settled), JSON.stringify(pen.notes));
  // The answer has its full stop (wording 7).
  assert.equal(saved.data.preview.answers[0].answer, 'The ceiling contractor supplies and installs them.');
  const page = read('public/hse.js');
  assert.match(page, /\$\{notesBlock\(item\.notes, p\.from\)\}/);
});

// ---- Blocker 3: a building's riser shaft is not an excavated shaft ----

test('a shaft named beside risers is a building\'s services shaft, not a trench or shaft deeper than 1.5 m (blocker 3)', () => {
  const state = findState('nsw');
  const ids = (text) => draft.highRiskMatches(text, 'no', state).map((item) => item.id);
  assert.deepEqual(ids('Install structural bracing and support for shaft and riser containment. Shafts / risers.'), []);
  assert.deepEqual(ids('Install the duct risers in the shafts and risers on each level.'), []);
  // A dug shaft is still one.
  assert.ok(ids('Excavate a 2.5 m deep shaft for the pump station.').includes('trench'));
  assert.ok(ids('Dig a shaft and riser for the pump station.').includes('trench'));
  // The scope reading says so too.
  const flag = draft.screenHighRisk({ state: 'nsw', task: 'Install ductwork and fan coil units. Install structural bracing and support for shaft and riser containment.' });
  assert.ok(!flag.categories.some((item) => item.id === 'trench'), JSON.stringify(flag));
});

// ---- Blocker 4: every site answer given once for the project ----

test('no site answer given once for every SWMS brings high risk work, steps or plant of its own (blocker 4)', () => {
  const task = 'Install ductwork and grilles in the ceiling space on level 1.';
  const answers = {
    access: 'scissor lift on the slab, forklift deliveries through the loading dock',
    publicInterface: 'footpath next to Wombat Street, a busy road',
    otherTrades: 'excavator and trucks working nearby',
    liveServices: 'overhead power lines along the street',
    ground: 'open trenches 2 m deep along the boundary',
  };
  for (const [field, text] of Object.entries(answers)) {
    const base = { ...ANSWERED, state: 'nsw', task, fallRisk: 'no', residential: 'no', crane: 'none', site: { ...ANSWERED.site, [field]: text } };
    const own = prepareDraft(draftBody(ready(base)));
    assert.ok(Object.values(own.highRiskFrom || {}).some((where) => /answer$/.test(where)), `${field}: its own answer still counts`);
    const shared = prepareDraft(draftBody(ready({ ...base, siteShared: true })));
    assert.equal(shared.kind, 'draft');
    assert.deepEqual(Object.values(shared.highRiskFrom || {}).filter((where) => /answer$/.test(where)), [], `${field}: ${JSON.stringify(shared.highRiskFrom)}`);
    const steps = (shared.jobSteps || []).map((step) => step.step).join('; ');
    assert.doesNotMatch(steps, /elevating work platform|power lines|trench/i, `${field}: ${steps}`);
    assert.ok(!(shared.plant || []).some((item) => /Elevating|Scissor|Forklift/.test(item.item)), `${field}: ${JSON.stringify(shared.plant)}`);
  }
  // A SWMS that changed one answer for itself (its Ground) still has the others as the project gave them:
  // those bring nothing (the round 10 office changed an answer on one draft, and the shared Access answer
  // then counted as its own). Its own changed answer still counts.
  const site = { liveServices: 'none', publicInterface: 'none', otherTrades: 'sparkies', ground: 'open trenches 2 m deep beside the plant room', access: 'scissor lift on the slab' };
  const partial = prepareDraft(draftBody(ready({ ...ANSWERED, state: 'nsw', task, fallRisk: 'no', residential: 'no', crane: 'none', site, siteShared: ['liveServices', 'publicInterface', 'otherTrades', 'access'] })));
  assert.deepEqual(Object.values(partial.highRiskFrom || {}), ['your Ground answer'], JSON.stringify(partial.highRiskFrom));
  assert.deepEqual(draftBody({ siteShared: ['access', 'nonsense', 3] }).siteShared, ['access']);
  assert.equal(draftBody({ siteShared: ['nonsense'] }).siteShared, undefined);
  assert.match(read('public/scope.js'), /if \(ids\.length === 5 && !item\.siteOwn\) return true;\n    return ids\.length \? ids : undefined;/);
  // Its own work still brings them: the scissor lift in the task.
  const own = prepareDraft(draftBody(ready({ ...ANSWERED, state: 'nsw', task: 'Install ductwork from a scissor lift on level 2.', fallRisk: 'no', residential: 'no', crane: 'none', siteShared: true })));
  assert.ok(own.highRisk.some((label) => /powered mobile plant/.test(label)));
});

// ---- Blocker 5 and wording 3: "Change the work" against the new words ----

test('"Change the work" keeps folded work the new words name, and the clauses follow what each activity does (blocker 5, wording 3)', async () => {
  const s = await readScope('r10work');
  const main = s.page.items.find((item) => item.group === 'list' && /^Mechanical services/.test(item.title));
  assert.ok(main, s.page.items.map((item) => `${item.group}: ${item.title}`).join(' | '));
  assert.deepEqual(main.alsoCovers, ['Trade installation: switchroom and comms room']);
  const next = (await call('PUT', `/api/hse/subcontracts/${s.subId}/items/${main.id}`, { reviewer: s.lead, body: { task: 'install ductwork, pipework and dampers on levels 1 and 2 and in the switchroom and comms room' } })).data;
  assert.doesNotMatch(next.message, /no longer part of it/);
  const changed = next.items.find((item) => item.id === main.id);
  assert.deepEqual(changed.alsoCovers, ['Trade installation: switchroom and comms room']);
  // The access panels (16) and the copper coating (7) are not named by the new words; the ductwork
  // fittings are. One heading, once (wording 2).
  assert.deepEqual(changed.clauses, ['Specific Inclusions 2b, 4, 2c, 2d']);
  // New words that leave the switchroom out take it out, as before.
  const again = (await call('PUT', `/api/hse/subcontracts/${s.subId}/items/${main.id}`, { reviewer: s.lead, body: { task: 'Install ductwork and dampers on levels 1 and 2.' } })).data;
  assert.match(again.message, /Switchroom and comms room is no longer part of it/);
  assert.equal(handover.activityNamed('Install ductwork.', 'Install access panels in ductwork'), false);
  assert.equal(handover.activityNamed('Install access panels.', 'Install access panels in ductwork'), true);
});

// ---- Blocker 7: every list title is a work title, moved items included ----

test('every SWMS SiteLink lists takes a work title, set aside and folded work included, and keeps it when moved onto the list (blocker 7)', async () => {
  const s = await readScope('r10titles');
  const titles = s.page.items.map((item) => `${item.group}: ${item.title}`);
  assert.ok(titles.includes('list: Mechanical services installation'), titles.join(' | '));
  assert.ok(titles.includes('aside: Discharge and intake points'), titles.join(' | '));
  // Messy round 11, blocker 6: work part of another SWMS shows its work title on the lead's page too.
  assert.ok(!titles.some((title) => /Trade installation:|: Mechanical services$/.test(title)), titles.join(' | '));
  assert.ok(titles.includes('removed: Mechanical installation, switchroom and comms room'), titles.join(' | '));
  // Moved onto the list, the set-aside work keeps its work title, which goes out in the email.
  const aside = s.page.items.find((item) => item.group === 'aside');
  const moved = (await call('PUT', `/api/hse/subcontracts/${s.subId}/items/${aside.id}`, { reviewer: s.lead, body: { removed: false } })).data;
  assert.ok(moved.items.some((item) => item.group === 'list' && item.title === 'Discharge and intake points'));
  // Folded work put back takes the title it would have had on the list.
  const folded = s.page.items.find((item) => item.group === 'removed' && item.title === 'Mechanical installation, switchroom and comms room');
  const back = (await call('PUT', `/api/hse/subcontracts/${s.subId}/items/${folded.id}`, { reviewer: s.lead, body: { removed: false } })).data;
  assert.ok(back.items.some((item) => item.group === 'list' && item.title === 'Mechanical installation, switchroom and comms room'), back.items.map((item) => `${item.group}: ${item.title}`).join(' | '));
  const due = inDays(14);
  const preview = await call('POST', `/api/hse/subcontracts/${s.subId}/send/preview`, { reviewer: s.lead, body: { due } });
  assert.doesNotMatch(JSON.stringify(preview.data), /Trade installation:/);
});

// ---- Wording ----

test('wording: clause headings once, "may not need" said once to the lead, full stops on answers and notes, reasons with capitals (wordings 2, 4, 7, 8, 9)', () => {
  // 2. Each heading once.
  assert.deepEqual(handover.clauseList(['Specific Inclusions 2b, 4', 'Specific Inclusions 2c, 2d, 2e', 'Installation 21', 'Specific Inclusions 7', 'Installation 28', 'Exclusions 3']), ['Specific Inclusions 2b, 4, 2c, 2d, 2e, 7', 'Installation 21, 28']);
  for (const file of ['public/hse.js', 'public/list.js', 'public/project-go.js']) assert.match(read(file), /clauses\.join\('; '\)/, file);
  // 4. Said once, and not "The builder may still ask" to the builder.
  assert.equal(handover.REMOVED_WHY.noLaw, 'No high risk construction work was found in it. Move it to the list if you want a SWMS for it.');
  assert.match(read('public/hse.js'), /const said = item\.group === 'aside' && !\(item\.highRisk && item\.highRisk\.status === 'none'\);/);
  // 7. A point answer ends with a full stop.
  // (messy round 17: with the project's people and "n" and "b4" read too, sitelink-answers.js leadWords).
  assert.match(read('sitelink-scopes.js'), /\{ answer: true \}\), \{ \.\.\.\(await leadNames\(ctx\)\), scopeText: scopeWordsOf\(await itemsOf\(ctx\.sub\.id\)\), stop: true \}\)/);
  // 8. The "our call" reason on the draft page starts with a capital.
  assert.match(read('public/app.js'), /Reason: \$\{esc\(String\(item\.reason\)\.trim\(\)\.replace\(\/\[\.\\s\]\+\$\/, ''\)\.replace\(\/\^\[a-z\]\/,/);
  // 9. A note sent back ends with a full stop on both sides.
  assert.match(read('public/project-go.js'), /\$\{esc\(entry\.backNote\)\}\$\{\/\[\.!\?\]\$\/\.test\(entry\.backNote\) \? '' : '\.'\}/);
  assert.match(read('public/review.js'), /\$\{esc\(entry\.backNote\)\}\$\{\/\[\.!\?\]\$\/\.test\(entry\.backNote\) \? '' : '\.'\}/);
});

// ---- Smaller faults ----

test('taking a SWMS off the list, and putting it back, reach the log both sides see (smaller fault 1)', async () => {
  const c = await claimed('r10off');
  const items = c.list.items.map((item) => ({ ...item, body: null, status: 'todo' }));
  const [first, ...rest] = items;
  const save = (baseVersion, project) => call('PUT', `/api/from-builders/${c.subId}/progress`, { session: c.office, body: { baseVersion, project, page: { state: 'nsw' } } });
  let r = await save(0, { stage: 'questions', current: 0, items: rest, offList: [first] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  let log = await logOf(c);
  assert.ok(log.some((text) => text === `Numbat Air Pty Ltd took ${first.title} off its list in SiteWrite. It is not submitted.`), log.join('\n'));
  // The lead's table says it is off while it is.
  const screen = await call('GET', `/api/hse/projects/${c.projectId}`, { reviewer: c.lead });
  assert.match(JSON.stringify(screen.data), /"state":"off"/);
  r = await save(1, { stage: 'questions', current: 0, items, offList: [] });
  assert.equal(r.status, 200);
  log = await logOf(c);
  assert.ok(log.some((text) => text === `Numbat Air Pty Ltd put ${first.title} back on its list in SiteWrite.`), log.join('\n'));
  // The same save again logs nothing more.
  await save(2, { stage: 'questions', current: 0, items, offList: [] });
  assert.equal((await logOf(c)).filter((text) => /back on its list/.test(text)).length, 1);
  // The subcontractor's own log shows both.
  const own = (await call('GET', `/api/from-builders/${c.subId}`, { session: c.office })).data.sent;
  const ownLog = JSON.stringify(own);
  assert.match(ownLog, /off its list in SiteWrite/);
});

test('a confirmed condition keeps the subcontractor\'s note beside it on both sides (smaller fault 3)', () => {
  for (const file of ['public/review.js', 'public/project-go.js']) {
    const source = read(file);
    const closed = source.slice(source.indexOf("Confirmed by ${esc(entry.closedBy)}") > 0 ? source.indexOf('const conditionsList') - 1200 : source.indexOf('confirmed it on ${esc(entry.closedOn)}') - 400);
    assert.match(closed, /entry\.doneBy \? `<span class="meta">Marked done by \$\{esc\(entry\.doneBy\)\} on \$\{esc\(entry\.doneOn\)\}/, file);
  }
});

test('testing and commissioning the mechanical systems needs a SWMS by law, as the lead\'s own balancing does (smaller fault 4)', () => {
  const ids = (task) => draft.screenHighRisk({ state: 'nsw', task }).categories.map((item) => item.id);
  assert.deepEqual(ids('Test, balance and commission the mechanical systems.'), ['electrical']);
  assert.deepEqual(ids('Balance and commission the a/c systems.'), ['electrical']);
  assert.deepEqual(ids('Test and commission the mechanical controls.'), ['electrical']);
  // Programming the controls alone is not work near energised parts.
  assert.deepEqual(ids('Program the mechanical controls system and its interfaces with other trade systems.'), []);
});

test('the account bar does not say "Sign in" while a kept session is checked (smaller fault 5)', () => {
  assert.match(read('public/account.js'), /Checking your sign-in\.\.\./);
});
