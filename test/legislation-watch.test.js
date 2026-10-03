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

test('code list pages give one line per code, without menus or query strings', () => {
  const { codeLinks } = require('../legislation-watch/check');
  const html = '<a href="/codes-of-practice">Codes of practice</a>'
    + '<a href="/files/confined.pdf?v=3">Confined spaces Code of Practice 2021 (PDF, 1.2 MB)</a>'
    + '<a href="https://www.example.gov.au/cop-folder/construction-work">Construction work</a>'
    + '<a href="/about">About us</a>';
  assert.deepEqual(codeLinks(html), [
    'Confined spaces Code of Practice 2021 | /files/confined.pdf',
    'Construction work | /cop-folder/construction-work',
  ]);
});

test('news feed items are read with their title, link and date', () => {
  const { newsItems } = require('../legislation-watch/check');
  const xml = '<rss><channel><item><title><![CDATA[New silica code of practice - Safety News &amp; Co]]></title><link>https://example.com/1</link><pubDate>Fri, 02 Oct 2026 01:00:00 GMT</pubDate></item><item><title>No link</title></item></channel></rss>';
  assert.deepEqual(newsItems(xml), [{ title: 'New silica code of practice - Safety News & Co', link: 'https://example.com/1', date: 'Fri, 02 Oct 2026 01:00:00 GMT' }]);
});
