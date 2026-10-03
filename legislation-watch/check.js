// Daily check of each jurisdiction's legislation page, each regulator's list of codes of
// practice, and news searches about changes. For legislation it reads the version
// date on the page and compares it with the date seen last time.
//
//   node legislation-watch/check.js            record changes in state.json and write report.md
//   node legislation-watch/check.js --dry-run  read every page and fail if one cannot be read
//   add --show                                 print the version wording of a page whose date was not found
//
// A change or a page that cannot be read is written to report.md. The workflow
// turns that report into a GitHub issue and an email.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const SOURCES = path.join(DIR, 'sources.json');
const CODES = path.join(DIR, 'codes.json');
const NEWS = path.join(DIR, 'news.json');
const STATE = path.join(DIR, 'state.json');
const REPORT = path.join(DIR, 'report.md');

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec';
const DATE = `(\\d{1,2}\\s+(?:${MONTHS})\\s+\\d{4}|\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{4}|\\d{4}-\\d{2}-\\d{2})`;

// Wording the Australian legislation sites use for the version in force.
const VERSION_PATTERNS = [
  `current as at\\s*:?\\s*${DATE}`,
  `in force (?:from|at|as at)\\s*:?\\s*${DATE}`,
  `version (?:in force|effective|date)?\\s*(?:from|:)?\\s*${DATE}`,
  `(?:effective|commencement) date\\s*:?\\s*${DATE}`,
  `authorised version[^.]{0,80}?${DATE}`,
  `(?:reprint|republication|compilation)[^.]{0,60}?${DATE}`,
  `current version for\\s*${DATE}`,
  `\\bas at\\s*:?\\s*${DATE}`,
  `\\beffective\\s*:?\\s*${DATE}`,
  `version\\s*:?\\s*${DATE}`,
].map((pattern) => new RegExp(pattern, 'i'));

function pageText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function versionDate(text, pattern) {
  const patterns = pattern ? [new RegExp(pattern, 'i')] : VERSION_PATTERNS;
  for (const regex of patterns) {
    const match = text.match(regex);
    if (match) return match[1].replace(/\s+/g, ' ').trim();
  }
  return '';
}

// The codes on a regulator's list page, as "title | address" lines. A new, renamed,
// removed or re-issued code (a new file address) shows as a changed line.
function codeLinks(html) {
  const items = new Set();
  const byHref = new Map();
  for (const match of String(html || '').matchAll(/<a\b[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1].replace(/&amp;/g, '&').replace(/[?].*$/, '').replace(/^https?:\/\/[^/]+/i, '');
    let text = pageText(match[2]).replace(/\s*\((?:PDF|DOCX?|Word|external site)[^)]*\)/gi, '').trim();
    // A bare "Download" link is named by its file.
    if (/^(?:download|view|open|pdf|docx?)$/i.test(text)) text = decodeURIComponent(href.split('/').pop() || '');
    if (!text || text.length > 200) continue;
    if (/^(?:mailto|tel|javascript):/i.test(match[1])) continue;
    if (!/\bcodes? of practice\b|\bcompliance code\b|\bcode\b.*\b(?:19|20)\d{2}\b|\bcop\b|\/cop-|code-practice|codes-practice|compliance-code|code-of-practice/i.test(`${text} ${href}`)) continue;
    // Menus and headings that point back to the list itself are not codes.
    if (/^(?:codes? of practice|compliance codes|model codes of practice|back|more|read more|view all)$/i.test(text)) continue;
    // The same file linked twice (its name, then "Download") is one code, named by its title.
    const named = !/\.(?:pdf|docx?)$/i.test(text);
    if (!byHref.has(href) || (named && !byHref.get(href).named)) byHref.set(href, { text, named });
  }
  for (const [href, { text }] of byHref) items.add(`${text} | ${href}`);
  return [...items].sort();
}

// Google News items as { title, link, date }.
function newsItems(xml) {
  const out = [];
  for (const match of String(xml || '').matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const field = (name) => {
      const found = match[1].match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, 'i'));
      return found ? found[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim() : '';
    };
    const title = field('title');
    const link = field('link');
    if (title && link) out.push({ title, link, date: field('pubDate') });
  }
  return out;
}

// Pages that refuse plain requests or build their list with JavaScript are read
// with a headless browser (Playwright, installed by the workflow).
let browserPromise = null;
async function renderPage(url) {
  try {
    if (!browserPromise) browserPromise = require('playwright').chromium.launch();
    const browser = await browserPromise;
    const page = await browser.newPage();
    try {
      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
      if (response && response.status() >= 400) return { ok: false, error: `HTTP ${response.status()}` };
      return { ok: true, html: await page.content() };
    } finally {
      await page.close();
    }
  } catch (error) {
    return { ok: false, error: error.message.split('\n')[0] };
  }
}

async function fetchPage(url, { browser = false, timeout = 20000 } = {}) {
  let lastError = '';
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          // Some regulators' sites refuse anything but a browser, so the code pages are asked for as one.
          'User-Agent': browser ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' : 'SiteReady legislation check (github.com/rickrollerd/siteready)',
          Accept: 'text/html,application/xhtml+xml,application/rss+xml,application/xml',
          'Accept-Language': 'en-AU,en;q=0.9',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeout),
      });
      if (response.ok) return { ok: true, html: await response.text() };
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.name === 'TimeoutError' ? 'timed out' : error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 5000));
  }
  return { ok: false, error: lastError };
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

async function check(source) {
  const page = await fetchPage(source.url);
  if (!page.ok) return { status: 'unreadable', detail: `The page could not be read (${page.error}).` };
  const text = pageText(page.html);
  // Some sites only give the version date in a link, not in the page text.
  const inHtml = source.htmlPattern ? page.html.match(new RegExp(source.htmlPattern)) : null;
  const found = source.htmlPattern ? (inHtml ? inHtml[1] : '') : versionDate(text, source.versionPattern);
  if (!found && process.argv.includes('--show')) {
    console.log(`--- ${source.id} (${text.length} characters): ${text.slice(0, 300)}`);
    const words = /.{0,80}(current as at|as at|reprint|in force|version|republication|compilation|currency).{0,80}/gi;
    for (const line of (text.match(words) || []).slice(0, 10)) console.log(`    ${line}`);
    const raw = page.html.slice(0, 60000).replace(/\s+/g, ' ');
    for (const line of (raw.match(/.{0,100}\d{4}-\d{2}-\d{2}.{0,60}/g) || []).slice(0, 8)) console.log(`    html: ${line}`);
  }
  const version = found;
  if (!version) return { status: 'unreadable', detail: 'The page was read but no version date was found. The page layout may have changed.' };
  return { status: 'ok', version };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const sources = readJson(SOURCES, []);
  const state = readJson(STATE, {});
  const today = new Date().toISOString().slice(0, 10);
  const changes = [];
  const problems = [];
  const recorded = [];
  let failures = 0;

  // Every page is read at once so one slow site does not hold up the rest.
  const results = await Promise.all(sources.map(check));
  sources.forEach((source, index) => {
    const result = results[index];
    const before = state[source.id] || {};
    const label = `${source.jurisdiction}: ${source.title}`;
    console.log(`${result.status === 'ok' ? 'OK  ' : 'FAIL'} ${label} | ${result.version || result.detail} | ${source.url}`);

    if (result.status !== 'ok') {
      // A site known to refuse automated requests does not fail the push check,
      // but it is still reported once so it is checked by hand.
      if (source.knownBlocked) result.detail = source.knownBlocked;
      else failures += 1;
      // Report a problem once, when it starts, so a site that is down does not email every day.
      if (before.status !== 'unreadable') problems.push(`- **${label}**: ${result.detail}\n  ${source.url}`);
      state[source.id] = { ...before, status: 'unreadable' };
      return;
    }
    if (before.version && before.version !== result.version) {
      changes.push(`- **${label}**: version changed from ${before.version} to ${result.version}.\n  ${source.url}`);
    } else if (!before.version) {
      recorded.push(`- ${label}: ${result.version}`);
    }
    if (before.status === 'unreadable' && before.version === result.version) {
      recorded.push(`- ${label}: can be read again (${result.version}).`);
    }
    // No check date here, so state.json only changes when something changed.
    state[source.id] = { version: result.version, status: 'ok' };
  });

  // Codes of practice: each regulator's list of codes.
  const codes = readJson(CODES, []);
  const codeChanges = [];
  const codePages = [];
  for (const source of codes) codePages.push(source.render ? await renderPage(source.url) : await fetchPage(source.url, { browser: true, timeout: 45000 }));
  if (browserPromise) await (await browserPromise).close().catch(() => {});
  codes.forEach((source, index) => {
    const page = codePages[index];
    const key = `code:${source.id}`;
    const before = state[key] || {};
    const label = `${source.jurisdiction}: ${source.title}`;
    const items = page.ok ? codeLinks(page.html) : [];
    if (!page.ok || !items.length) {
      const detail = page.ok ? 'The page was read but no codes were found on it. The page layout may have changed.' : `The page could not be read (${page.error}).`;
      console.log(`FAIL ${label} | ${detail} | ${source.url}`);
      if (page.ok && process.argv.includes('--show')) {
        const anchors = [...page.html.matchAll(/<a\b[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => `${pageText(m[2]).slice(0, 80)} | ${m[1]}`);
        console.log(`    ${page.html.length} characters, ${anchors.length} links: ${anchors.slice(0, 60).join(' || ')}`);
      }
      if (!source.knownBlocked) failures += 1;
      // Reported once, when it starts, like the legislation pages.
      if (before.status !== 'unreadable') problems.push(`- **${label}**: ${source.knownBlocked || detail}\n  ${source.url}`);
      state[key] = { ...before, status: 'unreadable' };
      return;
    }
    console.log(`OK   ${label} | ${items.length} codes | ${source.url}`);
    if (process.argv.includes('--show')) for (const item of items) console.log(`    ${item}`);
    if (before.items) {
      const was = new Set(before.items);
      const now = new Set(items);
      const added = items.filter((item) => !was.has(item));
      const removed = before.items.filter((item) => !now.has(item));
      if (added.length || removed.length) {
        codeChanges.push(`- **${label}** (${source.url})\n${added.map((item) => `  - New or changed: ${item}`).join('\n')}${added.length && removed.length ? '\n' : ''}${removed.map((item) => `  - Gone or replaced: ${item}`).join('\n')}`);
      }
    } else {
      recorded.push(`- ${label}: ${items.length} codes recorded.`);
    }
    state[key] = { items, status: 'ok' };
  });

  // News: articles about changes, from Google News. Reported once each, for reading.
  const news = readJson(NEWS, { searches: [] });
  const keep = new RegExp(news.keep || '.', 'i');
  const seen = new Set((state['news:seen'] || []));
  const firstNewsRun = !state['news:seen'];
  const fresh = [];
  const feeds = await Promise.all(news.searches.map((query) => fetchPage(`https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:7d`)}&hl=en-AU&gl=AU&ceid=AU:en`)));
  feeds.forEach((feed, index) => {
    if (!feed.ok) { console.log(`FAIL news search "${news.searches[index]}" | ${feed.error}`); return; }
    const items = newsItems(feed.html);
    console.log(`OK   news search "${news.searches[index]}" | ${items.length} articles`);
    for (const item of items) {
      // A short fingerprint of the headline, without the publisher, keeps the file small.
      const id = crypto.createHash('sha1').update(item.title.toLowerCase().replace(/\s+-\s+[^-]+$/, '').replace(/[^a-z0-9]+/g, ' ').trim()).digest('hex').slice(0, 10);
      if (seen.has(id)) continue;
      seen.add(id);
      if (keep.test(item.title) && !fresh.some((other) => other.title === item.title)) fresh.push(item);
    }
  });
  if (process.argv.includes('--show')) for (const item of fresh) console.log(`    news: ${item.title}`);
  // Only the most recent titles are kept so the file stays small.
  if (feeds.some((feed) => feed.ok)) state['news:seen'] = [...seen].slice(-4000);
  const newsLines = firstNewsRun ? [] : fresh.slice(0, 25).map((item) => `- ${item.title}${item.date ? ` (${item.date.replace(/ \d\d:\d\d:\d\d .*$/, '')})` : ''}\n  ${item.link}`);
  if (firstNewsRun) recorded.push(`- News: ${seen.size} articles recorded as already seen.`);

  if (dryRun) {
    if (failures) {
      console.error(`${failures} page(s) could not be read or had no version date.`);
      process.exit(1);
    }
    return;
  }

  fs.writeFileSync(STATE, `${JSON.stringify(state, null, 2)}\n`);
  const sections = [];
  if (changes.length) {
    sections.push(`## Legislation changed\n\nThe app may be out of date. Check the change, update \`legislation.js\` and \`draft.js\`, and have the update signed off before it goes live.\n\n${changes.join('\n')}`);
  }
  if (codeChanges.length) {
    sections.push(`## Codes of practice changed\n\nA code was added, re-issued or removed. Check whether SiteReady cites it (\`register.js\`, \`activities.js\`, \`scenarios/qld-codes.json\`), update the titles, years and section numbers, and have the update signed off before it goes live.\n\n${codeChanges.join('\n')}`);
  }
  if (newsLines.length) {
    sections.push(`## News to read\n\nArticles about possible changes. These are not confirmed changes: check the official source before changing anything.\n\n${newsLines.join('\n')}`);
  }
  if (problems.length) {
    sections.push(`## Pages that could not be checked\n\nThese were not checked today, so a change could be missed. Check them by hand, or fix the address in \`legislation-watch/sources.json\`.\n\n${problems.join('\n')}`);
  }
  if (sections.length) {
    fs.writeFileSync(REPORT, `${sections.join('\n\n')}\n\nChecked ${today}.\n`);
  } else if (fs.existsSync(REPORT)) {
    fs.unlinkSync(REPORT);
  }
  if (recorded.length) console.log(`Recorded without an alert:\n${recorded.join('\n')}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { pageText, versionDate, codeLinks, newsItems };
