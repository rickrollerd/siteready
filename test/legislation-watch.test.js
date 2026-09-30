const test = require('node:test');
const assert = require('node:assert/strict');
const { pageText, versionDate } = require('../legislation-watch/check');

test('version dates are read in the forms the legislation sites use', () => {
  assert.equal(versionDate('Current as at 29 March 2026'), '29 March 2026');
  assert.equal(versionDate('Current version for 3 October 2025 to date'), '3 October 2025');
  assert.equal(versionDate('As at 01 Jul 2026 Official Version'), '01 Jul 2026');
  assert.equal(versionDate('Republication No 30 effective 26 November 2025'), '26 November 2025');
  assert.equal(versionDate('Version: 1.7.2026'), '1.7.2026');
  assert.equal(versionDate('No date on this page'), '');
});

test('page text drops scripts and tags', () => {
  assert.equal(pageText('<p>Current as at <b>1 May 2026</b></p><script>x = "3 June 2020"</script>'), 'Current as at 1 May 2026');
});
