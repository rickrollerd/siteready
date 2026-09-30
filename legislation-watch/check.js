// Daily check of each jurisdiction's legislation page. It reads the version
// date on the page and compares it with the date seen last time.
//
//   node legislation-watch/check.js            record changes in state.json and write report.md
//   node legislation-watch/check.js --dry-run  read every page and fail if one cannot be read
//   add --show                                 print the version wording of a page whose date was not found
//
// A change or a page that cannot be read is written to report.md. The workflow
// turns that report into a GitHub issue and an email.

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const SOURCES = path.join(DIR, 'sources.json');
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

async function fetchPage(url) {
  let lastError = '';
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'SiteReady legislation check (github.com/rickrollerd/siteready)',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-AU,en;q=0.9',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(20000),
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

module.exports = { pageText, versionDate };
