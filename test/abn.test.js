const test = require('node:test');
const assert = require('node:assert/strict');
const abn = require('../abn');

const reply = (body) => async (url) => ({ ok: true, url, text: async () => `callback(${JSON.stringify(body)})` });

test('an ABN fills in the business name, status, state and postcode', async () => {
  process.env.ABR_GUID = 'test-guid';
  let asked = '';
  const fetchImpl = async (url) => { asked = url; return reply({ Abn: '53004085616', AbnStatus: 'Active', AddressState: 'QLD', AddressPostcode: '4350', EntityName: 'EXAMPLE BUILDERS PTY LTD', BusinessName: ['Example Building', 'Example Building'], Gst: '2000-07-01', Message: '' })(url); };
  const result = await abn.lookupAbn('53 004 085 616', { fetchImpl });
  assert.equal(result.found, true);
  assert.equal(result.active, true);
  assert.equal(result.entityName, 'EXAMPLE BUILDERS PTY LTD');
  assert.deepEqual(result.businessNames, ['Example Building']);
  assert.equal(result.state, 'QLD');
  assert.equal(result.postcode, '4350');
  assert.match(asked, /abn=53004085616&callback=callback&guid=test-guid/);
  delete process.env.ABR_GUID;
});

test('a sole trader reads as a person, and a cancelled ABN says so', async () => {
  process.env.ABR_GUID = 'test-guid';
  const result = await abn.lookupAbn('83914571673', { fetchImpl: reply({ Abn: '83914571673', AbnStatus: 'Cancelled', EntityName: "O'BRIEN, MARY-JANE", BusinessName: [], Message: '' }) });
  assert.equal(result.entityName, "Mary-Jane O'Brien");
  assert.equal(result.active, false);
  assert.equal(result.status, 'Cancelled');
  delete process.env.ABR_GUID;
});

test('not found, invalid, unreachable and switched off', async () => {
  process.env.ABR_GUID = 'test-guid';
  assert.equal((await abn.lookupAbn('51824753556', { fetchImpl: reply({ Abn: '', Message: 'Search text is not a valid ABN or ACN' }) })).found, false);
  assert.equal((await abn.lookupAbn('12345678901', { fetchImpl: () => { throw new Error('should not call'); } })).error, 'That is not a valid ABN.');
  const down = await abn.lookupAbn('33051775556', { fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(down.found, false);
  assert.match(down.error, /not available/);
  delete process.env.ABR_GUID;
  assert.equal((await abn.lookupAbn('53004085616', { fetchImpl: () => { throw new Error('should not call'); } })).enabled, false);
});
