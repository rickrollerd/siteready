const test = require('node:test');
const assert = require('node:assert/strict');
const { localSource, localText } = require('../citations');
const { prepareDraft } = require('../draft');

const QLD = 'Work Health and Safety Regulation 2011 (Qld) ';

test('Queensland drafts cite the Queensland-approved code, renumbered where Queensland differs', () => {
  assert.equal(localSource('Model Code: Excavation work s 6.1', 'qld'), 'Excavation work Code of Practice 2021 (Qld) s 6.2');
  assert.equal(localSource('Model Code: Managing the risk of falls s 3.1, s 5.1', 'qld'), 'Managing the risk of falls at workplaces Code of Practice 2021 (Qld) s 3.2, s 5.1');
  assert.equal(localSource('Model Code: Managing electrical risks s 6.1', 'qld'), 'Electrical Safety Code of Practice 2021: Managing electrical risks in the workplace (Qld) s 5.1');
  // Queensland has not approved the Construction work code, and some sections have no match.
  assert.equal(localSource('Model Code: Construction work s 4.1', 'qld'), 'Model Code: Construction work s 4.1');
  assert.equal(localSource('Model Code: Managing electrical risks s 8.2, s 9.2', 'qld'),
    'Electrical Safety Code of Practice 2021: Managing electrical risks in the workplace (Qld) s 7.2; Model Code: Managing electrical risks s 8.2');
  assert.equal(localSource(`${QLD}s 306D`, 'qld'), `${QLD}s 306D`);
});

test('WA and Vic drafts cite their own regulation, and leave out what has no match', () => {
  const source = `${QLD}s 78, s 79, s 306D, schedule 3; Model Code: Managing the risk of falls s 5.1; Ozone Protection and Synthetic Greenhouse Gas Management Regulations 1995 (Cth) r 111`;
  // WA has approved its own version of the falls code; s 5.1 there holds the same text.
  assert.equal(localSource(source, 'wa'), 'Work Health and Safety (General) Regulations 2022 (WA) r 78, r 79, Schedule 3; Managing the risk of falls at workplaces Code of practice 2022 (WA) s 5.1; Ozone Protection and Synthetic Greenhouse Gas Management Regulations 1995 (Cth) r 111');
  assert.equal(localSource(source, 'vic'), 'Occupational Health and Safety Regulations 2017 (Vic) r 44, Schedule 3; Ozone Protection and Synthetic Greenhouse Gas Management Regulations 1995 (Cth) r 111');
  assert.equal(localSource(`${QLD}s 299`, 'vic'), 'Occupational Health and Safety Regulations 2017 (Vic) r 327');
  // NSW is mapped from the Work Health and Safety Regulation 2025 (NSW) text.
  assert.equal(localSource(`${QLD}s 299`, 'nsw'), 'Work Health and Safety Regulation 2025 (NSW) s 299');
});

test('the asbestos date follows the state', () => {
  const text = 'Buildings built before 31 December 1989 are checked for asbestos.';
  assert.equal(localText(text, 'qld'), text);
  assert.equal(localText(text, 'wa'), 'Buildings built before 31 December 2003 are checked for asbestos.');
});

test('a WA draft prints WA citations and no Queensland ones', () => {
  const task = 'Strip out and renovate the bathroom in a 1970s house, then waterproof the floor.';
  const facts = { asbestosArrangement: 'Asbestos register checked; licensed removalist removes the wall sheeting first.' };
  for (const state of ['wa', 'vic']) {
    const done = prepareDraft({ state, task, fallRisk: 'no', residential: 'yes', facts });
    const text = JSON.stringify(done.jobSteps);
    assert.doesNotMatch(text, /\(Qld\)/, state);
    assert.doesNotMatch(text, /31 December 1989/, state);
  }
  const wa = JSON.stringify(prepareDraft({ state: 'wa', task, fallRisk: 'no', residential: 'yes', facts }).jobSteps);
  assert.match(wa, /Work Health and Safety \(General\) Regulations 2022 \(WA\) r \d+/);
});

test('SA, Tas, ACT and NT controls carry their own regulation numbers', () => {
  const { localSource } = require('../citations');
  const src = 'Work Health and Safety Regulation 2011 (Qld) s 214, s 215';
  assert.equal(localSource(src, 'sa'), 'Work Health and Safety Regulations 2012 (SA) r 214, r 215');
  assert.equal(localSource(src, 'tas'), 'Work Health and Safety Regulations 2022 (Tas) r 214, r 215');
  assert.equal(localSource(src, 'act'), 'Work Health and Safety Regulation 2011 (ACT) s 214, s 215');
  assert.equal(localSource(src, 'nt'), 'Work Health and Safety (National Uniform Legislation) Regulations 2011 (NT) r 214, r 215');
  // NSW numbers its provisions as sections; s 85 (evidence of licence) is s 85 there too, not the diving rule.
  assert.equal(localSource(src, 'nsw'), 'Work Health and Safety Regulation 2025 (NSW) s 214, s 215');
  assert.equal(localSource('Work Health and Safety Regulation 2011 (Qld) s 85', 'nsw'), 'Work Health and Safety Regulation 2025 (NSW) s 85');
  // Queensland-only rules are left out, and the ACT's engineered stone ban is r 418F there.
  assert.equal(localSource('Work Health and Safety Regulation 2011 (Qld) s 306G', 'sa'), '');
  assert.equal(localSource('Work Health and Safety Regulation 2011 (Qld) s 529A, s 529D', 'act'), 'Work Health and Safety Regulation 2011 (ACT) s 418F');
});

test('ACT drafts do not give the 10 m2 asbestos exception, which the ACT does not have', () => {
  const { localText } = require('../citations');
  const line = 'Asbestos is removed by a licensed asbestos removalist, except for 10 m2 or less of non-friable asbestos removed under the regulation.';
  assert.equal(localText(line, 'act'), 'Asbestos is removed only by a licensed asbestos removalist, whatever the amount.');
  assert.equal(localText(line, 'sa'), line);
});

test('ACT drafts use the ACT crystalline silica rules, and the 14 day silica report is stated generally where a state has no such rule', () => {
  const { localText } = require('../citations');
  const assess = 'Assess in writing before cutting whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely only on the dust controls used for the processing, such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until that is determined.';
  const act = localText(assess, 'act');
  assert.match(act, /^Before cutting, a continuous water feed is used with at least one other crystalline silica control/);
  assert.doesNotMatch(act, /assess in writing|high risk\./i);
  // SA r 529CA(3) and (5): the dust controls are not relied on, and an unknown is high risk.
  assert.equal(localText(assess, 'sa'), 'Assess in writing before cutting whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely on the dust controls used for the processing, such as wet methods, extraction or isolation. If it cannot be determined, treat it as high risk until it is determined that it is not.');
  const plan = 'Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work), and workers have completed a VET accredited or regulator approved crystalline silica course.';
  assert.equal(localText(plan, 'act'), 'Workers who carry out high risk crystalline silica work have completed the crystalline silica awareness course the Minister declares under section 418D.');
  const report = 'Monitor the air and keep the results for 30 years. For high risk processing, results above the exposure standard are reported to the regulator within 14 days.';
  assert.equal(localText(report, 'qld'), report);
  // The model states have r 529CE; the ACT and Victoria do not.
  assert.equal(localText(report, 'sa'), 'Monitor the air and keep the results for 30 years. For high risk processing, air monitoring is done, results above the exposure standard are reported to the regulator within 14 days, and all workers doing the processing have health monitoring.');
  assert.match(localText(report, 'act'), /where the territory's rules require it\.$/);
});

test('SA, WA, Tas, ACT and NT cite their own approved code, at the section that holds the same text', () => {
  const falls = 'Managing the risk of falls at workplaces Code of Practice 2021 (Qld) s 3.2';
  // Queensland's s 3.2 (identifying the hazards) is s 3.1 in South Australia's June 2020 edition.
  assert.equal(localSource(falls, 'sa'), 'Managing the risk of falls at workplaces Code of Practice 2020 (SA) s 3.1');
  assert.equal(localSource(falls, 'qld'), falls);
  // A Queensland and an NSW citation of the same section print once, as the state's code.
  const both = 'Work Health and Safety Regulation 2011 (Qld) s 55; Managing the risk of falls at workplaces Code of Practice 2021 (Qld) s 8.1; SafeWork NSW Code of practice: Managing the risk of falls at workplaces (August 2019) s 8.1';
  assert.equal(localSource(both, 'sa'), 'Work Health and Safety Regulations 2012 (SA) r 55; Managing the risk of falls at workplaces Code of Practice 2020 (SA) s 8.1');
  // NSW keeps its own codes, unchanged.
  assert.equal(localSource(both, 'nsw'), 'Work Health and Safety Regulation 2025 (NSW) s 55; SafeWork NSW Code of practice: Managing the risk of falls at workplaces (August 2019) s 8.1');
  // The NT has approved the silica code; Tasmania's approved silica code is not clear, so none is cited there.
  const silica = 'SafeWork NSW Code of practice: Managing risks of respirable crystalline silica in the workplace (February 2026) s 2.4.2';
  assert.equal(localSource(silica, 'nt'), 'Managing risks of respirable crystalline silica in the workplace Code of Practice 2026 (NT) s 2.4.2');
  assert.equal(localSource(silica, 'tas'), '');
  // The ACT has approved a formwork code; NSW's s 7.9 is s 4.7 there.
  assert.equal(localSource('SafeWork NSW Code of practice: Formwork (March 2021) s 7.9', 'act'), 'Formwork Code of Practice 2024 (ACT) s 4.7');
});

test('a code is not cited where the state has not approved it, or where no section holds the same text', () => {
  // SA has not approved the Construction work code (its regulator lists it as a model code only).
  assert.equal(localSource('Model Code: Construction work appendix K', 'sa'), '');
  assert.equal(localSource('Model Code: Construction work appendix K', 'act'), 'Construction work Code of Practice 2025 (ACT) appendix K');
  // Queensland's scaffolding code and NSW's roofs code have no counterpart elsewhere.
  assert.equal(localSource('Scaffolding Code of Practice 2021 (Qld) s 4.1', 'sa'), '');
  assert.equal(localSource('SafeWork NSW Code of practice: Work on roofs, commercial and industrial buildings (May 2026) s 3.4', 'wa'), '');
  // Victoria's compliance codes are worded differently: no Queensland, NSW or model section is cited there.
  assert.equal(localSource('Managing the risk of falls at workplaces Code of Practice 2021 (Qld) s 9.1', 'vic'), '');
});

test('a state code section is left off a line whose own sentence the state section does not hold', () => {
  const codes = require('../scenarios/state-codes.json');
  const key = Object.keys(codes.sa.notOnLine).find((k) => k.startsWith('Confined spaces Code of Practice 2021 (Qld)|s 1.1'));
  const line = codes.lines[codes.sa.notOnLine[key][0]];
  const source = 'Confined spaces Code of Practice 2021 (Qld) s 1.1';
  assert.equal(localSource(source, 'sa', line), '');
  assert.equal(localSource(source, 'sa', 'Another line.'), 'Confined spaces Code of Practice 2024 (SA) s 1.1');
  // Every mapped section names a code the state has approved.
  for (const [state, data] of Object.entries(codes)) {
    if (state === 'lines') continue;
    for (const [code] of Object.values(data.sections)) assert.ok(data.codes[code], `${state} ${code}`);
  }
});

test('lines that differ only in the state code references are still said once in a draft', () => {
  const { localControl, withoutStateCodes } = require('../citations');
  const text = 'Ladders are industrial and rated for at least 120 kg.';
  const plain = localControl(text, 'Work Health and Safety Regulation 2011 (Qld) s 306M', 'sa');
  const cited = localControl(text, 'Work Health and Safety Regulation 2011 (Qld) s 306M; SafeWork NSW Code of practice: Managing the risk of falls at workplaces (August 2019) s 9.1', 'sa');
  assert.equal(plain, text);
  assert.equal(cited, `${text} (Managing the risk of falls at workplaces Code of Practice 2020 (SA) s 9.1)`);
  assert.equal(withoutStateCodes(cited), plain);
  // Every state code part comes out, wherever it sits in the citation, and the law stays.
  const demolition = 'Demolition work Code of Practice 2020 (SA) s 6.10';
  const chemicals = 'Managing risks of hazardous chemicals in the workplace Code of Practice 2024 (SA) appendix J, s 4.2';
  const reg = 'Work Health and Safety Regulations 2012 (SA) r 55';
  assert.equal(withoutStateCodes(`A. (${demolition}; ${chemicals})`), 'A.');
  assert.equal(withoutStateCodes(`A. (${reg}; ${demolition}; ${chemicals})`), `A. (${reg})`);
  assert.equal(withoutStateCodes(`A. (${demolition}; ${reg})`), `A. (${reg})`);
  assert.equal(withoutStateCodes(`A (${reg}). B.`), `A (${reg}). B.`);
  // A whole draft: no line is printed twice, by its words, in any state with its own codes.
  const { split } = { split: (line) => line.replace(/\s*\((?:[^()]|\([^()]*\))*\)$/, '') };
  const { questionsFor } = require('../draft');
  const { answersFor } = require('../presets');
  const task = 'Install copper pipework in the plant room and risers from ladders, drill and chase concrete walls for pipe brackets, and cut plasterboard for access panels.';
  for (const state of ['sa', 'wa', 'tas', 'act', 'nt']) {
    const input = { state, task, fallRisk: 'no', residential: 'no', workplace: 'Test site', principalContractor: 'Test builder' };
    const facts = {};
    for (let round = 0; round < 8; round += 1) {
      const asked = questionsFor({ ...input, facts });
      const open = (asked.required || []).filter((item) => !facts[item.id]);
      if (!open.length) break;
      for (const item of open) facts[item.id] = item.choices ? item.choices[0].value : (answersFor(item.id, asked.task)[0] || {}).text || 'As set out in the site plan.';
    }
    const done = prepareDraft({ ...input, facts });
    assert.equal(done.kind, 'draft', state);
    const lines = done.jobSteps.flatMap((step) => step.controls).map(split);
    assert.equal(lines.length, new Set(lines).size, state);
  }
});
