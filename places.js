// Job address suggestions from Google Places API (New) Autocomplete.
// The key stays on the server (GOOGLE_PLACES_API_KEY). Without a key, no suggestions
// are given and the address is typed in full.
const { stateFromAddress, stateFromTyped, placeWords } = require('./public/address');

const ENDPOINT = 'https://places.googleapis.com/v1/places:autocomplete';
const CACHE_LIMIT = 500;
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map();
// A daily cap on paid lookups per server process, so a fault or misuse cannot run up the bill.
const DAILY_CAP = Number(process.env.GOOGLE_PLACES_DAILY_CAP) > 0 ? Number(process.env.GOOGLE_PLACES_DAILY_CAP) : 1000;
let day = '';
let used = 0;

function underCap() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; used = 0; }
  if (used >= DAILY_CAP) return false;
  used += 1;
  return true;
}

function enabled() {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}

function cleanQuery(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function fromCache(query) {
  const hit = cache.get(query);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_MS) { cache.delete(query); return null; }
  return hit.suggestions;
}

function toCache(query, suggestions) {
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
  cache.set(query, { at: Date.now(), suggestions });
}

// A street in the address part of a suggestion: a business is offered only with one (messy-user
// testing, 13 October 2026: a business name alone printed as the workplace).
const STREET = /\b\d+[a-z]?(?:[-/]\d+[a-z]?)?\s+\w|\b(?:street|st|road|rd|avenue|ave|parade|pde|terrace|tce|drive|dr|lane|ln|highway|hwy|boulevard|blvd|place|pl|court|ct|crescent|cres|way|close|cl|circuit|cct|esplanade|esp|square|sq|grove|gr)\b/i;
const ADDRESS_TYPES = new Set(['street_address', 'premise', 'subpremise', 'route', 'street_number', 'intersection', 'locality', 'sublocality', 'postal_code', 'administrative_area_level_1', 'administrative_area_level_2', 'geocode']);
const STATE_SHORT = { act: 'ACT', nsw: 'NSW', vic: 'VIC', qld: 'QLD', sa: 'SA', wa: 'WA', tas: 'TAS', nt: 'NT' };
const STATE_NAME = { act: 'Australian Capital Territory', nsw: 'New South Wales', vic: 'Victoria', qld: 'Queensland', sa: 'South Australia', wa: 'Western Australia', tas: 'Tasmania', nt: 'Northern Territory' };

// One suggestion as { text, state }, with business set for a business or place named with its street
// address; null for a business named with no street. A business is offered only with its street
// number and street (D278): "Qld transport, St Georges Terrace" does not say where the work is.
const STREET_NUMBER = /\b\d+[a-z]?(?:[-/]\d+[a-z]?)?\s+[A-Za-z]/;
// Only a city doubled ("East Perth Perth") or a "City" suburb after another suburb ("Carina Brisbane
// City") is taken off: "North Sydney" stays as it is.
const CITY_AFTER_SUBURB = /,\s*([A-Z][A-Za-z' -]*?)\s+(Brisbane City|Sydney City|Darwin City|Brisbane|Perth|Sydney|Melbourne|Adelaide|Hobart|Darwin|Canberra)(?=,?\s*(?:QLD|NSW|VIC|SA|WA|TAS|NT|ACT)\b)/;
// Symbols the lookup sometimes puts in a suggestion ("60 \u26c9 Bridge Street", messy round 7, run 1) are
// not part of any address: only letters, numbers, spaces and the marks an address uses are kept.
const ADDRESS_MARKS = /[^\p{L}\p{N}\s,.'\u2019/&()#-]/gu;
const plainAddress = (text) => String(text || '').replace(ADDRESS_MARKS, ' ').replace(/\s+([,.])/g, '$1').replace(/\s{2,}/g, ' ').trim();
function toSuggestion(given) {
  if (!given || !given.text || !given.text.text) return null;
  const clean = (part) => (part && part.text ? { ...part, text: plainAddress(part.text) } : part);
  const format = given.structuredFormat || {};
  const prediction = { ...given, text: clean(given.text), structuredFormat: { ...format, mainText: clean(format.mainText), secondaryText: clean(format.secondaryText) } };
  const full = prediction.text.text;
  if (!full) return null;
  const types = Array.isArray(prediction.types) ? prediction.types : [];
  const main = prediction.structuredFormat && prediction.structuredFormat.mainText && prediction.structuredFormat.mainText.text;
  const rest = prediction.structuredFormat && prediction.structuredFormat.secondaryText && prediction.structuredFormat.secondaryText.text;
  const business = types.length > 0 && types.some((type) => type === 'establishment' || type === 'point_of_interest') && !types.some((type) => ['street_address', 'premise', 'subpremise', 'route'].includes(type))
    || (types.length > 0 && !types.some((type) => ADDRESS_TYPES.has(type)));
  // Google adds the city after the suburb ("Carina Brisbane City", "East Perth Perth", messy round 5,
  // runs 3 and 4): the suburb alone is kept, so the city typed does not make the wrong suburb rank first.
  const text = String(full).replace(/,\s*Australia$/i, '').replace(CITY_AFTER_SUBURB, (whole, suburb, city) => (/ City$/.test(city) || suburb.trim().toLowerCase().endsWith(` ${city.toLowerCase()}`) ? `, ${suburb.trim()}` : whole));
  // A named building or place with no street ("Gordon Stephenson House, Perth WA", messy round 4, run 4)
  // is a business name too: it is offered only with its street number and street.
  const namedPlace = Boolean(main) && !STREET_NUMBER.test(main) && !STREET.test(main) && types.some((type) => ['premise', 'establishment', 'point_of_interest'].includes(type));
  if (!business && !namedPlace) return { text, state: stateFromAddress(text).state };
  const address = String(rest || text.slice(String(main || '').length)).replace(/^[,\s]+/, '').replace(/,\s*Australia$/i, '');
  if (!STREET.test(address) || !STREET_NUMBER.test(address)) return null;
  const named = main ? `${main}, ${address}` : text;
  return { text: named, state: stateFromAddress(named).state, business: true };
}

async function lookUp(query, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY },
      body: JSON.stringify({ input: query, includedRegionCodes: ['au'], languageCode: 'en-AU' }),
      signal: controller.signal,
    });
    if (!response.ok) return { error: `Address lookup failed (${response.status}).`, suggestions: [] };
    const data = await response.json();
    return { suggestions: (data.suggestions || []).map((item) => toSuggestion(item.placePrediction)).filter(Boolean) };
  } finally {
    clearTimeout(timer);
  }
}

// Whether a suggestion names the suburb or town typed after the street ("parramatta"), allowing a slip
// typed in it (messy round 9: "parramtta", "woodvile" and "allenby gardns" matched no suggestion, so the
// lookup's own order, or a state picked before, ranked the list).
function slips(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let row = Array.from({ length: b.length + 1 }, (_x, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= b.length; j += 1) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}
const nearWord = (typed, word) => typed === word || (typed.length >= 4 && slips(typed, word) <= (typed.length >= 7 ? 2 : 1));
const namesPlace = (item, words) => {
  if (!words.length) return false;
  const said = String(item.text || '').toLowerCase().split(/[^a-z0-9'-]+/).filter(Boolean);
  return words.every((word) => { const typed = word.replace(/[^a-z0-9'-]/g, ''); return said.some((other) => nearWord(typed, other)); });
};
// Whether the suggestion's suburb is the place typed, word for word (allowing a slip), not a suburb that only has it
// after its own name: "22 hunter st newcastle" is "22 Hunter St, Newcastle NSW", not "22 Hunter St, Stockton
// Newcastle NSW" (messy round 15, A run 1, real Google list).
const suburbOf = (item) => String(String(item.text || '').split(',').slice(1).join(' ') || '').toLowerCase().replace(/\b(?:nsw|vic|qld|sa|wa|tas|nt|act|australia)\b|\b\d{4}\b/g, ' ').split(/[^a-z0-9'-]+/).filter(Boolean);
const suburbIs = (item, words) => { const suburb = suburbOf(item); return words.length > 0 && suburb.length === words.length && words.every((word, i) => nearWord(word.replace(/[^a-z0-9'-]/g, ''), suburb[i])); };
// The street's own name typed before its kind ("cheltenham" in "18 cheltenham pde woodville"), and whether a suggestion's
// street part has it; and whether the place typed is in its suburb, not only in its street's name (messy round 17, B run 5:
// "18 Woodville Street, Hurstville NSW" came first for "18 cheltenham pde woodville", before "18 Cheltenham Parade, ... SA").
const STREET_KIND = /^(?:st|street|rd|road|ave|avenue|tce|terrace|pde|parade|dr|drive|ln|lane|hwy|highway|blvd|boulevard|cres|crescent|ct|court|pl|place|cct|circuit|esp|esplanade|cl|close|way|wy|grove|gr|gve|square|sq|parkway|pkwy)$/;
function streetWords(query) {
  const words = String(query || '').toLowerCase().replace(/[,]+/g, ' ').split(/\s+/).filter(Boolean);
  const at = words.findIndex((word, i) => i > 0 && STREET_KIND.test(word));
  if (at < 1) return [];
  return words.slice(0, at).filter((word) => /[a-z]{3,}/.test(word) && !/\d/.test(word) && !/^(?:unit|shop|suite|level|lot)$/.test(word));
}
const namesStreet = (item, words) => { const street = String(item.text || '').split(',')[0].toLowerCase().split(/[^a-z0-9'-]+/).filter(Boolean); return words.every((word) => street.some((other) => nearWord(word, other))); };
const placeInSuburb = (item, words) => { const suburb = suburbOf(item); return words.every((word) => { const typed = word.replace(/[^a-z0-9'-]/g, ''); return suburb.some((other) => nearWord(typed, other)); }); };
// The street number typed ("14 macquarie st", "2/14 smith st"), and whether a suggestion has it.
const typedNumber = (query) => { const found = /(?:^|[\s,/-])(\d{1,5}[a-z]?)\s+[a-z]/i.exec(query); return found ? found[1].toLowerCase() : ''; };
const hasNumber = (item, number) => Boolean(number) && new RegExp(`(?:^|[\\s,/-])${number}(?![\\d])`, 'i').test(String(item.text || '').split(',')[0]);

// Suggestions as { text, state }, Australian addresses only, best fit first (messy round 3, 14 October
// 2026: "12 smith st darwin" offered four Queensland addresses first, because a state nobody chose
// was used to rank them and the lookup was asked again with "QLD" added).
// - The state the user typed comes first: a state or its abbreviation ("nt"), a postcode, or a capital
//   city or large town ("darwin", "perth", "hobart", "parramatta"); public/address.js stateFromTyped.
// - Then a suggestion that names the suburb or town typed after the street.
// - near is the state the user's own earlier answers point to (an address given before, the company
//   profile's address). It is used only when the typing names no state or place. No state is assumed
//   when nothing is known.
// - Where no suggestion is in the state wanted (or names the place typed), the lookup is asked once
//   more with that state added.
// - A business is offered only with its street number and street, and not when a street address is typed.
async function suggest(rawQuery, { fetchImpl = fetch, timeoutMs = 4000, near = '' } = {}) {
  const query = cleanQuery(rawQuery);
  const home = STATE_SHORT[String(near || '').toLowerCase()] ? String(near).toLowerCase() : '';
  if (!enabled()) return { enabled: false, suggestions: [] };
  if (query.length < 3) return { enabled: true, suggestions: [] };
  const typed = stateFromTyped(query);
  const words = placeWords(query);
  const want = typed.state || (words.length ? '' : home);
  const key = `${query.toLowerCase()}|${want}|${home}`;
  const cached = fromCache(key);
  if (cached) return { enabled: true, suggestions: cached };
  if (!underCap()) return { enabled: true, suggestions: [], error: 'Address suggestions are paused for today. Type the full address.' };
  try {
    const found = await lookUp(query, fetchImpl, timeoutMs);
    if (found.error) return { enabled: true, suggestions: [], error: found.error };
    let list = found.suggestions;
    // The typed place with no state named: the near state is used only where nothing fits the place.
    const ask = want || (home && words.length && !list.some((item) => namesPlace(item, words)) ? home : '');
    const fits = (item) => item.state === ask && !item.business && (!words.length || namesPlace(item, words) || typed.from === 'place');
    if (ask && !list.some(fits) && underCap()) {
      // A state typed by name or abbreviation is asked for by its full name; otherwise by its abbreviation.
      const again = await lookUp(`${query} ${typed.from === 'name' ? STATE_NAME[ask] : STATE_SHORT[ask]}`, fetchImpl, timeoutMs).catch(() => ({ suggestions: [] }));
      const seen = new Set(list.map((item) => item.text.toLowerCase()));
      list = [...list, ...(again.suggestions || []).filter((item) => !seen.has(item.text.toLowerCase()))];
    }
    // Lower is better: in another state than the one typed, not naming the place typed, not in the
    // state wanted, a business rather than an address.
    // A suggestion with the street number typed, and the suburb typed, comes first (messy round 9: "Macquarie
    // St, Sydney NSW", with no number and the wrong suburb, came before "14 Macquarie St, Parramatta NSW").
    const number = typedNumber(query);
    const street = streetWords(query);
    const rank = (item) => (typed.state && item.state !== typed.state ? 16 : 0) + (namesPlace(item, words) ? (placeInSuburb(item, words) ? 0 : 2) : 4) + (street.length && !namesStreet(item, street) ? 4 : 0) + (number && !hasNumber(item, number) ? 4 : 0) + (ask && item.state !== ask ? 2 : 0) + (item.business ? 1 : 0) + (words.length && namesPlace(item, words) && !suburbIs(item, words) ? 0.5 : 0);
    const suggestions = list.map((item, at) => ({ item, at })).sort((a, b) => rank(a.item) - rank(b.item) || a.at - b.at).map(({ item }) => item).slice(0, 6);
    toCache(key, suggestions);
    return { enabled: true, suggestions };
  } catch (error) {
    return { enabled: true, suggestions: [], error: 'Address lookup is not available right now.' };
  }
}

// The nearest hospitals and medical centres to a job address, for the Hospital box.
// Three lookups: the address's location, then hospitals and medical centres near it.
const SEARCH_TEXT = 'https://places.googleapis.com/v1/places:searchText';
const SEARCH_NEARBY = 'https://places.googleapis.com/v1/places:searchNearby';
const careCache = new Map();
const CARE_MS = 24 * 60 * 60 * 1000;

// Straight-line distance in kilometres.
function km(a, b) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

// A place that reads as a hospital that could take an injured worker. Clinics, health
// centres, day surgeries, rehabilitation, mental health, vets and the like are left out.
// Some public hospitals are named "Medical Centre" (messy round 11, run 5: Flinders Medical Centre, 2 km from Clovelly
// Park, was left out).
const HOSPITAL_NAME = /\b(hospitals?|health service|health campus|multi-?purpose (?:service|centre|health)|MPS|(?:flinders|monash) medical centre)\b/i;
const NOT_EMERGENCY = /\b(day (?:hospital|surgery|procedure)|rehab\w*|mental health|psychiatr\w*|veterinar\w*|vets?|animals?|pets?|equine|dental|dentists?|skin|hand unit|radiology|imaging|pathology|eye and ear|wellness|cancer|house|cottage|fertility|sleep|cosmetic|aesthetic\w*|hospice|palliative|aged care|nursing home|pharmacy|chemist|car ?park|parking|caf[eé]|kiosk|auxiliary|foundation|chapel|lodge|accommodation|school|clinic)\b/i;
// Google's own type must also say hospital: a clinic that calls itself a "medical hospital" is left out.
// The nearest public emergency department matters most: hospitals Google returns for an
// emergency department search come first, then other public hospitals, then private ones.
const EMERGENCY_NAME = /\bemergency (?:room|department|dept)\b/i;
// Every hospital named as an emergency department or returned by an emergency department search ranks
// first, nearest first (messy round 8, run 7: Queanbeyan at 11.5 km was listed before a hospital at 7.3 km
// because only one of the two ED searches returned the nearer one). Other public hospitals follow, then
// private ones.
// A private hospital counts only where its listing is named as an emergency department: the nearest-first
// "hospital emergency department" search returns the nearest hospitals of any kind, so a private hospital
// with no emergency department came first (messy round 9, runs 5, 7 and 8).
// Private hospitals often have no "private" in the name: the private operators' names count too (messy round 10, run 6:
// Calvary's Lenah Valley hospital, with no emergency department, came first in Hobart). Calvary's public hospitals
// (Calvary Mater, Calvary Public) are not private.
// Adelaide's private hospitals with no "private" in the name (messy round 11, run 5: four came before the public emergency
// departments).
const PRIVATE_NAME = /\b(private|st vincent'?s hospital launceston|calvary(?! (?:mater|public))|st john of god|ramsay|healthscope|epworth|hollywood|pindara|john flynn|greenslopes|cabrini|warringal|knox private|mater private|st andrew'?s(?: war memorial)?|north west private|hobart private|st helen'?s|mayo private|blackwood|ashford|burnside|wakefield|allamanda)\b/i;
const hasEmergency = (item) => EMERGENCY_NAME.test(item.name) || (Boolean(item.ed) && !PRIVATE_NAME.test(item.name));
// A public emergency department first, then a private one (a private emergency room charges, and was listed first on the
// Gold Coast: messy round 11, run 3), then other public hospitals, then private ones. A hospital in another state comes
// after those in the job's state (run 3: a New South Wales hospital offered for a Queensland site).
// A children's hospital comes after the general hospitals of its rank: the crew are adults (messy round 13, A run 1: John
// Hunter Children's Hospital was listed first in Newcastle).
// So does a hospital for women, or for women and children (messy round 15, B run 7: the Centenary Hospital for Women and
// Children was listed before Canberra Hospital's emergency department). "Royal Brisbane and Women's Hospital" is a general
// hospital.
const CHILDRENS = /\b(?:children'?s|childrens|children|kids|paediatric|pediatric|maternity|obstetric\w*)\b|\b(?:for|of) women\b|\bwomen'?s and children'?s\b/i;
const hospitalRank = (item) => (item.otherState ? 4 : 0) + (hasEmergency(item) ? (PRIVATE_NAME.test(item.name) ? 1 : 0) : PRIVATE_NAME.test(item.name) ? 3 : 2) + (CHILDRENS.test(item.name) ? 0.5 : 0);
// The words that tell one hospital from another: not "hospital", "the", "emergency" and the like.
const PLAIN_WORDS = /\b(?:the|a|an|hospitals?|public|general|emergency|room|department|dept|ed|centre|center|main|reception|entrance|campus|health|service|services|and|of|for|at|on|in|unit|wing|building|block|level|ward|wards)\b/g;
const nameWords = (name) => String(name || '').toLowerCase().replace(/['’]s\b/g, 's').replace(/[^a-z\s]/g, ' ').replace(PLAIN_WORDS, ' ').split(/\s+/).filter((word) => word.length > 1);
const plainAddress2 = (address) => String(address || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// Two listings are one hospital where the words of one name are all in the other and they stand within 300 m of each
// other, or at one street address where Google gives no place (messy round 15: "The Maitland Hospital: Emergency Room"
// and "Maitland Hospital", "Main Reception Canberra Hospital" and "Canberra Hospital", two names at one address in New
// Norfolk, Princess Alexandra twice). A suburb alone ("Adelaide SA 5000") is not one address, and a private hospital is
// never the public one beside it ("Darwin Private Hospital" on the Royal Darwin campus).
const sameHospital = (a, b) => {
  const one = nameWords(a.name);
  const two = nameWords(b.name);
  if (!one.length || !two.length || PRIVATE_NAME.test(a.name) !== PRIVATE_NAME.test(b.name)) return false;
  if (!one.every((word) => two.includes(word)) && !two.every((word) => one.includes(word))) return false;
  if (a.at && b.at) return km(a.at, b.at) <= 0.3;
  return Boolean(plainAddress2(a.address)) && plainAddress2(a.address) === plainAddress2(b.address) && /^\d/.test(plainAddress2(a.address));
};
// A regional or metropolitan health service or network is the body that runs hospitals, not a hospital (messy round 15, A
// run 4: "North Metropolitan Health Service" was listed). "Kyneton District Health Service" is a hospital, so a district
// name is not counted.
const ADMIN_BODY = /\b(?:metropolitan|metro|country|statewide|state-wide)\b[^,]*\bhealth (?:services?|networks?)\b|\blocal health (?:networks?|districts?)\b|\bprimary health networks?\b/i;
const STATE_IN = /\b(NSW|QLD|VIC|SA|WA|TAS|NT|ACT)\b(?:\s+\d{4})?(?:,\s*Australia)?\s*$/i;
const stateIn = (address) => ((STATE_IN.exec(String(address || '')) || [])[1] || '').toUpperCase();
// General practices and medical centres before other practices.
const clinicRank = (item) => (/\b(medical (?:centre|center|clinic|practice|group)|family (?:medical|practice|doctors)|general practice|GP|doctors)\b/i.test(item.name) ? 0 : 1);
// A listing named as an emergency department is kept whatever Google types it (often "service").
const isHospital = (name, type = 'hospital') => (/hospital/i.test(type) || (EMERGENCY_NAME.test(name) && HOSPITAL_NAME.test(name))) && HOSPITAL_NAME.test(name) && !NOT_EMERGENCY.test(name) && !/\b(pty|ltd|limited|medical hospital)\b/i.test(name) && !(ADMIN_BODY.test(name) && !/\b(?:hospitals?|campus|emergency)\b/i.test(name));
// A general practice or medical centre. Specialist and cosmetic practices are left out.
const NOT_GENERAL = /\b(travel\w*|mental|youth|fit lab|skin|aesthetic\w*|cosmetic\w*|beauty|laser|skin cancer|skin clinic|dermatolog\w*|dental|dentists?|orthodont\w*|physio\w*|chiro\w*|osteo\w*|podiatr\w*|optom\w*|optical|eye|hearing|audiolog\w*|psycholog\w*|counsell\w*|fertility|IVF|vet\w*|animal|pharmacy|chemist|radiology|imaging|x-?ray|pathology|blood|massage|naturopath\w*|acupunct\w*|weight loss|sleep|plastic surg\w*|vein|hair|botox|dietitian|speech|cardiolog\w*|specialists?|surgeons?)\b/i;
// The name must read as a general practice or medical centre, not a company or one specialist.
const GENERAL_NAME = /\b(medical|clinic|doctors|GP|general practice|family practice|health)\b/i;
const isGeneralClinic = (name) => GENERAL_NAME.test(name) && !NOT_GENERAL.test(name) && !/\b(pty|ltd|limited|solutions|hospitals?)\b/i.test(name);

// A place name Google holds all in lower case takes its capitals, as a name typed so does ("new norfolk public hospital"
// reads "New Norfolk Public Hospital": messy round 12, run 6). A name with any capital is left as Google gives it.
// A curly apostrophe in Google's name reads as a straight one, so "St Andrew’s Hospital" is known as private and "Women’s"
// as a women's hospital (messy round 16, B run 5: St Andrew's had no private note).
const placeName = (name) => require('./sitelink-answers').tidyName(String(name || '').replace(/[\u2018\u2019\u02bc\u0060\u00b4]/g, "'"));

async function nearbyCare(rawAddress, { fetchImpl = fetch, timeoutMs = 6000, raw = false } = {}) {
  const address = cleanQuery(rawAddress);
  if (!enabled()) return { enabled: false, hospitals: [], clinics: [] };
  if (address.length < 8) return { enabled: true, hospitals: [], clinics: [], error: 'Enter the job address first.' };
  const key = address.toLowerCase();
  const hit = careCache.get(key);
  if (!raw && hit && Date.now() - hit.at < CARE_MS) return hit.result;
  if (!underCap()) return { enabled: true, hospitals: [], clinics: [], error: 'Hospital suggestions are paused for today. Type the hospital.' };
  const post = async (url, body, fields) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY, 'X-Goog-FieldMask': fields },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`lookup failed (${response.status})`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    const found = await post(SEARCH_TEXT, { textQuery: address, regionCode: 'au', languageCode: 'en-AU', pageSize: 1 }, 'places.location,places.formattedAddress');
    const centre = found.places && found.places[0] && found.places[0].location;
    const jobState = stateIn((found.places && found.places[0] && found.places[0].formattedAddress) || '') || stateIn(address);
    if (!centre) return { enabled: true, hospitals: [], clinics: [], error: 'The job address could not be found on the map. Type the hospital.' };
    const fields = 'places.id,places.displayName,places.formattedAddress,places.location,places.primaryType';
    const near = (types, count) => post(SEARCH_NEARBY, {
      includedPrimaryTypes: types,
      maxResultCount: count,
      rankPreference: 'DISTANCE',
      languageCode: 'en-AU',
      regionCode: 'au',
      locationRestriction: { circle: { center: centre, radius: 50000 } },
    }, fields);
    // Google's hospital type also covers health centres and clinics, and in a city the 20
    // nearest "hospital" places can all be clinics. So several searches are merged: nearby by
    // type, the nearest places Google strictly types as hospitals, and one worded for emergency
    // departments. Only names that read as a hospital are kept. A search that fails is skipped.
    const errors = [];
    const safe = (label, promise) => promise.catch((error) => { errors.push(`${label}: ${error.message}`); return { places: [] }; });
    const bias = { circle: { center: centre, radius: 50000 } };
    const text = (textQuery, extra) => post(SEARCH_TEXT, { textQuery, regionCode: 'au', languageCode: 'en-AU', pageSize: 20, locationBias: bias, ...extra }, fields);
    // In a city with many private and day hospitals, the nearest public emergency department can fall outside the 20
    // nearest of every search (messy round 11, run 3: Gold Coast University Hospital was not offered), so the nearest
    // places Google types as hospitals that answer "public hospital emergency department" are searched too.
    const [nearHospitals, typedHospitals, edSearch, edNearest, clinics, clinicSearch, publicNearest] = await Promise.all([
      safe('nearby hospitals', near(['hospital'], 20)),
      safe('typed hospitals', text('hospital', { includedType: 'hospital', strictTypeFiltering: true, rankPreference: 'DISTANCE' })),
      safe('emergency departments', text('public hospital emergency department', { pageSize: 10 })),
      safe('nearest emergency departments', text('hospital emergency department', { rankPreference: 'DISTANCE' })),
      safe('nearby clinics', near(['medical_clinic', 'medical_center', 'doctor'], 20)),
      safe('medical centres', text('medical centre general practice', { rankPreference: 'DISTANCE' })),
      safe('nearest public emergency departments', text('public hospital emergency department', { includedType: 'hospital', strictTypeFiltering: true, rankPreference: 'DISTANCE' })),
    ]);
    const list = (data, fallbackType = '') => (data.places || [])
      .filter((place) => place.displayName && place.displayName.text && place.location)
      .map((place) => ({ id: place.id || '', name: placeName(place.displayName.text), address: String(place.formattedAddress || '').replace(/,\s*Australia$/i, ''), km: Math.round(km(centre, place.location) * 10) / 10, at: place.location, type: String(place.primaryType || fallbackType), ed: fallbackType === 'ed', otherState: Boolean(jobState) && Boolean(stateIn(place.formattedAddress)) && stateIn(place.formattedAddress) !== jobState }));
    // Each place once: by Google's id, then by name, then (for practices) by the first two words of the name.
    // Best first (rank, then distance), then each place once: by Google's id, by name without
    // "emergency room", and for practices by the first two words of the name, so a hospital and its emergency
    // department listing, or one practice's several listings, show once.
    // Hospitals are told apart by their whole name: two that share their first two words are two hospitals (messy round
    // 12, A runs 1 and 3: "Port Macquarie Private" and "Gold Coast Private" were dropped beside the public hospitals).
    const nearest = (items, keep, count, rank, practices = false) => {
      const ed = new Set(items.filter((item) => item.ed).map((item) => item.id || item.name.toLowerCase()));
      const seen = new Set();
      const kept = [];
      const shown = items
        .filter((item) => keep(item.name, item.type === 'ed' ? 'hospital' : item.type))
        .map((item) => ({ ...item, ed: ed.has(item.id || item.name.toLowerCase()) }));
      // A hospital with an emergency department listing of its own, or one at its place, says so on the page (Google's lists
      // cannot show a hospital has none: messy round 15, A run 4, and content8's Canberra Hospital).
      const listed = shown.filter((item) => EMERGENCY_NAME.test(item.name));
      const sorted = shown
        .map((item) => (practices ? item : { ...item, edListed: listed.some((other) => other === item || sameHospital(item, other)) }))
        .sort((a, b) => rank(a) - rank(b) || a.km - b.km);
      for (const item of sorted) {
        // A hospital's emergency listing ("... Emergency Centre", "... ED") is the hospital, and so is a second listing
        // at its place ("Main Reception ..."). Of the two, the listing named as the emergency department is shown.
        const plain = item.name.toLowerCase().replace(EMERGENCY_NAME, ' ').replace(/\b(?:emergency(?: (?:centre|center|services?|unit))?|ed)\b/g, ' ').replace(/^the\s+|\bmain reception\b|\breception\b/g, ' ').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
        const keys = [item.id, plain, practices ? plain.split(' ').slice(0, 2).join(' ') : ''].filter(Boolean);
        const twin = practices ? -1 : kept.findIndex((other) => sameHospital(item, other));
        if (twin >= 0 && EMERGENCY_NAME.test(item.name) && !EMERGENCY_NAME.test(kept[twin].name)) kept[twin] = item;
        if (twin >= 0 || keys.some((k) => seen.has(k))) { keys.forEach((k) => seen.add(k)); continue; }
        keys.forEach((k) => seen.add(k));
        kept.push(item);
      }
      return kept
        .slice(0, count)
        // A private hospital is said to be one, as its name shows (messy round 15, A runs 2 and 3: listed with no note).
        .map(({ type, id, ed: _ed, otherState: _other, at: _at, edListed, ...item }) => ({ ...item, ...(!practices && edListed ? { emergencyListed: true } : {}), ...(!practices && PRIVATE_NAME.test(item.name) ? { private: true } : {}) }));
    };
    const hospitalPool = [...list(nearHospitals, 'hospital'), ...list(typedHospitals, 'hospital'), ...list(edSearch, 'ed'), ...list(edNearest, 'ed'), ...list(publicNearest, 'ed')];
    const clinicPool = [...list(clinics), ...list(clinicSearch)];
    if (raw) {
      const show = (items, keep) => items.map((item) => ({ ...item, kept: keep(item.name, item.type === 'ed' ? 'hospital' : item.type) })).sort((a, b) => a.km - b.km);
      return { centre, errors, hospitals: show(hospitalPool, isHospital), clinics: show(clinicPool, isGeneralClinic) };
    }
    if (errors.length === 7) throw new Error(errors.join('; '));
    // At a remote site the next hospitals can be hundreds of kilometres away: past 150 km (or
    // twice the first one's distance) they are left out, but the first is always kept.
    const ranked = nearest(hospitalPool, isHospital, 5, hospitalRank);
    const hospitals = ranked.filter((item, index) => index === 0 || item.km <= Math.max(150, ranked[0].km * 2));
    const result = { enabled: true, hospitals, clinics: nearest(clinicPool, isGeneralClinic, 3, clinicRank, true) };
    if (careCache.size >= CACHE_LIMIT) careCache.delete(careCache.keys().next().value);
    careCache.set(key, { at: Date.now(), result });
    return result;
  } catch (error) {
    return { enabled: true, hospitals: [], clinics: [], error: 'Hospital suggestions are not available right now. Type the hospital.' };
  }
}

module.exports = { suggest, nearbyCare, enabled, km, isHospital, isGeneralClinic, toSuggestion, PRIVATE_NAME };
