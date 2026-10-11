const test = require('node:test');
const assert = require('node:assert/strict');
const { localControl, withoutStateCodes } = require('../citations');
const { withoutCitation, controlLevel } = require('../control-level');
const VIC = require('../scenarios/vic-lines.json');

const QLD = 'Work Health and Safety Regulation 2011 (Qld) ';
const MANUAL = 'Compliance code: Hazardous manual handling 2019 (Vic)';
const REGS = 'Occupational Health and Safety Regulations 2017 (Vic)';

test('a Victorian line cites the compliance code paragraphs its own sentence was matched to', () => {
  const text = 'Team lifts are an interim control only, with one person in charge.';
  const source = 'Model Code: Hazardous manual tasks s 4.9; SafeWork NSW Code of practice: Hazardous manual tasks (August 2019) s 4.1, s 4.7';
  assert.equal(localControl(text, source, 'vic'), `${text} (${MANUAL} para 110, para 111)`);
  // The other states print what they printed before.
  assert.ok(!/Compliance code/.test(localControl(text, source, 'qld')));
  assert.ok(!/Compliance code/.test(localControl(text, source, 'nsw')));
  assert.ok(!/Compliance code/.test(localControl(text, source, 'sa')));
});

test('a reworded Victorian line gets the Victorian provision that states it, and a line not in the table is unchanged', () => {
  // Reworded for Victoria (crystalline silica rules), so it carried no reference before.
  const text = 'Assess in writing before starting whether the processing is high risk, and treat it as high risk if it cannot be determined.';
  assert.equal(localControl(text, `${QLD}s 529CA`, 'vic'), `Before work starts, determine whether the work is high risk crystalline silica work. (${REGS} r 319J)`);
  // A line with no Victorian match keeps what it had.
  assert.equal(localControl('Install ties as the scaffold goes up.', 'Scaffolding Code of Practice 2021 (Qld) s 4.1', 'vic'), 'Install ties as the scaffold goes up.');
});

test('regulations matched to the line join those already cited, once each, in number order', () => {
  const text = 'A confined space is entered only under a confined space entry permit and a separate SWMS.';
  // Queensland s 67 is Victoria's r 63 by heading; the line table adds r 63, r 322 and r 327.
  assert.equal(localControl(text, `${QLD}s 67`, 'vic'), `${text} (${REGS} r 63, r 322, r 327)`);
  // Act sections come before the regulations.
  const incident = 'A serious electrical incident or dangerous electrical event is reported to the regulator immediately, and the site is left undisturbed.';
  assert.equal(localControl(incident, 'Electrical Safety Regulation 2026 (Qld) s 292, s 296', 'vic'), 'A notifiable incident is reported to the regulator immediately, and the site is left undisturbed. (Occupational Health and Safety Act 2004 (Vic) s 38, s 39)');
});

test('every entry in the Victorian line table names a held provision in the right form', () => {
  const codes = new Set(Object.keys(VIC.codes));
  for (const [line, refs] of Object.entries(VIC.lines)) {
    assert.ok(refs.length, line);
    assert.ok(!/\)$/.test(line), `no reference in the key: ${line}`);
    for (const ref of refs) {
      const match = /^(?:r \d+[A-Z]*|s \d+[A-Z]*|Schedule \d+|([a-z-]+) para \d+)$/.exec(ref);
      assert.ok(match, `${line}: ${ref}`);
      if (match[1]) assert.ok(codes.has(match[1]), `${line}: ${ref}`);
    }
  }
  for (const title of Object.values(VIC.codes)) assert.match(title, /^Compliance code: .+ \d{4} \(Vic\)$/);
});

test('a compliance code reference is not part of the line for matching or for its level of control', () => {
  const line = `Use pipe lifters and mechanical aids. Team lifts are an interim control only. (${MANUAL} para 105, para 110)`;
  assert.equal(withoutStateCodes(line), 'Use pipe lifters and mechanical aids. Team lifts are an interim control only.');
  assert.equal(withoutStateCodes(`A. (${REGS} r 44; ${MANUAL} para 105)`), `A. (${REGS} r 44)`);
  const falls = 'Barricade and sign the area below. (Compliance code: Prevention of falls in general construction 2019 (Vic) para 221, para 222)';
  assert.equal(withoutCitation(falls), 'Barricade and sign the area below.');
  assert.equal(controlLevel(falls), controlLevel('Barricade and sign the area below.'));
});

test('a Victorian draft lists the compliance codes it cites, by title, and no other state\'s law', () => {
  const { prepareDraft, questionsFor } = require('../draft');
  const { answersFor } = require('../presets');
  const input = { state: 'vic', task: 'Dig a trench for a stormwater pipe beside the building, lay the pipe and backfill.', fallRisk: 'no', residential: 'no', workplace: 'Test site', principalContractor: 'Test builder', company: 'Test' };
  const facts = {};
  for (let round = 0; round < 8; round += 1) {
    const asked = questionsFor({ ...input, facts });
    const open = (asked.required || []).filter((item) => !facts[item.id]);
    if (!open.length) break;
    for (const item of open) facts[item.id] = item.choices ? item.choices[0].value : (answersFor(item.id, asked.task)[0] || {}).text || 'As set out in the site plan.';
  }
  const draft = prepareDraft({ ...input, facts });
  assert.equal(draft.kind, 'draft');
  const codes = draft.sources.codes.filter((title) => /^Compliance code/.test(title));
  assert.ok(codes.includes('Compliance code: Excavation 2019 (Vic)'), JSON.stringify(draft.sources));
  for (const title of [...draft.sources.codes, ...draft.sources.legislation]) assert.ok(!/\bpara\b|\((?:Qld|NSW|SA|WA|Tas|ACT|NT)\)/.test(title), title);
  const lines = draft.jobSteps.flatMap((step) => step.controls);
  assert.ok(lines.some((line) => /\(Compliance code: Excavation 2019 \(Vic\) para \d+/.test(line)));
  assert.ok(!lines.some((line) => /\((?:Qld|NSW)\)|SafeWork NSW|Model Code/.test(line)));
});

test('a change to a Victorian compliance code paragraph or regulation finds the lines that now cite it (goal 10)', () => {
  const { covers, referencesFor, linesCiting } = require('../scripts/lines-citing');
  assert.equal(covers('para 221', 'para 221'), true);
  assert.equal(covers('para 221', '22'), false);
  assert.deepEqual(referencesFor(`${MANUAL} para 110, para 111`, 'Hazardous manual handling'), ['para 110', 'para 111']);
  const found = linesCiting('vic', 'Compliance code: Hazardous manual handling', 'para 111');
  assert.ok(found.some((item) => item.text === 'Team lifts are an interim control only, with one person in charge.'));
  // The regulation sections matched by heading are still found, alongside those matched by line.
  const permits = linesCiting('vic', 'Occupational Health and Safety Regulations 2017', 'r 63').map((item) => item.printed);
  assert.ok(permits.some((line) => /r 63, r 322, r 327\)$/.test(line)));
  assert.ok(linesCiting('vic', 'Occupational Health and Safety Regulations 2017', 'r 44').length >= 29);
});
