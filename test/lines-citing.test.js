// Goal 10: given a changed section of a law or code, every control line citing it is listed, as it
// prints in that state, so a change can be mapped to the lines it affects (scripts/lines-citing.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { covers, referencesFor, linesCiting, draftLinesCiting } = require('../scripts/lines-citing');

test('a section matches itself, its subsections and any range it falls in', () => {
  assert.equal(covers('s 299', 's 299'), true);
  assert.equal(covers('r 299(1)', '299'), true);
  assert.equal(covers('s 3.4', 's 3'), true);
  assert.equal(covers('s 4.6.2', '4.6'), true);
  assert.equal(covers('s 291 to s 295', 's 293'), true);
  assert.equal(covers('s 2990', 's 299'), false);
  assert.equal(covers('s 3.4', 's 3.5'), false);
  assert.equal(covers('appendix K', 'Appendix K'), true);
});

test('references are read after the law or code name and its bracketed details', () => {
  assert.deepEqual(referencesFor('Work Health and Safety Regulation 2025 (NSW) s 299, s 300', 'Work Health and Safety Regulation 2025'), ['s 299', 's 300']);
  assert.deepEqual(referencesFor('Managing the risk of falls at workplaces Code of Practice 2021 (Qld) s 3.4; Work Health and Safety Regulation 2011 (Qld) s 78', 'managing the risk of falls'), ['s 3.4']);
  assert.deepEqual(referencesFor('SafeWork NSW Code of practice: Excavation work (January 2020) s 3.6, appendix B', 'Excavation work'), ['s 3.6', 'appendix B']);
  assert.deepEqual(referencesFor('Model Code: Excavation work s 3.5', 'Hazardous manual tasks'), []);
});

test('the lines citing a NSW section are found as NSW SWMS print them', () => {
  const lines = linesCiting('nsw', 'Work Health and Safety Regulation 2025', 's 78');
  assert.ok(lines.length >= 5, `found ${lines.length}`);
  for (const item of lines) {
    assert.match(item.printed, /Work Health and Safety Regulation 2025 \(NSW\)/);
    assert.ok(item.steps.length >= 1);
  }
  // The same Queensland lines cite Queensland's own section in Queensland.
  assert.equal(linesCiting('qld', 'Work Health and Safety Regulation 2011', 's 78').length, lines.length);
  assert.deepEqual(linesCiting('nsw', 'Work Health and Safety Regulation 2025', 's 9999'), []);
  // Lines draft.js adds are listed by line number to check by hand.
  assert.ok(draftLinesCiting('qld', 's 215', 'Work Health and Safety Regulation 2011').some((item) => /CITE\.WHS\('s 215'\)/.test(item.text)));
});

test('the script prints the lines for a person to read', () => {
  const out = execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'lines-citing.js'), 'nsw', 'Work Health and Safety Regulation 2025', 's 299']).toString();
  assert.match(out, /NSW: \d+ control lines? citing Work Health and Safety Regulation 2025 s 299/);
  assert.match(out, /next to an operating hospital/);
});
