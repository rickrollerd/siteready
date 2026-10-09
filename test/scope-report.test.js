// The scope review report (Word) and the conflicts pop-up, from a stand-in AI reading.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const { app } = require('../server');
const db = require('../db');
const { setupAccounts, lastLinkToken } = require('./helpers');
const { reportSections, reportToDocx } = require('../scope-report');
const { conflictDialog, ADVICE } = require('../public/scope-conflicts');

const READING = {
  activities: [
    { activity: 'Install ductwork', type: 'Site work', package: 'Mechanical installation', crew: 'Sheet metal', clause: '4.2 (a)', quotes: ['Supply and install all ductwork.'], where: 'Level 2 ceilings', plant: '', conditions: '', unknowns: 'Working height; ceiling access', matrixColumn: '' },
    { activity: 'Fabricate duct fittings', type: 'Off-site work', package: 'Mechanical installation', crew: 'Workshop', clause: '4.2 (c)', quotes: ['Fabricate all fittings in the workshop.'], where: '', plant: '', conditions: '', unknowns: '', matrixColumn: '' },
    { activity: 'Lift chillers into the plant room', type: 'Site work', package: 'Plant lifting and cranage', crew: 'Crane company', clause: '4.2 (b)', quotes: ['Lift the chillers into the plant room using a mobile crane.'], where: 'Plant room', plant: 'Mobile crane', conditions: '', unknowns: 'Chiller weights', matrixColumn: '' },
    { activity: 'Attend weekly site meetings', type: 'Duty', package: 'Supervision', crew: 'Supervisor', clause: '2.1', quotes: ['Attend weekly site coordination meetings.'], where: '', plant: '', conditions: '', unknowns: '', matrixColumn: '' },
  ],
  byOthers: [{ work: 'Roof penetrations', party: 'Roofing contractor', clause: '4.9', quotes: ['Roof penetrations by the roofer.'] }],
  conflicts: [{ clauseA: 'C-1.10', quoteA: 'Make all roof penetrations.', clauseB: '4.9', quoteB: 'Roof penetrations by the roofer.', why: 'Both say who makes the roof penetrations.', confidence: 'High' }],
  packages: [
    { package: 'Mechanical installation', groups: ['ductwork'], byOthers: [{ group: 'ductwork', step: 'Set out', party: 'Builder', clause: '6', says: 'Set out by the builder.' }], unknown: [], unmatched: ['Commissioning'] },
    { package: 'Plant lifting and cranage', groups: ['plantLift'], byOthers: [], unknown: [], unmatched: [] },
  ],
};

const textOf = async (buffer) => (await mammoth.extractRawText({ buffer })).value;

test('the report has every section, from a stand-in reading', async () => {
  const sections = reportSections(READING);
  assert.deepEqual(sections.work.map((pack) => [pack.package, pack.rows.length]), [['Mechanical installation', 2], ['Plant lifting and cranage', 1]]);
  assert.equal(sections.duties.length, 1);
  assert.equal(sections.byOthers.length, 2);
  assert.deepEqual(sections.unknowns.map((item) => item.activity), ['Install ductwork', 'Lift chillers into the plant room']);

  const text = await textOf(await reportToDocx(READING, { company: { name: 'Test Mechanical' }, date: '5 October 2026' }));
  for (const words of [
    'Scope review report', 'Test Mechanical', '5 October 2026',
    '1. The work this subcontractor does', 'Mechanical installation (2 activities)', 'Install ductwork', '4.2 (a)', '"Supply and install all ductwork."', 'Where: Level 2 ceilings', 'Off-site work',
    'No job steps in SiteReady\'s library for: Commissioning',
    '2. Work the scope gives to others', 'Roof penetrations', 'Roofing contractor', '"Roof penetrations by the roofer."', 'Set out (in Mechanical installation)', 'Builder',
    '3. Clauses that conflict', 'Clause A (C-1.10) says', '"Make all roof penetrations."', 'Clause B (4.9) says', 'Why this matters', 'Both say who makes the roof penetrations.', 'Confidence', 'High',
    '4. Unknowns that change the risk', 'Working height', 'Ceiling access', 'Chiller weights',
    '5. Duties', 'Attend weekly site meetings', '"Attend weekly site coordination meetings."',
  ]) assert.ok(text.includes(words), `missing: ${words}`);
  // Duties are listed once, under duties, not as work.
  const work = text.slice(text.indexOf('1. The work'), text.indexOf('2. Work the scope'));
  assert.ok(!work.includes('Attend weekly site meetings'));
});

test('an empty reading still gives a report that says so in each section', async () => {
  const text = await textOf(await reportToDocx({ activities: [], byOthers: [], conflicts: [], packages: [] }, { checks: { passed: false, quotesNotFound: [{}], quotesShortened: [] } }));
  for (const words of ['no site or off-site work', 'no work the scope gives to others', 'no clauses that conflict', 'no unknowns', 'no duties', 'could not be matched word for word to the document (1)']) {
    assert.ok(text.includes(words), `missing: ${words}`);
  }
});

test('the conflicts pop-up lists each conflict in plain words, with the advice and the report button', () => {
  assert.equal(conflictDialog([]), '');
  const html = conflictDialog([...READING.conflicts, { clauseA: '1 <b>', quoteA: 'A & B', clauseB: '2', quoteB: 'C', why: 'D', confidence: 'Low' }]);
  assert.match(html, /^<dialog class="conflict-dialog" id="conflict-dialog" aria-labelledby="conflict-dialog-title"/);
  assert.match(html, /2 conflicts between clauses in the scope/);
  assert.ok(html.includes('<strong>Clause A (C-1.10) says:</strong> "Make all roof penetrations."'));
  assert.ok(html.includes('<strong>Clause B (4.9) says:</strong> "Roof penetrations by the roofer."'));
  assert.ok(html.includes('<strong>Why this matters:</strong> Both say who makes the roof penetrations.'));
  assert.ok(html.includes('<strong>Confidence:</strong> High'));
  assert.ok(html.includes(ADVICE) && /builder before you price or start/.test(ADVICE));
  assert.match(html, /data-scope-report/);
  assert.match(html, /data-conflict-close/);
  // Scope words are shown as text, never as markup.
  assert.ok(html.includes('Clause A (1 &lt;b&gt;) says:</strong> "A &amp; B"'));
  assert.match(conflictDialog(READING.conflicts), /Two clauses in the scope conflict/);
  // Not modal: the page opens it with show(), never showModal(), so the tasks stay usable.
  const page = fs.readFileSync(path.join(__dirname, '../public/scope.js'), 'utf8');
  assert.match(page, /dialog\.show\(\)/);
  assert.doesNotMatch(page, /showModal/);
  assert.match(fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8'), /<script src="\/scope-conflicts.js"><\/script>\s*<script src="\/scope.js">/);
});

let server;
let base;
test.before(async () => {
  await setupAccounts();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

async function signIn(email) {
  const post = (route, body) => fetch(`${base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  await post('/api/auth/email', { email });
  const { token } = await (await post('/api/auth/verify', { token: lastLinkToken(email) })).json();
  const user = await db.one('SELECT company_id FROM users WHERE email = $1', [email]);
  return { token, companyId: user.company_id };
}

async function keepReading(id, companyId, status = 'done') {
  await db.query('INSERT INTO ai_readings (id, company_id, doc_hash, brief_version, model, status, reading, checks, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [id, companyId, `hash-${id}`, 'v3.3', 'claude-opus-5-5', status, status === 'done' ? JSON.stringify(READING) : null, JSON.stringify({ passed: true }), new Date()]);
}

test('the report route gives the company its own reading as Word, and refuses another company\'s', async () => {
  const owner = await signIn('report@owner.example');
  const other = await signIn('report@other.example');
  await keepReading('report-reading-1', owner.companyId);
  await keepReading('report-reading-2', owner.companyId, 'reading');
  const get = (id, token) => fetch(`${base}/api/scope/ai/${id}/report.docx`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

  const mine = await get('report-reading-1', owner.token);
  assert.equal(mine.status, 200);
  assert.match(mine.headers.get('content-type'), /wordprocessingml/);
  assert.match(mine.headers.get('content-disposition'), /Scope-review-report\.docx/);
  const text = await textOf(Buffer.from(await mine.arrayBuffer()));
  assert.ok(text.includes('3. Clauses that conflict'));

  assert.equal((await get('report-reading-1', other.token)).status, 404);
  assert.equal((await get('report-reading-1')).status, 401);
  assert.equal((await get('report-reading-2', owner.token)).status, 409);
});

test('the reading and the report show each package\'s high risk construction work, in the state\'s words', async () => {
  const owner = await signIn('hrcw@owner.example');
  await keepReading('hrcw-reading-1', owner.companyId);
  const headers = { Authorization: `Bearer ${owner.token}` };
  const reading = await (await fetch(`${base}/api/scope/ai/hrcw-reading-1?state=nsw`, { headers })).json();
  assert.equal(reading.state, 'nsw');
  // Packages with site work only; the duties package is not flagged.
  assert.deepEqual(reading.reading.highRisk.map((item) => item.package), ['Mechanical installation', 'Plant lifting and cranage']);
  const lift = reading.reading.highRisk[1];
  assert.ok(lift.categories.some((item) => item.id === 'plant' && /^Is carried out in an area at a workplace in which there is movement of powered mobile plant$/.test(item.label) && item.short === 'Moving powered mobile plant'));
  // No state given: Queensland, as the quick read does.
  assert.equal((await (await fetch(`${base}/api/scope/ai/hrcw-reading-1`, { headers })).json()).state, 'qld');

  const text = await textOf(Buffer.from(await (await fetch(`${base}/api/scope/ai/hrcw-reading-1/report.docx?state=nsw`, { headers })).arrayBuffer()));
  for (const words of [
    'High risk construction work', 'of 2 work packages',
    'Each work package shows the high risk construction work its work involves', 'The categories are those of the Work Health and Safety Regulation 2025 (NSW).',
    'High risk construction work: a SWMS is required by law.', 'Moving powered mobile plant.',
  ]) assert.ok(text.includes(words), `missing: ${words}`);
  // Each package's flag sits under its own heading.
  const work = text.slice(text.indexOf('Plant lifting and cranage (1 activity)'), text.indexOf('2. Work the scope'));
  assert.ok(work.includes('Moving powered mobile plant.'));
});

test('a package with no high risk construction work says so, and that the principal contractor may still want a SWMS', async () => {
  const reading = {
    ...READING,
    highRisk: [
      { package: 'Mechanical installation', categories: [], dependsOn: [] },
      { package: 'Plant lifting and cranage', categories: [{ id: 'plant', label: 'x', short: 'Moving powered mobile plant', likely: false, dependsOn: '' }], dependsOn: [] },
    ],
  };
  const text = await textOf(await reportToDocx(reading, { date: '7 October 2026' }));
  assert.ok(text.includes('1 high risk: a SWMS is required by law; 1 none found (of 2 work packages)'));
  const pack = text.slice(text.indexOf('Mechanical installation (2 activities)'), text.indexOf('Plant lifting and cranage (1 activity)'));
  assert.ok(pack.includes('No high risk construction work found in this work.'));
  assert.ok(pack.includes('A SWMS may still be required by the principal contractor.'));
  // A reading without flags gives the report as before.
  assert.ok(!(await textOf(await reportToDocx(READING))).includes('high risk construction work'));
});
