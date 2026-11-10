// A trade is recorded on every activity (D316 item 2), the prerequisite for the typed-text trade gate.
// Recorded only: the job steps are still chosen as before.
const test = require('node:test');
const assert = require('node:assert/strict');
const { ACTIVITIES } = require('../activities');
const { TRADES, COMMON, limitToTrades } = require('../trades');
const { ANY, OTHER_TRADES, ACTIVITY_TRADES, tradesFor } = require('../activity-trades');

const KNOWN = new Set([...TRADES.map((trade) => trade.id), ...Object.keys(OTHER_TRADES), ANY]);
const KINDS = new Set(ACTIVITIES.map((activity) => activity.when));

test('every activity has its trades recorded, each a known trade or any', () => {
  for (const activity of ACTIVITIES) {
    assert.ok(Array.isArray(activity.trades) && activity.trades.length, `${activity.when} has trades`);
    for (const id of activity.trades) assert.ok(KNOWN.has(id), `${activity.when}: ${id} is a known trade`);
    assert.equal(new Set(activity.trades).size, activity.trades.length, `${activity.when}: no trade twice`);
  }
});

test('the table has an entry for each kind of work and nothing else', () => {
  assert.deepEqual(Object.keys(ACTIVITY_TRADES).sort(), [...KINDS].sort());
  assert.equal(tradesFor('noSuchKind'), null);
  assert.equal(tradesFor('constructor'), null);
});

test('the recorded trades include every trade that trades.js gives the work to', () => {
  for (const trade of TRADES) {
    for (const kind of [...trade.kinds, ...(trade.extra || [])].filter(Boolean)) {
      if (!KINDS.has(kind)) continue;
      assert.ok(tradesFor(kind).includes(trade.id), `${kind} records ${trade.id}`);
    }
  }
  // A trade's own kinds come first.
  assert.deepEqual(tradesFor('cablePull').slice(0, 1), ['electrical']);
});

test('specialist trades outside trades.js are recorded but are not gate trades yet', () => {
  for (const id of Object.keys(OTHER_TRADES)) assert.ok(!TRADES.some((trade) => trade.id === id), `${id} is not in trades.js`);
  assert.deepEqual(tradesFor('asbestos'), ['asbestos']);
  assert.deepEqual(tradesFor('towerCrane'), ['cranes']);
  // An unknown trade id given to the gate is ignored, as before.
  assert.deepEqual(limitToTrades({ asbestos: true, painting: true }, 'asbestos', ['asbestos', 'painting']), { asbestos: true, painting: true });
});

test('work any trade can strike is marked any or keeps its trades.js trades', () => {
  for (const kind of COMMON) {
    if (!KINDS.has(kind)) continue;
    assert.ok(tradesFor(kind).length, `${kind} has trades`);
  }
  for (const kind of ['ewp', 'ladderUse', 'forklift', 'power', 'generatorUse']) assert.ok(tradesFor(kind).includes(ANY), `${kind} is any trade's`);
  // Trade work that any trade's scope may name still says whose it is (D329: brazing, lift and door work).
  assert.ok(tradesFor('bathReplace').includes('plumbing'));
  assert.ok(tradesFor('switchboardReplace').includes('electrical'));
  assert.ok(tradesFor('liftMotor').includes('lifts'));
  assert.ok(tradesFor('doorHang').includes('doors'));
});
