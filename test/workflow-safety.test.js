// The Send SWMS pack workflow and the other GitHub workflows (outside review, 23 October 2026):
// the project and email text are names of files in scenarios/projects, never paths; nothing the
// person running a workflow types is written into a shell command; the step with the mail login
// reads only the pack; actions are pinned to a commit; and the tests run on every pull request.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { projectFile } = require('../scenarios/project-files');
const { buildMessage } = require('../scenarios/email-pack');

const ROOT = path.join(__dirname, '..');
const WORKFLOWS = path.join(ROOT, '.github', 'workflows');
const workflow = (name) => fs.readFileSync(path.join(WORKFLOWS, name), 'utf8');
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sitewrite-pack-'));

test('a project or email text is a name in scenarios/projects, and a path is refused', () => {
  assert.equal(projectFile('brisbane-tower', '.json'), fs.realpathSync(path.join(ROOT, 'scenarios', 'projects', 'brisbane-tower.json')));
  assert.equal(path.basename(projectFile('brisbane-tower-email', '.txt')), 'brisbane-tower-email.txt');
  for (const name of ['/proc/self/environ', '../../package', '../email-pack', 'scenarios/projects/brisbane-tower.json', 'brisbane-tower.json', '..', '', ' ', 'Brisbane-Tower', 'a/b', 'brisbane tower', '-rf']) {
    assert.throws(() => projectFile(name, '.json'), /not a file name|There is no/, JSON.stringify(name));
  }
  assert.throws(() => projectFile('no-such-project', '.json'), /There is no no-such-project\.json/);
  // Only the two endings, so a .js file is never handed to require().
  assert.throws(() => projectFile('brisbane-tower', '.js'), /Only \.json and \.txt/);
  assert.throws(() => projectFile('brisbane-tower', ''), /Only \.json and \.txt/);
});

test('a link in the projects folder that leads outside it is refused', () => {
  const dir = temp();
  const outside = path.join(temp(), 'secret.txt');
  fs.writeFileSync(outside, 'not for email');
  fs.writeFileSync(path.join(dir, 'fine.txt'), 'hello');
  fs.symlinkSync(outside, path.join(dir, 'leak.txt'));
  fs.symlinkSync(path.join(dir, 'fine.txt'), path.join(dir, 'alias.txt'));
  fs.mkdirSync(path.join(dir, 'folder.txt'));
  assert.equal(projectFile('fine', '.txt', dir), path.join(fs.realpathSync(dir), 'fine.txt'));
  assert.throws(() => projectFile('leak', '.txt', dir), /not a plain file/);
  assert.throws(() => projectFile('alias', '.txt', dir), /not a plain file/, 'no links at all, even inside');
  assert.throws(() => projectFile('folder', '.txt', dir), /not a plain file/);
});

test('project-pack refuses a path before reading or requiring it', () => {
  const out = temp();
  for (const name of ['/etc/passwd', '../package.json', path.join(ROOT, 'scenarios', 'projects', 'brisbane-tower.json')]) {
    const run = spawnSync(process.execPath, [path.join(ROOT, 'scenarios', 'project-pack.js'), name, out], { encoding: 'utf8' });
    assert.equal(run.status, 1, name);
    assert.match(run.stderr, /not a file name/, name);
  }
  const body = spawnSync(process.execPath, [path.join(ROOT, 'scenarios', 'project-pack.js'), 'brisbane-tower', out, '', '/proc/self/environ'], { encoding: 'utf8' });
  assert.equal(body.status, 1);
  assert.match(body.stderr, /not a file name/);
  assert.deepEqual(fs.readdirSync(out), [], 'nothing was written');
});

test('project-pack writes the Word files with the email text and title beside them', { timeout: 120000 }, () => {
  const out = temp();
  const run = spawnSync(process.execPath, [path.join(ROOT, 'scenarios', 'project-pack.js'), 'brisbane-tower', out, '1 October 2026', 'brisbane-tower-email'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const files = fs.readdirSync(out);
  assert.ok(files.filter((name) => name.endsWith('.docx')).length >= 1);
  assert.equal(fs.readFileSync(path.join(out, 'email.txt'), 'utf8'), fs.readFileSync(path.join(ROOT, 'scenarios', 'projects', 'brisbane-tower-email.txt'), 'utf8'));
  assert.equal(fs.readFileSync(path.join(out, 'title.txt'), 'utf8'), require('../scenarios/projects/brisbane-tower.json').title);
});

test('the email is built from the pack folder only, to one plain address', () => {
  const pack = temp();
  fs.writeFileSync(path.join(pack, 'email.txt'), 'Hello reviewers.');
  fs.writeFileSync(path.join(pack, 'title.txt'), 'Test tower');
  fs.writeFileSync(path.join(pack, '01 Test.docx'), 'word file');
  const message = buildMessage(pack, 'sender@example.com', 'reviewer@example.com');
  assert.match(message, /^From: SiteWrite <sender@example\.com>\r\nTo: reviewer@example\.com\r\nSubject: SiteWrite SWMS for review: Test tower\r\n/);
  assert.ok(message.includes(Buffer.from('Hello reviewers.').toString('base64')));
  assert.match(message, /filename="01 Test\.docx"/);
  for (const to of ['reviewer@example.com\r\nBcc: someone@example.com', 'a@example.com, b@example.com', 'Name <a@example.com>', '', 'not an address']) {
    assert.throws(() => buildMessage(pack, 'sender@example.com', to), /one plain email address/, JSON.stringify(to));
  }
  // A link put in the pack in place of the text is not followed.
  const outside = path.join(temp(), 'environ');
  fs.writeFileSync(outside, 'SMTP_PASSWORD=not-real');
  fs.rmSync(path.join(pack, 'email.txt'));
  fs.symlinkSync(outside, path.join(pack, 'email.txt'));
  assert.throws(() => buildMessage(pack, 'sender@example.com', 'reviewer@example.com'), /not a plain file/);
});

// The lines of each run: block (one line, or the indented lines under "run: |").
function runBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^(\s*)(?:- )?run:\s*(.*)$/.exec(lines[i]);
    if (!match) continue;
    if (!/^[|>]/.test(match[2])) { blocks.push([match[2]]); continue; }
    const indent = match[1].length;
    const block = [];
    for (let j = i + 1; j < lines.length && (!lines[j].trim() || lines[j].search(/\S/) > indent); j += 1) block.push(lines[j]);
    blocks.push(block);
  }
  return blocks;
}

test('no workflow writes a GitHub expression into a shell command', () => {
  const names = fs.readdirSync(WORKFLOWS).filter((name) => name.endsWith('.yml'));
  assert.ok(names.length >= 17);
  for (const name of names) {
    for (const block of runBlocks(workflow(name))) {
      for (const line of block) assert.ok(!line.includes('${{'), `${name}: ${line.trim()}`);
    }
  }
  // The check finds the old pattern.
  assert.equal(runBlocks('      - run: node x.js "${{ inputs.project }}"\n').flat().some((line) => line.includes('${{')), true);
});

test('the step with the mail password runs no script, and the build job has no mail login', () => {
  const text = workflow('send-pack.yml');
  const [build, send] = text.split(/\n {2}send:\n/);
  assert.ok(send, 'building and sending are separate jobs');
  assert.ok(!/secrets\./.test(build), 'the build job has no secrets');
  assert.match(send, /needs: build/);
  const steps = send.split(/\n {6}- /);
  const withPassword = steps.filter((step) => step.includes('secrets.SMTP_PASSWORD'));
  assert.equal(withPassword.length, 1);
  assert.ok(!/\bnode\b|\bnpm\b|\bnpx\b/.test(withPassword[0]), 'only curl runs with the password');
  assert.match(withPassword[0], /--upload-file message\.eml/);
  assert.ok(!/inputs\.body/.test(send), 'the send job never sees the email text name');
  assert.match(text, /default: brisbane-tower\n/);
  assert.match(text, /default: brisbane-tower-email\n/);
});

const PINNED = /uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d/;

test('the workflows changed for the review pin each action to a commit and Playwright to one version', () => {
  for (const name of ['send-pack.yml', 'test.yml', 'fetch-guidance.yml', 'fetch-qld-codes.yml', 'fetch-state-regs.yml', 'legislation-watch.yml']) {
    const uses = workflow(name).split('\n').filter((line) => /^\s*(- )?uses:/.test(line));
    assert.ok(uses.length >= 2, name);
    for (const line of uses) assert.match(line, PINNED, `${name}: ${line.trim()}`);
  }
  for (const name of fs.readdirSync(WORKFLOWS)) {
    const text = workflow(name);
    for (const install of text.match(/playwright@[^\s&]+/g) || []) assert.match(install, /^playwright@\d+\.\d+\.\d+$/, `${name}: ${install}`);
  }
});

test('the tests run on every pull request and push to main, read only', () => {
  const text = workflow('test.yml');
  assert.match(text, /\n {2}pull_request:\n/);
  assert.match(text, /\n {2}push:\n {4}branches: \[main\]\n/);
  assert.match(text, /\npermissions:\n {2}contents: read\n/);
  assert.ok(!/write/.test(text.split('jobs:')[0]), 'no write permission');
  assert.ok(!/secrets\./.test(text));
  assert.match(text, /- run: npm ci /);
  assert.match(text, /- run: npm test\n/);
  assert.match(text, /persist-credentials: false/);
});
