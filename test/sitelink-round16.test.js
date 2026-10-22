// SiteLink fixes from messy round 16 (19 October 2026, staging a52feac). Made-up companies, people and
// sites only. No paid AI reading: the stand-in client answers with a made-up fire services reading.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.RATE_LIMIT_HSE_REQUESTS = '5000';
process.env.RATE_LIMIT_AI_SCOPE_REQUESTS = '1000';
process.env.RATE_LIMIT_MAX_REQUESTS = '5000';
process.env.RATE_LIMIT_LIST_REQUESTS = '5000';
process.env.RATE_LIMIT_LIST_SENDS = '1000';
process.env.RATE_LIMIT_WORD_REQUESTS = '30000';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip');
const { app } = require('../server');
const db = require('../db');
const send = require('../sitelink-send');
const handover = require('../handover');
const answers = require('../sitelink-answers');
const aiScope = require('../ai-scope');
const abnRegister = require('../abn');
const { validAbn } = require('../accounts');
const { prepareDraft, statusOf } = require('../draft');
const { draftBody } = require('../input');
const { downloadGaps } = require('../download-gate');
const { withEmergencyAnswers } = require('../emergency');
const { setupAccounts, mailbox, lastLinkToken, ANSWERED, ready, checked } = require('./helpers');

abnRegister.lookupAbn = async () => ({ enabled: false });
let abnSeed = 61829374000;
function nextAbn() {
  for (abnSeed += 83; ; abnSeed += 1) if (validAbn(String(abnSeed))) return String(abnSeed);
}

// A made-up fire services reading, with the round 16 point, notes and title shapes.
const row = (activity, pack, clause, quote, unknowns = '', extra = {}) => ({ activity, type: 'Site work', package: pack, crew: 'Sprinkler fitters', clause, quotes: [quote], where: '', plant: '', conditions: '', unknowns, matrixColumn: '', ...extra });
const READING = {
  activities: [
    row('Install wet pipe sprinkler systems', 'Sprinklers', '4.2(a)', 'Install wet pipe sprinkler systems throughout.'),
    row('Fire seal fire protection service penetrations through fire barriers', 'Penetrations and core drilling', '3.1(y)', 'Where there is a shared penetration, the final Subcontractor to install their service is responsible for fire sealing the penetration.',
      'Sealant products and their chemical hazards; at shared penetrations the last trade to install seals the penetration; so who seals depends on the builder\'s sequence'),
    row('Install and seal fire protection devices in air plenums and ducts', 'Penetrations and core drilling', 'C-8.08', 'Install and seal fire protection devices in air plenums and ducts.', 'Duct access; the line refers to ductwork'),
    row('Cut out section of existing pipe and blank off retained pipework', 'Sprinklers', 'C-1.82', 'Cut out the existing pipe and blank off the retained pipework.', 'The document does not say who isolates the existing fire services before pipe is cut'),
    row('Provide, connect and commission kitchen hood suppression system', 'Sprinklers', '4.2(e)', 'Suppression system within the kitchen hoods.', 'Whether Fire or Mechanical supplies the hood system (see conflicts)'),
    row('Install the gas suppression system in the Gatehouse SER room', 'Trade installation: SER room', '4.3(a)', 'Install the gas suppression system in the Gatehouse SER room.'),
    row('Interface new fire systems with existing FIP in the existing correctional facility', 'Work in an existing or live facility', '4.4(j)', 'Interface the new fire systems with the existing FIP.', '', { crew: 'Electrical fire system tradespersons / FIP technician' }),
    row('Install new block plans and signage in existing booster cupboard', 'Work in an existing or live facility', '4.5(d)', 'Install new block plans and signage in the existing booster cupboard.', '', { crew: 'Fire services technicians' }),
  ],
  byOthers: [],
  conflicts: [],
};
const GROUPS = { Sprinklers: ['fireAtHeight'], 'Penetrations and core drilling': ['coreDrill', 'passiveFire'], 'Trade installation: SER room': ['gasSuppression'], 'Work in an existing or live facility': ['fireLive', 'signageInstall'] };
const SCOPE = ['Subcontract scope of works: Fire services. The Gatehouse SER room is protected by a gas suppression system. FIP and SER as named in the drawings.', ...READING.activities.map((one, i) => `1.${i + 1} ${one.quotes[0]}`),
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
  delete process.env.ANTHROPIC_API_KEY;
  server.close();
});

async function call(method, route, { body, reviewer, session } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(reviewer ? { 'X-Reviewer-Token': reviewer } : {}), ...(session ? { Authorization: `Bearer ${session}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = response.headers.get('content-type') || '';
  return { status: response.status, headers: response.headers, data: type.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()) };
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
  assert.equal((await call('PUT', '/api/hse/me', { reviewer: data.token, body: { name: 'Imogen Varga', position: 'HSE lead', phone: '0412 555 019' } })).status, 200);
  return data.token;
}
const WORKPLACE = '18 Station St, Wentworthville NSW 2145';
const DETAILS = {
  musterPoint: 'Grassed area by gate 2 off Station St',
  firstAider: 'Saoirse Byrne, site office, 0433 218 640',
  firstAidLocation: 'Site office, ground floor',
  hospital: 'Westmead Hospital, Emergency Department',
  siteManager: 'Hamish Te Rangi, 0418 552 907',
  scaffoldSupervisor: 'Dmitri Pavlenko, 0419 300 221',
  siteRules: ['Sign in at the site office before starting.'],
};

// A builder's project with a subcontract whose scope is read by the stand-in.
async function readScope(prefix) {
  const lead = await leadSignIn(`lead@${prefix}.example`);
  const org = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: 'Wombat Flat Constructions Pty Ltd', abn: nextAbn() } });
  await db.query("UPDATE orgs SET abn_check = 'verified', abn_verified_at = $1 WHERE id = $2", [new Date(), org.data.org.id]);
  const project = await call('POST', `/api/hse/orgs/${org.data.org.id}/projects`, { reviewer: lead, body: { name: 'Tallowood Creek Community Centre', workplace: WORKPLACE, state: 'nsw' } });
  const projectId = project.data.project.id;
  assert.equal((await call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: lead, body: { baseRev: 0, details: DETAILS } })).status, 200);
  const email = `office@${prefix}-sub.example`;
  const added = await call('POST', `/api/hse/projects/${projectId}/subcontracts`, { reviewer: lead, body: { name: 'Spinebill Fire Protection Pty Ltd', trade: 'Fire services', email } });
  assert.equal(added.status, 201, JSON.stringify(added.data));
  const subId = added.data.subcontract.id;
  const sent = await call('POST', `/api/hse/subcontracts/${subId}/scope`, { reviewer: lead, body: { file: { name: 'Fire services scope.txt', data: Buffer.from(SCOPE).toString('base64') } } });
  assert.ok([200, 202].includes(sent.status), JSON.stringify(sent.data));
  for (let i = 0; i < 300; i += 1) {
    const page = await call('GET', `/api/hse/subcontracts/${subId}`, { reviewer: lead });
    if (page.data.reading.status !== 'reading') return { lead, projectId, subId, page: page.data, email, trade: added.data.subcontract.trade };
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
  throw new Error('the reading did not finish');
}
async function subbie(email, name) {
  assert.equal((await call('POST', '/api/auth/email', { body: { email } })).status, 200);
  const { data } = await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } });
  assert.equal((await call('PUT', '/api/company', { session: data.token, body: { name, abn: nextAbn(), address: '4 Spinebill Lane, Parramatta NSW 2150', phone: '02 9555 0100', email } })).status, 200);
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
  const office = await subbie(`admin@${prefix}-sub.example`, 'Spinebill Fire Protection Pty Ltd');
  assert.equal((await call('POST', `/api/list/${token}/claim`, { session: office })).status, 200);
  const { list } = (await call('GET', `/api/from-builders/${s.subId}`, { session: office })).data;
  return { ...s, office, list };
}
// A SWMS for a list item as the pages send it: the builder's details filled in, prepared, SiteWrite's check
// passed and each part ticked by the foreman.
// The list's work is not what these tests are about: each SWMS is given a task SiteWrite covers in full.
const TASK = 'Install power outlets and light switches in the offices.';
function swmsFor(item, extra = {}) {
  const input = ready({ ...ANSWERED, state: 'nsw', task: TASK, fallRisk: 'no', residential: 'no', workplace: WORKPLACE, principalContractor: 'Wombat Flat Constructions Pty Ltd', ...DETAILS, ...extra });
  return { ...checked(input, null, { name: 'Tomasz Weatherby', role: 'Foreman' }), swmsTitle: item.title };
}
const footerRef = async (buffer) => {
  const zip = await JSZip.loadAsync(buffer);
  const text = (await Promise.all(Object.keys(zip.files).filter((name) => /footer/.test(name)).map((name) => zip.file(name).async('string')))).join(' ').replace(/<[^>]+>/g, '');
  return (text.match(/SW-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}/) || [])[0];
};

const signRead = require('../sign-read');
const scopeTask = require('../public/scope-task');
const substanceRules = require('../public/substance-rules');

// The PPE a draft ticks, as the page sends it.
const ppeOf = (input) => (prepareDraft(draftBody(input)).ppe || []).flatMap((group) => (group.items || []).filter((one) => one.ticked).map((one) => one.id));

// ---- Stuck point 1: an unchanged SWMS saved again keeps its revision ----

test('an unchanged SWMS saved, reloaded and downloaded keeps its revision, whatever order the page sends its answers in (stuck point 1)', async () => {
  const office = await subbie('admin@r16rev.example', 'Spinebill Rev Fire Pty Ltd');
  const base = ready({ ...ANSWERED, state: 'nsw', task: TASK, fallRisk: 'no', residential: 'no', company: 'Spinebill Rev Fire Pty Ltd' });
  const ppe = ppeOf(base);
  assert.ok(ppe.length > 3, JSON.stringify(ppe));
  const input = { ...base, ppe, kindsSeen: ['a', 'b'] };
  // Save SWMS: revision 1.
  const saved = await call('POST', '/api/swms', { session: office, body: { input, ...checked({ input }) } });
  assert.equal(saved.status, 201, JSON.stringify(saved.data));
  const id = saved.data.swms.id;
  const first = (await call('GET', `/api/swms/${id}`, { session: office })).data;
  // The reloaded page sends the same work with its PPE ticks and seen steps in another order (the round 16 Hot work).
  const reloaded = { ...input, ppe: [...ppe].reverse(), kindsSeen: ['b', 'a'] };
  const word = await call('POST', '/api/draft.docx', { session: office, body: { ...checked(reloaded), swmsId: id } });
  assert.equal(word.status, 200, String(word.data).slice(0, 300));
  assert.equal(word.headers.get('x-sitewrite-revision'), '1', 'still revision 1');
  assert.equal(await footerRef(word.data), first.swms.ref, 'under the reference it was saved with');
  // Save SWMS pressed again with nothing changed keeps it too, and says so.
  const again = await call('PUT', `/api/swms/${id}`, { session: office, body: { input: reloaded, ...checked({ input: reloaded }) } });
  assert.equal(again.status, 200, JSON.stringify(again.data));
  assert.equal(again.data.swms.revision, 1);
  assert.equal(again.data.swms.unchanged, true);
  // A real change is still the next revision.
  const changed = { ...reloaded, preparedBy: 'Tomasz Weatherby, foreman' };
  const next = await call('PUT', `/api/swms/${id}`, { session: office, body: { input: changed, ...checked({ input: changed }) } });
  assert.equal(next.status, 200, JSON.stringify(next.data));
  assert.equal(next.data.swms.revision, 2);
  // The page's message for an unchanged save.
  const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'account.js'), 'utf8');
  assert.match(page, /Nothing has changed since revision \$\{data\.swms\.revision \|\| 1\}, so it stays revision/);
});

test('Submit after a reload with the answers in another order submits the revision saved, not a new one (stuck point 1)', async () => {
  const c = await claimed('r16sub');
  const item = c.list.items[0];
  const swms = swmsFor(item);
  const ppe = ppeOf(swms);
  const word = await call('POST', '/api/draft.docx', { session: c.office, body: { ...swmsFor(item, { ppe }) } });
  assert.equal(word.status, 200, String(word.data).slice(0, 300));
  const swmsId = word.headers.get('x-sitewrite-swms');
  const done = await call('POST', `/api/from-builders/${c.subId}/submit`, { session: c.office, body: { items: [{ requiredId: item.requiredId, swms: { ...swmsFor(item, { ppe: [...ppe].reverse() }), swmsId } }] } });
  assert.equal(done.status, 201, JSON.stringify(done.data));
  assert.equal(done.data.submitted[0].revision, 1);
  assert.equal(done.data.submitted[0].ref, await footerRef(word.data));
});

// ---- Stuck point 2: Prepared by is judged on the project page (see sitelink-round16-page.test.js) ----

test('the example under a refused Prepared by names the person with capitals (stuck point 2)', () => {
  const gate = require('../public/gate-rules');
  assert.equal(gate.answerNeed({ ask: '', name: 'Prepared by', optional: true, kind: 'person' }, 'priya dalgarno office'),
    '"priya dalgarno office" ends in "office", which is a place, not a role. Give their name and role, for example "Priya Dalgarno, office manager".');
});

// ---- Blocker 4 and wording 1: points and notes ----

test('the lead\'s answer settles the note on its own subject, and a point never starts "So who" (blocker 4, wording 1)', async () => {
  // As the reading now splits it: the note and the question it leads to are one point.
  const split = handover.splitPoint('Sealant products; at shared penetrations the last trade to install seals the penetration; so who seals depends on the builder\'s sequence');
  assert.deepEqual(split, { asks: ['at shared penetrations the last trade to install seals the penetration, so who seals depends on the builder\'s sequence'], notes: ['Sealant products'] });
  // A list read before keeps the note and the point apart: the lead's answer on who seals settles the note.
  const answersGiven = [{ activity: 'Fire seal fire protection service penetrations through fire barriers', question: 'So who seals depends on the builder\'s sequence.', answer: 'You seal all fire services penetrations incl collars and dampers as you go.' }];
  const notes = handover.withSettled({ draftNotes: handover.notesOf(['At shared penetrations the last trade to install seals the penetration.', 'Sealant products to be confirmed.', 'Working height.']) }, answersGiven).draftNotes;
  assert.equal(notes[0].settled, answersGiven[0].answer);
  assert.equal(notes[1].settled, undefined, 'a note on the product is not settled by who seals');
  assert.equal(notes[2].settled, undefined);
  // Through SiteLink: the point is one sentence with its full stop; "(see conflicts)" is gone; notes about the
  // scope's own lines are left out.
  const s = await readScope('r16points');
  const questions = s.page.points.map((one) => one.question);
  assert.ok(questions.includes('At shared penetrations the last trade to install seals the penetration, so who seals depends on the builder\'s sequence.'), JSON.stringify(questions));
  assert.ok(questions.includes('The document does not say who isolates the existing fire services before pipe is cut.'), JSON.stringify(questions));
  assert.ok(questions.includes('Whether Fire or Mechanical supplies the hood system.'), JSON.stringify(questions));
  assert.ok(questions.every((one) => /[.?]$/.test(one) && !/see conflicts?/i.test(one) && !/^So\b/.test(one)), JSON.stringify(questions));
  const all = JSON.stringify(s.page.items.map((one) => one.item && one.item.draftNotes));
  assert.doesNotMatch(all, /line refers to|clause sits under|see conflicts/i);
  assert.equal(handover.pointSentence('Locations (see conflict with 4.4(e)); working height'), 'Locations (clause 4.4(e) says otherwise); working height.');
  assert.deepEqual(handover.notesOf(['The clause sits under switchboard thermographic scanning.', 'Maintenance: the line refers to ductwork.', 'Duct access.']).map((one) => one.text), ['Duct access.']);
});

// ---- Wording 2 and 3: titles ----

test('titles: no sentence, a place takes its trade\'s work, and the scope\'s own capitals for short names (wordings 2 and 3)', async () => {
  const titles = handover.packageTitles(READING);
  assert.equal(titles['Trade installation: SER room'], 'Gas suppression system, Gatehouse SER room');
  assert.equal(titles['Work in an existing or live facility'], 'Fire services work in the existing or live facility');
  const s = await readScope('r16title');
  const item = s.page.items.find((one) => /Gas suppression/.test(one.title));
  assert.ok(item, JSON.stringify(s.page.items.map((one) => one.title)));
  const renamed = await call('PUT', `/api/hse/subcontracts/${s.subId}/items/${item.id}`, { reviewer: s.lead, body: { title: 'gas suppression system - ser room' } });
  assert.equal(renamed.status, 200, JSON.stringify(renamed.data));
  assert.ok(renamed.data.items.some((one) => one.title === 'Gas suppression system - SER room'), JSON.stringify(renamed.data.items.map((one) => one.title)));
  // A short word the scope writes in capitals in a heading is not taken for a name.
  assert.equal(answers.tidyTitle('fire seal as per it', 'AS 1851 and IT rooms'), 'Fire seal as per it');
});

// ---- Wordings 4, 5 and 6: names inside free text ----

test('the people the lead set take their capitals in conditions and notes; "ok" reads "OK"; a company word alone does not (wordings 4 to 6)', async () => {
  const people = ['Hamish Te Rangi, 0418 552 907', 'Dmitri Pavlenko, 0419 300 221', 'Saoirse Byrne, site office, 0433 218 640'];
  assert.equal(answers.tidyLines('ok to start\nhamish te rangi to sign off each hot work permit', ['Spinebill Fire Protection Pty Ltd'], people), 'OK to start\nHamish Te Rangi to sign off each hot work permit');
  assert.equal(answers.tidyNote('dmitri checked the tag. saoirse has the permit', [], people), 'Dmitri checked the tag. Saoirse has the permit');
  // A phone typed after the name with no comma, as the site details keep it, is not part of the name.
  assert.equal(answers.tidyNote('ok once hamish te rangi n dmitri sign', [], ['Hamish Te Rangi 0418 552 907', 'Dmitri Pavlenko 0419 300 221']), 'OK once Hamish Te Rangi and Dmitri sign');
  assert.equal(answers.tidyNote('no note given. name the fire watch on each permit', ['Spinebill Fire Protection Pty Ltd']), 'No note given. Name the fire watch on each permit');
  assert.equal(answers.tidyNote('emailed by spinebill office', ['Spinebill Fire Protection Pty Ltd']), 'Emailed by Spinebill office');
  // Through SiteLink: the lead's conditions and the notes on each side.
  const c = await claimed('r16names');
  const item = c.list.items[0];
  const r = await call('POST', `/api/from-builders/${c.subId}/submit`, { session: c.office, body: { items: [{ requiredId: item.requiredId, swms: swmsFor(item) }] } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const submissionId = r.data.submitted[0].id;
  const response = await call('POST', `/api/hse/submissions/${submissionId}/response`, { reviewer: c.lead, body: { response: 'conditions', text: 'hamish te rangi signs off the hot work permit\nname the fire watch on each permit' } });
  assert.ok([200, 201].includes(response.status), JSON.stringify(response.data));
  const conditions = await db.query('SELECT id, text FROM review_conditions WHERE submission_id = $1 ORDER BY position', [submissionId]);
  assert.deepEqual(conditions.map((one) => one.text), ['Hamish Te Rangi signs off the hot work permit', 'Name the fire watch on each permit']);
  assert.equal((await call('POST', `/api/from-builders/${c.subId}/conditions/${conditions[0].id}/done`, { session: c.office, body: { note: 'dmitri n saoirse have the permits' } })).status, 200);
  assert.equal((await db.one('SELECT done_note FROM review_conditions WHERE id = $1', [conditions[0].id])).done_note, 'Dmitri and Saoirse have the permits');
  const back = await call('POST', `/api/hse/conditions/${conditions[0].id}/back`, { reviewer: c.lead, body: { note: 'ok but hamish te rangi has not signed' } });
  assert.equal(back.status, 200, JSON.stringify(back.data));
  assert.equal((await db.one('SELECT back_note FROM review_conditions WHERE id = $1', [conditions[0].id])).back_note, 'OK but Hamish Te Rangi has not signed');
});

// ---- Live services chips ----

test('a live services chip is offered only where it names a service (live services chip)', () => {
  assert.deepEqual(scopeTask.siteSuggestions(['Energised buildings after energisation', 'Energised switchboards; operating facility', 'Gas services', 'Energised HV.'], 'liveServices'), ['Energised switchboards.', 'Gas services.', 'Energised HV.']);
  assert.deepEqual(scopeTask.scopeSite([{ conditions: 'Energised buildings after energisation' }]), {});
});

// ---- Smaller faults ----

test('the products a safety data sheet answer names are read with their types (smaller fault)', () => {
  assert.deepEqual(substanceRules.sdsProducts('The products used are pipe thread sealant, cutting oil and pvc solvent cement. They are used with good ventilation.'), [
    { type: 'Sealants, mastics and silicone', product: 'pipe thread sealant' },
    { type: 'PVC primer and solvent cement', product: 'pvc solvent cement' },
  ]);
  assert.deepEqual(substanceRules.sdsProducts('No paint is used. SDSs are kept in the gang box.'), []);
});

test('a wrong check answer never names the same things as a control in the SWMS (smaller fault)', () => {
  const draft = { task: 'Make and waterproof roof penetrations for fire services. Erect barricades and penetration covers.', ppe: [], jobSteps: [
    { step: 'Set out the penetration', hazards: ['Falls through the roof sheeting.'], controls: ['Work from the walkway mesh.', 'Mark the penetration on the sheeting.'] },
    { step: 'Cut the roof penetration', hazards: ['Falls through the opening.', 'Cuts from the sheet edges.'], controls: ['The opening is covered or barricaded as soon as it is cut.', 'Wear cut resistant gloves.'] },
    { step: 'Flash and seal the penetration', hazards: ['Falls from the roof edge.'], controls: ['The flashing is sealed with the roofing maker\'s sealant.', 'Stay inside the edge protection.'] },
  ] };
  let asked = 0;
  for (let i = 0; i < 20; i += 1) {
    for (const q of signRead.questionPool(`r16-${i}`, draft).steps || []) {
      if (q.kind !== 'control') continue;
      asked += 1;
      // None names two of the things the opening control names: an opening, a cover, a barricade.
      const things = (text) => [/\b(?:openings?|penetrations?|holes?|voids?)\b/i, /\bcover\w*/i, /\bbarricad\w*|\bbarriers?\b/i].filter((one) => one.test(text)).length;
      for (const wrong of q.decoys) assert.ok(things(wrong) < 2, `"${wrong}" beside "${q.correct}"`);
    }
  }
  assert.ok(asked > 0);
});

test('My SWMS names a SWMS from a list by its project, submitted or not (smaller fault)', async () => {
  const c = await claimed('r16mine');
  const [first, second] = c.list.items;
  const a = await call('POST', '/api/draft.docx', { session: c.office, body: swmsFor(first) });
  const b = await call('POST', '/api/draft.docx', { session: c.office, body: swmsFor(second, { task: `${TASK} Label the circuits.` }) });
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  // The list's work kept on the server knows each SWMS by its id; only the first is submitted.
  const work = { items: [first, second].map((one, i) => ({ requiredId: one.requiredId, title: one.title, task: one.task, swmsId: [a, b][i].headers.get('x-sitewrite-swms') })), current: 0, stage: 'review' };
  assert.equal((await call('PUT', `/api/from-builders/${c.subId}/progress`, { session: c.office, body: { baseVersion: 0, project: work, page: {}, pageId: 'r16page' } })).status, 200);
  assert.equal((await call('POST', `/api/from-builders/${c.subId}/submit`, { session: c.office, body: { items: [{ requiredId: first.requiredId, swms: { ...swmsFor(first), swmsId: work.items[0].swmsId } }] } })).status, 201);
  const mine = (await call('GET', '/api/swms', { session: c.office })).data.swms;
  assert.deepEqual(mine.map((one) => one.place), ['Tallowood Creek Community Centre', 'Tallowood Creek Community Centre']);
});
