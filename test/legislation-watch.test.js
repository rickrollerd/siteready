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

test('safety alert links: only links matching the source pattern with a real title, made absolute, each once', () => {
  const { alertLinks } = require('../legislation-watch/check');
  const source = { url: 'https://www.safework.nsw.gov.au/compliance-and-prosecutions/incident-information-releases/industries/construction', linkPattern: '/compliance-and-prosecutions/incident-information-releases/[^"#?]+/[^"#?]+' };
  const html = [
    '<a href="/compliance-and-prosecutions/incident-information-releases/2026/worker-falls-through-skylight">Worker falls through skylight at Penrith</a>',
    '<a href="/compliance-and-prosecutions/incident-information-releases/2026/worker-falls-through-skylight">Worker falls through skylight at Penrith</a>',
    '<a href="/compliance-and-prosecutions/incident-information-releases/industries/construction">Construction</a>',
    '<a href="/about-us/who-we-are">About SafeWork NSW and its people</a>',
  ].join('');
  assert.deepEqual(alertLinks(html, source), [{ title: 'Worker falls through skylight at Penrith', link: 'https://www.safework.nsw.gov.au/compliance-and-prosecutions/incident-information-releases/2026/worker-falls-through-skylight' }]);
  // Every alert source names its licence, so the reviewer knows how the wording may be used.
  for (const item of require('../legislation-watch/alerts.json')) assert.ok(item.licence && item.linkPattern && item.url, item.id);
});

test('NSW law is watched through the legislation site feed: its own id or an amending law by title', () => {
  const { feedEntries, feedMatches } = require('../legislation-watch/check');
  const entry = (id, title) => `<entry><title type="html">${title}</title><link rel="alternate" type="text/html" hreflang="en" href="http://legislation.nsw.gov.au:80/view/pdf/asmade/${id}" /><id>${id}</id><updated>2026-10-09T00:00:00+10:00</updated><content type="html">Published: 9 October 2026</content></entry>`;
  const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">${[
    entry('sl-2026-559', 'Water Legislation Amendment (Miscellaneous) Regulation 2026'),
    entry('sl-2026-601', 'Work Health and Safety Amendment (Falls) Regulation 2026'),
    entry('act-2026-040', 'Work Health and Safety Amendment (Industrial Manslaughter) Act 2026'),
    entry('sl-2025-0440', 'Work Health and Safety Regulation 2025'),
  ].join('')}</feed>`;
  const entries = feedEntries(xml);
  assert.equal(entries.length, 4);
  assert.deepEqual(entries[1], { id: 'sl-2026-601', title: 'Work Health and Safety Amendment (Falls) Regulation 2026', link: 'https://legislation.nsw.gov.au/view/pdf/asmade/sl-2026-601', updated: '2026-10-09' });
  const sources = require('../legislation-watch/sources.json');
  const reg = sources.find((item) => item.id === 'nsw-whs-reg');
  const act = sources.find((item) => item.id === 'nsw-whs-act');
  assert.deepEqual(feedMatches(entries, reg.feed).map((item) => item.id), ['sl-2026-601', 'sl-2025-0440']);
  assert.deepEqual(feedMatches(entries, act.feed).map((item) => item.id), ['act-2026-040']);
  // The version date itself is still read by hand monthly, and said so.
  for (const source of [reg, act]) assert.match(source.handCheck, /by hand/);
});

test('code lists read with a pattern, from a sitemap, and pages named from their address', () => {
  const { listItems, sitemapEntries, sitemapIndex, titleFromLink } = require('../legislation-watch/check');
  const nt = { url: 'https://worksafe.nt.gov.au/forms-and-resources/codes-of-practice', linkPattern: '/forms-and-resources/codes-of-practice/[^/]+$' };
  const html = '<a href="https://worksafe.nt.gov.au/forms-and-resources/codes-of-practice">Codes of Practice</a>'
    + '<a href="/forms-and-resources/codes-of-practice/confined-spaces"></a>'
    + '<a href="/forms-and-resources/codes-of-practice/confined-spaces">Confined spaces</a>'
    + '<a href="/forms-and-resources/codes-of-practice/construction-work?x=1">Construction work</a>';
  assert.deepEqual(listItems(html, nt), ['Confined spaces | /forms-and-resources/codes-of-practice/confined-spaces', 'Construction work | /forms-and-resources/codes-of-practice/construction-work']);
  // A list of notices with no address of their own is read by its words.
  const act = { url: 'https://www.act.gov.au/open/work-safety-group-public-notices', textPattern: '^Notice issued \\d' };
  assert.deepEqual(listItems('<a href="#">Notice issued 24/04/2025: tower crane code of practice approval</a><a href="#">Contact us</a>', act), ['Notice issued 24/04/2025: tower crane code of practice approval | -']);
  const index = '<sitemapindex><sitemap><loc>https://www.worksafe.vic.gov.au/sitemap.xml?page=1</loc></sitemap></sitemapindex>';
  assert.deepEqual(sitemapIndex(index), ['https://www.worksafe.vic.gov.au/sitemap.xml?page=1']);
  const map = '<urlset><url><loc>https://www.worksafe.vic.gov.au/resources/compliance-code-excavation</loc><lastmod>2026-02-09T11:22:05+11:00</lastmod></url></urlset>';
  assert.deepEqual(sitemapEntries(map), [{ link: 'https://www.worksafe.vic.gov.au/resources/compliance-code-excavation', lastmod: '2026-02-09' }]);
  assert.equal(titleFromLink('https://www.worksafe.vic.gov.au/resources/compliance-code-excavation'), 'Compliance code excavation');
  const vic = require('../legislation-watch/codes.json').find((item) => item.id === 'vic-codes');
  assert.match('/resources/compliance-code-excavation', new RegExp(vic.linkPattern));
  assert.doesNotMatch('/safety-alerts/mobile-plant-overturns', new RegExp(vic.linkPattern));
});

test('every page is read automatically, or says how it is checked instead', () => {
  const lists = [...require('../legislation-watch/sources.json'), ...require('../legislation-watch/codes.json'), ...require('../legislation-watch/alerts.json')];
  for (const source of lists) {
    if (source.read === 'browser' || source.read === 'sitemap' || source.feed) assert.ok(source.knownBlocked, `${source.id} says what happens when it cannot be read`);
    if (source.read === 'sitemap') assert.ok(source.sitemap && source.linkPattern, source.id);
  }
  // Nothing is left as "check by hand" without the hand check being recorded and reported.
  assert.ok(Array.isArray(require('../legislation-watch/hand-checks.json').checks));
});

test('a hand check is due monthly, from the last one recorded', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { lastHandChecks, handCheckDue } = require('../legislation-watch/check');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hand-')), 'hand-checks.json');
  fs.writeFileSync(file, JSON.stringify({ checks: [
    { key: 'code:tas-codes', date: '2026-08-01', by: 'Clive' },
    { key: 'code:tas-codes', date: '2026-09-20', by: 'Clive', result: 'No change' },
    { key: 'code:act-codes', date: 'last week' },
  ] }));
  const last = lastHandChecks(file);
  assert.equal(last['code:tas-codes'].date, '2026-09-20');
  assert.equal(last['code:act-codes'], undefined, 'a check without a real date does not count');
  assert.equal(handCheckDue(last['code:tas-codes'], '2026-10-09'), false);
  assert.equal(handCheckDue(last['code:tas-codes'], '2026-10-25'), true);
  assert.equal(handCheckDue(undefined, '2026-10-09'), true);
});
