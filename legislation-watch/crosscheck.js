// Compares the legislation loaded in the app with AustLII's copy, a second,
// independent source for the official text.
//
//   node legislation-watch/crosscheck.js
//
// For each loaded state it finds the regulation on AustLII, reads the high risk
// construction work and SWMS provisions, and checks the section numbers and
// every category label against them. It prints the provisions so they can be
// read in full.

const { STATES, highRiskList } = require('../legislation');

const AUSTLII = 'https://classic.austlii.edu.au/au/legis';

// Where each state's regulation is listed on AustLII.
// AustLII refuses requests from GitHub (HTTP 403), so these are only used when the
// check is run from somewhere AustLII answers.
const SOURCES = {
  nsw: { toc: `${AUSTLII}/nsw/consol_reg/toc-W.html`, title: 'Work Health and Safety Regulation 2025' },
  vic: { toc: `${AUSTLII}/vic/consol_reg/toc-O.html`, title: 'Occupational Health and Safety Regulations 2017' },
  sa: { toc: `${AUSTLII}/sa/consol_reg/toc-W.html`, title: 'Work Health and Safety Regulations 2012' },
};

// How each state was checked by hand when no source here can be read automatically.
const CHECKED_BY_HAND = {
  nsw: 'Official PDF (3 July 2026) and the model WHS Regulations (5 December 2025).',
  vic: 'Authorised PDF (version 017) and WorkSafe Victoria\'s Safe Work Method Statements (SWMS) page (retrieved 1 October 2026).',
  sa: 'Authorised PDF (1 July 2026) and the model WHS Regulations (5 December 2025).',
  wa: 'Official current version (01-c0-00, 1 July 2026) read through GitHub, the 2022 PDF (00-a0-00) for regulations 166A and 306B to 306I, and the model WHS Regulations for 291 and 299.',
};

// The provision that defines high risk construction work in each state.
const HRCW_SECTION = { qld: '291', nsw: '291', vic: '322', sa: '291' };

async function get(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'SiteReady legislation cross-check (github.com/rickrollerd/siteready)' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

function text(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8212;|&mdash;/g, '—')
    .replace(/&#822[01];|&[lr]dquo;/g, '"')
    .replace(/·/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(value) {
  return String(value)
    .toLowerCase()
    .replace(/(\d)\s*m\b/g, '$1 metres')
    .replace(/metre\b/g, 'metres')
    .split(/[^a-z0-9.]+/)
    .map((word) => word.replace(/^\.+|\.+$/g, ''))
    .filter((word) => word.length > 2 || /\d/.test(word));
}

async function regulationBase(source) {
  const toc = await get(source.toc);
  const escaped = source.title.replace(/[()]/g, '\\$&');
  const match = toc.match(new RegExp(`<a[^>]+href="([^"]+)"[^>]*>\\s*(?:<[^>]+>\\s*)*${escaped}`, 'i'));
  if (!match) throw new Error(`"${source.title}" was not found in ${source.toc}`);
  return new URL(match[1], source.toc).href.replace(/[^/]*$/, '');
}

async function provision(base, number) {
  for (const prefix of ['s', 'r']) {
    try {
      return { url: `${base}${prefix}${number}.html`, body: text(await get(`${base}${prefix}${number}.html`)) };
    } catch (error) {
      // Try the other prefix.
    }
  }
  throw new Error(`Provision ${number} was not found under ${base}`);
}

// Queensland's official site answers GitHub, so its whole-regulation page is read
// and each provision is cut out of it.
const OFFICIAL = {
  qld: 'https://www.legislation.qld.gov.au/view/whole/html/inforce/current/sl-2011-0240',
};

function cutProvision(body, number) {
  const start = body.search(new RegExp(`\\b${number} (?:Meaning of|Safe work method statement required)`));
  if (start < 0) throw new Error(`Provision ${number} was not found in the official text`);
  const next = body.slice(start + 10).search(new RegExp(`\\b${Number(number) + 1} [A-Z]`));
  return body.slice(start, next < 0 ? start + 5000 : start + 10 + next);
}

async function checkState(state) {
  const source = SOURCES[state.id];
  if (!source && !OFFICIAL[state.id]) return { lines: [`No source is listed for ${state.name}.`], differences: 1 };
  const lines = [];
  let differences = 0;
  let hrcw;
  let swms;
  if (OFFICIAL[state.id]) {
    const body = text(await get(OFFICIAL[state.id]));
    lines.push(`Official text: ${OFFICIAL[state.id]}`);
    hrcw = { url: OFFICIAL[state.id], body: cutProvision(body, HRCW_SECTION[state.id]) };
    swms = { url: OFFICIAL[state.id], body: cutProvision(body, state.section) };
  } else {
    const base = await regulationBase(source);
    lines.push(`AustLII: ${base}`);
    hrcw = await provision(base, HRCW_SECTION[state.id]);
    swms = await provision(base, state.section);
  }
  const hrcwWords = new Set(words(hrcw.body));

  const heading = (body) => body.slice(0, 160);
  lines.push(`High risk construction work: ${hrcw.url}`);
  lines.push(`  ${heading(hrcw.body)}`);
  if (!/high risk construction work/i.test(heading(hrcw.body))) {
    differences += 1;
    lines.push('  DIFFERENT: this provision does not define high risk construction work.');
  }
  lines.push(`SWMS: ${swms.url}`);
  lines.push(`  ${heading(swms.body)}`);
  if (!/safe work method statement/i.test(heading(swms.body))) {
    differences += 1;
    lines.push(`  DIFFERENT: ${state.sectionRef} is not the SWMS provision.`);
  }

  const items = (hrcw.body.match(/\([a-z]\)/g) || []).length;
  const list = highRiskList(state);
  lines.push(`Categories: the app has ${list.length}; the source lists ${items} lettered items.`);
  if (items && items < list.length) {
    differences += 1;
    lines.push('  DIFFERENT: the source lists fewer items than the app.');
  }
  for (const item of list) {
    const missing = words(item.label).filter((word) => !hrcwWords.has(word));
    if (missing.length) {
      differences += 1;
      lines.push(`  DIFFERENT: "${item.label}" (not in the source: ${missing.join(', ')})`);
    } else {
      lines.push(`  Same: "${item.label}"`);
    }
  }
  lines.push('', `Full text of ${HRCW_SECTION[state.id]}:`, hrcw.body.slice(0, 4000), '', `Full text of ${state.section}:`, swms.body.slice(0, 3000));
  return { lines, differences };
}

async function main() {
  let total = 0;
  for (const state of STATES.filter((item) => item.loaded)) {
    console.log(`\n===== ${state.name}: ${state.instrument} =====`);
    try {
      const result = await checkState(state);
      total += result.differences;
      console.log(result.lines.join('\n'));
      console.log(`Differences: ${result.differences}`);
    } catch (error) {
      if (CHECKED_BY_HAND[state.id]) {
        console.log(`Not readable from here (${error.message}). Checked by hand: ${CHECKED_BY_HAND[state.id]}`);
      } else {
        total += 1;
        console.log(`Could not check: ${error.message}`);
      }
    }
  }
  console.log(`\nTotal differences: ${total}`);
}

if (require.main === module) main();
