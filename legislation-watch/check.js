// Daily check of each jurisdiction's legislation page, each regulator's list of codes of
// practice, and news searches about changes. For legislation it reads the version
// date on the page and compares it with the date seen last time.
//
// Each page is read one of these ways (set in sources.json, codes.json and alerts.json):
//   the page itself, as a plain request (the default);
//   "feed": the legislation site's feed of new and changed laws, for a site whose pages refuse
//     automated requests (NSW): any entry naming the law is reported;
//   "read": "browser": a real browser, for a site behind a bot check that a plain request fails;
//   "read": "sitemap": the site's sitemap, for a site that builds its list in the browser (Vic);
//   "handCheck": a person checks the page monthly and records it in hand-checks.json.
// A page that is not read today, or is marked for a hand check, is listed under "Hand checks due"
// once a month until a hand check is recorded, so nothing reads as watched when it is not.
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
const ALERTS = path.join(DIR, 'alerts.json');
const STATE = path.join(DIR, 'state.json');
const REPORT = path.join(DIR, 'report.md');
const HAND_CHECKS = path.join(DIR, 'hand-checks.json');
// A hand check is due once a month.
const HAND_CHECK_DAYS = 31;
// A list read in a browser counts as watched while it was read in the last week.
const BROWSER_GRACE_DAYS = 7;

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

// Alert links on a regulator's list page, as { title, link }: links matching the source's
// pattern with a real title, made absolute, each once.
function alertLinks(html, source) {
  const pattern = new RegExp(source.linkPattern, 'i');
  const out = [];
  for (const match of String(html || '').matchAll(/<a\b[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1];
    const title = pageText(match[2]).replace(/\s+/g, ' ').trim();
    if (!pattern.test(href) || title.length < 12 || href.replace(/\/$/, '') === new URL(source.url).pathname.replace(/\/$/, '')) continue;
    const link = new URL(href, source.url).toString();
    if (link.replace(/\/$/, '') === source.url.replace(/\/$/, '') || out.some((item) => item.link === link)) continue;
    out.push({ title, link });
  }
  return out;
}

// A regulator's list read with the source's own pattern: links whose address matches
// linkPattern, or whose words match textPattern (a list of notices with no address of their own),
// as "title | address" lines.
function listItems(html, source) {
  const byAddress = source.linkPattern ? new RegExp(source.linkPattern, 'i') : null;
  const byWords = source.textPattern ? new RegExp(source.textPattern, 'i') : null;
  const self = new URL(source.url).pathname.replace(/\/$/, '');
  const items = new Map();
  for (const match of String(html || '').matchAll(/<a\b[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1].replace(/&amp;/g, '&').replace(/[?#].*$/, '').replace(/^https?:\/\/[^/]+/i, '');
    const text = pageText(match[2]);
    if (!text || text.length > 200) continue;
    if (byAddress && (!byAddress.test(href) || href.replace(/\/$/, '') === self)) continue;
    if (byWords && !byWords.test(text)) continue;
    const key = byWords ? text : href;
    if (!items.has(key)) items.set(key, `${text} | ${href || '-'}`);
  }
  return [...items.values()].sort();
}

// The pages in a sitemap (or a sitemap index's sitemaps) as { link, lastmod }.
function sitemapEntries(xml) {
  const out = [];
  for (const match of String(xml || '').matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
    const loc = (match[1].match(/<loc>\s*([^<]+?)\s*<\/loc>/i) || [])[1];
    const lastmod = (match[1].match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/i) || [])[1] || '';
    if (loc) out.push({ link: loc.replace(/&amp;/g, '&'), lastmod: lastmod.slice(0, 10) });
  }
  return out;
}

const sitemapIndex = (xml) => [...String(xml || '').matchAll(/<sitemap>[\s\S]*?<loc>\s*([^<]+?)\s*<\/loc>[\s\S]*?<\/sitemap>/gi)].map((match) => match[1].replace(/&amp;/g, '&'));

// A page's title from its address: "compliance-code-excavation" reads "Compliance code excavation".
function titleFromLink(link) {
  const slug = decodeURIComponent(new URL(link).pathname.replace(/\/$/, '').split('/').pop() || '');
  const words = slug.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Entries of the NSW legislation site's Atom feeds as { id, title, link, updated }.
function feedEntries(xml) {
  const out = [];
  for (const match of String(xml || '').matchAll(/<entry>([\s\S]*?)<\/entry>/gi)) {
    const field = (pattern) => ((match[1].match(pattern) || [])[1] || '').trim();
    const title = field(/<title[^>]*>([\s\S]*?)<\/title>/i).replace(/&amp;/g, '&');
    const link = field(/<link\b[^>]*href="([^"]+)"/i).replace(/^http:\/\/([^/:]+)(?::80)?\//i, 'https://$1/');
    if (title) out.push({ id: field(/<id>([\s\S]*?)<\/id>/i), title, link, updated: field(/<updated>([\s\S]*?)<\/updated>/i).slice(0, 10) });
  }
  return out;
}

// The feed entries that name a law: its own id (a new version in force) or an amending law
// whose title matches.
function feedMatches(entries, feed) {
  const titles = feed.titlePattern ? new RegExp(feed.titlePattern, 'i') : null;
  return entries.filter((entry) => (feed.ids || []).includes(entry.id) || (titles && titles.test(entry.title)));
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

// Playwright, from the project or installed globally. Without it, pages marked to be read in a
// browser are reported as not read.
function playwright() {
  try { return require('playwright'); } catch (error) { /* not in the project */ }
  try {
    const root = require('child_process').execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return require(path.join(root, 'playwright'));
  } catch (error) {
    return null;
  }
}

const BOT_CHECK = /just a moment|verif(?:y|ication)|attention required|access denied/i;

// Reads pages in a real browser, one at a time, waiting out a bot check page. Each page gets
// three tries; the bot check lets a browser through some of the time.
async function browserPages(urls) {
  const lib = urls.length ? playwright() : null;
  if (!lib) return urls.map(() => ({ ok: false, error: 'no browser is installed here' }));
  // Behind a proxy (a test machine), the browser goes through it too.
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await lib.chromium.launch(proxy ? { proxy: { server: proxy } } : {});
  const out = [];
  try {
    for (const url of urls) {
      let result = { ok: false, error: 'the site\'s bot check did not let the browser through' };
      for (let attempt = 1; attempt <= 3 && !result.ok; attempt += 1) {
        const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' });
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
          // The bot check page reloads itself into the real page, so the title is read again until it changes.
          const title = () => page.title().catch(() => 'Just a moment');
          for (let i = 0; i < 10 && BOT_CHECK.test(await title()); i += 1) await page.waitForTimeout(3000);
          await page.waitForLoadState('domcontentloaded').catch(() => {});
          await page.waitForTimeout(2000);
          if (!BOT_CHECK.test(await title())) result = { ok: true, html: await page.content() };
        } catch (error) {
          result = { ok: false, error: error.message.split('\n')[0] };
        }
        await page.close().catch(() => {});
      }
      out.push(result);
    }
  } finally {
    await browser.close();
  }
  return out;
}

// A sitemap, or every sitemap in a sitemap index.
async function readSitemap(url) {
  const first = await fetchPage(url, { browser: true, timeout: 45000 });
  if (!first.ok) return first;
  const children = sitemapIndex(first.html);
  if (!children.length) return { ok: true, entries: sitemapEntries(first.html) };
  const pages = await Promise.all(children.map((child) => fetchPage(child, { browser: true, timeout: 45000 })));
  const failed = pages.find((page) => !page.ok);
  if (failed) return failed;
  return { ok: true, entries: pages.flatMap((page) => sitemapEntries(page.html)) };
}

// Reads every page in a list, each the way its source says.
async function readAll(sources, options, sitemap = (source) => readSitemap(source.sitemap)) {
  const browserIndexes = sources.map((source, index) => (source.read === 'browser' ? index : -1)).filter((index) => index >= 0);
  const [plain, viaBrowser] = await Promise.all([
    Promise.all(sources.map((source) => {
      if (source.read === 'browser') return null;
      if (source.read === 'sitemap') return sitemap(source);
      return fetchPage(source.url, options);
    })),
    browserPages(browserIndexes.map((index) => sources[index].url)).catch((error) => browserIndexes.map(() => ({ ok: false, error: error.message.split('\n')[0] }))),
  ]);
  browserIndexes.forEach((index, n) => { plain[index] = viaBrowser[n]; });
  return plain;
}

// The latest hand check recorded for each page, from hand-checks.json.
function lastHandChecks(file = HAND_CHECKS) {
  const out = {};
  for (const item of (readJson(file, { checks: [] }).checks || [])) {
    if (item && item.key && /^\d{4}-\d{2}-\d{2}$/.test(item.date || '') && (!out[item.key] || out[item.key].date < item.date)) out[item.key] = item;
  }
  return out;
}

// A hand check is due when the page was not read today, or is marked for hand checks, and no
// hand check has been recorded in the last month.
function handCheckDue(last, today) {
  if (!last) return true;
  return (new Date(today) - new Date(last.date)) / 86400000 > HAND_CHECK_DAYS;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

// Feeds are shared by the laws on one site, so each is read once.
const feedPages = new Map();
const readFeed = (url) => {
  if (!feedPages.has(url)) feedPages.set(url, fetchPage(url));
  return feedPages.get(url);
};

// A law watched through its site's feed of new and changed laws (NSW): every entry this week that
// names it. The feed covers a week, so a daily check misses nothing unless it stops for a week.
async function checkFeed(source) {
  const pages = await Promise.all(source.feed.urls.map(readFeed));
  const failed = pages.find((page) => !page.ok);
  if (failed) return { status: 'unreadable', detail: `The legislation site's feed could not be read (${failed.error}).` };
  if (pages.some((page) => !/<feed\b/i.test(page.html))) return { status: 'unreadable', detail: 'The legislation site did not answer with its feed. The address may have changed.' };
  const entries = new Map();
  for (const entry of feedMatches(pages.flatMap((page) => feedEntries(page.html)), source.feed)) entries.set(`${entry.id} ${entry.updated}`, entry);
  return { status: 'ok', via: 'feed', entries: [...entries.values()] };
}

async function check(source) {
  if (source.feed) return checkFeed(source);
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

// The codes or alerts on a page read from a sitemap: the sitemap's pages under the source's pattern.
function sitemapItems(entries, source) {
  const pattern = new RegExp(source.linkPattern, 'i');
  return entries.filter((entry) => pattern.test(new URL(entry.link).pathname));
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const sources = readJson(SOURCES, []);
  const state = readJson(STATE, {});
  const today = new Date().toISOString().slice(0, 10);
  const changes = [];
  const problems = [];
  const recorded = [];
  // Pages a person must check: not read today, or marked for a monthly hand check.
  const handPages = [];
  let failures = 0;
  // A page that stops being read keeps the date it stopped, so state.json changes only then.
  const unreadable = (before) => ({ ...before, status: 'unreadable', since: before.status === 'unreadable' && before.since ? before.since : today });
  // Pages read in a browser or by hand are known to be hard to read: they never fail the push check.
  const knownHard = (source) => Boolean(source.knownBlocked || source.read === 'browser' || source.handCheck);

  // Every page is read at once so one slow site does not hold up the rest.
  const results = await Promise.all(sources.map(check));
  sources.forEach((source, index) => {
    const result = results[index];
    const before = state[source.id] || {};
    const label = `${source.jurisdiction}: ${source.title}`;
    const shown = result.via === 'feed' ? `watched through the legislation site's feed, ${result.entries.length} ${result.entries.length === 1 ? 'entry' : 'entries'} naming it this week` : result.version || result.detail;
    console.log(`${result.status === 'ok' ? 'OK  ' : 'FAIL'} ${label} | ${shown} | ${source.url}`);
    if (source.handCheck) handPages.push({ key: source.id, label, url: source.url, why: source.handCheck });

    if (result.status !== 'ok') {
      // A site known to refuse automated requests does not fail the push check,
      // but it is still reported once so it is checked by hand.
      if (source.knownBlocked) result.detail = source.knownBlocked;
      if (!knownHard(source)) failures += 1;
      // Report a problem once, when it starts, so a site that is down does not email every day.
      if (before.status !== 'unreadable') problems.push(`- **${label}**: ${result.detail}\n  ${source.url}`);
      state[source.id] = unreadable(before);
      if (!source.handCheck) handPages.push({ key: source.id, label, url: source.url, why: result.detail });
      return;
    }
    if (result.via === 'feed') {
      // Each entry naming the law is reported once. The first time, this week's are recorded.
      const key = (entry) => `${entry.id} ${entry.updated}`;
      const seen = new Set(before.seen || []);
      if (before.via !== 'feed') {
        recorded.push(`- ${label}: now watched through the legislation site's feed (${result.entries.length} ${result.entries.length === 1 ? 'entry' : 'entries'} naming it this week).`);
      } else {
        for (const entry of result.entries.filter((item) => !seen.has(key(item)))) {
          changes.push(`- **${label}**: the NSW legislation site lists "${entry.title}" (${entry.updated}). Check whether it changes this law, and its version date.\n  ${entry.link}`);
        }
        if (before.status === 'unreadable') recorded.push(`- ${label}: the feed can be read again.`);
      }
      state[source.id] = { via: 'feed', seen: [...new Set([...seen, ...result.entries.map(key)])].slice(-100), status: 'ok' };
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
  const sitemaps = new Map();
  const viaSitemap = (source) => {
    if (!sitemaps.has(source.sitemap)) sitemaps.set(source.sitemap, readSitemap(source.sitemap));
    return sitemaps.get(source.sitemap);
  };
  const codePages = await readAll(codes, { browser: true, timeout: 45000 }, viaSitemap);
  codes.forEach((source, index) => {
    const page = codePages[index];
    const key = `code:${source.id}`;
    const before = state[key] || {};
    const label = `${source.jurisdiction}: ${source.title}`;
    let items = [];
    if (page.ok && source.read === 'sitemap') items = sitemapItems(page.entries, source).map((entry) => `${titleFromLink(entry.link)} | ${new URL(entry.link).pathname} | ${entry.lastmod}`).sort();
    else if (page.ok) items = source.linkPattern || source.textPattern ? listItems(page.html, source) : codeLinks(page.html);
    if (source.handCheck) handPages.push({ key, label, url: source.url, why: source.handCheck });
    if (!page.ok && source.read === 'browser') {
      // The bot check lets a browser through some days and not others, so a miss is not reported.
      // The list counts as watched while it was read in the last week; after that a hand check is due.
      const stale = !before.readOn || (new Date(today) - new Date(before.readOn)) / 86400000 > BROWSER_GRACE_DAYS;
      console.log(`MISS ${label} | ${page.error}; last read ${before.readOn || 'never'} | ${source.url}`);
      if (stale) handPages.push({ key, label, url: source.url, why: `${source.knownBlocked} Last read automatically: ${before.readOn || 'never'}.` });
      return;
    }
    if (!page.ok || !items.length) {
      const detail = page.ok ? 'The page was read but no codes were found on it. The page layout may have changed.' : `The page could not be read (${page.error}).`;
      console.log(`FAIL ${label} | ${detail} | ${source.url}`);
      if (page.ok && page.html && process.argv.includes('--show')) {
        const anchors = [...page.html.matchAll(/<a\b[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => `${pageText(m[2]).slice(0, 80)} | ${m[1]}`);
        console.log(`    ${page.html.length} characters, ${anchors.length} links: ${anchors.slice(0, 60).join(' || ')}`);
      }
      if (!knownHard(source)) failures += 1;
      // Reported once, when it starts, like the legislation pages.
      if (before.status !== 'unreadable') problems.push(`- **${label}**: ${source.knownBlocked || detail}\n  ${source.url}`);
      state[key] = unreadable(before);
      if (!source.handCheck) handPages.push({ key, label, url: source.url, why: source.knownBlocked || detail });
      return;
    }
    console.log(`OK   ${label} | ${items.length} codes${source.read ? ` (read ${source.read === 'browser' ? 'in a browser' : 'from the sitemap'})` : ''} | ${source.url}`);
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
    state[key] = { items, status: 'ok', ...(source.read === 'browser' ? { readOn: today } : {}) };
  });

  // Safety alerts and incident releases: each new one is read by a person and, where it names a
  // control SiteReady lacks, turned into a library line cited to the alert (task #107).
  const alerts = readJson(ALERTS, []);
  const alertLines = [];
  const alertPages = await readAll(alerts, { browser: true, timeout: 45000 }, viaSitemap);
  alerts.forEach((source, index) => {
    const page = alertPages[index];
    const key = `alerts:${source.id}`;
    const before = state[key] || {};
    const label = `${source.jurisdiction}: ${source.title}`;
    let items = [];
    if (page.ok && source.read === 'sitemap') items = sitemapItems(page.entries, source).map((entry) => ({ title: titleFromLink(entry.link), link: entry.link }));
    else if (page.ok) items = alertLinks(page.html, source);
    if (!page.ok || !items.length) {
      const detail = page.ok ? 'The page was read but no alerts were found on it. The page layout may have changed.' : `The page could not be read (${page.error}).`;
      console.log(`FAIL ${label} | ${detail} | ${source.url}`);
      if (page.ok && page.html && process.argv.includes('--show')) {
        const anchors = [...page.html.matchAll(/<a\b[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => `${pageText(m[2]).slice(0, 80)} | ${m[1]}`);
        console.log(`    ${page.html.length} characters, ${anchors.length} links: ${anchors.slice(0, 80).join(' || ')}`);
      }
      if (before.status !== 'unreadable') problems.push(`- **${label}**: ${source.knownBlocked || detail}\n  ${source.url}`);
      state[key] = unreadable(before);
      handPages.push({ key, label, url: source.url, why: source.knownBlocked || detail });
      return;
    }
    console.log(`OK   ${label} | ${items.length} alerts${source.read === 'sitemap' ? ' (read from the sitemap)' : ''} | ${source.url}`);
    if (process.argv.includes('--show')) for (const item of items.slice(0, 15)) console.log(`    ${item.title} | ${item.link}`);
    if (before.seen) {
      const seenLinks = new Set(before.seen);
      const added = items.filter((item) => !seenLinks.has(item.link));
      if (added.length) alertLines.push(`- **${label}** (${source.licence})\n${added.slice(0, 15).map((item) => `  - ${item.title}\n    ${item.link}`).join('\n')}`);
    } else {
      recorded.push(`- ${label}: ${items.length} alerts recorded as already seen.`);
    }
    // Only the most recent links are kept so the file stays small.
    state[key] = { seen: [...new Set([...(before.seen || []), ...items.map((item) => item.link)])].slice(-400), status: 'ok' };
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

  // Hand checks: every page not read today, or marked for a monthly hand check, with the date it
  // was last checked by hand. One that is due is reported once a month until a check is recorded.
  const handChecks = lastHandChecks();
  const month = today.slice(0, 7);
  const handLines = [];
  for (const item of handPages) {
    const last = handChecks[item.key];
    const lastText = last ? `last checked by hand ${last.date}${last.by ? ` by ${last.by}` : ''}` : 'never checked by hand';
    console.log(`HAND ${item.label} | ${lastText}${handCheckDue(last, today) ? ', due now' : ''} | ${item.url}`);
    if (!handCheckDue(last, today) || state[`hand:${item.key}`] === month) continue;
    state[`hand:${item.key}`] = month;
    handLines.push(`- **${item.label}**: ${item.why} Hand check: ${lastText}.\n  ${item.url}`);
  }

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
    sections.push(`## Legislation changed\n\nThe app may be out of date. Follow handover/CHANGE-PROCESS.md: triage within 2 working days, list the affected lines with \`node scripts/lines-citing.js\`, update \`legislation.js\` and \`draft.js\`, and have the update signed off before it goes live.\n\n${changes.join('\n')}`);
  }
  if (codeChanges.length) {
    sections.push(`## Codes of practice changed\n\nA code was added, re-issued or removed. Check whether SiteReady cites it (\`register.js\`, \`activities.js\`, \`scenarios/qld-codes.json\`; \`node scripts/lines-citing.js\` lists the lines citing a code), update the titles, years and section numbers, and have the update signed off before it goes live.\n\n${codeChanges.join('\n')}`);
  }
  if (alertLines.length) {
    sections.push(`## Safety alerts to review\n\nNew safety alerts and incident releases. For each one: does SiteReady's step for that work already have the control the alert calls for? If not, add it to \`scenarios/code-controls.json\` or \`activities.js\`, cited to the alert, following the licence noted, and have it signed off before it goes live.\n\n${alertLines.join('\n')}`);
  }
  if (newsLines.length) {
    sections.push(`## News to read\n\nArticles about possible changes. These are not confirmed changes: check the official source before changing anything.\n\n${newsLines.join('\n')}`);
  }
  if (problems.length) {
    sections.push(`## Pages that could not be checked\n\nThese were not checked today, so a change could be missed. Check them by hand, or fix the address in \`legislation-watch/sources.json\`.\n\n${problems.join('\n')}`);
  }
  if (handLines.length) {
    sections.push(`## Hand checks due\n\nThese pages are not read automatically, or were not read today, and have not been checked by hand in the last month. Open each one, compare it with what SiteReady uses, and add the check to \`legislation-watch/hand-checks.json\` (page, date, who, what was found).\n\n${handLines.join('\n')}`);
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

module.exports = { pageText, versionDate, codeLinks, newsItems, alertLinks, listItems, browserPages, readSitemap, sitemapEntries, sitemapIndex, titleFromLink, feedEntries, feedMatches, lastHandChecks, handCheckDue, HAND_CHECK_DAYS };
