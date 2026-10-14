// Messy round 3, 14 October 2026: the first address suggestion for "12 smith st darwin",
// "200 st georges tce perth", "45 Elizabeth St Hobart" and "88 phillip st parramatta" was in
// Queensland, because a state nobody chose was used to rank them. The state the user typed comes first.
const test = require('node:test');
const assert = require('node:assert/strict');
const { stateFromTyped, placeWords } = require('../public/address');
const places = require('../places');

const prediction = (main, rest, types = ['street_address']) => ({ placePrediction: { text: { text: `${main}, ${rest}, Australia` }, structuredFormat: { mainText: { text: main }, secondaryText: { text: rest } }, types } });

// Each test types its own words: the server keeps suggestions for 10 minutes.
// A lookup that answers as the messy testers saw it: Queensland places first, the right one later or,
// for some, only when the state is added.
function lookup(table) {
  const asked = [];
  const fetchImpl = async (_url, options) => {
    const input = JSON.parse(options.body).input;
    asked.push(input);
    const list = table(input) || [];
    return { ok: true, json: async () => ({ suggestions: list }) };
  };
  return { asked, fetchImpl };
}
async function withKey(fn) {
  const saved = process.env.GOOGLE_PLACES_API_KEY;
  process.env.GOOGLE_PLACES_API_KEY = 'test-key';
  try { await fn(); } finally { if (saved === undefined) delete process.env.GOOGLE_PLACES_API_KEY; else process.env.GOOGLE_PLACES_API_KEY = saved; }
}

test('the state is read from what the user types: a state, a postcode, a capital or a large town', () => {
  const cases = {
    '12 smith st darwin': 'nt', '200 st georges tce perth': 'wa', '45 Elizabeth St Hobart': 'tas', '88 phillip st parramatta': 'nsw',
    '1 main st nt': 'nt', '1 main st 0800': 'nt', '9 queen st brisbane': 'qld', '9 bourke st melbourne': 'vic', '9 king william st adelaide': 'sa',
    '9 london cct canberra': 'act', '9 pitt st sydney': 'nsw', '3 hay st perth wa': 'wa',
    // A regional town in each state and territory.
    '5 baylis st wagga wagga': 'nsw', '22 sturt st ballarat': 'vic', '9 flinders st townsville': 'qld', '5 commercial st e mount gambier': 'sa',
    '9 victoria st bunbury': 'wa', '1 george st launceston': 'tas', '7 todd mall alice springs': 'nt', '3 hibberson st gungahlin': 'act',
  };
  for (const [typed, state] of Object.entries(cases)) assert.equal(stateFromTyped(typed).state, state, typed);
  // A capital's name used as a street's name is not the state; nor is a street number a postcode.
  assert.equal(stateFromTyped('88 adelaide st').state, '');
  assert.equal(stateFromTyped('1200 smith st').state, '');
  assert.equal(stateFromTyped('10 albany creek rd').state, '');
  assert.deepEqual(placeWords('88 phillip st parramatta'), ['parramatta']);
  assert.deepEqual(placeWords('200 st georges tce perth'), ['perth']);
});

const TOWNS = [
  ['darwin', 'Darwin City NT', 'nt'], ['perth', 'Perth WA', 'wa'], ['hobart', 'Hobart TAS', 'tas'], ['sydney', 'Sydney NSW', 'nsw'],
  ['melbourne', 'Melbourne VIC', 'vic'], ['brisbane', 'Brisbane City QLD', 'qld'], ['adelaide', 'Adelaide SA', 'sa'], ['canberra', 'Canberra ACT', 'act'],
  ['wagga wagga', 'Wagga Wagga NSW', 'nsw'], ['ballarat', 'Ballarat Central VIC', 'vic'], ['townsville', 'Townsville City QLD', 'qld'], ['mount gambier', 'Mount Gambier SA', 'sa'],
  ['bunbury', 'Bunbury WA', 'wa'], ['launceston', 'Launceston TAS', 'tas'], ['alice springs', 'Alice Springs NT', 'nt'], ['gungahlin', 'Gungahlin ACT', 'act'],
];

test('each capital city and a regional town in every state comes first, ahead of the Queensland places', async () => {
  await withKey(async () => {
    for (const [town, place, state] of TOWNS) {
      const { fetchImpl } = lookup(() => [prediction('12 Smith St', 'Capalaba QLD'), prediction('12 Smith St', 'Maryborough QLD'), prediction('12 Smith St', 'Brighton VIC'), prediction('12 Smith St', place)]);
      const result = await places.suggest(`12 smith st ${town}`, { fetchImpl });
      assert.equal(result.suggestions[0].state, state, town);
      assert.equal(result.suggestions[0].text, `12 Smith St, ${place}`, town);
    }
  });
});

test('no state is assumed when nothing is known, and the lookup is never asked for Queensland unasked', async () => {
  await withKey(async () => {
    // As staging answered: Queensland first. Before, the page sent near=qld (the state ticked when it
    // opened) and the lookup was asked again with "QLD" added, which put four Queensland places first.
    const table = (input) => (/QLD$/.test(input)
      ? [prediction('12 Smith St', 'Capalaba QLD'), prediction('12 Smith St', 'Maryborough QLD')]
      : [prediction('12 Smith St', 'West Gladstone QLD'), prediction('12 Smith St', 'Darwin City NT'), prediction('12 Smith St', 'Urangan QLD')]);
    const darwin = lookup(table);
    const result = await places.suggest('12 smith street darwin', { fetchImpl: darwin.fetchImpl });
    assert.deepEqual(darwin.asked, ['12 smith street darwin']);
    assert.equal(result.suggestions[0].text, '12 Smith St, Darwin City NT');
    // A Queensland profile does not outrank the city typed.
    const near = lookup(table);
    const again = await places.suggest('12 smith street darwin', { fetchImpl: near.fetchImpl, near: 'qld' });
    assert.ok(!near.asked.some((input) => /QLD$/.test(input)), 'not asked for Queensland');
    assert.equal(again.suggestions[0].state, 'nt');
  });
});

test('the three round 3 addresses: Darwin, Perth and Hobart, asked again with the state where none fits', async () => {
  await withKey(async () => {
    const perth = lookup((input) => (/\bWA$/.test(input)
      ? [prediction('200 St Georges Terrace', 'Perth WA')]
      : [prediction('200 St Georges Ln', 'Shaw QLD'), prediction('Qld transport', 'St Georges Terrace, Saint George QLD', ['establishment']), prediction('200 St Georges Ct', 'Carrara QLD'), prediction('200 St Georges Rd', 'Bridport TAS')]));
    const result = await places.suggest('200 st georges tce perth', { fetchImpl: perth.fetchImpl });
    assert.deepEqual(perth.asked, ['200 st georges tce perth', '200 st georges tce perth WA']);
    assert.equal(result.suggestions[0].text, '200 St Georges Terrace, Perth WA');
    // A business is offered only with its street number and street (D278).
    assert.ok(!result.suggestions.some((item) => /Qld transport/.test(item.text)));
    const hobart = lookup(() => [prediction('45 Elizabeth St', 'Aitkenvale QLD'), prediction('45 Elizabeth St', 'Hobart TAS'), prediction('45 Elizabeth St', 'Paddington NSW')]);
    assert.equal((await places.suggest('45 Elizabeth St Hobart', { fetchImpl: hobart.fetchImpl })).suggestions[0].text, '45 Elizabeth St, Hobart TAS');
    const parramatta = lookup(() => [prediction('Phillip St', 'North Mackay QLD', ['route']), prediction('88 Phillip St', 'Parramatta NSW')]);
    assert.equal((await places.suggest('88 phillip st parramatta', { fetchImpl: parramatta.fetchImpl, near: 'qld' })).suggestions[0].text, '88 Phillip St, Parramatta NSW');
    // A state typed by its abbreviation ("nt") wins, and is asked for by its full name where nothing fits.
    const nt = lookup((input) => (/Northern Territory$/.test(input) ? [prediction('12 Smith St', 'Darwin City NT')] : [prediction('12 Smith St', 'Capalaba QLD')]));
    const typed = await places.suggest('12 smith st nt', { fetchImpl: nt.fetchImpl });
    assert.deepEqual(nt.asked, ['12 smith st nt', '12 smith st nt Northern Territory']);
    assert.equal(typed.suggestions[0].state, 'nt');
  });
});

test('with no place typed, the state the user\'s own answers point to still comes first', async () => {
  await withKey(async () => {
    const { fetchImpl, asked } = lookup((input) => (/QLD$/.test(input) ? [prediction('10 Example Street', 'Herston QLD')] : [prediction('10 Example Street', 'Brighton VIC')]));
    const result = await places.suggest('10 Example Street', { fetchImpl, near: 'qld' });
    assert.deepEqual(asked, ['10 Example Street', '10 Example Street QLD']);
    assert.equal(result.suggestions[0].state, 'qld');
  });
});
