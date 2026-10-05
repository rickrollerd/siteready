// Proof of reading at worker sign-on (task #92): the read time, the check questions, the
// supervisor option, the reading record and translations (with a stand-in for the model).
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { app } = require('../server');
const db = require('../db');
const aiScope = require('../ai-scope');
const signRead = require('../sign-read');
const { prepareDraft } = require('../draft');
const { withCompany } = require('../accounts');
const { setupAccounts, lastLinkToken } = require('./helpers');

let server;
let base;

test.before(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  await setupAccounts();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server.close();
  delete process.env.ANTHROPIC_API_KEY;
  aiScope.useClient(null);
});

function call(method, route, { body, token } = {}) {
  return fetch(`${base}${route}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// A valid ABN made from the email, as in the accounts tests.
function abnFor(seed) {
  let n = 0;
  for (const ch of seed) n = (n * 31 + ch.charCodeAt(0)) % 1000000000;
  const tail = String(n).padStart(9, '0');
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  for (let head = 10; head <= 99; head += 1) {
    const digits = `${head}${tail}`;
    const total = [...digits].reduce((sum, d, i) => sum + (Number(d) - (i === 0 ? 1 : 0)) * weights[i], 0);
    if (total % 89 === 0) return digits;
  }
  return abnFor(`${seed}x`);
}

const INPUT = {
  state: 'qld',
  task: 'Install sprinkler pipework in the ward ceilings from scissor lifts more than 2 m above the floor.',
  fallRisk: 'yes',
  facts: { fallControl: 'Scissor lifts with guardrails are used for all work above 2 m.' },
};
const SIGNATURE = `data:image/png;base64,${Buffer.from('signature').toString('base64')}`;

// A saved SWMS and its sign-on key, for a fresh business.
async function savedSwms(email) {
  await call('POST', '/api/auth/email', { body: { email } });
  const { token } = await (await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } })).json();
  await call('PUT', '/api/company', { token, body: { name: `Test business ${email}`, abn: abnFor(email) } });
  const { swms } = await (await call('POST', '/api/swms', { token, body: { input: INPUT, reviewConfirmed: true, reviewedBy: 'Alex Chen' } })).json();
  const key = new URLSearchParams(swms.signonPath.split('?')[1]).get('t');
  return { token, swms, key };
}

// The worker's page has been open this many seconds: the read row is backdated.
async function openFor(readId, seconds) {
  await db.query('UPDATE sign_reads SET started_at = $1 WHERE id = $2', [new Date(Date.now() - seconds * 1000), readId]);
}

async function questionsFor(swmsId) {
  const row = await db.one('SELECT * FROM swms WHERE id = $1', [swmsId]);
  const company = await db.one('SELECT * FROM companies WHERE id = $1', [row.company_id]);
  return signRead.checkQuestions(row.id, prepareDraft(withCompany(row.input, company)));
}

const rightAnswers = (questions) => Object.fromEntries(questions.map((q) => [q.id, q.answer]));
const total = (view) => view.sections.reduce((sum, item) => sum + item.minSeconds, 0);

test('the page gets every section with its reading time, and questions without their answers', async () => {
  const { swms, key } = await savedSwms('questions@read.example');
  const view = await (await call('GET', `/api/sign/${key}`)).json();
  assert.ok(view.readId);
  assert.equal(view.sections.length, view.jobSteps.length + 2, 'high risk, each step and PPE');
  assert.ok(view.sections.every((item) => item.minSeconds >= 2));
  assert.equal(view.questions.length, 2);
  for (const q of view.questions) {
    assert.deepEqual(Object.keys(q).sort(), ['id', 'options', 'question', 'section']);
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options).size, 4);
  }
  const text = JSON.stringify(view);
  assert.doesNotMatch(text, /"answer"|"correct"|"ticked"/, 'nothing in the page gives the answers away');
  assert.ok(view.ppe.every((item) => typeof item === 'string'), 'only the PPE to wear is sent');
  assert.deepEqual(view.languages, [], 'no languages without the AI');

  // Made the same way every time, and the right answers are what the SWMS says.
  const questions = await questionsFor(swms.id);
  assert.deepEqual(signRead.publicQuestions(questions), view.questions);
  const ppe = questions.find((q) => q.id === 'ppe');
  assert.equal(ppe.question, 'Which of these PPE does this SWMS list?');
  assert.ok(view.ppe.includes(ppe.options[ppe.answer]));
  assert.equal(ppe.options.filter((option) => view.ppe.includes(option)).length, 1, 'the decoys are PPE not ticked');
  assert.ok(ppe.options.filter((option) => !view.ppe.includes(option)).every((option) => !/sleeves|pants|clothing|hi-?vis|glasses|gloves|boots|hard hat|sunscreen|brim|chin strap/i.test(option)), 'no everyday PPE as a wrong answer');
  const steps = questions.find((q) => q.id === 'steps');
  const names = view.jobSteps.map((step) => step.step);
  assert.ok(names.includes(steps.options[steps.answer]));
  assert.ok(!['Before starting', 'Finish and clean up'].includes(steps.options[steps.answer]));
  assert.equal(steps.options.filter((option) => names.includes(option)).length, 1, 'the decoys are steps not in this SWMS');
});

test('a sign-on is refused without a read id, and when the SWMS was not open long enough', async () => {
  const { swms, key } = await savedSwms('fast@read.example');
  const view = await (await call('GET', `/api/sign/${key}`)).json();
  const answers = rightAnswers(await questionsFor(swms.id));
  const body = { name: 'Quick Worker', signature: SIGNATURE, confirmed: true, answers };

  const noRead = await call('POST', `/api/sign/${key}`, { body });
  assert.equal(noRead.status, 400);
  assert.match((await noRead.json()).message, /Read the SWMS first/);
  const madeUp = await call('POST', `/api/sign/${key}`, { body: { ...body, readId: 'made-up' } });
  assert.equal(madeUp.status, 400);

  // Scrolling straight to the bottom and signing is too fast.
  const fast = await call('POST', `/api/sign/${key}`, { body: { ...body, readId: view.readId } });
  assert.equal(fast.status, 400);
  assert.match((await fast.json()).message, /Read the SWMS first/);
  // Just under 80% of the reading time is still too fast; just over is enough.
  await openFor(view.readId, Math.floor(total(view) * signRead.SERVER_SHARE) - 2);
  assert.equal((await call('POST', `/api/sign/${key}`, { body: { ...body, readId: view.readId } })).status, 400);
  await openFor(view.readId, Math.ceil(total(view) * signRead.SERVER_SHARE) + 2);
  assert.equal((await call('POST', `/api/sign/${key}`, { body: { ...body, readId: view.readId } })).status, 201);

  // One reading signs on one worker.
  const again = await call('POST', `/api/sign/${key}`, { body: { ...body, name: 'Second Worker', readId: view.readId } });
  assert.equal(again.status, 400);
  assert.match((await again.json()).message, /already been used/);
  // A read id from another SWMS does not work here.
  const other = await savedSwms('other@read.example');
  const otherView = await (await call('GET', `/api/sign/${other.key}`)).json();
  await openFor(otherView.readId, 3600);
  assert.equal((await call('POST', `/api/sign/${key}`, { body: { ...body, readId: otherView.readId } })).status, 400);
});

test('a wrong answer names the question and the section to read again, and the worker can retry', async () => {
  const { swms, key } = await savedSwms('wrong@read.example');
  const view = await (await call('GET', `/api/sign/${key}`)).json();
  await openFor(view.readId, 3600);
  const questions = await questionsFor(swms.id);
  const answers = rightAnswers(questions);
  const body = { name: 'Retry Worker', signature: SIGNATURE, confirmed: true, readId: view.readId };

  const wrongPpe = await call('POST', `/api/sign/${key}`, { body: { ...body, answers: { ...answers, ppe: (answers.ppe + 1) % 4 } } });
  assert.equal(wrongPpe.status, 400);
  const first = await wrongPpe.json();
  assert.deepEqual(first.wrong, ['ppe']);
  assert.deepEqual(first.sections, ['ppe']);
  assert.match(first.message, /question 1 is not right/);
  assert.match(first.message, /PPE to wear section/);

  const wrongSteps = await call('POST', `/api/sign/${key}`, { body: { ...body, answers: { ...answers, steps: (answers.steps + 1) % 4 } } });
  const second = await wrongSteps.json();
  assert.deepEqual(second.wrong, ['steps']);
  assert.match(second.message, /question 2 is not right.*Job steps section/);

  const none = await (await call('POST', `/api/sign/${key}`, { body: { ...body, answers: {} } })).json();
  assert.deepEqual(none.wrong, ['ppe', 'steps']);
  assert.match(none.message, /PPE to wear and Job steps sections/);

  assert.equal((await call('POST', `/api/sign/${key}`, { body: { ...body, answers } })).status, 201);
  const row = await db.one('SELECT * FROM signons WHERE swms_id = $1', [swms.id]);
  assert.equal(row.check_attempts, 4, 'every attempt is counted');
});

test('a sign-on keeps the reading record, and it is printed on the sign-on sheet', async () => {
  const { token, swms, key } = await savedSwms('record@read.example');
  const view = await (await call('GET', `/api/sign/${key}`)).json();
  await openFor(view.readId, 400);
  const answers = rightAnswers(await questionsFor(swms.id));
  // The page's own times: every section but the last read long enough, plus one it never showed.
  const reported = Object.fromEntries(view.sections.map((item, i) => [item.id, i === view.sections.length - 1 ? 0.5 : item.minSeconds + 1.25]));
  const response = await call('POST', `/api/sign/${key}`, {
    body: { name: 'Record Worker', company: 'Crew Co', signature: SIGNATURE, confirmed: true, readId: view.readId, answers, language: 'en', reading: { sections: { ...reported, madeUp: 99 } } },
  });
  assert.equal(response.status, 201);
  const row = await db.one('SELECT * FROM signons WHERE swms_id = $1', [swms.id]);
  assert.equal(row.language, 'en');
  assert.ok(row.read_seconds >= 399 && row.read_seconds <= 410, `the server's time, not the page's (${row.read_seconds})`);
  assert.equal(row.sections_total, view.sections.length);
  assert.equal(row.sections_viewed, view.sections.length - 1);
  assert.deepEqual(Object.keys(JSON.parse(row.section_seconds)), view.sections.map((item) => item.id), 'only known sections are kept');
  assert.equal(row.check_attempts, 1);
  assert.equal(row.explained_by, '');

  const note = signRead.readingNote(row);
  assert.match(note, new RegExp(`^Read in English, 6 min \\d+ s, ${view.sections.length - 1} of ${view.sections.length} sections viewed, check questions passed \\(1 attempt\\)$`));
  const detail = await (await call('GET', `/api/swms/${swms.id}`, { token })).json();
  assert.equal(detail.signons[0].reading, note);

  const docx = await call('GET', `/api/swms/${swms.id}/docx`, { token });
  const xml = await (await JSZip.loadAsync(Buffer.from(await docx.arrayBuffer()))).file('word/document.xml').async('string');
  assert.ok(xml.includes(note), 'the Word sign-on sheet shows how the worker read it');
  const pdf = await call('GET', `/api/swms/${swms.id}/pdf`, { token });
  assert.equal(pdf.status, 200);

  // The line for a translation, and for older sign-ons without a record.
  assert.equal(signRead.readingNote({ language: 'vi', read_seconds: 400, sections_viewed: 12, sections_total: 12, check_attempts: 2 }),
    'Read in Vietnamese (translation), 6 min 40 s, all 12 sections viewed, check questions passed (2 attempts)');
  assert.equal(signRead.readingNote({ language: '' }), '');
});

test('a worker whose supervisor explained the SWMS signs on without the read time or questions', async () => {
  const { token, swms, key } = await savedSwms('explained@read.example');
  const body = { name: 'Explained Worker', signature: SIGNATURE, confirmed: true, explained: true };
  const noName = await call('POST', `/api/sign/${key}`, { body });
  assert.equal(noName.status, 400);
  assert.match((await noName.json()).message, /supervisor/);
  assert.equal((await call('POST', `/api/sign/${key}`, { body: { ...body, supervisor: 'J Smith' } })).status, 201);
  const row = await db.one('SELECT * FROM signons WHERE swms_id = $1', [swms.id]);
  assert.equal(row.explained_by, 'J Smith');
  assert.equal(row.check_attempts, null);
  assert.equal(row.read_seconds, null);
  assert.equal(signRead.readingNote(row), 'Explained by J Smith (supervisor)');
  const detail = await (await call('GET', `/api/swms/${swms.id}`, { token })).json();
  assert.equal(detail.signons[0].reading, 'Explained by J Smith (supervisor)');
});

// A stand-in for the model: it "translates" by marking each string, and counts its calls.
function translator() {
  const calls = [];
  const mark = (value) => (typeof value === 'string' ? `[vi] ${value}` : Array.isArray(value) ? value.map(mark)
    : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mark(item)])));
  return {
    calls,
    broken: false,
    beta: {
      messages: {
        stream: (params) => {
          calls.push(params);
          const english = JSON.parse(/<swms>\n([^]*)\n<\/swms>/.exec(params.messages[0].content)[1]);
          const answer = client.broken ? { ...mark(english), ppe: [] } : mark(english);
          return { finalMessage: async () => ({ stop_reason: 'end_turn', model: 'claude-opus-5-5', usage: { input_tokens: 100, output_tokens: 100 }, content: [{ type: 'text', text: JSON.stringify(answer) }] }) };
        },
      },
    },
  };
}
let client = null;

test('translation is off without an API key', async () => {
  const { key } = await savedSwms('nokey@read.example');
  const view = await (await call('GET', `/api/sign/${key}`)).json();
  assert.deepEqual(view.languages, []);
  const response = await call('GET', `/api/sign/${key}/translation?lang=vi`);
  assert.equal(response.status, 503);
  assert.match((await response.json()).message, /not available/);
});

test('a SWMS is translated once per language, with the stand-in model, and kept', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
  client = translator();
  aiScope.useClient(client);
  try {
    const { swms, key } = await savedSwms('translate@read.example');
    const view = await (await call('GET', `/api/sign/${key}`)).json();
    assert.equal(view.languages.length, signRead.LANGUAGES.length);
    assert.ok(view.languages.some((item) => item.code === 'ar' && item.rtl && item.label === 'Arabic (العربية)'));
    assert.ok(view.languages.some((item) => item.label === 'Filipino (Tagalog)'));

    const first = await call('GET', `/api/sign/${key}/translation?lang=vi`);
    assert.equal(first.status, 200);
    const translated = await first.json();
    assert.equal(client.calls.length, 1);
    const params = client.calls[0];
    assert.equal(params.output_config.effort, 'medium');
    assert.equal(params.output_config.format.schema, signRead.TRANSLATE_SCHEMA);
    assert.match(params.system[0].text, /Translate faithfully/);
    assert.match(params.messages[0].content, /into Vietnamese/);
    assert.doesNotMatch(params.messages[0].content, /"answer"/, 'the answers are not sent to be translated');
    assert.deepEqual(translated.language, { code: 'vi', name: 'Vietnamese', rtl: false, lessReliable: false });
    assert.equal(translated.title, `[vi] ${swms.title}`);
    assert.equal(translated.steps.length, view.jobSteps.length);
    assert.equal(translated.steps[1].controls[0], `[vi] ${view.jobSteps[1].controls[0]}`);
    assert.deepEqual(translated.ppe, view.ppe.map((item) => `[vi] ${item}`));
    assert.equal(translated.questions[0].options.length, 4);
    assert.equal(translated.questions[0].question, `[vi] ${view.questions[0].question}`);

    // Asked again, from any phone: kept, so no second call.
    assert.equal((await call('GET', `/api/sign/${key}/translation?lang=vi`)).status, 200);
    assert.equal(client.calls.length, 1);
    const arabic = await (await call('GET', `/api/sign/${key}/translation?lang=ar`)).json();
    assert.equal(arabic.language.rtl, true);
    assert.equal(client.calls.length, 2, 'each language is its own translation');

    assert.equal((await call('GET', `/api/sign/${key}/translation?lang=xx`)).status, 400);

    // A translation that does not match the English item for item is not used or kept.
    client.broken = true;
    const broken = await call('GET', `/api/sign/${key}/translation?lang=ko`);
    assert.equal(broken.status, 502);
    client.broken = false;
    assert.equal((await call('GET', `/api/sign/${key}/translation?lang=ko`)).status, 200);
    assert.equal(client.calls.length, 4);

    // Answering in a translation is marked the same way, and the record names the language.
    await openFor(view.readId, 3600);
    const answers = rightAnswers(await questionsFor(swms.id));
    assert.equal((await call('POST', `/api/sign/${key}`, { body: { name: 'Viet Worker', signature: SIGNATURE, confirmed: true, readId: view.readId, answers, language: 'vi' } })).status, 201);
    const row = await db.one('SELECT * FROM signons WHERE swms_id = $1', [swms.id]);
    assert.match(signRead.readingNote(row), /^Read in Vietnamese \(translation\), 60 min 0 s, 0 of \d+ sections viewed, check questions passed \(1 attempt\)$/);
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
    aiScope.useClient(null);
  }
});
