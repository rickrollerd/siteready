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

test('every law and code SiteWrite can print is watched, and each source names what it cites', () => {
  const { coverage, printedSources, STATES } = require('../legislation-watch/coverage');
  const printed = printedSources();
  // The list comes from the code: each state prints its own regulation, its codes and the national laws.
  assert.ok(printed.vic.some((item) => item.name === 'Compliance code: Plant 2019 (Vic)'));
  assert.ok(printed.wa.some((item) => item.name === 'Construction work Code of practice 2022 (WA)'));
  assert.ok(printed.nt.some((item) => item.name === 'Electrical Safety Regulations 2024 (NT)'));
  assert.ok(printed.act.some((item) => item.name === 'Utilities Act 2000'), 'a law named in a state\'s own wording');
  for (const id of STATES) assert.ok(printed[id].some((item) => /^Ozone Protection/.test(item.name)), id);
  const { rows, gaps } = coverage(printed);
  assert.ok(rows.length >= 190, `${rows.length} laws and codes`);
  assert.deepEqual(gaps.map((row) => `${row.state}: ${row.name}`), []);
  // Each cite names a state and, on a list, the pattern its line on the list matches.
  const lists = [...require('../legislation-watch/sources.json'), ...require('../legislation-watch/codes.json')];
  for (const source of lists) {
    assert.ok(source.cites && source.cites.length, `${source.id} says what SiteWrite cites it as`);
    for (const cite of source.cites) {
      assert.ok([...STATES, 'all'].includes(cite.state) && cite.name, source.id);
      if (cite.item) assert.doesNotThrow(() => new RegExp(cite.item, 'i'), source.id);
    }
  }
  assert.equal(new Set(lists.map((source) => source.id)).size, lists.length, 'ids are unique');
});

test('each cited code is found on its regulator\'s list as read on 11 October 2026', () => {
  // The lines each list gave on the first local run (test/watch-lists.data.json).
  const read = require('./watch-lists.data.json');
  for (const source of require('../legislation-watch/codes.json')) {
    const items = read[`code:${source.id}`];
    if (!items) continue;
    for (const cite of source.cites.filter((item) => item.item)) {
      const found = items.filter((line) => new RegExp(cite.item, 'i').test(line));
      assert.ok(found.length >= 1, `${source.id}: ${cite.name}`);
    }
  }
  // Every list with cited lines was read, so none of the patterns went untested.
  for (const id of ['qld-codes', 'nsw-codes', 'vic-codes', 'wa-codes', 'sa-approved-codes', 'swa-model-codes']) assert.ok(read[`code:${id}`], id);
});

test('a code\'s own page is read for its file links and dated wording', () => {
  const { listItems, pageItems, citesFor } = require('../legislation-watch/check');
  const codes = require('../legislation-watch/codes.json');
  const tas = codes.find((item) => item.id === 'tas-code-confined');
  const html = '<p>Effective in Tasmania on and from 23 April 2025</p><a href="https://www.worksafe.tas.gov.au/__data/assets/word_doc/0007/806713/model_code_of_practice-confined_spaces-nov24.docx">Confined spaces code of practice</a><a href="/topics/laws-and-compliance">Laws</a>';
  assert.deepEqual([...listItems(html, tas), ...pageItems(html, tas)], [
    'Confined spaces code of practice | /__data/assets/word_doc/0007/806713/model_code_of_practice-confined_spaces-nov24.docx',
    'Effective in Tasmania on and from 23 April 2025 | -',
  ]);
  const wa = codes.find((item) => item.id === 'wa-code-construction');
  const waHtml = '<a href="/system/files/migrated/sites/default/files/atoms/files/221122_cp_construction.pdf">Construction work: Code of practice</a><a href="/system/files/migrated/sites/default/files/atoms/files/231293_br_swms-highrisk.pdf">SWMS brochure</a>';
  assert.deepEqual(listItems(waHtml, wa), ['Construction work: Code of practice | /system/files/migrated/sites/default/files/atoms/files/221122_cp_construction.pdf']);
  // On a list, only the codes whose line changed are mapped; a code's own page maps to its code.
  const vic = codes.find((item) => item.id === 'vic-codes');
  assert.deepEqual(citesFor(vic, ['Compliance code plant | /resources/compliance-code-plant | 2026-10-20']).map((item) => item.name), ['Compliance code: Plant 2019 (Vic)']);
  assert.deepEqual(citesFor(vic, ['Compliance code plant response public comment | /resources/compliance-code-plant-response-public-comment | 2026-10-20']), []);
  assert.deepEqual(citesFor(wa).map((item) => item.name), ['Construction work Code of practice 2022 (WA)']);
});

// A mock change run through the real watch, with its page requests answered from local copies: the
// first run records what it reads, the second finds the change and maps it to the lines citing it.
test('mock changes to a Victorian compliance code, a WA code and an NT electrical regulation map to the lines citing them', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { execFileSync } = require('child_process');
  const { linesCiting } = require('../scripts/lines-citing');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-'));
  const pick = (file, id) => require(`../legislation-watch/${file}`).find((item) => item.id === id);
  const ntReg = pick('sources.json', 'nt-es-reg');
  const vicCodes = pick('codes.json', 'vic-codes');
  const waCode = pick('codes.json', 'wa-code-construction');
  fs.writeFileSync(path.join(dir, 'sources.json'), JSON.stringify([ntReg]));
  fs.writeFileSync(path.join(dir, 'codes.json'), JSON.stringify([vicCodes, waCode]));
  fs.writeFileSync(path.join(dir, 'alerts.json'), '[]');
  fs.writeFileSync(path.join(dir, 'news.json'), '{"searches":[]}');
  fs.writeFileSync(path.join(dir, 'hand-checks.json'), '{"checks":[]}');
  const ntPage = (reprint) => `<html><body>ELECTRICAL SAFETY REGULATIONS 2024 Commencement: 28/05/2026 Reprint No: ${reprint} Remarks:</body></html>`;
  const sitemap = (plant) => `<urlset><url><loc>https://www.worksafe.vic.gov.au/resources/compliance-code-plant</loc><lastmod>${plant}T10:00:00+11:00</lastmod></url><url><loc>https://www.worksafe.vic.gov.au/resources/compliance-code-noise</loc><lastmod>2026-09-24T10:00:00+10:00</lastmod></url></urlset>`;
  const waPage = (file) => `<a href="/system/files/${file}">Construction work: Code of practice</a>`;
  const run = (pages) => {
    fs.writeFileSync(path.join(dir, 'mock.json'), JSON.stringify({ [ntReg.url]: pages.nt, [vicCodes.sitemap]: pages.vic, [waCode.url]: pages.wa }));
    execFileSync(process.execPath, ['--require', path.join(__dirname, 'watch-fetch-mock.js'), path.join(__dirname, '..', 'legislation-watch', 'check.js')], { env: { ...process.env, LEGISLATION_WATCH_DIR: dir, WATCH_MOCK: path.join(dir, 'mock.json') }, stdio: 'pipe' });
    const report = path.join(dir, 'report.md');
    return fs.existsSync(report) ? fs.readFileSync(report, 'utf8') : '';
  };
  assert.equal(run({ nt: ntPage('REPE047R1'), vic: sitemap('2026-09-24'), wa: waPage('migrated/sites/default/files/atoms/files/221122_cp_construction.pdf') }), '', 'the first run records what it reads, with no alert');
  const report = run({ nt: ntPage('REPE048'), vic: sitemap('2026-10-20'), wa: waPage('documents/2026-10/261020_cp_construction.pdf') });
  assert.match(report, /Northern Territory: Electrical Safety Regulations 2024\*\*: version changed from REPE047R1 to REPE048/);
  assert.match(report, /New or changed: Compliance code plant \| \/resources\/compliance-code-plant \| 2026-10-20/);
  assert.match(report, /New or changed: Construction work: Code of practice \| \/system\/files\/documents\/2026-10\/261020_cp_construction\.pdf/);
  // Each change names the law or code as SiteWrite prints it, the lines citing it in that state, and the command.
  for (const [state, name, place] of [['nt', 'Electrical Safety Regulations 2024 (NT)', 'the Northern Territory'], ['vic', 'Compliance code: Plant 2019 (Vic)', 'Victoria'], ['wa', 'Construction work Code of practice 2022 (WA)', 'Western Australia']]) {
    const count = linesCiting(state, name, 'all').length;
    assert.ok(count >= 5, `${name}: ${count} lines`);
    const command = `node scripts/lines-citing.js ${state} "${name}" all`;
    assert.ok(report.includes(`SiteWrite cites "${name}" in ${place}. ${count} control lines cite it. List them: \`${command}\``), `${name}\n${report}`);
    // Step 2: the command lists those lines as that state's SWMS print them.
    const out = execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'lines-citing.js'), state, name, 'all']).toString();
    assert.ok(out.includes(`${state.toUpperCase()}: ${count} control lines citing ${name} (any section)`), out.slice(0, 300));
    assert.ok(out.split('\n').filter((line) => /^\d+\. /.test(line)).every((line) => line.includes(name)), `${name}: every line listed cites it`);
  }
  // Only the code whose line changed is mapped: Victoria's noise code did not change.
  assert.doesNotMatch(report, /Compliance code: Noise/);
});
