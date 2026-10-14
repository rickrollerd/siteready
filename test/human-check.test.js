// Goal 12 stage 2 (D286, D290): every SWMS gets SiteReady's own check (the gate, then Builder check,
// must-fix items blocking), then a named person ticks each part as checked, with their role, before
// it downloads or saves. Each tick holds its part's fingerprint, so a change after ticking clears it
// and the server refuses a stale tick. "Checked by" prints on the Word file, the PDF and the sign-on
// page; older revisions print as before; the principal contractor's response fills the review box of
// the revision it was given on.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.RATE_LIMIT_REVIEW_REQUESTS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const JSZip = require('jszip');
const { app } = require('../server');
const db = require('../db');
const { prepareDraft } = require('../draft');
const { draftBody } = require('../input');
const { validAbn, sendReviewReminders } = require('../accounts');
const humanCheck = require('../human-check');
const parts = require('../public/check-parts');
const { draftToDocx, draftedNote } = require('../docx-draft');
const { draftToPdf } = require('../pdf-draft');
const { setupAccounts, lastLinkToken, mailbox, ANSWERED, ready, checked } = require('./helpers');

let server;
let base;

test.before(async () => {
  await setupAccounts();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

function call(method, route, { body, token, reviewer } = {}) {
  return fetch(`${base}${route}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(reviewer ? { 'X-Reviewer-Token': reviewer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

let abnSeed = 0;
function nextAbn() {
  for (;;) {
    abnSeed += 1;
    const digits = crypto.createHash('sha256').update(`check${abnSeed}`).digest('hex').replace(/\D/g, '').slice(0, 11);
    if (digits.length === 11 && digits[0] !== '0' && validAbn(digits)) return digits;
  }
}

async function signIn(email) {
  await call('POST', '/api/auth/email', { body: { email } });
  const { token } = await (await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } })).json();
  assert.equal((await call('PUT', '/api/company', { token, body: { name: `Check ${email.split('@')[0]} Pty Ltd`, abn: nextAbn() } })).status, 200);
  return token;
}

const FENCE = ready({ ...ANSWERED, state: 'qld', task: 'Replace a 3m length of timber fence.', fallRisk: 'no', residential: 'no' });
const TRENCH = ready({ ...ANSWERED, state: 'qld', task: 'Dig a trench 1 m deep with an excavator.', fallRisk: 'no', residential: 'no', trade: 'excavation' });
const draftOf = (input) => prepareDraft(draftBody(input));
const word = async (buffer) => {
  const zip = await JSZip.loadAsync(Buffer.from(buffer));
  const names = Object.keys(zip.files).filter((name) => /^word\/(document|footer\d*)\.xml$/.test(name));
  return (await Promise.all(names.map((name) => zip.file(name).async('string')))).join(' ').replace(/<[^>]+>/g, ' ').replace(/&apos;/g, '\'').replace(/\s+/g, ' ');
};
// The PDF's text as a reader sees it (pdftotext), one line each.
function pdfText(buffer) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-pdf-'));
  const file = path.join(dir, 'swms.pdf');
  fs.writeFileSync(file, Buffer.from(buffer));
  try { return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' }).replace(/[ \t]+/g, ' '); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// ---- The fingerprints ----

test('each part has its own fingerprint, and a change clears only the part it is in', () => {
  const draft = draftOf(TRENCH);
  const now = parts.partHashes(draft);
  assert.deepEqual(Object.keys(now), ['steps', 'hazards', 'plant', 'emergency', 'site']);
  const changed = (input) => parts.staleParts(now, parts.partHashes(draftOf(input)));
  // A control changed: the hazards and controls only.
  const step = draft.jobSteps.find((item) => item.step === 'Excavate');
  const line = step.controls.find((text) => !/\(/.test(text));
  assert.deepEqual(changed({ ...TRENCH, controlEdits: { Excavate: { changed: [{ from: line, to: 'Spoil is kept 2 m back from the trench edge.' }] } } }), ['hazards']);
  // Who does a step: the job steps only.
  assert.deepEqual(changed({ ...TRENCH, whoEdits: { Excavate: 'Excavator operator' } }), ['steps']);
  // The muster point: the emergency arrangements. A site condition: the site details.
  assert.deepEqual(changed({ ...TRENCH, musterPoint: 'Rear gate on Lane Street' }), ['emergency']);
  assert.deepEqual(changed({ ...TRENCH, site: { ...TRENCH.site, ground: 'Soft clay after rain.' } }), ['site']);
  // The plant: the plant only.
  assert.deepEqual(changed({ ...TRENCH, plantChoice: { ...TRENCH.plantChoice, added: [{ item: 'Plate compactor', licence: 'No' }] } }), ['plant']);
  // The date moves on every day: no part changes with it, nor with the business's details.
  assert.deepEqual(changed({ ...TRENCH, date: '1 January 2027' }), []);
  assert.deepEqual(parts.partHashes(prepareDraft({ ...draftBody(TRENCH), company: 'Other Pty Ltd', companyAbn: '51 824 753 556' })), now);
});

test('the message says which parts to tick again', () => {
  assert.equal(parts.staleMessage(['steps']), 'You changed the job steps after ticking them. Tick them again.');
  assert.equal(parts.staleMessage(['plant']), 'You changed the plant after ticking it. Tick it again.');
  assert.equal(parts.staleMessage(['hazards', 'site']), 'You changed the hazards and controls and the site details after ticking them. Tick them again.');
});

// ---- SiteReady's own check ----

test('SiteReady\'s check gives the score, the band, must-fix items and the other findings, with no AI', async () => {
  const response = await call('POST', '/api/draft/check', { body: FENCE });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.gate, []);
  assert.equal(typeof result.builder.score, 'number');
  assert.ok(['Accepted', 'Accepted with changes'].includes(result.builder.band));
  assert.deepEqual(result.builder.mustFix, []);
  assert.deepEqual(result.partHashes, parts.partHashes(draftOf(FENCE)));
  // With the site questions still open, the gate comes first.
  const open = await (await call('POST', '/api/draft/check', { body: { ...FENCE, musterPoint: '' } })).json();
  assert.ok(open.gate.length > 0);
  assert.equal(open.builder, undefined);
  // The draft's own answer carries each part's fingerprint, for a project page to compare.
  assert.deepEqual((await (await call('POST', '/api/draft', { body: FENCE })).json()).checkParts, parts.partHashes(draftOf(FENCE)));
});

const VAGUE_STEP = { name: 'Work beside the open trench', hazards: ['A worker falls into the trench.', 'The trench wall collapses on a worker.'], controls: ['Be careful near the edge.'], who: 'Leading hand' };

test('a must-fix item blocks the download and the save, with what to fix', async () => {
  const token = await signIn('mustfix@check.example');
  const input = { ...TRENCH, ownSteps: [VAGUE_STEP] };
  const self = await (await call('POST', '/api/draft/check', { token, body: input })).json();
  assert.deepEqual(self.builder.mustFix.map((item) => item.rule), ['H5']);
  for (const route of ['/api/draft.docx', '/api/draft.pdf']) {
    const refused = await call('POST', route, { token, body: checked(input) });
    assert.equal(refused.status, 400);
    const data = await refused.json();
    assert.equal(data.field, 'mustFix');
    assert.match(data.message, /^SiteReady's check found a must-fix item\. Fix it before downloading: Controls for high risk hazards leave the decision to the worker/);
  }
  const save = await call('POST', '/api/swms', { token, body: checked({ input }) });
  assert.equal(save.status, 400);
  assert.match((await save.json()).message, /Fix it before saving/);
  // Fixed: it downloads.
  const fixed = { ...input, ownSteps: [{ ...VAGUE_STEP, controls: ['Keep 1 m back from the trench edge behind the barrier mesh.'] }] };
  assert.equal((await call('POST', '/api/draft.docx', { token, body: checked(fixed) })).status, 200);
});

// ---- The person's check ----

test('each part, the name, the role and the last box are needed, and a stale tick is refused', async () => {
  const token = await signIn('ticks@check.example');
  const good = checked(FENCE, null, { name: 'Sam Lee', role: 'Supervisor' });
  const send = (check) => call('POST', '/api/draft.docx', { token, body: { ...FENCE, check } });
  const refusal = async (check) => { const response = await send(check); return { status: response.status, ...(await response.json()) }; };
  assert.match((await refusal(undefined)).message, /^Tick each part as checked, and give your name and role, before downloading\.$/);
  const { plant: _plant, ...four } = good.check.parts;
  assert.equal((await refusal({ ...good.check, parts: four })).message, 'Tick each part as checked first: Plant.');
  const noRole = await refusal({ ...good.check, role: '   ' });
  assert.deepEqual([noRole.status, noRole.field, noRole.message], [400, 'role', 'Enter your role, for example Supervisor or Director.']);
  assert.equal((await refusal({ ...good.check, name: '' })).field, 'name');
  assert.equal((await refusal({ ...good.check, ack: false })).field, 'ack');
  // Ticked, then a control changed: the server refuses and names the part.
  const step = draftOf(FENCE).jobSteps[1];
  const edited = { ...FENCE, controlEdits: { [step.step]: { added: ['Posts are braced until the concrete sets.'] } } };
  const stale = await call('POST', '/api/draft.docx', { token, body: { ...edited, check: good.check } });
  assert.equal(stale.status, 409);
  const data = await stale.json();
  assert.equal(data.message, 'You changed the hazards and controls after ticking them. Tick them again.');
  assert.deepEqual(data.stale, ['hazards']);
  // Ticked again against the draft as it now prints, it downloads.
  assert.equal((await call('POST', '/api/draft.docx', { token, body: checked(edited, null, { name: 'Sam Lee', role: 'Supervisor' }) })).status, 200);
  // Moving a step after ticking: the job steps.
  assert.deepEqual(humanCheck.isPartCheck(humanCheck.confirm(good, draftOf(FENCE))), true);
  assert.throws(() => humanCheck.confirm(good, draftOf({ ...FENCE, whoEdits: { [step.step]: 'Fencer' } })), { message: 'You changed the job steps after ticking them. Tick them again.' });
});

test('the check is kept with the revision, the name stays on the SWMS for reminders, and it prints', async () => {
  const token = await signIn('print@check.example');
  const body = checked({ ...FENCE, title: 'Fence' }, null, { name: 'Sam Lee', role: 'Site supervisor' });
  const docx = await call('POST', '/api/draft.docx', { token, body });
  assert.equal(docx.status, 200);
  const id = docx.headers.get('x-siteready-swms');
  const kept = await db.one('SELECT confirmation FROM swms_revisions WHERE swms_id = $1 AND revision = 1', [id]);
  const confirmation = typeof kept.confirmation === 'string' ? JSON.parse(kept.confirmation) : kept.confirmation;
  assert.deepEqual(Object.keys(confirmation).sort(), ['builderCheck', 'date', 'name', 'partHashes', 'parts', 'role']);
  assert.equal(confirmation.name, 'Sam Lee');
  assert.equal(confirmation.role, 'Site supervisor');
  assert.equal(confirmation.date, humanCheck.longDate(new Date()), 'the date is the server\'s');
  assert.deepEqual(confirmation.parts, { steps: true, hazards: true, plant: true, emergency: true, site: true });
  assert.deepEqual(confirmation.partHashes, parts.partHashes(draftOf(FENCE)));
  assert.deepEqual(Object.keys(confirmation.builderCheck).sort(), ['band', 'score']);
  assert.equal((await db.one('SELECT reviewed_by FROM swms WHERE id = $1', [id])).reviewed_by, 'Sam Lee');
  // Word: the "Checked by" table under "Prepared by", and the footer line.
  const text = await word(await docx.arrayBuffer());
  const today = humanCheck.longDate(new Date());
  assert.match(text, /Prepared by .* Checked by Name Sam Lee Role Site supervisor Date [^]*?Parts checked Job steps; Hazards and controls; Plant; Emergency; Site details Principal contractor review/);
  assert.ok(text.includes(`Checked by Sam Lee, Site supervisor, ${today}. Drafted with SiteReady.`));
  // PDF of the same revision: the same table and footer.
  const pdf = pdfText(await (await call('GET', `/api/swms/${id}/pdf`, { token })).arrayBuffer());
  assert.match(pdf, /Checked by\n/);
  assert.match(pdf, /Role Site supervisor/);
  assert.match(pdf, /Parts checked Job steps; Hazards and controls; Plant; Emergency; Site details/);
  assert.ok(pdf.includes(`Checked by Sam Lee, Site supervisor, ${today}.`));
  // The sign-on page says who checked it.
  const { swms } = await (await call('GET', `/api/swms/${id}`, { token })).json();
  const signon = await (await call('GET', `/api/sign/${swms.signonPath.split('t=')[1]}`)).json();
  assert.equal(signon.checkedBy, `Checked by Sam Lee, Site supervisor, ${today}`);
  // The 3 monthly reminder still names the SWMS by the name kept on it.
  await db.query('UPDATE swms SET review_due_at = $1 WHERE id = $2', [new Date(Date.now() - 1000), id]);
  const before = mailbox.length;
  await sendReviewReminders();
  assert.ok(mailbox.slice(before).some((mail) => mail.to === 'print@check.example' && /due for checking/.test(mail.subject)));
});

test('a revision saved before the check prints as it did', async () => {
  const draft = { ...draftOf(FENCE), revision: '1' };
  const old = { name: 'Alex Chen', date: '6 October 2026' };
  const text = await word(await draftToDocx(draft, { confirmation: old }));
  assert.ok(text.includes('Drafted with SiteReady by Alex Chen on 6 October 2026.'));
  assert.ok(!/Checked by/.test(text));
  assert.equal(draftedNote(old), 'Drafted with SiteReady by Alex Chen on 6 October 2026. The business named in this SWMS reviews, approves and is responsible for it.');
  assert.ok(!/Checked by/.test(pdfText(await draftToPdf(draft, { confirmation: old, note: draftedNote(old) }))));
});

test('the business\'s own check of a saved SWMS is made part by part and prints from then on', async () => {
  const token = await signIn('mark@check.example');
  const saved = await (await call('POST', '/api/swms', { token, body: checked({ input: FENCE }, null, { name: 'Sam Lee', role: 'Supervisor' }) })).json();
  const id = saved.swms.id;
  const opened = await (await call('GET', `/api/swms/${id}`, { token })).json();
  assert.deepEqual(opened.selfCheck.partHashes, parts.partHashes(draftOf(FENCE)), 'the saved page gets SiteReady\'s check and the fingerprints');
  assert.equal(typeof opened.selfCheck.builder.score, 'number');
  assert.deepEqual(opened.lastCheck, { name: 'Sam Lee', role: 'Supervisor', date: humanCheck.longDate(new Date()) });
  // No role: refused.
  const noRole = await call('POST', `/api/swms/${id}/reviewed`, { token, body: checked({}, FENCE, { name: 'Jo Park', role: '' }) });
  assert.equal(noRole.status, 400);
  const marked = await call('POST', `/api/swms/${id}/reviewed`, { token, body: checked({}, FENCE, { name: 'Jo Park', role: 'Director' }) });
  assert.equal(marked.status, 200);
  assert.equal((await marked.json()).swms.reviewedBy, 'Jo Park');
  const text = await word(await (await call('GET', `/api/swms/${id}/docx`, { token })).arrayBuffer());
  assert.ok(text.includes('Checked by Jo Park, Director,'));
  const kept = await db.one('SELECT confirmation FROM swms_revisions WHERE swms_id = $1 AND revision = 1', [id]);
  const confirmation = typeof kept.confirmation === 'string' ? JSON.parse(kept.confirmation) : kept.confirmation;
  assert.equal(confirmation.earlier[0].name, 'Sam Lee', 'the earlier check is kept with it');
  // A copy for another job is checked the same way.
  const copy = await call('POST', `/api/swms/${id}/copy`, { token, body: checked({}, FENCE, { name: 'Jo Park', role: 'Director' }) });
  assert.equal(copy.status, 201);
});

// ---- Pages from before the check ----

test('a page from before the check is accepted for one SWMS until the changeover ends, then asked to refresh', async () => {
  const token = await signIn('oldpage@check.example');
  const old = { reviewConfirmed: true, reviewedBy: 'Alex Chen' };
  const was = process.env.OLD_CHECK_UNTIL;
  try {
    process.env.OLD_CHECK_UNTIL = '2999-12-31';
    const docx = await call('POST', '/api/draft.docx', { token, body: { ...FENCE, ...old } });
    assert.equal(docx.status, 200);
    const text = await word(await docx.arrayBuffer());
    assert.match(text, /Drafted with SiteReady by Alex Chen on /, 'it prints as it did');
    // SiteReady's check still blocks a must-fix item on an old page.
    const must = await call('POST', '/api/draft.docx', { token, body: { ...TRENCH, ownSteps: [VAGUE_STEP], ...old } });
    assert.equal(must.status, 400);
    // A project's one tick cannot stand for each SWMS: refresh.
    const zip = await call('POST', '/api/project.zip', { token, body: { swms: [FENCE], ...old } });
    assert.equal(zip.status, 400);
    assert.equal((await zip.json()).message, humanCheck.REFRESH);
    process.env.OLD_CHECK_UNTIL = '2026-01-01';
    const late = await call('POST', '/api/draft.docx', { token, body: { ...FENCE, ...old } });
    assert.equal(late.status, 400);
    const data = await late.json();
    assert.equal(data.field, 'refresh');
    assert.match(data.message, /Refresh the page/);
  } finally {
    if (was === undefined) delete process.env.OLD_CHECK_UNTIL; else process.env.OLD_CHECK_UNTIL = was;
  }
});

// ---- The project ----

test('a project downloads only the SWMS checked, and names the one not checked', async () => {
  const token = await signIn('project@check.example');
  const gate = ready({ ...ANSWERED, state: 'qld', task: 'Replace a 5m length of timber paling fence.', fallRisk: 'no', residential: 'no' });
  const items = [
    { ...checked(FENCE, null, { name: 'Sam Lee', role: 'Supervisor' }), swmsTitle: 'Fencing', swmsNumber: 1 },
    { ...checked(TRENCH, null, { name: 'Sam Lee', role: 'Supervisor' }), swmsTitle: 'Trench', swmsNumber: 2 },
    { ...gate, swmsTitle: 'Gate', swmsNumber: 3 },
  ];
  const response = await call('POST', '/api/project.zip', { token, body: { swms: items, pdf: true } });
  assert.equal(response.status, 200);
  const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()));
  const files = Object.keys(zip.files).sort();
  assert.deepEqual(files, ['01 Fencing.docx', '01 Fencing.pdf', '02 Trench.docx', '02 Trench.pdf', 'Not included.txt']);
  const note = await zip.file('Not included.txt').async('string');
  assert.match(note, /These SWMS have not been checked part by part since they last changed, so they are not in this download:\n3\. Gate: Tick each part as checked/);
  // Each prints its own check.
  assert.ok((await word(await zip.file('02 Trench.docx').async('nodebuffer'))).includes('Checked by Sam Lee, Supervisor,'));
  // A shared detail changed after the check: that SWMS is left out until it is ticked again.
  const moved = { ...items[0], musterPoint: 'Rear gate on Lane Street' };
  const again = await call('POST', '/api/project.zip', { token, body: { swms: [moved], pdf: false } });
  assert.equal(again.status, 400);
  assert.match((await again.json()).message, /1\. Fencing: You changed the emergency arrangements after ticking them\. Tick them again\./);
});

// ---- The principal contractor's response prints (D290) ----

function reviewerLink(email) {
  const message = [...mailbox].reverse().find((item) => item.to === email);
  return message && /review\.html\?ref=[^&\s]+&login=([A-Za-z0-9_-]+)/.exec(message.text);
}

test('the reviewed revision prints the principal contractor\'s response; an unreviewed one keeps the blank box', async () => {
  const token = await signIn('filled@check.example');
  const saved = await (await call('POST', '/api/swms', { token, body: checked({ input: FENCE }, null, { name: 'Sam Lee', role: 'Supervisor' }) })).json();
  const id = saved.swms.id;
  const { swms } = await (await call('GET', `/api/swms/${id}`, { token })).json();
  const blank = await word(await (await call('GET', `/api/swms/${id}/docx`, { token })).arrayBuffer());
  assert.match(blank, /Principal contractor review Completed by the principal contractor before the work starts\./);
  assert.match(blank, /Accepted with changes noted below/);
  // The reviewer returns "Approved with conditions".
  await call('POST', '/api/review/email', { body: { email: 'hse@tierone.example', ref: swms.ref } });
  const { token: reviewer } = await (await call('POST', '/api/review/verify', { body: { token: reviewerLink('hse@tierone.example')[1] } })).json();
  const sent = await call('POST', `/api/review/swms/${swms.ref}/response`, { reviewer, body: { response: 'conditions', text: 'Spotter on the footpath while the posts go in.\nBarrier mesh on the open holes overnight.', name: 'Riley Morgan', company: 'Tier One Builders' } });
  assert.equal(sent.status, 201);
  const date = (await sent.json()).review.date;
  // Downloaded again, Word and PDF carry the filled box.
  const text = await word(await (await call('GET', `/api/swms/${id}/docx`, { token })).arrayBuffer());
  assert.ok(text.includes(`The principal contractor's reviewer returned this response in SiteReady on SiteReady reference ${swms.ref}, revision 1.`));
  assert.match(text, /Reviewed by \(name and company\) Riley Morgan, Tier One Builders/);
  // The outcome is a ticked Word box beside "Approved with conditions" only.
  const xml = await (await JSZip.loadAsync(Buffer.from(await (await call('GET', `/api/swms/${id}/docx`, { token })).arrayBuffer()))).file('word/document.xml').async('string');
  const outcome = xml.slice(xml.indexOf('>Outcome<'), xml.indexOf('>Not approved<'));
  assert.deepEqual([...outcome.matchAll(/w14:checked w14:val="(\d)"[^]*?<w:t xml:space="preserve"> ([^<]+)</g)].map((match) => [match[2], match[1]]), [['Approved', '0'], ['Approved with conditions', '1'], ['Not approved', '0']]);
  assert.match(text, /Outcome Approved Approved with conditions Not approved/);
  assert.match(text, /Conditions Spotter on the footpath while the posts go in\. Barrier mesh on the open holes overnight\./);
  assert.ok(text.includes(`Date ${date}`));
  assert.ok(!/Accepted with changes noted below/.test(text));
  const pdf = pdfText(await (await call('GET', `/api/swms/${id}/pdf`, { token })).arrayBuffer());
  assert.match(pdf, /Riley Morgan, Tier One Builders/);
  assert.match(pdf, /\[ \] Approved \[x\] Approved with conditions \[ \] Not approved/);
  assert.match(pdf, /Barrier mesh on the open holes overnight\./);
  // A new revision starts unreviewed: its box is blank again, while revision 1 keeps its response.
  const edited = { ...FENCE, musterPoint: 'Rear gate on Lane Street' };
  assert.equal((await call('PUT', `/api/swms/${id}`, { token, body: checked({ input: edited }, null, { name: 'Sam Lee', role: 'Supervisor' }) })).status, 200);
  assert.match(await word(await (await call('GET', `/api/swms/${id}/docx`, { token })).arrayBuffer()), /Accepted with changes noted below/);
  assert.match(await word(await (await call('GET', `/api/swms/${id}/docx?revision=1`, { token })).arrayBuffer()), /Riley Morgan, Tier One Builders/);
});
