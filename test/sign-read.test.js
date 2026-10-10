// Proof of reading at worker sign-on (task #92): the read time, the check questions, the
// supervisor option, the reading record (kept, never shown to the business) and translations
// (with a stand-in for the model).
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { PDFParse } = require('pdf-parse');
const { app } = require('../server');
const db = require('../db');
const aiScope = require('../ai-scope');
const signRead = require('../sign-read');
const { prepareDraft } = require('../draft');
const { withCompany } = require('../accounts');
const { setupAccounts, lastLinkToken, ANSWERED, ready } = require('./helpers');

let server;
let base;

test.before(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  await setupAccounts();
  server = app.listen(0);
  // As in production (server.js): the pool test below holds the process for seconds, and a
  // shorter keep-alive closes the socket the next request reuses ("fetch failed").
  server.keepAliveTimeout = 65000;
  await new Promise((resolve) => server.once('listening', resolve));
  // A test that runs for more than 5 s without a request lets the server close the idle
  // keep-alive connection just as the next request reuses it ("fetch failed" on a busy machine).
  server.keepAliveTimeout = 60000;
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

// The site questions answered, as a SWMS needs before it is saved or downloaded (goal 2).
const INPUT = ready({
  ...ANSWERED,
  state: 'qld',
  task: 'Install sprinkler pipework in the ward ceilings from scissor lifts more than 2 m above the floor.',
  fallRisk: 'yes',
  facts: { fallControl: 'Scissor lifts with guardrails are used for all work above 2 m.' },
});
const SIGNATURE = `data:image/png;base64,${Buffer.from('signature').toString('base64')}`;

// A saved SWMS and its sign-on key, for a fresh business.
async function savedSwms(email, input = INPUT) {
  await call('POST', '/api/auth/email', { body: { email } });
  const { token } = await (await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } })).json();
  await call('PUT', '/api/company', { token, body: { name: `Test business ${email}`, abn: abnFor(email) } });
  const { swms } = await (await call('POST', '/api/swms', { token, body: { input, reviewConfirmed: true, reviewedBy: 'Alex Chen' } })).json();
  const key = new URLSearchParams(swms.signonPath.split('?')[1]).get('t');
  return { token, swms, key };
}

// The worker's page has been open this many seconds: the read row is backdated.
async function openFor(readId, seconds) {
  await db.query('UPDATE sign_reads SET started_at = $1 WHERE id = $2', [new Date(Date.now() - seconds * 1000), readId]);
}

async function draftFor(swmsId) {
  const row = await db.one('SELECT * FROM swms WHERE id = $1', [swmsId]);
  const company = await db.one('SELECT * FROM companies WHERE id = $1', [row.company_id]);
  return prepareDraft(withCompany(row.input, company));
}

// The questions for one read of a SWMS, with their answers: those first asked, or those after
// this many wrong attempts.
async function questionsFor(swmsId, readId, round = 0) {
  return signRead.checkQuestions(swmsId, readId, await draftFor(swmsId), round);
}

// The wait after a wrong attempt has passed: the last wrong answer is backdated.
async function waited(readId, seconds = 600) {
  await db.query('UPDATE sign_reads SET wrong_at = $1 WHERE id = $2', [new Date(Date.now() - seconds * 1000), readId]);
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

  // Made the same way every time for this read, and the right answers are what the SWMS says.
  const questions = await questionsFor(swms.id, view.readId);
  assert.deepEqual(signRead.publicQuestions(questions), view.questions);
  const ppe = questions.find((q) => q.id === 'ppe');
  assert.equal(ppe.question, 'Which of these PPE does this SWMS list?');
  assert.ok(view.ppe.includes(ppe.options[ppe.answer]));
  assert.equal(ppe.options.filter((option) => view.ppe.includes(option)).length, 1, 'the decoys are PPE not ticked');
  assert.ok(ppe.options.filter((option) => !view.ppe.includes(option)).every((option) => !/sleeves|pants|clothing|hi-?vis|glasses|gloves|boots|hard hat|sunscreen|brim|chin strap/i.test(option)), 'no everyday PPE as a wrong answer');
  assert.doesNotMatch(ppe.options[ppe.answer], /sleeves|pants|clothing|hi-?vis|glasses|gloves|boots|hard hat|sunscreen|brim|chin strap/i, 'nor as the right one, where it would stand out');
  // The second asks for a job step, or for a control in one step.
  const steps = questions.find((q) => q.id === 'steps');
  const names = view.jobSteps.map((step) => step.step);
  const lines = steps.question === 'Which of these is a job step in this SWMS?' ? names : view.jobSteps.flatMap((step) => step.controls);
  assert.ok(lines.includes(steps.options[steps.answer]));
  assert.ok(!['Before starting', 'Finish and clean up'].includes(steps.options[steps.answer]));
  assert.equal(steps.options.filter((option) => lines.includes(option)).length, 1, 'the decoys are not in this SWMS');
});

test('a sign-on is refused without a read id, and when the SWMS was not open long enough', async () => {
  const { swms, key } = await savedSwms('fast@read.example');
  const view = await (await call('GET', `/api/sign/${key}`)).json();
  const answers = rightAnswers(await questionsFor(swms.id, view.readId));
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

test('a wrong answer names the section to read again, and the next try has new questions', async () => {
  const { swms, key } = await savedSwms('wrong@read.example');
  const view = await (await call('GET', `/api/sign/${key}`)).json();
  await openFor(view.readId, 3600);
  const first = await questionsFor(swms.id, view.readId);
  const answers = rightAnswers(first);
  const body = { name: 'Retry Worker', signature: SIGNATURE, confirmed: true, readId: view.readId };

  const wrongPpe = await call('POST', `/api/sign/${key}`, { body: { ...body, answers: { ...answers, ppe: (answers.ppe + 1) % 4 } } });
  assert.equal(wrongPpe.status, 400);
  const reply = await wrongPpe.json();
  assert.deepEqual(reply.wrong, ['ppe']);
  assert.deepEqual(reply.sections, ['ppe']);
  assert.match(reply.message, /question 1 is not right/);
  assert.match(reply.message, /PPE to wear section again, then answer the new questions\.$/);
  assert.equal(reply.wait, 0, 'no wait after the first wrong attempt');
  // New questions for the next try, without their answers, and the job step question is a new one.
  const second = await questionsFor(swms.id, view.readId, 1);
  assert.deepEqual(reply.questions, signRead.publicQuestions(second));
  assert.doesNotMatch(JSON.stringify(reply), /"answer"|"correct"/);
  assert.notEqual(second.find((q) => q.kind !== 'ppe').key, first.find((q) => q.kind !== 'ppe').key);

  // The first questions' right answers do not pass now.
  const stale = await call('POST', `/api/sign/${key}`, { body: { ...body, answers } });
  assert.equal(stale.status, 400, 'the answers to the first questions do not sign on');
  const staleReply = await stale.json();
  assert.equal(staleReply.wait, 30, 'after two wrong attempts, a wait');
  assert.match(staleReply.message, /You can answer again in 30 seconds\./);

  // Answering again before the wait is over is turned away, and not counted as an attempt.
  const third = await questionsFor(swms.id, view.readId, 2);
  const early = await call('POST', `/api/sign/${key}`, { body: { ...body, answers: rightAnswers(third) } });
  assert.equal(early.status, 429);
  const earlyReply = await early.json();
  assert.ok(earlyReply.wait > 0 && earlyReply.wait <= 30);
  assert.match(earlyReply.message, /^Read the sections again before you answer\. You can answer again in \d+ seconds\.$/);

  // After the wait, nothing answered: both questions are wrong, and the wait is longer.
  await waited(view.readId, 31);
  const none = await (await call('POST', `/api/sign/${key}`, { body: { ...body, answers: {} } })).json();
  assert.equal(none.wrong.length, 2);
  // Once the one PPE question has been asked, both questions are on the job steps.
  assert.deepEqual(third.map((q) => q.section), ['steps', 'steps']);
  assert.match(none.message, /question 1 and question 2 are not right\. Read the Job steps section again/);
  assert.equal(none.wait, 60);

  await waited(view.readId, 61);
  const fourth = await questionsFor(swms.id, view.readId, 3);
  assert.equal((await call('POST', `/api/sign/${key}`, { body: { ...body, answers: rightAnswers(fourth) } })).status, 201);
  const row = await db.one('SELECT * FROM signons WHERE swms_id = $1', [swms.id]);
  assert.equal(row.check_attempts, 4, 'every marked attempt is counted, not the one turned away');
});

test('the wait after wrong answers grows to 2 minutes at most, and questions are not repeated while others are left', async () => {
  const at = (attempts, secondsAgo) => signRead.waitLeft({ attempts, wrong_at: new Date(Date.now() - secondsAgo * 1000) });
  assert.equal(at(0, 0), 0);
  assert.equal(at(1, 0), 0, 'one wrong attempt: no wait');
  assert.equal(at(2, 0), 30);
  assert.equal(at(2, 10), 20);
  assert.equal(at(2, 30), 0);
  assert.equal(at(3, 0), 60);
  assert.equal(at(4, 0), 90);
  assert.equal(at(9, 0), 120);
  assert.equal(signRead.waitLeft({ attempts: 3, wrong_at: null }), 0);

  // Trying every answer in turn does not work: each try asks job step and control questions not
  // asked before in this read.
  const draft = prepareDraft(INPUT);
  assert.ok(signRead.questionPool('rounds', draft).steps.length >= 6);
  const asked = [0, 1, 2].flatMap((round) => signRead.checkQuestions('rounds', 'read-1', draft, round).filter((q) => q.kind !== 'ppe').map((q) => q.key));
  assert.ok(asked.length >= 3);
  assert.equal(new Set(asked).size, asked.length, 'no job step or control question twice');
});

test('each read gets its own questions, and is marked on its own questions only', async () => {
  const { swms, key } = await savedSwms('ownquestions@read.example');
  const views = [];
  for (let i = 0; i < 6; i += 1) views.push(await (await call('GET', `/api/sign/${key}`)).json());
  assert.ok(new Set(views.map((view) => JSON.stringify(view.questions))).size > 1, 'reads of the same SWMS get different questions');
  for (const view of views) assert.deepEqual(signRead.publicQuestions(await questionsFor(swms.id, view.readId)), view.questions, 'the same read always gets the same questions');

  // A worker given another read's answers, where they differ, is refused; their own answers pass.
  const [first, ...rest] = views;
  const answers = rightAnswers(await questionsFor(swms.id, first.readId));
  let other = null;
  for (const view of rest) {
    const own = rightAnswers(await questionsFor(swms.id, view.readId));
    if (Object.keys(own).some((id) => own[id] !== answers[id])) other = { view, own };
  }
  assert.ok(other, 'some read has different right answers');
  await openFor(other.view.readId, 3600);
  await openFor(first.readId, 3600);
  const body = { name: 'Passed On', signature: SIGNATURE, confirmed: true };
  const copied = await call('POST', `/api/sign/${key}`, { body: { ...body, readId: other.view.readId, answers } });
  assert.equal(copied.status, 400);
  assert.ok((await copied.json()).wrong.length >= 1);
  // The next try has new questions: the worker answers their own.
  const next = rightAnswers(await questionsFor(swms.id, other.view.readId, 1));
  assert.equal((await call('POST', `/api/sign/${key}`, { body: { ...body, readId: other.view.readId, answers: next } })).status, 201);
  assert.equal((await call('POST', `/api/sign/${key}`, { body: { ...body, name: 'First Worker', readId: first.readId, answers } })).status, 201);
});

test('every question in the pool is fair, and its wrong answers are close to the work, for each scenario SWMS', () => {
  const generic = /^(before starting|finish and clean up|leave and close up)$/i;
  const everyday = /\b(sleeves|pants|clothing|hi-?vis|glasses|gloves|boots|hard hat|sunscreen|brim|chin strap)\b/i;
  const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'over', 'under', 'out', 'are', 'not', 'any', 'each', 'all', 'only', 'before', 'after', 'when', 'where', 'work', 'use', 'used']);
  const words = (text) => new Set(String(text).toLowerCase().split(/[^a-z0-9]+/).map((word) => word.replace(/s$/, '')).filter((word) => word.length > 2 && !STOP.has(word)));
  // How much two lines say the same: words in common over the words in both.
  const overlap = (a, b) => {
    const x = words(a);
    const y = words(b);
    const n = [...x].filter((word) => y.has(word)).length;
    return x.size + y.size ? (2 * n) / (x.size + y.size) : 0;
  };
  const scenarios = [{ id: 'sprinklers', ...INPUT }, ...require('../scenarios/scenarios.json')];
  let close = 0;
  let decoys = 0;
  for (const input of scenarios) {
    const draft = prepareDraft({ state: 'qld', ...input });
    const pool = signRead.questionPool(input.id, draft);
    const ticked = signRead.tickedPpe(draft);
    const names = draft.jobSteps.map((step) => step.step);
    const controls = draft.jobSteps.flatMap((step) => step.controls);
    const lines = draft.jobSteps.flatMap((step) => [step.step, ...step.hazards, ...step.controls]);
    const work = words(`${draft.task} ${lines.join(' ')}`);
    assert.ok(pool.steps.length >= 4, `${input.id}: a pool to draw from`);
    assert.ok(pool.steps.some((item) => item.kind === 'control'), `${input.id}: control questions`);
    // PPE is asked about only where the SWMS lists PPE particular to the work.
    assert.equal(pool.ppe.length > 0, ticked.some((label) => !everyday.test(label)), `${input.id}: a PPE question when there is particular PPE`);
    for (const item of pool.ppe) {
      assert.equal(item.question, 'Which of these PPE does this SWMS list?');
      assert.ok(ticked.includes(item.correct));
      assert.doesNotMatch(item.correct, everyday, `${input.id}: the right answer is not everyday PPE, which would stand out`);
      assert.ok(item.decoys.length >= 3);
      for (const decoy of item.decoys) {
        assert.ok(!ticked.includes(decoy), `${input.id}: ${decoy} is not ticked`);
        assert.doesNotMatch(decoy, everyday, `${input.id}: no everyday PPE as a wrong answer`);
      }
    }
    for (const item of pool.steps) {
      assert.equal(item.decoys.length, 6);
      if (item.kind === 'step') {
        assert.equal(item.question, 'Which of these is a job step in this SWMS?');
        assert.ok(names.includes(item.correct) && !['Before starting', 'Finish and clean up'].includes(item.correct));
        for (const decoy of item.decoys) {
          assert.ok(!names.includes(decoy) && !generic.test(decoy), `${input.id}: ${decoy} is a step name not in this SWMS`);
          for (const name of names) assert.ok(overlap(decoy, name) < 0.6, `${input.id}: ${decoy} is not a near twin of ${name}`);
        }
      } else {
        const [, number, name] = /^Which of these is a control in step (\d+) \((.+)\)\?$/.exec(item.question);
        assert.equal(draft.jobSteps[number - 1].step, name);
        assert.ok(draft.jobSteps[number - 1].controls.includes(item.correct), `${input.id}: the answer is a control in that step`);
        for (const decoy of item.decoys) {
          assert.ok(!controls.includes(decoy), `${input.id}: ${decoy} is not in this SWMS`);
          assert.doesNotMatch(decoy, everyday, `${input.id}: ${decoy} is not everyday PPE any job could have`);
          for (const line of [...lines, ...ticked]) assert.ok(overlap(decoy, line) < 0.6, `${input.id}: ${decoy} is not a near twin of ${line}`);
        }
      }
      // Close to the work: the wrong answers share words with this SWMS, so they cannot be ruled
      // out without reading it.
      for (const decoy of item.decoys) {
        decoys += 1;
        if ([...words(decoy)].some((word) => work.has(word))) close += 1;
      }
    }
  }
  assert.ok(close / decoys >= 0.95, `wrong answers close to the work: ${close} of ${decoys}`);
});

// A worker who does not read, and guesses from the task's words or picks the longest answer,
// passes no more often than chance allows, give or take.
test('guessing from the task, or by the longest answer, does not pass', () => {
  const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'over', 'under', 'out', 'are', 'not', 'any', 'each', 'all', 'work']);
  const words = (text) => new Set(String(text).toLowerCase().split(/[^a-z0-9]+/).map((word) => word.replace(/s$/, '')).filter((word) => word.length > 3 && !STOP.has(word)));
  let asked = 0;
  let byTask = 0;
  let byLength = 0;
  for (const input of require('../scenarios/scenarios.json')) {
    const draft = prepareDraft({ state: 'qld', ...input });
    const task = words(input.task);
    for (let read = 0; read < 20; read += 1) {
      for (const q of signRead.checkQuestions(input.id, `guess-${read}`, draft)) {
        asked += 1;
        const scores = q.options.map((option) => [...words(option)].filter((word) => task.has(word)).length);
        const best = Math.max(...scores);
        if (scores[q.answer] === best) byTask += 1 / scores.filter((score) => score === best).length;
        const lengths = q.options.map((option) => option.length);
        if (lengths.indexOf(Math.max(...lengths)) === q.answer) byLength += 1;
      }
    }
  }
  // Chance is 1 in 4 (25%).
  assert.ok(byTask / asked < 0.4, `guessed from the task: ${Math.round((100 * byTask) / asked)}%`);
  assert.ok(byLength / asked < 0.35, `the longest answer: ${Math.round((100 * byLength) / asked)}%`);
});

// How a worker read is kept for SiteReady's own learning only (owner decision, 6 October 2026):
// none of it reaches the business, in the app, the Word or PDF files or the export.
const READING_WORDS = /Read in |sections? viewed|check questions|attempts?\b|\d+ min \d+ s|"language"|read_seconds|sections_viewed|sections_total|section_seconds|check_attempts/i;
const READING_PRINTED = /Read in |sections? viewed|check questions|attempt|Vietnamese|\d+ min \d+ s/;

async function pdfText(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy().catch(() => {});
  }
}

test('a sign-on keeps the reading record, and none of it reaches the business', async () => {
  const { token, swms, key } = await savedSwms('record@read.example');
  const view = await (await call('GET', `/api/sign/${key}`)).json();
  await openFor(view.readId, 600);
  const answers = rightAnswers(await questionsFor(swms.id, view.readId));
  // The page's own times: every section but the last read long enough, plus one it never showed.
  const reported = Object.fromEntries(view.sections.map((item, i) => [item.id, i === view.sections.length - 1 ? 0.5 : item.minSeconds + 1.25]));
  const response = await call('POST', `/api/sign/${key}`, {
    body: { name: 'Record Worker', company: 'Crew Co', signature: SIGNATURE, confirmed: true, readId: view.readId, answers, language: 'vi', reading: { sections: { ...reported, madeUp: 99 } } },
  });
  assert.equal(response.status, 201);
  assert.doesNotMatch(JSON.stringify(await response.json()), READING_WORDS, 'the sign-on page is told only that the worker signed on');
  const row = await db.one('SELECT * FROM signons WHERE swms_id = $1', [swms.id]);
  assert.equal(row.language, 'vi');
  assert.ok(row.read_seconds >= 599 && row.read_seconds <= 610, `the server's time, not the page's (${row.read_seconds})`);
  assert.equal(row.sections_total, view.sections.length);
  assert.equal(row.sections_viewed, view.sections.length - 1);
  assert.deepEqual(Object.keys(JSON.parse(row.section_seconds)), view.sections.map((item) => item.id), 'only known sections are kept');
  assert.equal(row.check_attempts, 1);
  assert.equal(row.explained_by, '');
  assert.equal(signRead.signOnNote(row), '', 'nothing is printed under a worker who read it themselves');

  // The app's views: name, employer and time only.
  const detail = await (await call('GET', `/api/swms/${swms.id}`, { token })).json();
  assert.deepEqual(detail.signons, [{ worker_name: 'Record Worker', worker_company: 'Crew Co', signed_at: detail.signons[0].signed_at, note: '' }]);
  assert.doesNotMatch(JSON.stringify(detail.signons), READING_WORDS);
  const list = await (await call('GET', '/api/swms', { token })).json();
  assert.equal(list.swms.find((item) => item.id === swms.id).signons, 1);
  assert.doesNotMatch(JSON.stringify(list), READING_WORDS);

  // The Word file, the PDF and the export: the worker is on the sheet, how they read is not.
  const docx = await call('GET', `/api/swms/${swms.id}/docx`, { token });
  const xml = await (await JSZip.loadAsync(Buffer.from(await docx.arrayBuffer()))).file('word/document.xml').async('string');
  assert.ok(xml.includes('Record Worker') && xml.includes('Crew Co'));
  assert.doesNotMatch(xml, READING_PRINTED);
  const pdf = await call('GET', `/api/swms/${swms.id}/pdf`, { token });
  assert.equal(pdf.status, 200);
  const text = await pdfText(Buffer.from(await pdf.arrayBuffer()));
  assert.ok(text.includes('Record Worker') && text.includes('Crew Co'));
  assert.doesNotMatch(text, READING_PRINTED);
  const exported = await call('GET', '/api/swms/export.zip', { token });
  const zip = await JSZip.loadAsync(Buffer.from(await exported.arrayBuffer()));
  const names = Object.keys(zip.files);
  // The text file lists the team and sites, never the workers who signed on or how they read.
  const listed = await zip.file('Company, team and sites.txt').async('string');
  assert.ok(!listed.includes('Record Worker'));
  assert.doesNotMatch(listed, READING_PRINTED);
  for (const name of names.filter((item) => item.endsWith('.docx'))) {
    const inner = await JSZip.loadAsync(await zip.file(name).async('nodebuffer'));
    const exportedXml = await inner.file('word/document.xml').async('string');
    assert.ok(exportedXml.includes('Record Worker'));
    assert.doesNotMatch(exportedXml, READING_PRINTED);
  }
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
  assert.equal(signRead.signOnNote(row), 'Explained by J Smith (supervisor)');
  const detail = await (await call('GET', `/api/swms/${swms.id}`, { token })).json();
  assert.equal(detail.signons[0].note, 'Explained by J Smith (supervisor)', '"explained by" stays on the sheet');
  const docx = await call('GET', `/api/swms/${swms.id}/docx`, { token });
  const xml = await (await JSZip.loadAsync(Buffer.from(await docx.arrayBuffer()))).file('word/document.xml').async('string');
  assert.ok(xml.includes('Explained by J Smith (supervisor)'));
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

    const first = await call('GET', `/api/sign/${key}/translation?lang=vi&read=${view.readId}`);
    assert.equal(first.status, 200);
    const translated = await first.json();
    assert.equal(client.calls.length, 1);
    const params = client.calls[0];
    assert.equal(params.output_config.effort, 'medium');
    assert.equal(params.output_config.format.schema, signRead.TRANSLATE_SCHEMA);
    assert.match(params.system[0].text, /Translate faithfully/);
    assert.match(params.messages[0].content, /into Vietnamese/);
    assert.doesNotMatch(params.messages[0].content, /"answer"|"correct"/, 'the answers are not sent to be translated');
    assert.deepEqual(translated.language, { code: 'vi', name: 'Vietnamese', rtl: false, lessReliable: false });
    assert.equal(translated.title, `[vi] ${swms.title}`);
    assert.equal(translated.steps.length, view.jobSteps.length);
    assert.equal(translated.steps[1].controls[0], `[vi] ${view.jobSteps[1].controls[0]}`);
    assert.deepEqual(translated.ppe, view.ppe.map((item) => `[vi] ${item}`));
    assert.equal(translated.questions[0].options.length, 4);
    assert.equal(translated.questions[0].question, `[vi] ${view.questions[0].question}`);
    assert.deepEqual(translated.questions, view.questions.map((q) => ({ question: `[vi] ${q.question}`, options: q.options.map((option) => `[vi] ${option}`) })));
    assert.equal(translated.phrases, undefined, 'only this read\'s questions are sent');

    // Asked again, from any phone: kept, so no second call. Each read gets its own questions
    // from the one translation of the whole pool.
    assert.equal((await call('GET', `/api/sign/${key}/translation?lang=vi`)).status, 200);
    assert.equal(client.calls.length, 1);
    for (let i = 0; i < 4; i += 1) {
      const next = await (await call('GET', `/api/sign/${key}`)).json();
      const own = await (await call('GET', `/api/sign/${key}/translation?lang=vi&read=${next.readId}`)).json();
      assert.deepEqual(own.questions, next.questions.map((q) => ({ question: `[vi] ${q.question}`, options: q.options.map((option) => `[vi] ${option}`) })));
    }
    assert.equal(client.calls.length, 1, 'still one translation for the language');
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

    // After a wrong answer the read has new questions, and its translation follows them.
    const retry = await (await call('GET', `/api/sign/${key}`)).json();
    await openFor(retry.readId, 3600);
    const wrong = await (await call('POST', `/api/sign/${key}`, { body: { name: 'Retry Worker', signature: SIGNATURE, confirmed: true, readId: retry.readId, answers: {}, language: 'vi' } })).json();
    const retried = await (await call('GET', `/api/sign/${key}/translation?lang=vi&read=${retry.readId}`)).json();
    assert.notDeepEqual(wrong.questions, retry.questions);
    assert.deepEqual(retried.questions, wrong.questions.map((q) => ({ question: `[vi] ${q.question}`, options: q.options.map((option) => `[vi] ${option}`) })));

    // Answering in a translation is marked the same way, and the record names the language.
    await openFor(view.readId, 3600);
    const answers = rightAnswers(await questionsFor(swms.id, view.readId));
    assert.equal((await call('POST', `/api/sign/${key}`, { body: { name: 'Viet Worker', signature: SIGNATURE, confirmed: true, readId: view.readId, answers, language: 'vi' } })).status, 201);
    const row = await db.one('SELECT * FROM signons WHERE swms_id = $1', [swms.id]);
    assert.equal(row.language, 'vi');
    assert.equal(signRead.signOnNote(row), '', 'the language read in is kept, not printed');
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
    aiScope.useClient(null);
  }
});

// ---- Failed check questions, kept without names (goal 11) ----

const controlLearning = require('../control-learning');
const missCount = async () => Number((await db.one('SELECT COUNT(*) AS n FROM check_question_misses')).n);
const MISS_INPUT = { ...INPUT, trade: 'fire', workplace: 'Ward block, 9 Example Street, Woolloongabba QLD 4102' };

test('with CONTROL_LEARNING off, a wrong answer is not kept', async () => {
  delete process.env.CONTROL_LEARNING;
  const { swms, key } = await savedSwms('missoff@read.example', MISS_INPUT);
  const view = await (await call('GET', `/api/sign/${key}`)).json();
  await openFor(view.readId, 3600);
  const answers = rightAnswers(await questionsFor(swms.id, view.readId));
  const before = await missCount();
  const wrong = await call('POST', `/api/sign/${key}`, { body: { name: 'Off Worker', signature: SIGNATURE, confirmed: true, readId: view.readId, answers: { ...answers, ppe: (answers.ppe + 1) % 4 } } });
  assert.equal(wrong.status, 400);
  assert.equal(await missCount(), before);
});

test('with CONTROL_LEARNING on, each wrong answer is kept without the worker, business, site or SWMS', async () => {
  process.env.CONTROL_LEARNING = 'on';
  try {
    const { swms, key } = await savedSwms('misses@read.example', MISS_INPUT);
    const view = await (await call('GET', `/api/sign/${key}`)).json();
    await openFor(view.readId, 3600);
    const questions = await questionsFor(swms.id, view.readId);
    const answers = rightAnswers(questions);
    const ppe = questions.find((q) => q.id === 'ppe');
    const body = { name: 'Mira Kovac', company: 'Example Crew Pty Ltd', signature: SIGNATURE, confirmed: true, readId: view.readId, language: 'vi' };
    const before = await missCount();

    // A wrong PPE answer: one row.
    const wrongPpe = (answers.ppe + 1) % 4;
    assert.equal((await call('POST', `/api/sign/${key}`, { body: { ...body, answers: { ...answers, ppe: wrongPpe } } })).status, 400);
    const rows = await db.query('SELECT * FROM check_question_misses');
    assert.equal(rows.length, before + 1);
    const row = rows[rows.length - 1];
    assert.deepEqual(Object.keys(row).sort(), ['chosen', 'id', 'item', 'kind', 'language', 'month', 'state', 'step', 'trade'], 'no worker, business, site, SWMS, read or time column');
    assert.deepEqual([row.kind, row.step, row.item, row.chosen], ['ppe', '', ppe.options[ppe.answer], ppe.options[wrongPpe]]);
    assert.deepEqual([row.language, row.state, row.trade], ['vi', 'qld', 'fire']);
    assert.match(row.month, /^\d{4}-\d{2}$/);

    // A wrong step or control answer, on the new questions: the step it tested is kept too.
    const next = await questionsFor(swms.id, view.readId, 1);
    const steps = next.find((q) => q.id === 'steps');
    const wrongStep = (steps.answer + 1) % 4;
    assert.equal((await call('POST', `/api/sign/${key}`, { body: { ...body, language: 'xx', answers: { ...rightAnswers(next), steps: wrongStep } } })).status, 400);
    const stepRow = (await db.query("SELECT * FROM check_question_misses WHERE kind <> 'ppe'")).pop();
    assert.ok(['step', 'control'].includes(stepRow.kind));
    assert.deepEqual([stepRow.item, stepRow.chosen], [steps.options[steps.answer], steps.options[wrongStep]]);
    assert.ok(view.jobSteps.some((step) => step.step === stepRow.step), 'the step tested, by its name in the SWMS');
    assert.equal(stepRow.language, 'en', 'a language not offered is kept as English');

    // Questions left unanswered and right answers add nothing.
    await waited(view.readId);
    assert.equal((await call('POST', `/api/sign/${key}`, { body: { ...body, answers: {} } })).status, 400);
    assert.equal(await missCount(), before + 2);
    await waited(view.readId);
    assert.equal((await call('POST', `/api/sign/${key}`, { body: { ...body, answers: rightAnswers(await questionsFor(swms.id, view.readId, 3)) } })).status, 201);
    assert.equal(await missCount(), before + 2);

    const kept = JSON.stringify(await db.query('SELECT * FROM check_question_misses'));
    for (const text of ['Mira', 'Kovac', 'Example Crew', 'Test business', 'misses@read', 'Woolloongabba', 'Ward block', 'Alex Chen', swms.id, view.readId, key]) assert.ok(!kept.includes(text), `no ${text}`);

    // The owner's summary counts them; the reading record on the sign-on row is not moved yet.
    const summary = await controlLearning.summary();
    assert.equal(summary.failedQuestions.total, before + 2);
    assert.ok(summary.failedQuestions.items.some((item) => item.kind === 'ppe' && item.item === ppe.options[ppe.answer]));
    assert.equal((await db.one('SELECT check_attempts FROM signons WHERE swms_id = $1', [swms.id])).check_attempts, 4);
  } finally {
    delete process.env.CONTROL_LEARNING;
  }
});

test('failed questions leave out a business that opted out of industry data, production without its key, and go after 3 years', async () => {
  process.env.CONTROL_LEARNING = 'on';
  const railway = process.env.RAILWAY_ENVIRONMENT_NAME;
  try {
    const wrongOnce = async (email, setup = async () => {}) => {
      const { swms, key } = await savedSwms(email, MISS_INPUT);
      await setup(swms);
      const view = await (await call('GET', `/api/sign/${key}`)).json();
      await openFor(view.readId, 3600);
      const answers = rightAnswers(await questionsFor(swms.id, view.readId));
      const before = await missCount();
      assert.equal((await call('POST', `/api/sign/${key}`, { body: { name: 'Any Worker', signature: SIGNATURE, confirmed: true, readId: view.readId, answers: { ...answers, ppe: (answers.ppe + 1) % 4 } } })).status, 400);
      return (await missCount()) - before;
    };
    assert.equal(await wrongOnce('missoptout@read.example', (swms) => db.query('UPDATE companies SET industry_opt_out = TRUE WHERE id = (SELECT company_id FROM swms WHERE id = $1)', [swms.id])), 0);
    process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
    delete process.env.CONTROL_LEARNING_KEY;
    assert.equal(await wrongOnce('missprod@read.example'), 0);
    if (railway === undefined) delete process.env.RAILWAY_ENVIRONMENT_NAME;
    else process.env.RAILWAY_ENVIRONMENT_NAME = railway;
    assert.equal(await wrongOnce('misskept@read.example'), 1);

    await db.query("INSERT INTO check_question_misses (id, month, kind) VALUES ('old-miss', '2023-09', 'ppe')");
    await controlLearning.removeOld(new Date('2026-10-07T00:00:00Z'));
    assert.equal(await db.one("SELECT id FROM check_question_misses WHERE id = 'old-miss'"), null);
  } finally {
    delete process.env.CONTROL_LEARNING;
    if (railway === undefined) delete process.env.RAILWAY_ENVIRONMENT_NAME;
    else process.env.RAILWAY_ENVIRONMENT_NAME = railway;
  }
});
