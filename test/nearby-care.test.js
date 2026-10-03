const test = require('node:test');
const assert = require('node:assert/strict');
const places = require('../places');

test('nearest hospitals and medical centres are found from the job address, nearest first, with the distance', async () => {
  process.env.GOOGLE_PLACES_API_KEY = 'test-key';
  const calls = [];
  const reply = (body) => ({ ok: true, json: async () => body });
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, body, fields: options.headers['X-Goog-FieldMask'] });
    if (url.endsWith(':searchText')) return reply({ places: [{ location: { latitude: -27.4698, longitude: 153.0251 } }] });
    if (body.includedTypes.includes('hospital')) return reply({ places: [{ displayName: { text: 'Royal Brisbane and Women\'s Hospital' }, formattedAddress: 'Butterfield St, Herston QLD 4006, Australia', location: { latitude: -27.4485, longitude: 153.0285 } }] });
    return reply({ places: [{ displayName: { text: 'City Medical Centre' }, formattedAddress: '1 Queen St, Brisbane City QLD 4000, Australia', location: { latitude: -27.4700, longitude: 153.0260 } }] });
  };
  const result = await places.nearbyCare('100 Queen St, Brisbane City QLD 4000', { fetchImpl });
  assert.equal(result.hospitals[0].name, 'Royal Brisbane and Women\'s Hospital');
  assert.equal(result.hospitals[0].address, 'Butterfield St, Herston QLD 4006');
  assert.ok(result.hospitals[0].km > 2 && result.hospitals[0].km < 3, String(result.hospitals[0].km));
  assert.equal(result.clinics[0].name, 'City Medical Centre');
  const nearby = calls.filter((call) => call.url.endsWith(':searchNearby'));
  assert.equal(nearby.length, 2);
  assert.ok(nearby.every((call) => call.body.rankPreference === 'DISTANCE'));
  // Only the fields needed are asked for, which keeps each lookup cheaper.
  assert.ok(nearby.every((call) => !/phone|rating|opening/i.test(call.fields)));
  // The same address again comes from the cache.
  await places.nearbyCare('100 Queen St, Brisbane City QLD 4000', { fetchImpl });
  assert.equal(calls.length, 3);
  delete process.env.GOOGLE_PLACES_API_KEY;
});

test('without a key, no lookup is made', async () => {
  delete process.env.GOOGLE_PLACES_API_KEY;
  const result = await places.nearbyCare('100 Queen St, Brisbane City QLD 4000', { fetchImpl: () => { throw new Error('should not call'); } });
  assert.equal(result.enabled, false);
});
