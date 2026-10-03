const test = require('node:test');
const assert = require('node:assert/strict');
const { stateFromAddress, stateFromPostcode } = require('../public/address');
const places = require('../places');

test('the state comes from the job address: the state named, else the postcode', () => {
  assert.deepEqual(stateFromAddress('Vulture St, Woolloongabba QLD 4102'), { state: 'qld', from: 'name' });
  assert.deepEqual(stateFromAddress('1 Olympic Blvd, Melbourne VIC 3000'), { state: 'vic', from: 'name' });
  // A place named after a state is not the state.
  assert.equal(stateFromAddress('Albany Hwy, Victoria Park WA 6100').state, 'wa');
  assert.equal(stateFromAddress('Queensland Road, Casino NSW 2470').state, 'nsw');
  assert.deepEqual(stateFromAddress('Hospital Rd, Herston 4006'), { state: 'qld', from: 'postcode' });
  assert.equal(stateFromAddress('Northbourne Ave, Canberra 2601').state, 'act');
  assert.equal(stateFromAddress('Darwin 0800').state, 'nt');
  assert.equal(stateFromAddress('Hobart 7000').state, 'tas');
  // Border postcodes and addresses with no state stay unset.
  assert.equal(stateFromPostcode('2620'), '');
  assert.equal(stateFromAddress('Main Street').state, '');
});

test('address suggestions come from Google only with a key, Australian addresses only', async () => {
  const saved = process.env.GOOGLE_PLACES_API_KEY;
  delete process.env.GOOGLE_PLACES_API_KEY;
  assert.deepEqual(await places.suggest('Vulture St'), { enabled: false, suggestions: [] });
  process.env.GOOGLE_PLACES_API_KEY = 'test-key';
  let sent = null;
  const fetchImpl = async (url, options) => {
    sent = { url, options };
    return { ok: true, json: async () => ({ suggestions: [{ placePrediction: { text: { text: 'Vulture St, Woolloongabba QLD, Australia' } } }] }) };
  };
  const result = await places.suggest('Vulture St Wool', { fetchImpl });
  assert.equal(sent.url, 'https://places.googleapis.com/v1/places:autocomplete');
  assert.equal(sent.options.headers['X-Goog-Api-Key'], 'test-key');
  assert.deepEqual(JSON.parse(sent.options.body).includedRegionCodes, ['au']);
  assert.deepEqual(result.suggestions, [{ text: 'Vulture St, Woolloongabba QLD', state: 'qld' }]);
  // A failed lookup gives no suggestions, not an error page.
  const failed = await places.suggest('Herston Rd', { fetchImpl: async () => ({ ok: false, status: 403 }) });
  assert.deepEqual(failed.suggestions, []);
  if (saved === undefined) delete process.env.GOOGLE_PLACES_API_KEY; else process.env.GOOGLE_PLACES_API_KEY = saved;
});
