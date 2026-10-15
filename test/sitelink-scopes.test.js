// Goal 12 stage 4: on a SiteLink project, the HSE lead adds a subcontract and uploads its scope. The
// scope is read once on the project (a stand-in for the AI here: nothing is sent or billed), its work
// packages become the subcontract's SWMS list, and the lead keeps, removes, adds or rewords them and
// answers the points to confirm. No price from a scope is ever kept or shown. One account's reading
// is never readable by another account or by any subcontractor's company. The project's readings are
// free up to PROJECT_FREE_READINGS (D302); the same file again costs nothing and does not count.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.RATE_LIMIT_HSE_REQUESTS = '5000';
process.env.RATE_LIMIT_AI_SCOPE_REQUESTS = '1000';
process.env.RATE_LIMIT_MAX_REQUESTS = '5000';
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');
const db = require('../db');
const aiScope = require('../ai-scope');
const { setupAccounts, mailbox, lastLinkToken } = require('./helpers');
const abnRegister = require('../abn');
const { validAbn } = require('../accounts');
const D = require('./sitelink-scopes.data');

abnRegister.lookupAbn = async () => ({ enabled: false });
let abnSeed = 61000000000;
function nextAbn() {
  for (abnSeed += 101; ; abnSeed += 1) if (validAbn(String(abnSeed))) return String(abnSeed);
}

// The stand-in AI: it answers each document by its first line, and counts the readings it was asked
// for. A document it does not know is read as one activity, its first numbered line.
const GROUPS = { 'Formwork and falsework': ['formwork'], 'Edge protection': ['edgeProtectionInstall'], 'Plant lifting and cranage': ['plantLift'], 'Trade installation: ceiling space': ['cablePull'] };
const asked = { readings: 0, failNext: false };
function readingFor(text) {
  if (text.includes('scope of works: Formwork')) return D.FORMWORK_READING;
  if (text.includes('scope of works: Electrical services')) return D.ELECTRICAL_READING;
  const line = (text.match(/^4\.1 (.*)$/m) || [])[1] || 'Install the works.';
  return { activities: [{ activity: line.replace(/\.$/, ''), type: 'Site work', package: 'Trade installation: building', crew: '', clause: '4.1', quotes: [line], where: '', plant: '', conditions: '', unknowns: '', matrixColumn: '' }], byOthers: [], conflicts: [] };
}
const standIn = {
  beta: {
    messages: {
      stream(params) {
        const mapping = Boolean(params.output_config.format.schema.properties.packages);
        const content = params.messages[0].content;
        let body;
        if (mapping) {
          const names = [...content.matchAll(/^Work package: (.*)$/gm)].map((m) => m[1]);
          body = { packages: names.map((name) => ({ package: name, groups: GROUPS[name] || [], unmatched: [], byOthers: [] })) };
        } else {
          asked.readings += 1;
          if (asked.failNext) {
            asked.failNext = false;
            return { finalMessage: async () => { throw Object.assign(new Error('Overloaded'), { status: 529 }); } };
          }
          body = readingFor(content);
        }
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
  // The price scrub over every held scope keeps the process busy for seconds. A kept-alive connection
  // must not be closed by the server meanwhile, or the next request fails with "fetch failed".
  server.keepAliveTimeout = 120000;
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => {
  server.close();
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.PROJECT_FREE_READINGS;
  delete process.env.CONTROL_LEARNING;
  aiScope.useClient(null);
});

async function call(method, route, { body, reviewer, token } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(reviewer ? { 'X-Reviewer-Token': reviewer } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

async function hseSignIn(email, name) {
  await call('POST', '/api/hse/email', { body: { email } });
  const message = [...mailbox].reverse().find((item) => item.to === email);
  const link = /\/sitelink\?login=([A-Za-z0-9_-]+)/.exec(message.text);
  const { data } = await call('POST', '/api/hse/verify', { body: { token: link[1] } });
  await call('PUT', '/api/hse/me', { reviewer: data.token, body: { name, position: 'HSE manager' } });
  return data.token;
}

async function leadWithProject(email, orgName, name = 'Riley Morgan') {
  const lead = await hseSignIn(email, name);
  const org = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: orgName, abn: nextAbn() } });
  assert.equal(org.status, 201, JSON.stringify(org.data));
  const project = await call('POST', `/api/hse/orgs/${org.data.org.id}/projects`, { reviewer: lead, body: { name: 'Harbour Street offices', workplace: '40 Harbour Street, Sydney NSW 2000', state: 'nsw' } });
  return { lead, orgId: org.data.org.id, projectId: project.data.project.id };
}

async function addSub(lead, projectId, name = 'Tallow Formwork Pty Ltd', trade = 'Formwork', email = '') {
  const added = await call('POST', `/api/hse/projects/${projectId}/subcontracts`, { reviewer: lead, body: { name, trade, email } });
  assert.equal(added.status, 201, JSON.stringify(added.data));
  return added.data.subcontract.id;
}

// The scope sent as the page sends a file, then the page asking until the reading is finished.
async function upload(lead, subId, text, { name = 'Scope.txt', replace } = {}) {
  return call('POST', `/api/hse/subcontracts/${subId}/scope`, { reviewer: lead, body: { file: { name, data: Buffer.from(text).toString('base64') }, ...(replace ? { replace: true } : {}) } });
}
async function finished(lead, subId) {
  for (let i = 0; i < 200; i += 1) {
    const page = await call('GET', `/api/hse/subcontracts/${subId}`, { reviewer: lead });
    if (page.data.reading && page.data.reading.status !== 'reading') return page;
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
  throw new Error('the reading did not finish');
}

const MONEY_LEFT = /\$|\bAUD\b|\b\d{1,3}(?:,\d{3})+\.\d{2}\b|\b95\.00\b|\blump sum\b|\bGST\b|\blabour rate\b|\/hr\b/i;

test('a subcontract is added, its scope read once on the project, and its packages become the SWMS list', async () => {
  const { lead, projectId } = await leadWithProject('lead@corbel4.example', 'Corbel Four Pty Ltd');
  const before = asked.readings;
  // The company name and trade are needed; the email is optional, and checked when given.
  assert.equal((await call('POST', `/api/hse/projects/${projectId}/subcontracts`, { reviewer: lead, body: { name: '', trade: 'Formwork' } })).data.field, 'name');
  assert.equal((await call('POST', `/api/hse/projects/${projectId}/subcontracts`, { reviewer: lead, body: { name: 'Tallow', trade: '' } })).data.field, 'trade');
  assert.equal((await call('POST', `/api/hse/projects/${projectId}/subcontracts`, { reviewer: lead, body: { name: 'Tallow', trade: 'Formwork', email: 'not an email' } })).data.field, 'email');
  const subId = await addSub(lead, projectId, 'Tallow Formwork Pty Ltd', 'Formwork', 'office@tallow.example');
  const started = await upload(lead, subId, D.FORMWORK, { name: 'Formwork scope.txt' });
  assert.equal(started.status, 202, JSON.stringify(started.data));
  // The stand-in answers at once, so the reading may be finished already.
  assert.ok(['reading', 'done'].includes(started.data.reading.status));
  if (started.data.reading.status === 'reading') assert.ok(started.data.reading.progress.expectedSeconds > 0, 'the progress bar has what it needs');
  const page = await finished(lead, subId);
  assert.equal(asked.readings, before + 1);
  assert.equal(page.data.reading.status, 'done');
  assert.equal(page.data.subcontract.docName, 'Formwork scope.txt');
  const titles = page.data.items.map((item) => [item.title, item.removed]);
  assert.deepEqual(titles, [['Formwork and falsework', false], ['Edge protection', false], ['Plant lifting and cranage', false], ['Off-site fabrication', true]]);
  // Off-site work starts removed, with why. The scope gives this subcontractor the cranage, so it is kept.
  assert.match(page.data.items[3].removedWhy, /done off site/);
  assert.equal(page.data.items[0].highRisk.status, 'yes', 'the high risk work is shown for each package');
  assert.deepEqual(page.data.reading.duties, ['Provide a site supervisor']);
  // The project screen shows the subcontract and its SWMS list count.
  const project = await call('GET', `/api/hse/projects/${projectId}`, { reviewer: lead });
  assert.deepEqual(project.data.subcontracts.map((item) => [item.name, item.trade, item.swms, item.scope]), [['Tallow Formwork Pty Ltd', 'Formwork', 3, 'done']]);
  assert.deepEqual(project.data.readings, { used: 1, limit: 50, left: 49, message: '' });
  // The list is made once: asking again does not make it twice.
  const again = await call('GET', `/api/hse/subcontracts/${subId}`, { reviewer: lead });
  assert.equal(again.data.items.length, 4);
  assert.equal(Number((await db.one('SELECT COUNT(*) AS n FROM required_swms WHERE subcontract_id = $1', [subId])).n), 4);
});

test('a Word file is read like a text file', async () => {
  const { Document, Packer, Paragraph } = require('docx');
  const { lead, projectId } = await leadWithProject('lead@word4.example', 'Word Four Pty Ltd');
  const subId = await addSub(lead, projectId, 'Volt Electrical', 'Electrical');
  const doc = new Document({ sections: [{ children: D.ELECTRICAL.split('\n').map((line) => new Paragraph(line)) }] });
  const data = (await Packer.toBuffer(doc)).toString('base64');
  const started = await call('POST', `/api/hse/subcontracts/${subId}/scope`, { reviewer: lead, body: { file: { name: 'Electrical scope.docx', data } } });
  assert.equal(started.status, 202, JSON.stringify(started.data));
  const page = await finished(lead, subId);
  // A crane company's lifts: the scope does not give this subcontractor the cranage, so it starts removed.
  assert.deepEqual(page.data.items.map((item) => [item.title, item.removed]), [['Trade installation: ceiling space', false], ['Plant lifting and cranage', true], ['Testing and commissioning', false]]);
  assert.match(page.data.items[1].removedWhy, /does not say this subcontractor supplies the cranage/);
});

test('the same file a second time, for another subcontract, costs nothing and does not count', async () => {
  const { lead, projectId } = await leadWithProject('lead@same4.example', 'Same Four Pty Ltd');
  const first = await addSub(lead, projectId, 'Tallow Formwork Pty Ltd', 'Formwork');
  await upload(lead, first, D.FORMWORK);
  await finished(lead, first);
  const before = asked.readings;
  const second = await addSub(lead, projectId, 'Tallow Formwork Pty Ltd', 'Edge protection');
  const again = await upload(lead, second, D.FORMWORK, { name: 'Copy of the scope.pdf.txt' });
  assert.equal(again.status, 200);
  assert.equal(again.data.kept, true);
  assert.match(again.data.message, /^This file was read before for your account, so it was not read again\. It cost nothing and does not count toward the project's free readings\.$/);
  assert.equal(asked.readings, before, 'no second reading');
  assert.deepEqual(again.data.sameFile, ['Tallow Formwork Pty Ltd (Formwork)']);
  assert.equal(again.data.items.length, 4, 'the second subcontract has its own list from the same reading');
  assert.equal(again.data.readings.used, 1);
  // The same file again on the same subcontract changes nothing and keeps the lead's changes.
  const item = again.data.items[0];
  await call('PUT', `/api/hse/subcontracts/${second}/items/${item.id}`, { reviewer: lead, body: { removed: true } });
  const third = await upload(lead, second, D.FORMWORK);
  assert.equal(third.status, 200);
  assert.equal(third.data.items[0].removed, true);
  assert.equal(asked.readings, before);
});

test('the project\'s free readings: at the limit no reading runs, and the same file still costs nothing', async () => {
  process.env.PROJECT_FREE_READINGS = '2';
  try {
    const { lead, projectId } = await leadWithProject('lead@limit4.example', 'Limit Four Pty Ltd');
    const subs = [];
    for (const trade of ['Painting', 'Tiling', 'Joinery']) subs.push(await addSub(lead, projectId, `${trade} Co`, trade));
    // A reading that fails does not count, so the lead can read the file again.
    asked.failNext = true;
    await upload(lead, subs[0], D.plainScope('Painting'));
    const failed = await finished(lead, subs[0]);
    assert.equal(failed.data.reading.status, 'failed');
    assert.equal(failed.data.readings.used, 0);
    await upload(lead, subs[0], D.plainScope('Painting'));
    await finished(lead, subs[0]);
    await upload(lead, subs[1], D.plainScope('Tiling'));
    const second = await finished(lead, subs[1]);
    assert.deepEqual(second.data.readings, { used: 2, limit: 2, left: 0, message: 'You have used this project\'s 2 free readings. Contact SiteWrite to add more.' });
    const before = asked.readings;
    const refused = await upload(lead, subs[2], D.plainScope('Joinery'));
    assert.equal(refused.status, 402);
    assert.equal(refused.data.message, 'You have used this project\'s 2 free readings. Contact SiteWrite to add more.');
    assert.equal(refused.data.limit, true);
    assert.equal(asked.readings, before, 'no reading ran');
    assert.equal(Number((await db.one("SELECT COUNT(*) AS n FROM ai_readings WHERE project_id = $1 AND status <> 'failed'", [projectId])).n), 2);
    // A re-read of the same file costs nothing and does not count, even at the limit.
    const same = await upload(lead, subs[2], D.plainScope('Tiling'));
    assert.equal(same.status, 200);
    assert.equal(same.data.kept, true);
    assert.equal(asked.readings, before);
    // The default is 50.
    delete process.env.PROJECT_FREE_READINGS;
    assert.equal(aiScope.projectFreeReadings(), 50);
    // Two uploads at the same moment cannot both take the last free reading.
    process.env.PROJECT_FREE_READINGS = '3';
    const both = await Promise.all([upload(lead, subs[0], D.plainScope('Render'), { replace: true }), upload(lead, subs[2], D.plainScope('Glazing'), { replace: true })]);
    assert.deepEqual(both.map((one) => one.status).sort(), [202, 402]);
  } finally {
    delete process.env.PROJECT_FREE_READINGS;
  }
});

test('a drawing or a price schedule is refused before any reading, and costs nothing', async () => {
  const { lead, projectId } = await leadWithProject('lead@wrong4.example', 'Wrong Four Pty Ltd');
  const subId = await addSub(lead, projectId);
  const before = asked.readings;
  const drawing = await upload(lead, subId, D.DRAWING, { name: 'A-101.txt' });
  assert.equal(drawing.status, 422);
  assert.match(drawing.data.message, /^This file has very few typed sentences\. It looks like a drawing or a scanned page, not a scope of works\./);
  const prices = await upload(lead, subId, D.PRICE_LIST, { name: 'Price schedule.txt' });
  assert.equal(prices.status, 422);
  assert.match(prices.data.message, /^This file looks like a price schedule: most of its lines are prices\./);
  assert.equal(asked.readings, before);
  assert.equal(Number((await db.one('SELECT COUNT(*) AS n FROM ai_readings WHERE project_id = $1', [projectId])).n), 0);
  // A picture is refused by its type, as on the subcontractor's page.
  const picture = await call('POST', `/api/hse/subcontracts/${subId}/scope`, { reviewer: lead, body: { file: { name: 'scope.png', data: 'iVBORw0KGgo=' } } });
  assert.equal(picture.status, 400);
  assert.equal(picture.data.message, 'SiteLink reads a scope from a Word file (.docx), a PDF or a text file. A photo or picture of a scope cannot be read.');
  // A PDF with no typed text (a scan, or a drawing with no text layer) is said plainly, with no offer to paste.
  const PDFDocument = require('pdfkit');
  const blank = await new Promise((resolve) => {
    const doc = new PDFDocument();
    const parts = [];
    doc.on('data', (part) => parts.push(part));
    doc.on('end', () => resolve(Buffer.concat(parts)));
    doc.rect(50, 50, 400, 300).stroke();
    doc.end();
  });
  const scan = await call('POST', `/api/hse/subcontracts/${subId}/scope`, { reviewer: lead, body: { file: { name: 'Scan.pdf', data: blank.toString('base64') } } });
  assert.equal(scan.status, 400);
  assert.equal(scan.data.message, 'This PDF has no typed text. It may be a drawing or a scanned page. Upload the scope of works as a Word file or a PDF with typed text.');
  // Every held scope is taken as a scope.
  const fs = require('fs');
  const path = require('path');
  const { notAScope } = require('../sitelink-scopes');
  const dir = path.join(__dirname, '..', 'scenarios', 'scopes');
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.txt'));
  assert.equal(files.length, 35);
  for (const name of files) assert.equal(notAScope(fs.readFileSync(path.join(dir, name), 'utf8')), '', name);
});

test('no price, rate or amount from a scope is kept, or shown to the lead or the subcontractor', async () => {
  const { lead, projectId } = await leadWithProject('lead@price4.example', 'Price Four Pty Ltd');
  const subId = await addSub(lead, projectId);
  await upload(lead, subId, D.FORMWORK);
  const page = await finished(lead, subId);
  const row = await db.one('SELECT reading, checks FROM ai_readings WHERE id = (SELECT reading_id FROM subcontracts WHERE id = $1)', [subId]);
  assert.doesNotMatch(row.reading, MONEY_LEFT, 'the kept reading holds no price');
  assert.doesNotMatch(row.checks, MONEY_LEFT);
  const stored = await db.query('SELECT title, task, item FROM required_swms WHERE subcontract_id = $1', [subId]);
  assert.doesNotMatch(JSON.stringify(stored), MONEY_LEFT);
  assert.doesNotMatch(JSON.stringify((await db.query('SELECT * FROM subcontract_points WHERE subcontract_id = $1', [subId]))), MONEY_LEFT);
  assert.doesNotMatch(JSON.stringify(page.data), MONEY_LEFT, 'the page holds no price');
  // The work stays: the edge protection activity lost only its rate; the point lost only its priced part.
  assert.match(page.data.items[1].task, /^Erect and dismantle edge protection to slab edges\.$/);
  assert.deepEqual(page.data.points.map((point) => point.question), ['Who provides the hoist for stripping; whether the', 'Whether the builder\'s tower crane is available for formwork lifts']
    .map((text, i) => (i === 0 ? page.data.points[0].question : text)));
  assert.doesNotMatch(page.data.points[0].question, /lump sum|1,234,567/);
  // The lead's own words are checked too.
  const priced = await call('POST', `/api/hse/subcontracts/${subId}/items`, { reviewer: lead, body: { title: 'Night pours', task: 'Night pours at $2,000 a night' } });
  assert.equal(priced.status, 400);
  assert.equal(priced.data.field, 'task');
  assert.match(priced.data.message, /^Take the price out\./);
});

test('the price scrub over every held scope: no money or commercial term reaches the list, even when the AI quotes every line', () => {
  const fs = require('fs');
  const path = require('path');
  const handover = require('../handover');
  const dir = path.join(__dirname, '..', 'scenarios', 'scopes');
  // Commercial lines as builders write them, added to each scope, so every scope has some.
  const EXTRA = ['Lump sum price: $1,234,567.00 excl. GST.', 'Hourly rate $85.00/hr; day labour rates apply.', 'Retention of 5% retention on each progress claim.', 'Payment within 30 days of a valid invoice.', 'Provisional sum AUD 25000 for variations.', 'Item 4 Install cable tray 45,600.00'];
  const LEFT = /\$|\bAUD\b|\b\d{1,3}(?:,\d{3})+\.\d{2}\b|\b(?:lump sum|gst|retention|invoic\w*|payments?|provisional sum|labour rates?|day labour|prices?|variations?|progress claims?|costs?)\b/i;
  let lines = 0;
  for (const name of fs.readdirSync(dir).filter((file) => file.endsWith('.txt'))) {
    const text = `${fs.readFileSync(path.join(dir, name), 'utf8')}\n${EXTRA.join('\n')}`;
    const all = text.split('\n').map((line) => line.trim()).filter((line) => /[A-Za-z]/.test(line));
    lines += all.length;
    // The worst case: each line is an activity of its own, quoted in full, with its own words as the
    // activity, place, plant, conditions and point to confirm, in packages named from the line.
    const activities = all.slice(0, 400).map((line, i) => ({
      activity: line.slice(0, 200), type: i % 9 === 0 ? 'Duty' : 'Site work', package: i % 3 ? 'Trade installation: building' : `Works ${line.slice(0, 40)}`, crew: '', clause: String(i), quotes: [line, all[i + 1] || line],
      where: line.slice(0, 60), plant: line.slice(0, 40), conditions: line.slice(0, 80), unknowns: line, matrixColumn: '',
    }));
    const packs = [...new Set(activities.map((row) => row.package))].map((pack) => ({ package: pack, groups: [], byOthers: [], unknown: [], unmatched: [pack] }));
    const reading = { activities, byOthers: [{ work: all[0], party: 'Builder', clause: '1', quotes: all.slice(0, 5) }], conflicts: [{ clauseA: '1', quoteA: all[0], clauseB: '2', quoteB: all[1], why: all[2], confidence: 'Low' }], packages: packs };
    const items = handover.listItems(reading).map(({ package: _p, ...item }) => item);
    const points = handover.listPoints(reading).map((point) => ({ ...point, answer: 'Yes, the builder provides it.' }));
    const view = handover.subcontractorView({ project: { name: 'P', workplace: 'W', state: 'nsw', pc_name: 'B' }, org: { name: 'B' }, subcontract: { name: 'S' }, items: items.map((item) => ({ title: item.title, task: item.task, item, source: 'reading' })), points, siteDetails: null, fields: [] });
    const out = JSON.stringify({ items, points, view, kept: handover.scrubReading(reading) });
    const found = out.match(LEFT);
    assert.ok(!found, `${name}: "${found && out.slice(Math.max(0, found.index - 80), found.index + 40)}"`);
  }
  assert.ok(lines > 3000, `every line of the 35 held scopes was tried (${lines})`);
});

test('the points to confirm: the lead may answer them, and only the answered ones go to the subcontractor', async () => {
  const { lead, projectId } = await leadWithProject('lead@points4.example', 'Points Four Pty Ltd');
  const subId = await addSub(lead, projectId);
  await upload(lead, subId, D.FORMWORK);
  const page = await finished(lead, subId);
  assert.equal(page.data.points.length, 2);
  assert.deepEqual(page.data.preview.answers, [], 'nothing unanswered goes');
  const [first, second] = page.data.points;
  assert.equal((await call('PUT', `/api/hse/subcontracts/${subId}/points/${first.id}`, { reviewer: lead, body: { answer: 'TBC' } })).data.field, 'answer');
  const answered = await call('PUT', `/api/hse/subcontracts/${subId}/points/${second.id}`, { reviewer: lead, body: { answer: 'Yes, from 7 am to 3 pm. Book it with the site manager the day before.' } });
  assert.equal(answered.status, 200);
  assert.equal(answered.data.message, 'Your answer is saved. The subcontractor will see it with the list.');
  assert.deepEqual(answered.data.preview.answers.map((item) => [item.question, item.answer, item.by]), [['Whether the builder\'s tower crane is available for formwork lifts', 'Yes, from 7 am to 3 pm. Book it with the site manager the day before.', 'Riley Morgan']]);
  // Taking the answer off takes the point out of what the subcontractor sees.
  const cleared = await call('PUT', `/api/hse/subcontracts/${subId}/points/${second.id}`, { reviewer: lead, body: { answer: '' } });
  assert.equal(cleared.data.message, 'The answer is taken off. The subcontractor will not see this point.');
  assert.deepEqual(cleared.data.preview.answers, []);
  // The conflicts, the crew, the matrix column and the duties never go.
  const preview = JSON.stringify(cleared.data.preview);
  assert.doesNotMatch(preview, /Day works|Formworkers|site supervisor/);
});

test('keep, remove, put back, add and reword: the preview follows, and every package can be removed', async () => {
  const { lead, projectId } = await leadWithProject('lead@edit4.example', 'Edit Four Pty Ltd');
  const subId = await addSub(lead, projectId);
  await upload(lead, subId, D.FORMWORK);
  let page = (await finished(lead, subId)).data;
  assert.deepEqual(page.preview.swms.map((item) => item.title), ['Formwork and falsework', 'Edge protection', 'Plant lifting and cranage']);
  const rev = page.subcontract.listRev;
  for (const item of page.items.filter((one) => !one.removed)) page = (await call('PUT', `/api/hse/subcontracts/${subId}/items/${item.id}`, { reviewer: lead, body: { removed: true } })).data;
  assert.equal(page.preview.swms.length, 0, 'every package removed');
  assert.equal(page.subcontract.listRev, rev + 3);
  assert.equal((await call('GET', `/api/hse/projects/${projectId}`, { reviewer: lead })).data.subcontracts[0].swms, 0);
  page = (await call('PUT', `/api/hse/subcontracts/${subId}/items/${page.items[0].id}`, { reviewer: lead, body: { removed: false } })).data;
  assert.equal(page.message, 'Formwork and falsework is back on the list.');
  // The off-site package can be put back too.
  page = (await call('PUT', `/api/hse/subcontracts/${subId}/items/${page.items[3].id}`, { reviewer: lead, body: { removed: false } })).data;
  assert.equal(page.items[3].removedWhy, '');
  assert.equal((await call('POST', `/api/hse/subcontracts/${subId}/items`, { reviewer: lead, body: { title: '', task: 'Something' } })).data.field, 'title');
  page = (await call('POST', `/api/hse/subcontracts/${subId}/items`, { reviewer: lead, body: { title: 'Perimeter screens', task: 'Install, climb and remove the perimeter screens on levels 2 to 6.' } })).data;
  assert.equal(page.items[4].source, 'added');
  page = (await call('PUT', `/api/hse/subcontracts/${subId}/items/${page.items[0].id}`, { reviewer: lead, body: { task: 'Erect, strip and back-prop formwork to suspended slabs.' } })).data;
  assert.equal(page.items[0].taskChanged, true);
  assert.deepEqual(page.preview.swms.map((item) => [item.title, item.task]), [
    ['Formwork and falsework', 'Erect, strip and back-prop formwork to suspended slabs.'],
    ['Off-site fabrication', 'Fabricate column forms.'],
    ['Perimeter screens', 'Install, climb and remove the perimeter screens on levels 2 to 6.'],
  ]);
  // The stored SWMS carries the lead's words, for the subcontractor's draft.
  const row = await db.one('SELECT item FROM required_swms WHERE subcontract_id = $1 AND position = 0', [subId]);
  assert.equal(row.item.task, 'Erect, strip and back-prop formwork to suspended slabs.');
  // A new scope replaces the list only when the lead says so. SWMS the lead added stay.
  const replace = await upload(lead, subId, D.ELECTRICAL);
  assert.equal(replace.status, 409);
  assert.equal(replace.data.replace, true);
  await upload(lead, subId, D.ELECTRICAL, { replace: true });
  page = (await finished(lead, subId)).data;
  assert.deepEqual(page.items.map((item) => item.title), ['Trade installation: ceiling space', 'Plant lifting and cranage', 'Testing and commissioning', 'Perimeter screens']);
});

test('the lead\'s changes to a list are kept without names or ids, and only with control learning on', async () => {
  const { lead, projectId, orgId } = await leadWithProject('lead@learn4.example', 'Learnwell Constructions Pty Ltd', 'Quinn Ashdown');
  const subId = await addSub(lead, projectId, 'Brackenridge Formwork Pty Ltd', 'Formwork');
  await upload(lead, subId, D.FORMWORK);
  let page = (await finished(lead, subId)).data;
  const before = Number((await db.one('SELECT COUNT(*) AS n FROM list_edit_events')).n);
  await call('PUT', `/api/hse/subcontracts/${subId}/items/${page.items[1].id}`, { reviewer: lead, body: { removed: true } });
  assert.equal(Number((await db.one('SELECT COUNT(*) AS n FROM list_edit_events')).n), before, 'off: nothing kept');
  process.env.CONTROL_LEARNING = 'on';
  try {
    page = (await call('PUT', `/api/hse/subcontracts/${subId}/items/${page.items[1].id}`, { reviewer: lead, body: { removed: false } })).data;
    await call('PUT', `/api/hse/subcontracts/${subId}/items/${page.items[0].id}`, { reviewer: lead, body: { task: 'Erect formwork at Harbour Street offices for Learnwell Constructions; call Quinn Ashdown on 0412 345 678 or quinn@learn4.example.' } });
    await call('POST', `/api/hse/subcontracts/${subId}/items`, { reviewer: lead, body: { title: 'Brackenridge screens', task: 'Install perimeter screens at 40 Harbour Street.' } });
  } finally {
    delete process.env.CONTROL_LEARNING;
  }
  const rows = await db.query('SELECT * FROM list_edit_events ORDER BY created_at');
  const mine = rows.slice(before);
  assert.deepEqual(mine.map((row) => row.kind), ['restored', 'taskChanged', 'added']);
  const all = JSON.stringify(mine);
  for (const secret of [projectId, orgId, subId, 'Learnwell', 'Quinn', 'Ashdown', 'Brackenridge', 'Harbour', '0412', 'learn4.example', 'Tallow']) assert.ok(!all.includes(secret), `no ${secret}`);
  assert.deepEqual(Object.keys(mine[0]).sort(), ['brief_version', 'created_at', 'id', 'kind', 'month', 'original', 'package', 'reading_key', 'state', 'wording']);
  assert.equal(mine[0].state, 'nsw');
  assert.equal(mine[0].package, 'Edge protection');
  assert.match(mine[0].reading_key, /^[0-9a-f]{64}$/);
  // Kept 3 years, like the other learning rows.
  const old = new Date();
  old.setFullYear(old.getFullYear() - 4);
  await db.query("INSERT INTO list_edit_events (id, month, kind, created_at) VALUES ('old-edit', '2022-01', 'removed', $1)", [old]);
  await require('../control-learning').removeOld();
  assert.equal(await db.one("SELECT id FROM list_edit_events WHERE id = 'old-edit'"), null);
  assert.equal(Number((await db.one('SELECT COUNT(*) AS n FROM list_edit_events')).n), rows.length);
});

test('isolation: a reading made for one account is never readable by another account or any subcontractor company', async () => {
  const a = await leadWithProject('lead@iso4a.example', 'Isolation A Pty Ltd');
  const b = await leadWithProject('lead@iso4b.example', 'Isolation B Pty Ltd');
  const subId = await addSub(a.lead, a.projectId);
  await upload(a.lead, subId, D.FORMWORK);
  const page = (await finished(a.lead, subId)).data;
  const readingId = (await db.one('SELECT reading_id FROM subcontracts WHERE id = $1', [subId])).reading_id;
  const itemId = page.items[0].id;
  const pointId = page.points[0].id;
  // A member of account B, and a person in no account, and a subcontractor's company account.
  await call('POST', `/api/hse/orgs/${b.orgId}/members`, { reviewer: b.lead, body: { email: 'member@iso4b.example' } });
  const memberB = await hseSignIn('member@iso4b.example', 'Ash Kim');
  await call('GET', '/api/hse/me', { reviewer: memberB });
  const nobody = await hseSignIn('nobody@iso4c.example', 'Pat Doyle');
  await call('POST', '/api/auth/email', { body: { email: 'office@tallowsub.example' } });
  const company = (await call('POST', '/api/auth/verify', { body: { token: lastLinkToken('office@tallowsub.example') } })).data.token;
  const routes = [
    ['GET', `/api/hse/subcontracts/${subId}`],
    ['PUT', `/api/hse/subcontracts/${subId}`, { name: 'Taken', trade: 'Taken' }],
    ['POST', `/api/hse/subcontracts/${subId}/scope`, { text: D.ELECTRICAL, replace: true }],
    ['POST', `/api/hse/subcontracts/${subId}/items`, { title: 'Taken', task: 'Taken over the list.' }],
    ['PUT', `/api/hse/subcontracts/${subId}/items/${itemId}`, { removed: true }],
    ['PUT', `/api/hse/subcontracts/${subId}/points/${pointId}`, { answer: 'Taken' }],
    ['DELETE', `/api/hse/subcontracts/${subId}`],
    ['POST', `/api/hse/projects/${a.projectId}/subcontracts`, { name: 'Taken', trade: 'Taken' }],
    ['GET', `/api/hse/projects/${a.projectId}`],
  ];
  const readingsBefore = asked.readings;
  for (const [method, route, body] of routes) {
    for (const [who, reviewer] of [['lead B', b.lead], ['member B', memberB], ['no account', nobody]]) {
      const out = await call(method, route, { reviewer, body });
      assert.equal(out.status, 404, `${who} ${method} ${route}`);
      assert.doesNotMatch(JSON.stringify(out.data), /Isolation A|Tallow|Formwork and falsework/, `${who} learns nothing`);
    }
    assert.equal((await call(method, route, { token: company, body })).status, 401, `a company ${method} ${route}`);
    assert.equal((await call(method, route, { body })).status, 401, `signed out ${method} ${route}`);
  }
  assert.equal(asked.readings, readingsBefore, 'no reading was started by anyone else');
  const still = (await call('GET', `/api/hse/subcontracts/${subId}`, { reviewer: a.lead })).data;
  assert.equal(still.subcontract.name, 'Tallow Formwork Pty Ltd');
  assert.equal(still.items.filter((item) => item.source === 'added').length, 0);
  assert.equal(still.points[0].answer, '');
  // A company cannot open the account's reading by its id, or its report, and reading the same
  // file itself makes the company's own reading: the account's is never handed over.
  assert.equal((await call('GET', `/api/scope/ai/${readingId}`, { token: company })).status, 404);
  assert.equal((await call('GET', `/api/scope/ai/${readingId}/report.docx`, { token: company })).status, 404);
  await assert.rejects(aiScope.getReading({ id: '' }, readingId), /not found/);
  const own = await aiScope.startReading({ id: 'company-iso-4' }, D.FORMWORK);
  assert.equal(own.kept, false);
  assert.notEqual(own.id, readingId);
  await own.done;
  // Account B uploading the same file gets a reading of its own, and cannot reach A's through it.
  const bSub = await addSub(b.lead, b.projectId);
  const before = asked.readings;
  const bStarted = await upload(b.lead, bSub, D.FORMWORK);
  assert.equal(bStarted.status, 202);
  assert.equal(asked.readings, before + 1);
  await finished(b.lead, bSub);
  assert.notEqual((await db.one('SELECT reading_id FROM subcontracts WHERE id = $1', [bSub])).reading_id, readingId);
  await assert.rejects(aiScope.getProjectReading({ id: b.orgId }, readingId), /not found/);
  // A removed subcontract is gone for everyone.
  assert.equal((await call('DELETE', `/api/hse/subcontracts/${subId}`, { reviewer: a.lead })).status, 200);
  assert.equal((await call('GET', `/api/hse/subcontracts/${subId}`, { reviewer: a.lead })).status, 404);
});

test('the owner\'s AI readings page tags a project reading with the account and project', async () => {
  const rows = await db.query("SELECT r.id, o.name AS org FROM ai_readings r JOIN orgs o ON o.id = r.org_id WHERE r.org_id <> '' LIMIT 1");
  assert.ok(rows.length);
  const admin = require('../admin');
  const layer = admin.router.stack.find((item) => item.route && item.route.path === '/admin/ai-readings');
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;
  const prev = process.env.ADMIN_EMAILS;
  let out = null;
  process.env.ADMIN_EMAILS = 'owner@sitewrite.example';
  try {
    await handler({ user: { email: 'owner@sitewrite.example' }, company: {} }, { json: (value) => { out = value; }, set() {} }, (error) => { throw error; });
  } finally {
    if (prev === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = prev;
  }
  assert.ok(out, 'the page answered');
  assert.ok(out.readings.some((item) => /^SiteLink project: Harbour Street offices \(/.test(item.company)));
});
