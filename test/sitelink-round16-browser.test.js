// Messy round 16, SiteLink, in a real browser: the lead types the answer to one point while the answer before it
// is still saving (3 to 5 seconds on staging). The list of points is drawn again when that save comes back; the box
// being typed in keeps its words and the typing goes on in it (the round 16 lead's second answer kept only "you
// seal "). Made-up names only. No paid AI reading: the stand-in client answers with a made-up reading.
process.env.RATE_LIMIT_HSE_REQUESTS = '5000';
process.env.RATE_LIMIT_AI_SCOPE_REQUESTS = '1000';
process.env.RATE_LIMIT_MAX_REQUESTS = '5000';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const { app } = require('../server');
const db = require('../db');
const aiScope = require('../ai-scope');
const abnRegister = require('../abn');
const { validAbn } = require('../accounts');
const { setupAccounts, mailbox } = require('./helpers');

let chromium = null;
try {
  chromium = require(`${execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()}/playwright`).chromium;
} catch {
  chromium = null;
}
abnRegister.lookupAbn = async () => ({ enabled: false });
const abn = () => { for (let n = 81854743300; ; n += 1) if (validAbn(String(n))) return String(n); };

const row = (activity, pack, clause, unknowns) => ({ activity, type: 'Site work', package: pack, crew: 'Sprinkler fitters', clause, quotes: [`${activity}.`], where: '', plant: '', conditions: '', unknowns, matrixColumn: '' });
const READING = {
  activities: [
    row('Clear safety mesh from penetrations and erect barricades and penetration covers', 'Penetrations and core drilling', 'C-1.17', 'The document does not say who reinstates the mesh after it is cleared'),
    row('Fire seal fire protection service penetrations through fire barriers', 'Penetrations and core drilling', '3.1(y)', 'Who seals shared penetrations is not stated'),
  ],
  byOthers: [],
  conflicts: [],
};
const SCOPE = ['Subcontract scope of works: Fire services', ...READING.activities.map((one, i) => `1.${i + 1} ${one.quotes[0]}`), ...Array(4).fill('The Subcontractor shall carry out the works in accordance with the drawings and specifications and coordinate with other trades.')].join('\n');
const standIn = { beta: { messages: { stream(params) {
  const mapping = Boolean(params.output_config.format.schema.properties.packages);
  const content = params.messages[0].content;
  const body = mapping ? { packages: [...content.matchAll(/^Work package: (.*)$/gm)].map((m) => ({ package: m[1], groups: ['coreDrill'], unmatched: [], byOthers: [] })) } : READING;
  return { finalMessage: async () => ({ stop_reason: 'end_turn', model: 'claude-opus-5-5', usage: { input_tokens: 1000, output_tokens: 500 }, content: [{ type: 'text', text: JSON.stringify(body) }] }) };
} } } };

let server;
let base;
let browser;
test.before(async () => {
  if (!chromium) return;
  try {
    browser = await chromium.launch();
  } catch {
    browser = null;
    return;
  }
  await setupAccounts();
  process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
  aiScope.useClient(standIn);
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  aiScope.useClient(null);
  delete process.env.ANTHROPIC_API_KEY;
  if (browser) await browser.close();
  if (server) server.close();
});
const skip = () => (browser ? false : 'no browser to drive (Playwright and Chromium are not installed)');
async function call(method, route, { body, reviewer } = {}) {
  const response = await fetch(`${base}${route}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(reviewer ? { 'X-Reviewer-Token': reviewer } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
}

test('an answer typed while the one before it saves keeps every word (smaller fault)', async (t) => {
  if (skip()) return t.skip(skip());
  const email = 'lead@r16type.example';
  await call('POST', '/api/hse/email', { body: { email } });
  const token = /\/sitelink\?login=([A-Za-z0-9_-]+)/.exec([...mailbox].reverse().find((item) => item.to === email).text)[1];
  const lead = (await call('POST', '/api/hse/verify', { body: { token } })).data.token;
  await call('PUT', '/api/hse/me', { reviewer: lead, body: { name: 'Rosalind Achterberg', position: 'HSE lead', phone: '0412 555 019' } });
  const org = (await call('POST', '/api/hse/orgs', { reviewer: lead, body: { name: 'Wombat Type Constructions Pty Ltd', abn: abn() } })).data.org;
  const project = (await call('POST', `/api/hse/orgs/${org.id}/projects`, { reviewer: lead, body: { name: 'Tallowood Creek Community Centre', workplace: '18 Station St, Wentworthville NSW 2145', state: 'nsw' } })).data.project;
  const sub = (await call('POST', `/api/hse/projects/${project.id}/subcontracts`, { reviewer: lead, body: { name: 'Spinebill Fire Protection Pty Ltd', trade: 'Fire services', email: 'office@r16type-sub.example' } })).data.subcontract;
  await call('POST', `/api/hse/subcontracts/${sub.id}/scope`, { reviewer: lead, body: { file: { name: 'Fire services scope.txt', data: Buffer.from(SCOPE).toString('base64') } } });
  let points = [];
  for (let i = 0; i < 300 && !points.length; i += 1) {
    const page = (await call('GET', `/api/hse/subcontracts/${sub.id}`, { reviewer: lead })).data;
    if (page.reading.status !== 'reading') points = page.points;
    else await new Promise((resolve) => { setTimeout(resolve, 20); });
  }
  assert.equal(points.length, 2, JSON.stringify(points));
  const page = await browser.newPage();
  await page.addInitScript((value) => localStorage.setItem('sitewrite.reviewer', value), lead);
  // Each answer takes 3 seconds to save, as on staging.
  await page.route('**/points/**', async (route) => { await new Promise((resolve) => { setTimeout(resolve, 3000); }); await route.continue(); });
  await page.goto(`${base}/sitelink#/sub/${sub.id}`);
  await page.waitForSelector(`#answer-${points[0].id}`);
  await page.fill(`#answer-${points[0].id}`, 'Our carpenters reinstate the mesh once your penetrations are sealed.');
  await page.click(`[data-answer="${points[0].id}"]`);
  await page.click(`#answer-${points[1].id}`);
  const words = 'you seal all fire services penetrations incl collars and dampers as you go';
  await page.keyboard.type(words, { delay: 90 });
  await page.waitForFunction((id) => /Answered by/.test(document.getElementById(`point-${id}`).innerText), points[0].id, { timeout: 15000 });
  assert.equal(await page.inputValue(`#answer-${points[1].id}`), words);
  const saved = (await call('GET', `/api/hse/subcontracts/${sub.id}`, { reviewer: lead })).data.points.find((one) => one.id === points[0].id);
  assert.equal(saved.answer, 'Our carpenters reinstate the mesh once your penetrations are sealed.');
  assert.ok(await db.one('SELECT id FROM subcontracts WHERE id = $1', [sub.id]));
  await page.close();
});
