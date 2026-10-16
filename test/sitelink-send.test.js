// SiteLink, Goal 12 stage 5: sending the list, the list page, reminders and the project log.
// Made-up companies, people and sites only.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.RATE_LIMIT_HSE_REQUESTS = '5000';
process.env.RATE_LIMIT_MAX_REQUESTS = '5000';
process.env.RATE_LIMIT_LIST_REQUESTS = '5000';
process.env.RATE_LIMIT_LIST_UPLOADS = '1000';
process.env.RATE_LIMIT_LIST_SENDS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');
const db = require('../db');
const mailer = require('../mailer');
const listMail = require('../list-mail');
const send = require('../sitelink-send');
const abnRegister = require('../abn');
const { validAbn } = require('../accounts');
const { setupAccounts, mailbox, lastLinkToken } = require('./helpers');

// The register is not reachable here, so each builder's account is set up Unverified. Only a verified
// account sends list emails (D311), so builder() marks each account verified, as the register would.
abnRegister.lookupAbn = async () => ({ enabled: false });
let abnSeed = 51824753000;
function nextAbn() {
  for (abnSeed += 97; ; abnSeed += 1) if (validAbn(String(abnSeed))) return String(abnSeed);
}

let server;
let base;
test.before(async () => {
  await setupAccounts();
  server = app.listen(0);
  server.keepAliveTimeout = 120000;
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

async function call(method, route, { body, reviewer, session, headers, raw } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(reviewer ? { 'X-Reviewer-Token': reviewer } : {}), ...(session ? { Authorization: `Bearer ${session}` } : {}), ...headers },
    body: raw !== undefined ? raw : body ? JSON.stringify(body) : undefined,
  });
  const type = response.headers.get('content-type') || '';
  return { status: response.status, headers: response.headers, data: type.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()) };
}

// A date this many days from today where the project is (Queensland).
function inDays(days) {
  const today = send.todayIn('qld');
  const day = new Date(`${today}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

async function leadSignIn(email, name = 'Dana Whitfield') {
  assert.equal((await call('POST', '/api/hse/email', { body: { email } })).status, 200);
  const text = [...mailbox].reverse().find((item) => item.to === email).text;
  const token = /\/sitelink\?login=([A-Za-z0-9_-]+)/.exec(text)[1];
  const { data } = await call('POST', '/api/hse/verify', { body: { token } });
  if (name) assert.equal((await call('PUT', '/api/hse/me', { reviewer: data.token, body: { name, position: 'HSE manager', phone: '0412 555 012' } })).status, 200);
  return data.token;
}

// A builder's account, a project with its site details, and a subcontract with two SWMS on its list.
async function builder(prefix, orgName = 'Corbel Build Pty Ltd', { abn = '', email = `office@${prefix}-sub.example`, verified = true } = {}) {
  const leadEmail = `dana@${prefix}.example`;
  const lead = await leadSignIn(leadEmail);
  const org = await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: orgName, abn: nextAbn() } });
  assert.equal(org.status, 201, JSON.stringify(org.data));
  if (verified) await db.query("UPDATE orgs SET abn_check = 'verified', abn_verified_at = $1 WHERE id = $2", [new Date(), org.data.org.id]);
  const project = await call('POST', `/api/hse/orgs/${org.data.org.id}/projects`, { reviewer: lead, body: { name: 'Northgate Health Hub', workplace: '12 Wattle Road, Hamilton QLD 4007', state: 'qld' } });
  const projectId = project.data.project.id;
  const details = await call('PUT', `/api/hse/projects/${projectId}/site-details`, { reviewer: lead, body: { baseRev: 0, details: { musterPoint: 'Assembly area A at the Wattle Road gate', hospital: 'Northside General Hospital, Emergency Department', siteRules: ['Sign in at the site office before starting.'] } } });
  assert.equal(details.status, 200, JSON.stringify(details.data));
  const added = await call('POST', `/api/hse/projects/${projectId}/subcontracts`, { reviewer: lead, body: { name: 'Tallow Formwork Pty Ltd', trade: 'Formwork', email, abn } });
  assert.equal(added.status, 201, JSON.stringify(added.data));
  const subId = added.data.subcontract.id;
  for (const [title, task] of [['Formwork to suspended slabs', 'Form up, pour and strip the suspended slabs on levels 1 to 4.'], ['Edge protection to slab edges', 'Put up and take down the edge screens at each slab edge.']]) {
    assert.equal((await call('POST', `/api/hse/subcontracts/${subId}/items`, { reviewer: lead, body: { title, task } })).status, 201);
  }
  return { lead, leadEmail, orgId: org.data.org.id, projectId, subId };
}

const linkOf = (message) => /\/list\.html\?t=([A-Za-z0-9_-]+)/.exec(message.text)[1];
const stopOf = (message) => /\/list\.html\?stop=([A-Za-z0-9_-]+)/.exec(message.text)[1];
const mailTo = (email) => mailbox.filter((item) => item.to === email);

async function sendList(b, due = inDays(14)) {
  const preview = await call('POST', `/api/hse/subcontracts/${b.subId}/send/preview`, { reviewer: b.lead, body: { due } });
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  const sent = await call('POST', `/api/hse/subcontracts/${b.subId}/send`, { reviewer: b.lead, body: { due, check: preview.data.preview.check } });
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  return { preview: preview.data.preview, page: sent.data };
}

// A subcontractor's SiteWrite account, signed in, with its company name and ABN when given.
async function subbie(email, name = '', abn = '') {
  assert.equal((await call('POST', '/api/auth/email', { body: { email } })).status, 200);
  const { data } = await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } });
  if (name) assert.equal((await call('PUT', '/api/company', { session: data.token, body: { name, abn } })).status, 200);
  return data.token;
}

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
// The parts of a Word file the check reads: a zip whose entries name word/document.xml.
const DOCX = Buffer.concat([Buffer.from('504b0304', 'hex'), Buffer.from('\u0014\u0000\u0000\u0000[Content_Types].xml ... word/document.xml ... PK end', 'latin1')]);
async function upload(token, itemId, data, name, type = 'application/pdf') {
  return call('POST', `/api/list/${token}/items/${itemId}/upload`, { raw: data, headers: { 'Content-Type': type, 'X-File-Name': encodeURIComponent(name) } });
}

// ---- The mailer ----

test('Postmark sends with the From name, Reply-To and stop headers, plain text only, and tracking off', async () => {
  const seen = [];
  mailer.usePostmarkFetch(async (url, options) => { seen.push({ url, options }); return { ok: true, status: 200, json: async () => ({ MessageID: 'pm-1', ErrorCode: 0 }) }; });
  process.env.POSTMARK_SERVER_TOKEN = 'test-token-not-real';
  process.env.MAIL_FROM = 'noreply@sitewrite.com.au';
  mailer.captureMail(null);
  try {
    assert.equal(mailer.provider(), 'postmark');
    const result = await mailer.sendMail({ to: 'office@tallow.example', subject: 'SWMS required', text: 'Line one\nLine two', from: { name: 'Dana Whitfield via SiteWrite', address: 'lists@sitewrite.com.au' }, replyTo: 'dana@corbel.example', headers: { 'List-Unsubscribe': '<https://x/stop>', 'Bad Header': 'dropped' } });
    assert.deepEqual(result, { provider: 'postmark', id: 'pm-1' });
    assert.equal(seen[0].url, mailer.POSTMARK_URL);
    const body = JSON.parse(seen[0].options.body);
    assert.equal(body.From, '"Dana Whitfield via SiteWrite" <lists@sitewrite.com.au>');
    assert.equal(body.ReplyTo, 'dana@corbel.example');
    assert.equal(body.TrackOpens, false);
    assert.equal(body.TrackLinks, 'None');
    assert.equal(body.HtmlBody, undefined, 'no HTML, so no tracking image');
    assert.equal(body.TextBody, 'Line one\nLine two');
    assert.deepEqual(body.Headers, [{ Name: 'List-Unsubscribe', Value: '<https://x/stop>' }]);
    assert.equal(seen[0].options.headers['X-Postmark-Server-Token'], 'test-token-not-real');
    // A From name cannot break the header.
    assert.equal(mailer.fromHeader({ name: 'Eve "x"\r\nBcc: a@b.c', address: 'a@b.c' }, 'postmark'), '"Eve x Bcc: a@b.c" <a@b.c>');
    // Without a From address of its own, the message goes from MAIL_FROM.
    await mailer.sendMail({ to: 'a@tallow.example', subject: 's', text: 't', from: { name: 'Sam via SiteWrite' } });
    assert.equal(JSON.parse(seen[1].options.body).From, '"Sam via SiteWrite" <noreply@sitewrite.com.au>');
    // Postmark refusing says so plainly; its own words do not reach the person.
    mailer.usePostmarkFetch(async () => ({ ok: false, status: 422, json: async () => ({ ErrorCode: 406, Message: 'Inactive recipient' }) }));
    const original = console.error;
    console.error = () => {};
    try {
      await assert.rejects(mailer.sendMail({ to: 'a@b.example', subject: 's', text: 't' }), { message: 'The email could not be sent. Try again in a few minutes.' });
    } finally { console.error = original; }
  } finally {
    delete process.env.POSTMARK_SERVER_TOKEN;
    delete process.env.MAIL_FROM;
    mailer.usePostmarkFetch(null);
    mailer.captureMail((message) => { mailbox.push(message); });
  }
  // With no Postmark token, the app's existing SMTP mailer is the one used, when set up.
  assert.notEqual(mailer.provider(), 'postmark');
});

test('the email wording is the owner\'s, exactly, with the due date and nothing else', () => {
  assert.equal(listMail.longDue('2026-10-30'), 'Friday 30 October 2026');
  const email = listMail.compose({ kind: 'list_sent', person: 'Dana Whitfield', builder: 'Corbel Build Pty Ltd', project: 'Northgate Health Hub', items: ['Formwork to suspended slabs', 'Edge protection to slab edges'], due: '2026-10-30', link: 'LINK', stopLink: 'STOP' });
  assert.equal(email.subject, 'SWMS required for Northgate Health Hub by 30 October 2026');
  assert.equal(email.text, [
    'Dana Whitfield from Corbel Build Pty Ltd has reviewed your scope of works for Northgate Health Hub and has confirmed they require the following SWMS, which are ready for you to review in SiteWrite:',
    '',
    '\u2022 Formwork to suspended slabs',
    '\u2022 Edge protection to slab edges',
    '',
    'Submission due date: Friday 30 October 2026',
    '',
    'To review them, sign in to SiteWrite or start an account:',
    'LINK',
    '',
    '--',
    'Sent through SiteWrite for Corbel Build Pty Ltd. To stop these emails from Corbel Build Pty Ltd: STOP',
  ].join('\n'));
  assert.equal(email.version, 1);
  assert.equal(listMail.fromName('Dana Whitfield'), 'Dana Whitfield via SiteWrite');
  const changed = listMail.compose({ kind: 'list_changed', person: 'Dana Whitfield', builder: 'Corbel Build Pty Ltd', project: 'Northgate Health Hub', items: ['Formwork to suspended slabs', 'Perimeter screens'], due: '2026-11-02', dueWas: '2026-10-30', changes: { added: ['Perimeter screens'], removed: ['Edge protection to slab edges'], changed: ['Formwork to suspended slabs'] }, link: 'LINK', stopLink: 'STOP' });
  assert.equal(changed.subject, 'Updated: SWMS required for Northgate Health Hub by 2 November 2026');
  assert.match(changed.text, /^Dana Whitfield from Corbel Build Pty Ltd has changed the SWMS they require for Northgate Health Hub\. They now require the following SWMS, which are ready for you to review in SiteWrite:\n\n\u2022 Formwork to suspended slabs \(work changed\)\n\u2022 Perimeter screens \(new\)\n\nNo longer required:\n\u2022 Edge protection to slab edges\n\nSubmission due date: Monday 2 November 2026 \(was Friday 30 October 2026\)\n/);
  const dueOnly = listMail.compose({ kind: 'list_changed', person: 'Dana Whitfield', builder: 'Corbel Build Pty Ltd', project: 'Northgate Health Hub', items: ['Formwork to suspended slabs'], due: '2026-11-02', dueWas: '2026-10-30', changes: { added: [], removed: [], changed: [] }, link: 'LINK', stopLink: 'STOP' });
  assert.match(dueOnly.text, /^Dana Whitfield from Corbel Build Pty Ltd has changed the submission due date for Northgate Health Hub\. They require the following SWMS/);
  const reminder = listMail.compose({ kind: 'reminder', person: 'Dana Whitfield', builder: 'Corbel Build Pty Ltd', project: 'Northgate Health Hub', items: ['Edge protection to slab edges'], due: '2026-10-30', today: '2026-11-01', link: 'LINK', stopLink: 'STOP' });
  assert.equal(reminder.subject, 'Reminder: SWMS required for Northgate Health Hub by 30 October 2026');
  assert.match(reminder.text, /^Dana Whitfield from Corbel Build Pty Ltd is reminding you that they require the following SWMS for Northgate Health Hub, which are ready for you to review in SiteWrite:\n\n\u2022 Edge protection to slab edges\n\nThe submission due date was Friday 30 October 2026\.\n/);
  // No em dashes, no pictures, no HTML in any of them.
  for (const one of [email, changed, dueOnly, reminder]) assert.doesNotMatch(`${one.subject}\n${one.text}`, /\u2014|<img|<html|https?:\/\/\S+\.(?:png|gif|jpg)/i);
});

// ---- Sending ----

test('the lead checks the email, then sends it: From "{person} via SiteWrite", Reply-To the lead, the template version kept', async () => {
  const b = await builder('send1');
  const due = inDays(14);
  // A due date is required, real, not past and within a year.
  for (const [value, message] of [['', 'Choose the date the SWMS are due.'], ['2026-02-30', 'That is not a date. Choose the date the SWMS are due.'], [inDays(-1), 'That date has passed. Choose today or a later date.'], [inDays(400), 'That date is more than a year away. Check the year.']]) {
    const refused = await call('POST', `/api/hse/subcontracts/${b.subId}/send/preview`, { reviewer: b.lead, body: { due: value } });
    assert.equal(refused.status, 400);
    assert.equal(refused.data.message, message);
    assert.equal(refused.data.field, 'due');
  }
  assert.equal((await call('POST', `/api/hse/subcontracts/${b.subId}/send/preview`, { reviewer: b.lead, body: { due: inDays(0) } })).status, 200, 'today is allowed');
  const preview = await call('POST', `/api/hse/subcontracts/${b.subId}/send/preview`, { reviewer: b.lead, body: { due } });
  const p = preview.data.preview;
  assert.equal(p.kind, 'list_sent');
  assert.equal(p.email.to, 'office@send1-sub.example');
  assert.equal(p.email.fromName, 'Dana Whitfield via SiteWrite');
  assert.equal(p.email.replyTo, 'dana@send1.example');
  assert.match(p.email.text, /\[The link to the list\. It works only for this subcontract\.\]/);
  // A check that does not match what would be sent now is refused, with the email as it now stands.
  const before = mailTo('office@send1-sub.example').length;
  const stale = await call('POST', `/api/hse/subcontracts/${b.subId}/send`, { reviewer: b.lead, body: { due, check: 'not-the-check' } });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.preview.check, p.check);
  assert.equal(mailTo('office@send1-sub.example').length, before, 'nothing sent');
  const sent = await call('POST', `/api/hse/subcontracts/${b.subId}/send`, { reviewer: b.lead, body: { due, check: p.check } });
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  assert.equal(sent.data.message, 'The list has been sent to office@send1-sub.example.');
  const message = mailTo('office@send1-sub.example').pop();
  assert.equal(message.from.name, 'Dana Whitfield via SiteWrite');
  assert.equal(message.replyTo, 'dana@send1.example');
  assert.equal(message.subject, `SWMS required for Northgate Health Hub by ${listMail.shortDue(due)}`);
  const token = linkOf(message);
  const stop = stopOf(message);
  // The email is exactly what the lead checked, with the two links in place of the stand-ins.
  assert.equal(message.text, p.email.text.replace(send.PREVIEW_LINK, `${base}/list.html?t=${token}`).replace(send.PREVIEW_STOP, `${base}/list.html?stop=${stop}`));
  assert.equal(message.text, [
    'Dana Whitfield from Corbel Build Pty Ltd has reviewed your scope of works for Northgate Health Hub and has confirmed they require the following SWMS, which are ready for you to review in SiteWrite:',
    '', '\u2022 Formwork to suspended slabs', '\u2022 Edge protection to slab edges', '',
    `Submission due date: ${listMail.longDue(due)}`, '',
    'To review them, sign in to SiteWrite or start an account:', `${base}/list.html?t=${token}`, '', '--',
    `Sent through SiteWrite for Corbel Build Pty Ltd. To stop these emails from Corbel Build Pty Ltd: ${base}/list.html?stop=${stop}`,
  ].join('\n'));
  assert.equal(message.html, undefined);
  assert.equal(message.headers['List-Unsubscribe'], `<${base}/api/list/stop/${stop}>`);
  assert.equal(message.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  // Kept: the template and its version, with the tokens taken out of the body, and only hashes of them.
  const kept = await db.one('SELECT * FROM mail_messages WHERE subcontract_id = $1', [b.subId]);
  assert.equal(kept.template, 'list_sent');
  assert.equal(Number(kept.template_version), listMail.TEMPLATES.list_sent.version);
  assert.equal(kept.from_name, 'Dana Whitfield via SiteWrite');
  assert.equal(kept.reply_to, 'dana@send1.example');
  assert.ok(!kept.body.includes(token) && !kept.body.includes(stop));
  const link = await db.one('SELECT * FROM list_links WHERE subcontract_id = $1', [b.subId]);
  assert.notEqual(link.token_hash, token);
  assert.equal(link.list_rev, Number((await db.one('SELECT list_rev FROM subcontracts WHERE id = $1', [b.subId])).list_rev));
  // The subcontract and the project screen show it, and the log has it.
  assert.equal(sent.data.sending.sent.to, 'office@send1-sub.example');
  assert.match(sent.data.sending.log[0].text, new RegExp(`^Dana Whitfield sent the SWMS list \\(2 SWMS, due ${listMail.longDue(due)}\\) to Tallow Formwork Pty Ltd at office@send1-sub\\.example\\.$`));
  const project = await call('GET', `/api/hse/projects/${b.projectId}`, { reviewer: b.lead });
  assert.ok(project.data.log.some((entry) => /sent the SWMS list/.test(entry.text)));
  assert.equal(project.data.subcontracts[0].due, listMail.shortDue(due));
  assert.equal(project.data.subcontracts[0].lastContact.text, 'List sent');
  // The same list again is refused: Remind is for that.
  const again = await call('POST', `/api/hse/subcontracts/${b.subId}/send/preview`, { reviewer: b.lead, body: { due } });
  assert.equal(again.status, 409);
  assert.match(again.data.message, /^The list has not changed since it was sent to office@send1-sub\.example on .+\. Use Remind to send a reminder\.$/);
});

test('sending needs a contact email, a SWMS on the list, the site details and the lead\'s name', async () => {
  const b = await builder('send2', 'Corbel Build Pty Ltd', { email: '' });
  const due = inDays(10);
  const noEmail = await call('POST', `/api/hse/subcontracts/${b.subId}/send/preview`, { reviewer: b.lead, body: { due } });
  assert.equal(noEmail.status, 400);
  assert.equal(noEmail.data.message, 'Add the subcontractor\'s contact email first, under Change details.');
  // A project with no site details.
  const project = await call('POST', `/api/hse/orgs/${(await db.one('SELECT org_id FROM projects WHERE id = $1', [b.projectId])).org_id}/projects`, { reviewer: b.lead, body: { name: 'Bare Site', workplace: '1 Bare Street, Hamilton QLD 4007', state: 'qld' } });
  const sub = await call('POST', `/api/hse/projects/${project.data.project.id}/subcontracts`, { reviewer: b.lead, body: { name: 'Bare Sub Pty Ltd', trade: 'Painting', email: 'bare@sub.example' } });
  const empty = await call('POST', `/api/hse/subcontracts/${sub.data.subcontract.id}/send/preview`, { reviewer: b.lead, body: { due } });
  assert.equal(empty.data.message, 'No SWMS are on the list. Put one back or add one before sending it.');
  await call('POST', `/api/hse/subcontracts/${sub.data.subcontract.id}/items`, { reviewer: b.lead, body: { title: 'Painting to stairs', task: 'Paint the stair walls from a mobile scaffold.' } });
  const noDetails = await call('POST', `/api/hse/subcontracts/${sub.data.subcontract.id}/send/preview`, { reviewer: b.lead, body: { due } });
  assert.equal(noDetails.data.message, 'Set the project\'s site details before sending the list. The subcontractor\'s list page shows them.');
});

test('a list changed after sending goes again saying what changed, and an old link shows the current list', async () => {
  const b = await builder('change1');
  const due = inDays(14);
  await sendList(b, due);
  const first = linkOf(mailTo('office@change1-sub.example').pop());
  const page = await call('GET', `/api/hse/subcontracts/${b.subId}`, { reviewer: b.lead });
  const edge = page.data.items.find((item) => item.title === 'Edge protection to slab edges');
  const slab = page.data.items.find((item) => item.title === 'Formwork to suspended slabs');
  await call('PUT', `/api/hse/subcontracts/${b.subId}/items/${edge.id}`, { reviewer: b.lead, body: { removed: true } });
  await call('PUT', `/api/hse/subcontracts/${b.subId}/items/${slab.id}`, { reviewer: b.lead, body: { task: 'Form up, pour and strip the suspended slabs on levels 1 to 6.' } });
  await call('POST', `/api/hse/subcontracts/${b.subId}/items`, { reviewer: b.lead, body: { title: 'Perimeter screens', task: 'Climb the perimeter screens at each level.' } });
  // The subcontract page says what changed before it goes; Remind waits for the updated list.
  const changed = await call('GET', `/api/hse/subcontracts/${b.subId}`, { reviewer: b.lead });
  assert.deepEqual(changed.data.sending.changes, { added: ['Perimeter screens'], removed: ['Edge protection to slab edges'], changed: ['Formwork to suspended slabs'] });
  assert.equal(changed.data.sending.remind.can, false);
  // The old link already shows the list as it is now, and says it has changed.
  const old = await call('GET', `/api/list/${first}`);
  assert.equal(old.status, 200);
  assert.equal(old.data.changed, true);
  assert.deepEqual(old.data.swms.map((item) => item.title), ['Formwork to suspended slabs', 'Perimeter screens']);
  const later = inDays(17);
  const { preview } = await sendList(b, later);
  assert.equal(preview.kind, 'list_changed');
  const message = mailTo('office@change1-sub.example').pop();
  assert.equal(message.subject, `Updated: SWMS required for Northgate Health Hub by ${listMail.shortDue(later)}`);
  assert.match(message.text, /has changed the SWMS they require for Northgate Health Hub\./);
  assert.match(message.text, /\u2022 Formwork to suspended slabs \(work changed\)\n\u2022 Perimeter screens \(new\)\n\nNo longer required:\n\u2022 Edge protection to slab edges/);
  assert.match(message.text, new RegExp(`Submission due date: ${listMail.longDue(later)} \\(was ${listMail.longDue(due)}\\)`));
  assert.equal((await db.one("SELECT template FROM mail_messages WHERE subcontract_id = $1 ORDER BY created_at DESC LIMIT 1", [b.subId])).template, 'list_changed');
  // Both links work and show the current list; only the new one shows no change.
  assert.equal((await call('GET', `/api/list/${linkOf(message)}`)).data.changed, false);
  assert.equal((await call('GET', `/api/list/${first}`)).status, 200);
  const log = (await call('GET', `/api/hse/subcontracts/${b.subId}`, { reviewer: b.lead })).data.sending.log.map((entry) => entry.text);
  assert.ok(log.some((text) => /sent the updated SWMS list \(2 SWMS/.test(text)));
});

test('a wrong email, then corrected: the list goes to the right address and the wrong address\'s link stops working', async () => {
  const b = await builder('wrong1', 'Corbel Build Pty Ltd', { email: 'ofice@wrong1-sub.example' });
  await sendList(b);
  const wrongLink = linkOf(mailTo('ofice@wrong1-sub.example').pop());
  assert.equal((await call('GET', `/api/list/${wrongLink}`)).status, 200);
  await call('PUT', `/api/hse/subcontracts/${b.subId}`, { reviewer: b.lead, body: { name: 'Tallow Formwork Pty Ltd', trade: 'Formwork', email: 'office@wrong1-sub.example' } });
  const page = await call('GET', `/api/hse/subcontracts/${b.subId}`, { reviewer: b.lead });
  assert.equal(page.data.sending.emailChanged, true);
  const preview = await call('POST', `/api/hse/subcontracts/${b.subId}/send/preview`, { reviewer: b.lead, body: { due: inDays(14) } });
  assert.equal(preview.data.preview.kind, 'list_sent', 'the first email to this address');
  assert.deepEqual(preview.data.preview.others, ['ofice@wrong1-sub.example']);
  const sent = await call('POST', `/api/hse/subcontracts/${b.subId}/send`, { reviewer: b.lead, body: { due: inDays(14), check: preview.data.preview.check } });
  assert.equal(sent.data.message, 'The list has been sent to office@wrong1-sub.example. The link sent to ofice@wrong1-sub.example no longer works.');
  const gone = await call('GET', `/api/list/${wrongLink}`);
  assert.equal(gone.status, 410);
  assert.equal(gone.data.message, 'This link no longer works. Corbel Build Pty Ltd sent the list to another address. Ask Dana Whitfield at Corbel Build Pty Ltd (dana@wrong1.example) to send it to you.');
  assert.equal((await call('GET', `/api/list/${linkOf(mailTo('office@wrong1-sub.example').pop())}`)).status, 200);
});

// ---- The list page and its link ----

test('the list page works with no account, shows only its own subcontract, and records "opened" once, on use only', async () => {
  const a = await builder('scope1');
  const b = await builder('scope2', 'Ridgeline Projects Pty Ltd');
  // A second subcontract on a's project, which a's link must never show.
  const other = await call('POST', `/api/hse/projects/${a.projectId}/subcontracts`, { reviewer: a.lead, body: { name: 'Quarry Steel Pty Ltd', trade: 'Steel', email: 'q@quarry.example' } });
  await call('POST', `/api/hse/subcontracts/${other.data.subcontract.id}/items`, { reviewer: a.lead, body: { title: 'Steel erection to the atrium', task: 'Erect the atrium steel from boom lifts.' } });
  await sendList(a);
  await sendList(b);
  const token = linkOf(mailTo('office@scope1-sub.example').pop());
  const otherToken = linkOf(mailTo('office@scope2-sub.example').pop());
  // Sending is not opening.
  assert.equal((await db.one('SELECT opened_at FROM subcontracts WHERE id = $1', [a.subId])).opened_at, null);
  const view = await call('GET', `/api/list/${token}`);
  assert.equal(view.status, 200);
  assert.equal(view.data.builder.name, 'Corbel Build Pty Ltd');
  assert.equal(view.data.builder.verified, true);
  assert.equal(view.data.project.name, 'Northgate Health Hub');
  assert.deepEqual(view.data.swms.map((item) => item.title), ['Formwork to suspended slabs', 'Edge protection to slab edges']);
  assert.ok(view.data.siteDetails.list.some((entry) => entry.label === 'Muster point'));
  assert.equal(view.data.due.past, false);
  const text = JSON.stringify(view.data);
  for (const word of ['Quarry', 'Atrium', 'atrium', 'Ridgeline', a.subId, other.data.subcontract.id, a.projectId]) assert.ok(!text.includes(word), word);
  // Opened: logged on the first use only.
  await call('GET', `/api/list/${token}`);
  const opened = await db.query("SELECT * FROM project_log WHERE subcontract_id = $1 AND kind = 'list_opened'", [a.subId]);
  assert.equal(opened.length, 1);
  assert.match(opened[0].summary, /^The link in the list sent to Tallow Formwork Pty Ltd at office@scope1-sub\.example on .+ was opened\.$/);
  const sub = await db.one('SELECT status, opened_at FROM subcontracts WHERE id = $1', [a.subId]);
  assert.equal(sub.status, 'opened');
  // The link's token reaches its own subcontract's items and uploads only.
  const otherItem = (await call('GET', `/api/list/${otherToken}`)).data.swms[0].id;
  assert.equal((await upload(token, otherItem, PDF, 'swms.pdf')).status, 404);
  const quarryItem = (await db.one('SELECT id FROM required_swms WHERE subcontract_id = $1', [other.data.subcontract.id])).id;
  assert.equal((await upload(token, quarryItem, PDF, 'swms.pdf')).status, 404);
  const theirs = await upload(otherToken, otherItem, PDF, 'theirs.pdf');
  assert.equal(theirs.status, 201);
  const theirUpload = theirs.data.list.swms[0].uploads[0].id;
  assert.equal((await call('DELETE', `/api/list/${token}/uploads/${theirUpload}`)).status, 404);
  // A made-up or shortened token finds nothing.
  for (const bad of ['x'.repeat(32), token.slice(0, -2), 'short']) {
    const r = await call('GET', `/api/list/${bad}`);
    assert.equal(r.status, 404);
    assert.equal(r.data.message, 'This link is not right. Check you copied all of it from the email, or ask the main contractor to send the list again.');
  }
  // A subcontract the lead removed: the link says the list was withdrawn.
  await call('DELETE', `/api/hse/subcontracts/${b.subId}`, { reviewer: b.lead });
  const withdrawn = await call('GET', `/api/list/${otherToken}`);
  assert.equal(withdrawn.status, 410);
  assert.match(withdrawn.data.message, /^Ridgeline Projects Pty Ltd has withdrawn this list\./);
});

test('uploads: a PDF or Word file for one SWMS, logged and opened by the lead; other files refused; a wrong one taken off', async () => {
  const b = await builder('up1');
  await sendList(b);
  const token = linkOf(mailTo('office@up1-sub.example').pop());
  const list = (await call('GET', `/api/list/${token}`)).data;
  const [slab, edge] = list.swms;
  const pdf = await upload(token, slab.id, PDF, 'Tallow formwork SWMS.pdf');
  assert.equal(pdf.status, 201, JSON.stringify(pdf.data));
  assert.equal(pdf.data.message, 'Tallow formwork SWMS.pdf is uploaded for Formwork to suspended slabs. Corbel Build Pty Ltd can see it.');
  // The Word file for the wrong SWMS, then taken off and put on the right one.
  const wrong = await upload(token, slab.id, DOCX, 'Edge screens SWMS.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(wrong.status, 201, JSON.stringify(wrong.data));
  const wrongId = wrong.data.list.swms[0].uploads.find((row) => row.type === 'Word').id;
  const off = await call('DELETE', `/api/list/${token}/uploads/${wrongId}`);
  assert.equal(off.status, 200);
  assert.equal(off.data.message, 'Edge screens SWMS.docx is taken off Formwork to suspended slabs.');
  assert.equal((await upload(token, edge.id, DOCX, 'Edge screens SWMS.docx', 'application/octet-stream')).status, 201);
  // Refused: an older Word file, a picture, a PDF with a script, a Word file with macros, empty, too large.
  const refusals = [
    [Buffer.concat([Buffer.from('d0cf11e0a1b11ae1', 'hex'), Buffer.alloc(600)]), 'old.doc', 415, 'Older Word files (.doc) cannot be taken. Save it as .docx or as a PDF and upload it again.'],
    [Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), 'photo.png', 415, 'This file is not a PDF or a Word file (.docx). Upload the SWMS as a PDF or a Word file.'],
    [Buffer.from(`${PDF.toString('latin1').replace('/Type /Catalog', '/Type /Catalog /OpenAction << /S /JavaScript /JS (app.alert(1)) >>')}`, 'latin1'), 'script.pdf', 415, 'This PDF has scripts, actions or embedded files in it, so it cannot be taken. Save it again as a plain PDF (print to PDF) and upload that.'],
    [Buffer.concat([DOCX, Buffer.from(' word/vbaProject.bin ', 'latin1')]), 'macro.docm', 415, 'This Word file has macros in it, so it cannot be taken. Save it as a Word document (.docx) without macros, or as a PDF.'],
    [Buffer.alloc(0), 'empty.pdf', 400, 'The file is empty. Choose the SWMS file again.'],
    [Buffer.concat([PDF, Buffer.alloc(11 * 1024 * 1024)]), 'big.pdf', 413, 'The file is larger than 10 MB. Upload a smaller copy of the SWMS.'],
  ];
  for (const [data, name, status, message] of refusals) {
    const r = await upload(token, edge.id, data, name);
    assert.equal(r.status, status, name);
    assert.equal(r.data.message, message, name);
  }
  // The lead sees each file on the list and opens it; the log has each upload and the one taken off.
  const page = await call('GET', `/api/hse/subcontracts/${b.subId}`, { reviewer: b.lead });
  assert.deepEqual(page.data.sending.uploads.map((row) => [row.name, row.type, row.itemId === slab.id ? 'slab' : 'edge']), [['Tallow formwork SWMS.pdf', 'PDF', 'slab'], ['Edge screens SWMS.docx', 'Word', 'edge']]);
  const file = await call('GET', `/api/hse/subcontracts/${b.subId}/uploads/${page.data.sending.uploads[0].id}`, { reviewer: b.lead });
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'application/pdf');
  assert.ok(file.data.equals(PDF));
  const word = await call('GET', `/api/hse/subcontracts/${b.subId}/uploads/${page.data.sending.uploads[1].id}`, { reviewer: b.lead });
  assert.match(word.headers.get('content-disposition'), /^attachment; filename="Edge screens SWMS\.docx"/);
  const log = page.data.sending.log.map((entry) => entry.text);
  assert.ok(log.includes('Tallow formwork SWMS.pdf was uploaded for Formwork to suspended slabs on the list sent to Tallow Formwork Pty Ltd.'));
  assert.ok(log.includes('Edge screens SWMS.docx was taken off Formwork to suspended slabs on the list sent to Tallow Formwork Pty Ltd.'));
  assert.ok(log.includes('Edge screens SWMS.docx was uploaded for Edge protection to slab edges on the list sent to Tallow Formwork Pty Ltd.'));
  const project = await call('GET', `/api/hse/projects/${b.projectId}`, { reviewer: b.lead });
  assert.equal(project.data.subcontracts[0].filesIn, 2);
  // Another account's lead cannot open the files.
  const other = await builder('up2', 'Ridgeline Projects Pty Ltd');
  assert.equal((await call('GET', `/api/hse/subcontracts/${b.subId}/uploads/${page.data.sending.uploads[0].id}`, { reviewer: other.lead })).status, 404);
});

// ---- Claiming the list (D308) ----

test('with an ABN on the subcontract, only a company with that ABN can claim the list; another is told to contact the builder', async () => {
  const subAbn = nextAbn();
  const b = await builder('claim1', 'Corbel Build Pty Ltd', { abn: `${subAbn.slice(0, 2)} ${subAbn.slice(2)}` });
  assert.equal((await db.one('SELECT abn FROM subcontracts WHERE id = $1', [b.subId])).abn, subAbn, 'kept as 11 digits');
  await sendList(b);
  const token = linkOf(mailTo('office@claim1-sub.example').pop());
  // Signed out: sign in first.
  assert.equal((await call('POST', `/api/list/${token}/claim`)).status, 401);
  // The email forwarded to someone at another company, who signs up there.
  const stranger = await subbie('foreman@elsewhere.example', 'Elsewhere Concrete Pty Ltd', nextAbn());
  const refused = await call('POST', `/api/list/${token}/claim`, { session: stranger });
  assert.equal(refused.status, 409);
  assert.equal(refused.data.message, 'This list is for a company with a different ABN, so it has not been added to Elsewhere Concrete Pty Ltd. If the list should be yours, contact Dana Whitfield at Corbel Build Pty Ltd (dana@claim1.example).');
  // On the page, signed in, that company is told the same before it presses anything.
  const seen = await call('GET', `/api/list/${token}`, { session: stranger });
  assert.equal(seen.data.refusal, refused.data.message);
  assert.equal(seen.data.mine, false);
  assert.equal((await call('GET', `/api/list/${token}`)).data.refusal, '', 'nothing said to someone signed out');
  let sub = await db.one('SELECT * FROM subcontracts WHERE id = $1', [b.subId]);
  assert.equal(sub.company_id, '');
  assert.equal(sub.claimed_at, null);
  // A company with no name or ABN yet is asked for them first.
  const blank = await subbie('new@claim1-sub.example');
  const needs = await call('POST', `/api/list/${token}/claim`, { session: blank });
  assert.equal(needs.status, 400);
  assert.equal(needs.data.field, 'company');
  // The right company.
  const tallow = await subbie('admin@claim1-sub.example', 'Tallow Formwork Pty Ltd', subAbn);
  const claimed = await call('POST', `/api/list/${token}/claim`, { session: tallow });
  assert.equal(claimed.status, 200, JSON.stringify(claimed.data));
  assert.equal(claimed.data.message, 'The list is now linked to Tallow Formwork Pty Ltd in SiteWrite. Corbel Build Pty Ltd can see that you have it.');
  assert.equal((await call('POST', `/api/list/${token}/claim`, { session: tallow })).data.already, true);
  assert.equal((await call('GET', `/api/list/${token}`, { session: tallow })).data.mine, true);
  sub = await db.one('SELECT * FROM subcontracts WHERE id = $1', [b.subId]);
  assert.equal(sub.status, 'claimed');
  assert.equal(sub.claimed_abn, subAbn);
  const page = await call('GET', `/api/hse/subcontracts/${b.subId}`, { reviewer: b.lead });
  assert.equal(page.data.sending.claimed.name, 'Tallow Formwork Pty Ltd');
  const log = page.data.sending.log.map((entry) => entry.text);
  assert.ok(log.includes(`Tallow Formwork Pty Ltd (ABN ${subAbn.slice(0, 2)} ${subAbn.slice(2, 5)} ${subAbn.slice(5, 8)} ${subAbn.slice(8)}) took up the list for Tallow Formwork Pty Ltd in SiteWrite.`));
  assert.ok(log.includes('Tallow Formwork Pty Ltd: A company whose ABN does not match the ABN you gave tried to take up the list in SiteWrite. It was not linked to them.'));
  // The ABN that decided it cannot be changed now.
  const change = await call('PUT', `/api/hse/subcontracts/${b.subId}`, { reviewer: b.lead, body: { name: 'Tallow Formwork Pty Ltd', trade: 'Formwork', email: 'office@claim1-sub.example', abn: nextAbn() } });
  assert.equal(change.status, 400);
  assert.equal(change.data.message, 'Tallow Formwork Pty Ltd has taken up the list in SiteWrite, so the ABN cannot be changed now.');
  // A wrong ABN is refused when the subcontract is added.
  const bad = await call('POST', `/api/hse/projects/${b.projectId}/subcontracts`, { reviewer: b.lead, body: { name: 'Bad Abn Pty Ltd', trade: 'Painting', abn: '12 345 678 901' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.message, 'That ABN is not valid. Check the 11 digits, or leave it empty.');
});

test('with no ABN, the first company to claim gets the list and the lead sees which; a second is refused', async () => {
  const b = await builder('claim2');
  await sendList(b);
  const token = linkOf(mailTo('office@claim2-sub.example').pop());
  const first = await subbie('admin@claim2-sub.example', 'Tallow Formwork Pty Ltd', nextAbn());
  const second = await subbie('boss@other2.example', 'Other Formwork Pty Ltd', nextAbn());
  assert.equal((await call('POST', `/api/list/${token}/claim`, { session: first })).status, 200);
  const refused = await call('POST', `/api/list/${token}/claim`, { session: second });
  assert.equal(refused.status, 409);
  assert.equal(refused.data.message, 'Another company has already taken up this list in SiteWrite, so it has not been added to Other Formwork Pty Ltd. If the list should be yours, contact Dana Whitfield at Corbel Build Pty Ltd (dana@claim2.example).');
  const project = await call('GET', `/api/hse/projects/${b.projectId}`, { reviewer: b.lead });
  assert.equal(project.data.subcontracts[0].claimedName, 'Tallow Formwork Pty Ltd');
  // Deleting the business takes away its link to the list; the lead's record of who took it stays.
  const { deleteBusiness } = require('../business-removal');
  const companyId = (await db.one("SELECT company_id FROM users WHERE email = 'admin@claim2-sub.example'")).company_id;
  await deleteBusiness(companyId, { confirm: 'Tallow Formwork Pty Ltd', adminEmail: 'owner@sitewrite.example' });
  const sub = await db.one('SELECT company_id, claimed_by, claimed_name FROM subcontracts WHERE id = $1', [b.subId]);
  assert.deepEqual({ ...sub }, { company_id: '', claimed_by: '', claimed_name: 'Tallow Formwork Pty Ltd' });
});

test('signing up from the list page: a sign-in link that opens the list again, and a new company tagged with the project', async () => {
  const b = await builder('signup1');
  await sendList(b);
  const token = linkOf(mailTo('office@signup1-sub.example').pop());
  const asked = await call('POST', `/api/list/${token}/sign-in`, { body: { email: 'Foreman@Signup1-sub.example' } });
  assert.equal(asked.status, 200);
  assert.equal(asked.data.message, 'A sign-in link has been sent to foreman@signup1-sub.example. It expires in 20 minutes. Open it on this device to take up the list.');
  const message = mailTo('foreman@signup1-sub.example').pop();
  const match = new RegExp(`${base.replace(/[.]/g, '\\.')}/list\\.html\\?t=${token}&login=([A-Za-z0-9_-]+)`).exec(message.text);
  assert.ok(match, message.text);
  const { data } = await call('POST', '/api/auth/verify', { body: { token: match[1] } });
  const company = await db.one('SELECT companies.* FROM companies JOIN users ON users.company_id = companies.id WHERE users.email = $1', ['foreman@signup1-sub.example']);
  assert.equal(company.source, `project-invite:${b.projectId}`);
  assert.ok(new Date(company.trial_ends_at) > new Date(), 'the usual trial');
  assert.equal((await call('PUT', '/api/company', { session: data.token, body: { name: 'Tallow Formwork Pty Ltd', abn: nextAbn() } })).status, 200);
  assert.equal((await call('POST', `/api/list/${token}/claim`, { session: data.token })).status, 200);
  assert.equal((await call('POST', `/api/list/${token}/sign-in`, { body: { email: 'not an email' } })).status, 400);
});

// ---- Stop these emails, and reminders ----

test('a contact who stops the emails gets nothing more from that builder, until they start them again', async () => {
  const b = await builder('stop1');
  await sendList(b);
  const message = mailTo('office@stop1-sub.example').pop();
  const stop = stopOf(message);
  const info = await call('GET', `/api/list/stop/${stop}`);
  assert.deepEqual(info.data, { builder: 'Corbel Build Pty Ltd', email: 'office@stop1-sub.example', stopped: false });
  // The one-press stop that mail programs offer.
  const pressed = await call('POST', `/api/list/stop/${stop}`, { raw: 'List-Unsubscribe=One-Click', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(pressed.status, 200);
  assert.equal(pressed.data.message, 'office@stop1-sub.example will get no more list emails from Corbel Build Pty Ltd through SiteWrite.');
  const count = mailTo('office@stop1-sub.example').length;
  // Neither the list again (changed) nor a reminder goes; the lead is told why.
  await call('POST', `/api/hse/subcontracts/${b.subId}/items`, { reviewer: b.lead, body: { title: 'Perimeter screens', task: 'Climb the perimeter screens at each level.' } });
  const again = await call('POST', `/api/hse/subcontracts/${b.subId}/send/preview`, { reviewer: b.lead, body: { due: inDays(20) } });
  assert.equal(again.status, 409);
  assert.match(again.data.message, /^office@stop1-sub\.example asked on .+ for no more list emails from Corbel Build Pty Ltd\. SiteLink will not email them\. Contact them yourself, or change the contact email to another person\.$/);
  await db.query("UPDATE list_links SET created_at = $1 WHERE subcontract_id = $2", [new Date(Date.now() - 72 * 3600000), b.subId]);
  assert.equal((await call('POST', `/api/hse/subcontracts/${b.subId}/remind/preview`, { reviewer: b.lead })).status, 409);
  assert.equal((await call('POST', `/api/hse/subcontracts/${b.subId}/send`, { reviewer: b.lead, body: { due: inDays(20), check: 'x' } })).status, 409);
  assert.equal(mailTo('office@stop1-sub.example').length, count, 'nothing sent');
  const page = await call('GET', `/api/hse/subcontracts/${b.subId}`, { reviewer: b.lead });
  assert.equal(page.data.sending.stopped.email, 'office@stop1-sub.example');
  assert.ok(page.data.sending.log.some((entry) => entry.text === 'office@stop1-sub.example asked for no more list emails from Corbel Build Pty Ltd. SiteLink will not email them.'));
  // Another builder's emails to the same address are not stopped.
  const other = await builder('stop2', 'Ridgeline Projects Pty Ltd', { email: 'office@stop1-sub.example' });
  await sendList(other);
  assert.equal(mailTo('office@stop1-sub.example').length, count + 1);
  // Started again.
  const undo = await call('POST', `/api/list/stop/${stop}`, { body: { undo: true } });
  assert.equal(undo.data.stopped, false);
  assert.equal((await call('POST', `/api/hse/subcontracts/${b.subId}/send/preview`, { reviewer: b.lead, body: { due: inDays(20) } })).status, 200);
  assert.equal((await call('GET', '/api/list/stop/not-a-real-stop-token-at-all')).status, 404);
});

test('Remind: the SWMS not yet received, at most once every 48 hours and 3 times after each list', async () => {
  const b = await builder('remind1');
  const due = inDays(14);
  await sendList(b, due);
  const token = linkOf(mailTo('office@remind1-sub.example').pop());
  const soon = await call('POST', `/api/hse/subcontracts/${b.subId}/remind/preview`, { reviewer: b.lead });
  assert.equal(soon.status, 429);
  assert.match(soon.data.message, /^An email went to office@remind1-sub\.example on .+\. The next reminder can go from .+, so they are not flooded\.$/);
  const page = await call('GET', `/api/hse/subcontracts/${b.subId}`, { reviewer: b.lead });
  assert.equal(page.data.sending.remind.can, false);
  // One SWMS is in, so the reminder names only the other.
  const slab = (await call('GET', `/api/list/${token}`)).data.swms[0];
  await upload(token, slab.id, PDF, 'slab.pdf');
  const age = () => db.query('UPDATE list_links SET created_at = created_at - INTERVAL \'49 hours\' WHERE subcontract_id = $1', [b.subId]);
  for (let i = 1; i <= 3; i += 1) {
    await age();
    const preview = await call('POST', `/api/hse/subcontracts/${b.subId}/remind/preview`, { reviewer: b.lead });
    assert.equal(preview.status, 200, JSON.stringify(preview.data));
    assert.equal(preview.data.preview.kind, 'reminder');
    assert.equal(preview.data.preview.email.subject, `Reminder: SWMS required for Northgate Health Hub by ${listMail.shortDue(due)}`);
    assert.match(preview.data.preview.email.text, /\n\n\u2022 Edge protection to slab edges\n\nSubmission due date:/);
    const sent = await call('POST', `/api/hse/subcontracts/${b.subId}/remind`, { reviewer: b.lead, body: { check: preview.data.preview.check } });
    assert.equal(sent.status, 200, JSON.stringify(sent.data));
    assert.equal(sent.data.message, 'A reminder has gone to office@remind1-sub.example.');
  }
  await age();
  const fourth = await call('POST', `/api/hse/subcontracts/${b.subId}/remind/preview`, { reviewer: b.lead });
  assert.equal(fourth.status, 429);
  assert.equal(fourth.data.message, '3 reminders have gone since the list was sent. SiteLink sends no more, so the subcontractor is not flooded. Ring them instead.');
  const reminders = mailTo('office@remind1-sub.example').filter((item) => /^Reminder:/.test(item.subject));
  assert.equal(reminders.length, 3);
  assert.equal(reminders[0].from.name, 'Dana Whitfield via SiteWrite');
  assert.equal(reminders[0].replyTo, 'dana@remind1.example');
  // Each reminder's link works and shows the list.
  assert.equal((await call('GET', `/api/list/${linkOf(reminders[2])}`)).status, 200);
  const kept = await db.query("SELECT template, template_version FROM mail_messages WHERE subcontract_id = $1 AND template = 'reminder'", [b.subId]);
  assert.equal(kept.length, 3);
  assert.ok(kept.every((row) => Number(row.template_version) === listMail.TEMPLATES.reminder.version));
  const log = (await call('GET', `/api/hse/subcontracts/${b.subId}`, { reviewer: b.lead })).data.sending.log;
  assert.equal(log.filter((entry) => entry.text === 'Dana Whitfield sent Tallow Formwork Pty Ltd a reminder at office@remind1-sub.example.').length, 3);
  // Every SWMS in: nothing to remind of.
  const c = await builder('remind2');
  await sendList(c);
  const ct = linkOf(mailTo('office@remind2-sub.example').pop());
  for (const item of (await call('GET', `/api/list/${ct}`)).data.swms) await upload(ct, item.id, PDF, 'swms.pdf');
  await db.query('UPDATE list_links SET created_at = created_at - INTERVAL \'49 hours\' WHERE subcontract_id = $1', [c.subId]);
  const none = await call('POST', `/api/hse/subcontracts/${c.subId}/remind/preview`, { reviewer: c.lead });
  assert.equal(none.data.message, 'A file has been uploaded for every SWMS on the list, so there is nothing to remind them of.');
});

// ---- Prices and isolation ----

test('no price from a scope reaches the email or the list page', async () => {
  const b = await builder('price1');
  // As a scope reading could leave it, before the scrub: a price in the work and in the title.
  await db.query('UPDATE required_swms SET title = $1, task = $2 WHERE subcontract_id = $3 AND title = $4', ['Edge protection ($12,500 lump sum)', 'Put up the edge screens at $95.00/hr, and take them down.', b.subId, 'Edge protection to slab edges']);
  await sendList(b);
  const message = mailTo('office@price1-sub.example').pop();
  assert.doesNotMatch(message.text, /\$|lump sum|95\.00/);
  const view = await call('GET', `/api/list/${linkOf(message)}`);
  assert.doesNotMatch(JSON.stringify(view.data), /\$|lump sum|95\.00/);
});

test('every new route checks who is asking', async () => {
  const a = await builder('iso1');
  const other = await builder('iso2', 'Ridgeline Projects Pty Ltd');
  await sendList(a);
  const token = linkOf(mailTo('office@iso1-sub.example').pop());
  const item = (await call('GET', `/api/list/${token}`)).data.swms[0];
  await upload(token, item.id, PDF, 'swms.pdf');
  const uploadId = (await db.one('SELECT id FROM list_uploads WHERE subcontract_id = $1', [a.subId])).id;
  // A teammate who joined the account can send; anyone else cannot.
  const company = await subbie('admin@iso-company.example', 'Iso Company Pty Ltd', nextAbn());
  const routes = [
    ['POST', `/api/hse/subcontracts/${a.subId}/send/preview`, { due: inDays(9) }],
    ['POST', `/api/hse/subcontracts/${a.subId}/send`, { due: inDays(9), check: 'x' }],
    ['POST', `/api/hse/subcontracts/${a.subId}/remind/preview`, {}],
    ['POST', `/api/hse/subcontracts/${a.subId}/remind`, { check: 'x' }],
    ['GET', `/api/hse/subcontracts/${a.subId}/uploads/${uploadId}`, null],
  ];
  const mails = mailbox.length;
  for (const [method, route, body] of routes) {
    const theirs = await call(method, route, { reviewer: other.lead, body });
    assert.equal(theirs.status, 404, `${route} another account`);
    assert.equal(theirs.data.message, 'That subcontract was not found.');
    assert.equal((await call(method, route, { session: company, body })).status, 401, `${route} a company`);
    assert.equal((await call(method, route, { body })).status, 401, `${route} signed out`);
  }
  assert.equal(mailbox.length, mails, 'nothing sent');
  // The lead's file route only gives a file of that subcontract.
  const otherSub = await call('GET', `/api/hse/subcontracts/${other.subId}/uploads/${uploadId}`, { reviewer: other.lead });
  assert.equal(otherSub.status, 404);
  // A reviewer session is not an account session, so it cannot claim.
  assert.equal((await call('POST', `/api/list/${token}/claim`, { reviewer: a.lead })).status, 401);
});

test('a token never reaches the error log', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(source, /replace\(\/\^\\\/api\\\/list\\\/stop\\\/\[\^\/\]\+\/, '\/api\/list\/stop\/:token'\)/);
  assert.match(source, /replace\(\/\^\\\/api\\\/list\\\/\(\?!stop\\\/\)\[\^\/\]\+\/, '\/api\/list\/:token'\)/);
});
