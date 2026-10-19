// Reading a written methodology or sequence of works and suggesting job steps (owner, D224 and D230),
// with a stand-in for the AI so no request is made or billed.
const test = require('node:test');
const assert = require('node:assert/strict');
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph } = require('docx');
const { setupAccounts, ANSWERED } = require('./helpers');
const db = require('../db');
const aiScope = require('../ai-scope');
const methodRead = require('../method-read');
const { METHOD_BRIEF, METHOD_SCHEMA, METHOD_BRIEF_VERSION } = require('../method-brief');
const { STEPS_BRIEF } = require('../ai-brief');
const { prepareDraft } = require('../draft');
const { draftBody } = require('../input');
const { JUMP_LIFT, EXCAVATION, JUMP_LIFT_READING, JUMP_LIFT_STEPS, EXCAVATION_READING, EXCAVATION_STEPS, standIn } = require('./method-read.data');

const company = { id: 'company-method-1', name: 'Test Lifts' };

// A PDF of the given pages. A page is typed lines, or 'scan' (shapes only: no text layer, as a
// scanned page or a photo has), or 'drawing' (a drawing's text layer: grid lines, levels, labels).
function pdfOf(pages) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, autoFirstPage: false });
    const parts = [];
    doc.on('data', (part) => parts.push(part));
    doc.on('end', () => resolve(Buffer.concat(parts)));
    for (const page of pages) {
      doc.addPage();
      if (page === 'scan') {
        for (let i = 0; i < 40; i += 1) doc.rect(50 + (i % 8) * 60, 60 + Math.floor(i / 8) * 120, 50, 100).fill(i % 2 ? '#777777' : '#bbbbbb');
      } else if (page === 'drawing') {
        const labels = ['GRID A', 'GRID B', 'GRID C', 'RL 25.300', 'RL 28.450', '1200', '3600', 'LIFT 1', 'LIFT 2', 'CORE WALL', 'SECTION A-A', 'DWG L-201', 'REV C', 'SCALE 1:50', 'MACHINE PLATFORM', 'CLIMBING BEAM', 'POCKET', 'NTS', '250 THK', 'TYP.'];
        labels.forEach((label, i) => doc.fontSize(8).text(label, 60 + (i % 5) * 100, 80 + Math.floor(i / 5) * 160, { lineBreak: false }));
        doc.moveTo(50, 400).lineTo(550, 400).stroke();
      } else {
        doc.fontSize(10);
        for (const line of page) doc.text(line, { width: 495 });
      }
    }
    doc.end();
  });
}
const docxOf = (lines) => Packer.toBuffer(new Document({ sections: [{ children: lines.map((line) => new Paragraph(line)) }] }));
const base64 = (buffer) => Buffer.from(buffer).toString('base64');

test.before(async () => {
  await setupAccounts();
  process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
});
test.after(() => {
  delete process.env.ANTHROPIC_API_KEY;
  aiScope.useClient(null);
});

test('the methodology brief reads every word, quotes word for word and adds no hazard or control; its schema is strict', () => {
  assert.equal(METHOD_BRIEF_VERSION, 'methodology m1');
  assert.match(METHOD_BRIEF, /Read every word of the document/);
  assert.match(METHOD_BRIEF, /word for word and in full, with no "\.\.\." and nothing changed/);
  assert.match(METHOD_BRIEF, /Never add a control the document does not state, even an obvious one/);
  assert.match(METHOD_BRIEF, /Never add a hazard the document does not name/);
  assert.match(METHOD_BRIEF, /The notes on a drawing, a title block/);
  const strict = (schema) => schema.type !== 'object' || (schema.additionalProperties === false
    && Object.keys(schema.properties).every((key) => schema.required.includes(key)) && Object.values(schema.properties).every(strict))
    && (schema.type !== 'array' || strict(schema.items));
  assert.ok(strict(METHOD_SCHEMA));
});

test('a typed PDF and a Word file are read in full; pasted text is read as it is', async () => {
  const pdf = await methodRead.methodText({ file: { name: 'Jump lift raising.pdf', data: base64(await pdfOf([JUMP_LIFT.slice(0, 13), JUMP_LIFT.slice(13)])) } });
  assert.deepEqual(pdf.pagesNotRead, []);
  const found = aiScope.quoteFinder(pdf.text);
  for (const line of JUMP_LIFT) assert.ok(found(line), `every line is in the text: ${line}`);
  const word = await methodRead.methodText({ file: { name: 'Excavation sequence.docx', data: base64(await docxOf(EXCAVATION)) } });
  for (const line of EXCAVATION) assert.ok(aiScope.quoteFinder(word.text)(line));
  const pasted = await methodRead.methodText({ text: EXCAVATION.join('\n') });
  assert.equal(pasted.text, EXCAVATION.join('\n'));
});

test('drawings, photos and scanned pages are refused with a plain message, and never guessed from', async () => {
  const attached = /SiteWrite can only read typed methodologies\. This file looks like a drawing or a scan, so it is attached but not read\./;
  const chosen = /SiteWrite can only read typed methodologies\. This file looks like a drawing or a scan, so it was not read\./;
  await assert.rejects(methodRead.methodText({ file: { name: 'scan.pdf', data: base64(await pdfOf(['scan', 'scan'])) } }), chosen);
  await assert.rejects(methodRead.methodText({ file: { name: 'L-201.pdf', data: base64(await pdfOf(['drawing'])) } }), chosen);
  // Mostly drawings, one typed page: refused.
  await assert.rejects(methodRead.methodText({ file: { name: 'mixed.pdf', data: base64(await pdfOf([JUMP_LIFT.slice(0, 10), 'drawing', 'scan'])) } }), chosen);
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  await assert.rejects(methodRead.methodText({ file: { name: 'photo.png', data: base64(png) } }), chosen);
  await assert.rejects(methodRead.methodText({ file: { name: 'Methodology.docx', data: base64(await docxOf(['Jump lift methodology', 'See the drawing.'])) } }), chosen);
  // The file attached to the methodology card, read from the business's own files.
  const designFiles = require('../design-files');
  const scan = await designFiles.saveUpload({ companyId: company.id, userId: 'u1', data: await pdfOf(['scan']), name: 'Scanned methodology.pdf' });
  await assert.rejects(methodRead.methodText({ fileId: scan.id }, company), attached);
  const photo = await designFiles.saveUpload({ companyId: company.id, userId: 'u1', data: require('fs').readFileSync(require('path').join(__dirname, '../public/icon-192.png')), name: 'Photo.png' });
  await assert.rejects(methodRead.methodText({ fileId: photo.id }, company), attached);
  // Another business's file is not found.
  await assert.rejects(methodRead.methodText({ fileId: scan.id }, { id: 'someone-else' }), /not found/);
  // Mostly typed with one drawing page: read, and the page is named for the user to check.
  const mixed = await methodRead.methodText({ file: { name: 'with-sketch.pdf', data: base64(await pdfOf([JUMP_LIFT.slice(0, 13), JUMP_LIFT.slice(13), 'drawing'])) } });
  assert.deepEqual(mixed.pagesNotRead, [3]);
  // A short last page and a cover page with only the title are typed pages.
  const short = await methodRead.methodText({ file: { name: 'short-end.pdf', data: base64(await pdfOf([[JUMP_LIFT[0]], JUMP_LIFT.slice(1, 25), JUMP_LIFT.slice(25)])) } });
  assert.deepEqual(short.pagesNotRead, []);
  // A Word methodology set out as a table of short cells is read.
  const table = await methodRead.methodText({ file: { name: 'Table.docx', data: base64(await docxOf(EXCAVATION.flatMap((line) => line.split(/(?<=\.) /)).flatMap((line) => line.split(', ')))) } });
  assert.ok(table.text.includes('sediment tank'));
  const typed = await designFiles.saveUpload({ companyId: company.id, userId: 'u1', data: await pdfOf([EXCAVATION]), name: 'Sequence.pdf' });
  assert.deepEqual((await methodRead.methodText({ fileId: typed.id }, company)).pagesNotRead, []);
  await assert.rejects(methodRead.methodText({ text: 'Raise the platform.' }), /too little text/);
  await assert.rejects(methodRead.methodText({ file: { name: 'old.doc', data: base64(Buffer.from('x')) } }), /Older Word files/);
});

test('the whole methodology is sent with the brief, its steps matched with the scope step matching, in order, and kept', async () => {
  const model = standIn(JUMP_LIFT_READING, JUMP_LIFT_STEPS);
  aiScope.useClient(model);
  const text = JUMP_LIFT.join('\n');
  const started = await methodRead.startReading(company, { text, pagesNotRead: [] });
  assert.equal(started.status, 'reading');
  await started.done;
  const params = model.calls[0];
  assert.equal(params.model, 'claude-opus-5-5');
  assert.equal(params.system[0].text, METHOD_BRIEF);
  assert.ok(params.messages[0].content.includes(text), 'every word is sent');
  // The step matching is the scope reading's own, with the library.
  const asked = model.stepCalls[0];
  assert.ok(asked.system[0].text.startsWith(STEPS_BRIEF));
  assert.match(asked.system[0].text, /<library>[^]*liftShaft: Work at open lift shafts/);
  assert.match(asked.messages[0].content, /Work package: Step 6: Raise the machine platform with the chain blocks\n- Raise the machine platform with the chain blocks \| plant: Chain blocks\n- Release the machine platform locking pins/);
  const reading = await methodRead.getReading(company, started.id);
  assert.equal(reading.status, 'done');
  assert.equal(reading.checks.passed, true);
  const items = reading.suggestions;
  assert.deepEqual(items.map((item) => item.n), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(items.map((item) => item.kind), ['own', 'own', 'library', 'own', 'own', 'own', 'own', 'library', 'own']);
  assert.deepEqual(items[2].groups.map((group) => [group.id, group.label]), [['liftShaft', 'Work at open lift shafts']]);
  assert.deepEqual(items[5].hazards, ['the platform could fall if a chain block fails']);
  // Cost recorded: 2,000 in and 3,000 out, then 9,000 in and 600 out, at $4 and $20 per million:
  // (2,000 x 4 + 3,000 x 20 + 9,000 x 4 + 600 x 20) / 1,000,000 = $0.116.
  const row = await db.one('SELECT cost_usd, brief_version FROM ai_readings WHERE id = $1', [started.id]);
  assert.equal(Number(row.cost_usd), 0.116);
  assert.equal(row.brief_version, METHOD_BRIEF_VERSION);
  // The same methodology for the same business is not read again; another business cannot see it.
  const again = await methodRead.startReading(company, { text });
  assert.equal(again.kept, true);
  assert.equal(model.calls.length, 1);
  await assert.rejects(methodRead.getReading({ id: 'someone-else' }, started.id), /not found/);
  // A scope reading's id is not a methodology reading.
  await db.query('INSERT INTO ai_readings (id, company_id, doc_hash, brief_version, model, status, characters, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', ['scope-1', company.id, 'h', 'v3.4', 'claude-opus-5-5', 'done', 1, new Date()]);
  await assert.rejects(methodRead.getReading(company, 'scope-1'), /not found/);
});

test('the check against the brief finds every quote, control or hazard not word for word in the methodology', () => {
  const text = EXCAVATION.join('\n');
  assert.equal(methodRead.checkMethodReading(EXCAVATION_READING, text).passed, true);
  const change = (fn) => { const copy = JSON.parse(JSON.stringify(EXCAVATION_READING)); fn(copy.steps); return methodRead.checkMethodReading(copy, text); };
  const shortened = change((steps) => { steps[2].quotes[0] = 'Bulk excavate with the 30 tonne excavator ... against the shoring wall.'; });
  assert.equal(shortened.passed, false);
  assert.equal(shortened.quotesShortened.length, 1);
  const invented = change((steps) => { steps[1].controls = ['Install the fencing to AS 4687.']; });
  assert.equal(invented.passed, false);
  assert.deepEqual(invented.quotesNotFound.map((item) => item.where), ['Control: Install the perimeter fencing and wash-down bay']);
  const hazard = change((steps) => { steps[6].hazards = ['Drowning in the sump']; });
  assert.equal(hazard.passed, false);
  const reworded = change((steps) => { steps[0].quotes[0] = 'Locate and mark all underground services with the service locator before any digging.'; });
  assert.equal(reworded.passed, false);
  const noQuote = change((steps) => { steps[3].quotes = []; });
  assert.deepEqual(noQuote.rowsWithoutQuote, ['Hold until the first row of anchors is released']);
  // A word broken over two lines of a PDF counts as written either way.
  assert.equal(methodRead.checkMethodReading({ isMethodology: true, notMethodology: '', steps: [{ step: 'Inspect', quotes: ['record the inspection on the pre-raise checklist.', 'the inspection record'], plant: '', conditions: '', controls: [], hazards: [] }] }, 'record the inspection on the pre-\nraise checklist. the inspec-\ntion record').passed, true);
  // Spacing, line breaks and curly quote marks still count as the same words.
  assert.equal(change((steps) => { steps[2].controls[1] = 'The spotter controls truck movements and no person enters the excavator’s  swing radius.'; }).passed, true);
});

// D234 (owner, 13 October 2026): a misquoted suggestion is dropped on its own; the rest is used.
test('a step whose own words are not word for word is left out; a misquoted control or hazard line is left out of its step', () => {
  const text = EXCAVATION.join('\n');
  const copy = JSON.parse(JSON.stringify(EXCAVATION_READING));
  copy.steps[1].quotes = ['Install the perimeter fence and the truck wash-down bay at the site exit.'];
  copy.steps[3].quotes = [];
  copy.steps[2].controls.push('Install the fencing to AS 4687.');
  copy.steps[6].hazards = ['Drowning in the sump'];
  copy.steps[4].quotes[0] = 'Remove the berm ... second row of anchors.';
  const { steps, dropped } = methodRead.keptSteps(copy, text);
  assert.deepEqual(steps.map((row) => row.step), ['Locate and pothole the in-ground services', 'Bulk excavate to the first anchor level', 'Detail excavate pile caps, lift pits and trenches', 'Dewater the excavation']);
  assert.deepEqual(dropped.steps.map((row) => row.step), ['Install the perimeter fencing and wash-down bay', 'Hold until the first row of anchors is released', 'Excavate to the second anchor level and bulk excavation level']);
  assert.deepEqual(dropped.lines, [
    { step: 'Bulk excavate to the first anchor level', kind: 'control', quote: 'Install the fencing to AS 4687.' },
    { step: 'Dewater the excavation', kind: 'hazard', quote: 'Drowning in the sump' },
  ]);
  // The good lines of a step with a misquoted line stay.
  assert.deepEqual(steps[1].controls, EXCAVATION_READING.steps[2].controls);
  assert.deepEqual(steps[3].hazards, []);
});

test('through the stand-in, one misquoted step among good ones: the rest is used and the user is told; the check keeps what was left out', async () => {
  const made = JSON.parse(JSON.stringify(JUMP_LIFT_READING));
  made.steps[3].quotes = ['Inspect the climbing beams and lifting chains before every raise.'];
  made.steps[5].hazards.push('Crush injuries between the platform and the shaft wall');
  const model = standIn(made, { packages: [
    { package: 'Step 3: Barricade the landing entrances', groups: ['liftShaft'], unmatched: [], byOthers: [] },
    { package: 'Step 7: Extend the guide rails and travelling cable', groups: ['liftInstall'], unmatched: [], byOthers: [] },
  ] });
  aiScope.useClient(model);
  const started = await methodRead.startReading(company, { text: `${JUMP_LIFT.join('\n')}\nIssued for construction.` });
  await started.done;
  // The step left out is not sent for matching to the library.
  assert.doesNotMatch(model.stepCalls[0].messages[0].content, /Inspect the climbing beams/);
  const reading = await methodRead.getReading(company, started.id);
  assert.equal(reading.status, 'done');
  assert.equal(reading.suggestions.length, 8);
  assert.ok(!reading.suggestions.some((item) => item.step === 'Inspect the climbing beams and lifting chains'));
  assert.deepEqual(reading.suggestions.find((item) => item.step === 'Raise the machine platform with the chain blocks').hazards, ['the platform could fall if a chain block fails']);
  assert.deepEqual(reading.suggestions.filter((item) => item.kind === 'library').map((item) => [item.n, item.groups[0].id]), [[3, 'liftShaft'], [7, 'liftInstall']]);
  assert.deepEqual(reading.dropped, { steps: 1, lines: 1 });
  // The owner's AI readings page: the check of the AI's answer as given, and what was left out.
  assert.equal(reading.checks.passed, false);
  assert.equal(reading.checks.quotesNotFound.length, 2);
  assert.deepEqual(reading.checks.dropped.steps.map((row) => row.step), ['Inspect the climbing beams and lifting chains']);
  assert.deepEqual(reading.checks.dropped.lines.map((row) => row.quote), ['Crush injuries between the platform and the shaft wall']);
  const row = await db.one('SELECT status, cost_usd FROM ai_readings WHERE id = $1', [started.id]);
  assert.equal(row.status, 'done');
  assert.ok(Number(row.cost_usd) > 0);
});

test('when every step is misquoted, the reading is not used, with the plain message and its cost kept', async () => {
  const made = JSON.parse(JSON.stringify(EXCAVATION_READING));
  for (const row of made.steps) row.quotes = [`${row.quotes[0].replace(/\.$/, '')} as directed.`];
  const model = standIn(made, EXCAVATION_STEPS);
  aiScope.useClient(model);
  const started = await methodRead.startReading(company, { text: `${EXCAVATION.join('\n')}\nRevision A.` });
  await started.done;
  const reading = await methodRead.getReading(company, started.id);
  assert.equal(reading.status, 'failed');
  assert.match(reading.error, /quoted words that are not in the methodology, so its reading was not used/);
  assert.deepEqual(reading.suggestions, []);
  assert.equal(model.stepCalls.length, 0);
  assert.equal(reading.checks.dropped.steps.length, 7);
  const row = await db.one('SELECT cost_usd FROM ai_readings WHERE id = $1', [started.id]);
  assert.ok(Number(row.cost_usd) > 0);
});

test('a failed reading logs one diagnosis line, never the key; the user is told as before', async () => {
  const Anthropic = require('@anthropic-ai/sdk');
  const key = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-test-key-value-not-real';
  const lines = [];
  aiScope.useFailureLog((line) => lines.push(line));
  try {
    const denied = new Anthropic.PermissionDeniedError(403, { type: 'error', error: { type: 'permission_error', message: `Key ${process.env.ANTHROPIC_API_KEY} cannot use this model.` } }, undefined,
      new Headers({ 'request-id': 'req_test_1', 'x-api-key': process.env.ANTHROPIC_API_KEY }));
    aiScope.useClient({ beta: { messages: { stream: () => ({ finalMessage: async () => { throw denied; } }) } } });
    const started = await methodRead.startReading(company, { text: `${JUMP_LIFT.join('\n')}\nDenied.` });
    await started.done;
    const reading = await methodRead.getReading(company, started.id);
    assert.equal(reading.error, 'The AI reading is not set up on this server.');
    assert.equal(lines.length, 1);
    assert.equal(lines[0], 'AI reading failed: PermissionDeniedError 403 permission_error Key [key] cannot use this model. request req_test_1 (model claude-opus-5-5)');
    // A scope reading logs the same way.
    const scope = await aiScope.startReading(company, 'Supply and install all ductwork, including straight and curved sections.');
    await scope.done;
    assert.equal((await aiScope.getReading(company, scope.id)).error, 'The AI reading is not set up on this server.');
    assert.equal(lines.length, 2);
    assert.match(lines[1], /^AI reading failed: PermissionDeniedError 403 permission_error/);
    for (const line of lines) assert.ok(!line.includes(process.env.ANTHROPIC_API_KEY) && !line.includes('sk-ant-'), line);
  } finally {
    process.env.ANTHROPIC_API_KEY = key;
    aiScope.useFailureLog(null);
  }
});

test('a document that is not a methodology gets no suggestions and no step matching', async () => {
  const model = standIn({ isMethodology: false, notMethodology: 'It is a quote for lift works, not a sequence of work.', steps: [] }, JUMP_LIFT_STEPS);
  aiScope.useClient(model);
  const started = await methodRead.startReading(company, { text: 'Quotation for lift works. Supply and install two passenger lifts for the sum of the contract price, including all labour and materials, excluding builder\'s works.' });
  await started.done;
  const reading = await methodRead.getReading(company, started.id);
  assert.equal(reading.status, 'done');
  assert.equal(reading.isMethodology, false);
  assert.deepEqual(reading.suggestions, []);
  assert.equal(model.stepCalls.length, 0);
});

test('reading is off without the API key, with a plain message; a long methodology is refused, never cut short', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  await assert.rejects(methodRead.startReading(company, { text: JUMP_LIFT.join('\n') }), /Reading a methodology is not switched on here\. The methodology can still be attached\. Make the job steps match it yourself\./);
  process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
  await assert.rejects(methodRead.startReading(company, { text: 'x '.repeat(1250001) }), /too long for one reading/);
});

test('the routes: whether reading is on, and starting a reading needs an account', async () => {
  const { app } = require('../server');
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.deepEqual(await (await fetch(`${base}/api/methodology/read`)).json(), { enabled: true });
    const response = await fetch(`${base}/api/methodology/read`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: JUMP_LIFT.join('\n') }) });
    assert.equal(response.status, 401);
    assert.equal((await fetch(`${base}/api/methodology/read/abc`)).status, 401);
  } finally {
    server.close();
  }
});

// What the page sends once the user accepts or skips (public/method-read.js through app.js
// methodSteps): an accepted library match adds its job steps; an accepted "Your step" is the user's
// own step with the methodology's own words; a skipped one, or no reading at all, changes nothing.
test('accepted suggestions go in as job steps and own steps; skipped or unused changes nothing', () => {
  const input = { state: 'qld', fallRisk: 'yes', residential: 'no', task: 'Raise the jump lift machine platform in the lift shaft', kinds: ['liftShaft'], company: 'Test Lifts', ...ANSWERED,
    // The lift shaft steps' lines name a harness, so its question is answered from the start (round 4 merge).
    facts: { fallControl: 'Landing entrances barricaded.', harnessSystem: 'Full body harness on a restraint lanyard to the engineer-rated anchor in the shaft, inspected every 6 months, users trained by ABC Training.' } };
  const before = prepareDraft(draftBody(input));
  assert.equal(before.kind, 'draft');
  // Skipped: the input the page sends is the same, so the draft is the same.
  assert.deepEqual(prepareDraft(draftBody({ ...input })), before);
  assert.ok(!before.jobSteps.some((step) => step.step === 'Install the lift rails, car and machine'));
  // Accepted library match (Extend the guide rails: liftInstall), added to the steps chosen.
  // Its steps tick a harness, so the harness question is answered with them (round 4: asked from the steps).
  const accepted = prepareDraft(draftBody({ ...input, kinds: ['liftShaft', 'liftInstall'], facts: { ...input.facts, harnessSystem: 'Full body harness on a restraint lanyard to the engineer-rated anchor in the shaft, inspected every 6 months, users trained by ABC Training.' } }));
  assert.ok(accepted.jobSteps.some((step) => step.step === 'Install the lift rails, car and machine'));
  // Accepted "Your step" (Raise the machine platform): the methodology's own words, marked as the user's own.
  const raise = JUMP_LIFT_READING.steps[5];
  const own = prepareDraft(draftBody({ ...input, ownSteps: [{ part: '', name: raise.step, hazards: raise.hazards, controls: raise.controls, who: '' }] }));
  const step = own.jobSteps.find((item) => item.own);
  assert.equal(step.step, 'Raise the machine platform with the chain blocks (Our own step)');
  // Each line prints as a sentence, with its first capital (messy round 15: own step lines printed in lower case).
  const sentence = (line) => `${line.charAt(0).toUpperCase()}${line.slice(1)}`;
  assert.deepEqual(step.controls, raise.controls.map(sentence));
  assert.deepEqual(step.hazards, raise.hazards.map(sentence));
  // A "Your step" with no hazard the methodology names does not print until the user adds one.
  const bare = JUMP_LIFT_READING.steps[7];
  const unprinted = prepareDraft(draftBody({ ...input, ownSteps: [{ part: '', name: bare.step, hazards: [], controls: ['Extend the guide rails and the travelling cable to suit the new level.'], who: '' }] }));
  assert.ok(!unprinted.jobSteps.some((item) => item.own));
  assert.match(unprinted.ownStepNotes[0].notes[0], /Add at least one hazard/);
});

test('the page has the reading script and words "methodology", never "method", on what the user sees', () => {
  const fs = require('fs');
  const path = require('path');
  const page = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.match(page, /<script src="\/account.js"><\/script>\s*<script src="\/read-progress.js"><\/script>\s*<script src="\/method-read.js"><\/script>/);
  const script = fs.readFileSync(path.join(__dirname, '../public/method-read.js'), 'utf8');
  const shown = [...script.matchAll(/'([^'\n]*)'|`([^`]*)`/g)].map((match) => match[1] || match[2] || '').join('\n').replace(/<[^>]*>/g, ' ').replace(/data-[a-z-]+|\$\{[^}]*\}/g, ' ');
  assert.doesNotMatch(shown, /\bmethods?\b/i);
  const server = [methodRead.NOT_TYPED, methodRead.NOT_TYPED_ATTACHED, methodRead.OFF].join(' ');
  assert.doesNotMatch(server, /\bmethods?\b/i);
});

// The methodology card (app.js methodCard, from the attach-only build) offers the reading; loading the
// reading changes nothing the page sends until a suggestion is accepted.
test('the methodology card offers "Read it and suggest steps"; the card alone sends nothing new', async () => {
  const { loadPage, settle } = require('./fake-dom');
  const p = loadPage(['gate-rules.js', 'app.js', 'method-read.js'], () => ({ body: {} }));
  await settle();
  p.run('drawDesigns([])');
  const before = JSON.stringify(p.run('payload()'));
  p.document.getElementById('method-add').click();
  const html = p.document.getElementById('methods-block').innerHTML;
  assert.match(html, /<div class="method-read" data-method-read-box="method-1"><p class="meta">SiteWrite can read a typed methodology and suggest job steps from it\. It cannot read drawings, photos or scanned pages\.<\/p><button type="button" class="secondary small" data-mr-open="method-1">Read it and suggest steps<\/button><\/div>/);
  assert.ok(html.includes('SiteWrite reads only the typed words of a methodology, never drawings or scanned pages, and its suggestions can be wrong: check every one against the methodology.'));
  assert.equal(JSON.stringify(p.run('payload()')), before, 'an empty methodology card sends nothing');
});
