const test = require('node:test');
const assert = require('node:assert/strict');
const { localControl, withoutStateCodes, withoutAddedReferences } = require('../citations');
const { withoutCitation, controlLevel } = require('../control-level');
const LINES = require('../scenarios/state-lines.json');
const STATE_CITATIONS = require('../scenarios/state-citations.json');

const ESA = 'Electrical Safety Act 2002 (Qld) ';
const ESR = 'Electrical Safety Regulation 2026 (Qld) ';
const TAG = { qld: 'Qld', nsw: 'NSW', vic: 'Vic', sa: 'SA', wa: 'WA', tas: 'Tas', act: 'ACT', nt: 'NT' };
const LICENSED = 'Electrical work is done or supervised only by licensed electrical workers, for a licensed electrical contractor.';

test('the licensed electrical work line cites each state\'s own licensing law, where it is held', () => {
  const printed = (state) => localControl(LICENSED, `${ESA}s 55, s 56`, state);
  assert.equal(printed('qld'), `${LICENSED} (${ESA}s 55, s 56)`);
  const general = 'Electrical work is done or supervised only by licensed electricians, for a licensed electrical contractor, as the state\'s electrical licensing law requires.';
  assert.equal(printed('vic'), `${general} (Electricity Safety Act 1998 (Vic) s 30, s 38)`);
  assert.equal(printed('wa'), `${general} (Electricity (Licensing) Regulations 1991 (WA) r 19, r 33, r 50)`);
  assert.equal(printed('tas'), `${general} (Occupational Licensing Act 2005 (Tas) s 21, s 22; Occupational Licensing (Electrical Work) Regulations 2018 (Tas) r 5)`);
  assert.match(printed('act'), /territory's electrical licensing law requires\. \(Construction Occupations \(Licensing\) Act 2004 \(ACT\) s 11, s 84\)$/);
  assert.match(printed('nt'), /territory's electrical licensing law requires\. \(Electrical Safety Act 2022 \(NT\) s 34, s 65, s 66\)$/);
  // The NSW and SA licensing laws could not be fetched, and Part 4.7 does not license electrical work: no reference.
  assert.equal(printed('nsw'), general);
  assert.equal(printed('sa'), general);
});

test('Part 4.7 sections are cited in the WHS states, and a state whose law has no such rule prints the line as before', () => {
  const text = 'Circuits have RCD protection as AS/NZS 3012 requires.';
  const source = `${ESR}s 140`;
  assert.equal(localControl(text, source, 'nsw'), `${text} (Work Health and Safety Regulation 2025 (NSW) s 163)`);
  assert.equal(localControl(text, source, 'sa'), `${text} (Work Health and Safety Regulations 2012 (SA) r 163)`);
  assert.equal(localControl(text, source, 'wa'), `${text} (Work Health and Safety (General) Regulations 2022 (WA) r 163)`);
  assert.equal(localControl(text, source, 'act'), `${text} (Work Health and Safety Regulation 2011 (ACT) s 163)`);
  // The Northern Territory moved Part 4.7 into its electrical safety regulations.
  assert.equal(localControl(text, source, 'nt'), `${text} (Electrical Safety Regulations 2024 (NT) r 105, r 106)`);
  // Victoria's electrical law adopts no AS/NZS 3012 duty.
  assert.equal(localControl(text, source, 'vic'), text);
  assert.equal(localControl(text, source, 'qld'), `${text} (${source})`);
  // Energised work in Queensland: a line from a NSW code gains the Queensland sections that state it.
  const energised = 'Energised electrical work is never done because it is more convenient. It goes ahead only where the regulation permits, after a competent person\'s recorded risk assessment, with the isolation point clearly marked, kept clear and able to be operated quickly.';
  const nswCode = 'SafeWork NSW Code of practice: Managing electrical risks in the workplace (August 2019) s 6.1, s 6.2';
  assert.equal(localControl(energised, nswCode, 'qld'), `${energised} (${ESR}s 195, s 199)`);
  assert.equal(localControl(energised, nswCode, 'nsw'), `${energised} (${nswCode})`);
});

test('a reference the table adds joins the same document\'s part where the line already cites it, and comes out again', () => {
  const text = 'Circuits have RCD protection as AS/NZS 3012 requires.';
  // Queensland s 299 is the NSW regulation's s 299 by heading.
  const printed = localControl(text, 'Work Health and Safety Regulation 2011 (Qld) s 299', 'nsw');
  assert.equal(printed, `${text} (Work Health and Safety Regulation 2025 (NSW) s 299, s 163)`);
  assert.equal(withoutAddedReferences(printed), `${text} (Work Health and Safety Regulation 2025 (NSW) s 299)`);
  assert.equal(withoutStateCodes(printed), `${text} (Work Health and Safety Regulation 2025 (NSW) s 299)`);
  const tas = localControl(LICENSED, `${ESA}s 55, s 56`, 'tas');
  assert.equal(withoutStateCodes(tas), withoutAddedReferences(tas));
  assert.ok(!/\(/.test(withoutStateCodes(tas)));
  // The title of an Act is not part of the control: the line keeps its level.
  assert.equal(controlLevel(tas), controlLevel(withoutCitation(tas)));
});

test('every entry in the line table is a printed line with references to the state\'s own documents', () => {
  for (const [state, lines] of Object.entries(LINES.lines)) {
    const docs = LINES.docs[state] || {};
    for (const title of Object.values(docs)) assert.ok(title.endsWith(` (${TAG[state]})`), title);
    for (const [line, refs] of Object.entries(lines)) {
      assert.ok(refs.length, line);
      assert.ok(!/\)$/.test(line), `no reference in the key: ${line}`);
      for (const ref of refs) {
        const match = /^([a-z]+) ([sr]) (\d+[A-Z]*)$/.exec(ref);
        assert.ok(match, `${state} ${line}: ${ref}`);
        if (match[1] === 'whs') {
          assert.ok(STATE_CITATIONS[state], `${state} has WHS regulations: ${ref}`);
          assert.equal(match[2], STATE_CITATIONS[state].unit, `${state} ${ref}`);
        } else {
          assert.ok(docs[match[1]], `${state} ${ref}`);
        }
      }
    }
  }
});

test('an electrical draft cites its own state\'s electrical law, lists it in the sources and names no other state\'s law', () => {
  const { prepareDraft, questionsFor } = require('../draft');
  const { answersFor } = require('../presets');
  const build = (state) => {
    const input = { state, task: 'Install new lighting and power circuits and a new distribution board in the office fit-out, terminate and test.', fallRisk: 'no', residential: 'no', workplace: 'Test site', principalContractor: 'Test builder', company: 'Test' };
    const facts = {};
    for (let round = 0; round < 8; round += 1) {
      const asked = questionsFor({ ...input, facts });
      const open = (asked.required || []).filter((item) => !facts[item.id]);
      if (!open.length) break;
      for (const item of open) facts[item.id] = item.id === 'liveElectrical' ? 'no' : item.choices ? item.choices[0].value : (answersFor(item.id, asked.task)[0] || {}).text || 'As set out in the site plan.';
    }
    return prepareDraft({ ...input, facts });
  };
  const own = { vic: 'Electricity Safety Act 1998 (Vic)', wa: 'Electricity (Licensing) Regulations 1991 (WA)', tas: 'Occupational Licensing Act 2005 (Tas)', act: 'Construction Occupations (Licensing) Act 2004 (ACT)', nt: 'Electrical Safety Act 2022 (NT)' };
  for (const state of ['qld', 'nsw', 'vic', 'sa', 'wa', 'tas', 'act', 'nt']) {
    const draft = build(state);
    assert.equal(draft.kind, 'draft', state);
    const lines = draft.jobSteps.flatMap((step) => step.controls);
    if (own[state]) {
      assert.ok(lines.some((line) => line.includes(`(${own[state]} s `) || line.includes(`(${own[state]} r `)), state);
      assert.ok(draft.sources.legislation.includes(own[state]), `${state}: ${draft.sources.legislation}`);
    }
    const other = new RegExp(`\\((?:${Object.values(TAG).filter((tag) => tag !== TAG[state]).join('|')})\\)`);
    for (const text of [...lines, ...draft.sources.legislation, ...draft.sources.codes]) assert.ok(!other.test(text), `${state}: ${text}`);
  }
});

test('the sign-on question pool of an electrical draft is the same with or without the electrical line table', () => {
  const { prepareDraft, questionsFor } = require('../draft');
  const { answersFor } = require('../presets');
  const { questionPool } = require('../sign-read');
  const tasks = [
    'Install new lighting and power circuits and a new distribution board in the office fit-out, terminate and test.',
    'Run temporary construction power and lighting for the site, install site switchboards and test and tag leads and tools.',
  ];
  const build = (state, task) => {
    const input = { state, task, fallRisk: 'no', residential: 'no', workplace: 'Test site', principalContractor: 'Test builder', company: 'Test' };
    const facts = {};
    for (let round = 0; round < 8; round += 1) {
      const asked = questionsFor({ ...input, facts });
      const open = (asked.required || []).filter((item) => !facts[item.id]);
      if (!open.length) break;
      for (const item of open) facts[item.id] = item.id === 'liveElectrical' ? 'no' : item.choices ? item.choices[0].value : (answersFor(item.id, asked.task)[0] || {}).text || 'As set out in the site plan.';
    }
    return prepareDraft({ ...input, facts });
  };
  const before = (state, task) => {
    const saved = LINES.lines;
    try {
      LINES.lines = {};
      return build(state, task);
    } finally {
      LINES.lines = saved;
    }
  };
  for (const state of ['qld', 'nsw', 'vic', 'sa', 'wa', 'tas', 'act', 'nt']) {
    let added = 0;
    for (const [index, task] of tasks.entries()) {
      const now = build(state, task);
      const then = before(state, task);
      const nowLines = now.jobSteps.flatMap((step) => step.controls);
      const thenLines = then.jobSteps.flatMap((step) => step.controls);
      added += nowLines.filter((line, k) => line !== thenLines[k]).length;
      assert.deepEqual(nowLines.map(withoutStateCodes), thenLines.map(withoutStateCodes), `${state} ${index}`);
      assert.deepEqual(questionPool(`elec-${index}`, now), questionPool(`elec-${index}`, then), `${state} ${index}`);
      // Everything but the references is the same.
      assert.deepEqual({ ...now, jobSteps: undefined, sources: undefined }, { ...then, jobSteps: undefined, sources: undefined }, `${state} ${index}`);
    }
    if (state !== 'sa') assert.ok(added > 0, `${state} gained references`);
  }
});

test('a change to a state\'s electrical law finds the lines that now cite it (goal 10)', () => {
  const { linesCiting } = require('../scripts/lines-citing');
  const wa = linesCiting('wa', 'Electricity (Licensing) Regulations 1991', 'r 19').map((item) => item.printed);
  assert.ok(wa.some((line) => /^Any power connection is made by a licensed electrician\. \(Electricity \(Licensing\) Regulations 1991 \(WA\) r 19\)$/.test(line)), JSON.stringify(wa));
  // The Before starting lines added for electrical work are found too (r 33 and r 50 are cited only there).
  const r33 = linesCiting('wa', 'Electricity (Licensing) Regulations 1991', 'r 33');
  assert.deepEqual(r33.map((item) => item.printed), ['Electrical work is done or supervised only by licensed electricians, for a licensed electrical contractor, as the state\'s electrical licensing law requires. (Electricity (Licensing) Regulations 1991 (WA) r 19, r 33, r 50)']);
  assert.deepEqual(r33[0].steps, ['electricalWork: Before starting']);
  assert.equal(linesCiting('wa', 'Electricity (Licensing) Regulations 1991', 'r 50').length, 2);
  assert.equal(linesCiting('wa', 'Electricity (Licensing) Regulations 1991', 'all').length, 14);
  const nsw = linesCiting('nsw', 'Work Health and Safety Regulation 2025', 's 163').map((item) => item.printed);
  assert.ok(nsw.includes('Circuits have RCD protection as AS/NZS 3012 requires. (Work Health and Safety Regulation 2025 (NSW) s 163)'));
  assert.equal(linesCiting('vic', 'Electricity Safety Act 1998', 's 38').every((item) => /\(Electricity Safety Act 1998 \(Vic\) s /.test(item.printed)), true);
});
