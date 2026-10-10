// Stressing rail is track work, not post-tensioning (independent tester FAULT-3, 10 October 2026).
const test = require('node:test');
const assert = require('node:assert/strict');
const { suggestedKinds } = require('../draft');

const TRACK = 'Renew a section of railway track on the Adelaide metro line during a track possession, including removing old sleepers and rail with a road-rail excavator, placing new concrete sleepers and rail, and tamping and stressing the rail, working adjacent to an open adjacent line with rail traffic.';

test('stressing the rail in a track renewal brings no post-tensioning steps', () => {
  const kinds = suggestedKinds(TRACK, {}, {});
  for (const kind of ['stressing', 'ptSlab', 'ptTendons']) assert.ok(!kinds.includes(kind), kind);
  assert.ok(kinds.includes('trackWork'));
  assert.ok(kinds.includes('railCorridor'));
});

test('post-tensioning stressing still brings its steps', () => {
  assert.ok(suggestedKinds('Stressing the post-tensioned slab tendons on level 4', {}, {}).includes('stressing'));
  assert.ok(suggestedKinds('Stress and grout the tendons to the transfer slab', {}, {}).includes('stressing'));
});
