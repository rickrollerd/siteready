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
    if (url.endsWith(':searchText') && body.pageSize === 1) return reply({ places: [{ location: { latitude: -27.4698, longitude: 153.0251 } }] });
    if (url.endsWith(':searchText')) return reply({ places: [] });
    if (body.includedPrimaryTypes.includes('hospital')) return reply({ places: [{ displayName: { text: 'Royal Brisbane and Women\'s Hospital' }, formattedAddress: 'Butterfield St, Herston QLD 4006, Australia', location: { latitude: -27.4485, longitude: 153.0285 } }] });
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
  assert.equal(calls.length, 4);
  delete process.env.GOOGLE_PLACES_API_KEY;
});

test('without a key, no lookup is made', async () => {
  delete process.env.GOOGLE_PLACES_API_KEY;
  const result = await places.nearbyCare('100 Queen St, Brisbane City QLD 4000', { fetchImpl: () => { throw new Error('should not call'); } });
  assert.equal(result.enabled, false);
});

// Reported: 22 Tamarind Ave, Bogangar NSW. Google's hospital type returned five clinics and
// health centres nearer than the Tweed Valley Hospital, and the hospital never showed.
test('clinics and health centres do not crowd out the hospital (Bogangar)', async () => {
  process.env.GOOGLE_PLACES_API_KEY = 'test-key';
  const at = (latitude, longitude) => ({ latitude, longitude });
  const place = (text, address, location) => ({ displayName: { text }, formattedAddress: `${address}, Australia`, location });
  const reply = (body) => ({ ok: true, json: async () => body });
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    if (url.endsWith(':searchText') && body.pageSize === 1) return reply({ places: [{ location: at(-28.3305, 153.5632) }] });
    if (url.endsWith(':searchText')) return reply({ places: [place('Tweed Valley Hospital', '771 Cudgen Rd, Cudgen NSW 2487', at(-28.2654, 153.5640)), place('Gold Coast University Hospital', '1 Hospital Blvd, Southport QLD 4215', at(-27.9617, 153.3818))] });
    if (body.includedPrimaryTypes.includes('hospital')) {
      return reply({ places: [
        place('Cabarita Beach Health Centre', '2/5/33 Tweed Coast Rd, Cabarita Beach NSW 2488', at(-28.3320, 153.5660)),
        place('Casuarina Health & Medical Centre', '482 Casuarina Way, Casuarina NSW 2487', at(-28.3010, 153.5700)),
        place('Pottsville Medical Centre', '5 Coronation Ave, Pottsville NSW 2489', at(-28.3900, 153.5610)),
        place('SunDoctors Skin Cancer Clinics Pottsville', '15 Coronation Ave, Pottsville NSW 2489', at(-28.3902, 153.5612)),
        place('Total Health Pottsville', '10A Elizabeth St, Pottsville NSW 2489', at(-28.3930, 153.5600)),
        place('Tweed Valley Hospital', '771 Cudgen Rd, Cudgen NSW 2487', at(-28.2654, 153.5640)),
      ] });
    }
    return reply({ places: [
      place('The Health Cove', '2/29 Tweed Coast Rd, Bogangar NSW 2488', at(-28.3310, 153.5640)),
      place("Angela's Aesthetic Club", '27 Tweed Coast Rd, Bogangar NSW 2488', at(-28.3311, 153.5641)),
      place('Cabarita Beach Medical', '22 Tweed Coast Rd, Cabarita Beach NSW 2488', at(-28.3312, 153.5642)),
    ] });
  };
  const result = await places.nearbyCare('22 Tamarind Ave, Bogangar NSW 2488', { fetchImpl });
  assert.deepEqual(result.hospitals.map((item) => item.name), ['Tweed Valley Hospital', 'Gold Coast University Hospital']);
  assert.deepEqual(result.clinics.map((item) => item.name), ['The Health Cove', 'Cabarita Beach Medical']);
  delete process.env.GOOGLE_PLACES_API_KEY;
});

test('hospital and clinic names are sorted from the rest', () => {
  for (const name of ['Tweed Valley Hospital', 'Royal Brisbane and Women\'s Hospital', 'Bourke Multipurpose Service', 'Fiona Stanley Hospital', 'Mareeba Hospital', 'John Flynn Private Hospital']) assert.ok(places.isHospital(name), name);
  for (const name of ['Cabarita Beach Health Centre', 'Pottsville Medical Centre', 'Sydney Day Hospital', 'Brisbane Rehabilitation Hospital', 'Gold Coast Veterinary Hospital', 'Hospital Pharmacy', 'Mater Mental Health Hospital', 'Tweed Hospital Car Park']) assert.ok(!places.isHospital(name), name);
  for (const name of ['SunDoctors Skin Cancer Clinics Pottsville', "Angela's Aesthetic Club", 'Coast Dental', 'Pottsville Physiotherapy', 'QScan Radiology']) assert.ok(!places.isGeneralClinic(name), name);
  for (const name of ['Pottsville Medical Centre', 'The Health Cove', 'Cabarita Beach Medical']) assert.ok(places.isGeneralClinic(name), name);
});
