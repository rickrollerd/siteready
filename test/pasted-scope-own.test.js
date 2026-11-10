const test = require('node:test');
const assert = require('node:assert/strict');
const { foundKinds } = require('../draft');
const { ready, ANSWERED } = require('./helpers');

test('leading "The Subcontractor shall ..." counts as own work', () => {
  const kinds = foundKinds(ready({ ...ANSWERED, state: 'sa', task: 'The Subcontractor shall paint all walls', fallRisk: 'no', residential: 'no' }));
  assert.ok(kinds && kinds.includes('painting'), kinds ? kinds.join(', ') : 'null');
});

test('leading numbered "1. The Subcontractor shall ..." counts as own work', () => {
  const kinds = foundKinds(ready({ ...ANSWERED, state: 'sa', task: '1. The Subcontractor shall paint all walls', fallRisk: 'no', residential: 'no' }));
  assert.ok(kinds && kinds.includes('painting'), kinds ? kinds.join(', ') : 'null');
});

test('"The Contractor shall paint all walls" does NOT count as own work', () => {
  const kinds = foundKinds(ready({ ...ANSWERED, state: 'sa', task: 'The Contractor shall paint all walls', fallRisk: 'no', residential: 'no' }));
  assert.ok(!kinds || !kinds.includes('painting'), kinds ? kinds.join(', ') : 'null');
});

test('a pasted painting scope brings painting steps, not joinery alone', () => {
  const task = [
    '1. The Subcontractor shall paint all internal plasterboard, villaboard walls and ceilings, in Building 1, 2, 3 and 4 in a 3 coat system (excluding Conference Room Ceiling and Walls and additional coats for feature wall colours).',
    '2. The Subcontractor shall paint all doors, architraves, skirting, timber window reveals, timber sills and roller door jambs',
  ].join('\n');
  const kinds = foundKinds(ready({ ...ANSWERED, state: 'sa', task, fallRisk: 'no', residential: 'no' }));
  assert.ok(kinds && kinds.includes('painting'), kinds ? kinds.join(', ') : 'null');
  assert.ok(!kinds.includes('carpJoinery'), kinds.join(', '));
});

test('a named other subcontractor is still others\' work', () => {
  const kinds = foundKinds(ready({ ...ANSWERED, state: 'sa', task: 'The electrical subcontractor shall paint all walls', fallRisk: 'no', residential: 'no' }));
  assert.ok(!kinds || !kinds.includes('painting'), kinds ? kinds.join(', ') : 'null');
});
