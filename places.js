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
function toSuggestion(prediction) {
  const full = prediction && prediction.text && prediction.text.text;
  if (!full) return null;
  const types = Array.isArray(prediction.types) ? prediction.types : [];
  const main = prediction.structuredFormat && prediction.structuredFormat.mainText && prediction.structuredFormat.mainText.text;
  const rest = prediction.structuredFormat && prediction.structuredFormat.secondaryText && prediction.structuredFormat.secondaryText.text;
  const business = types.length > 0 && types.some((type) => type === 'establishment' || type === 'point_of_interest') && !types.some((type) => ['street_address', 'premise', 'subpremise', 'route'].includes(type))
    || (types.length > 0 && !types.some((type) => ADDRESS_TYPES.has(type)));
  const text = String(full).replace(/,\s*Australia$/i, '');
  if (!business) return { text, state: stateFromAddress(text).state };
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

// Whether a suggestion names the suburb or town typed after the street ("parramatta").
const namesPlace = (item, words) => words.length > 0 && words.every((word) => new RegExp(`\\b${word.replace(/[^a-z0-9'-]/g, '')}\\b`, 'i').test(item.text));

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
    const rank = (item) => (typed.state && item.state !== typed.state ? 8 : 0) + (namesPlace(item, words) ? 0 : 4) + (ask && item.state !== ask ? 2 : 0) + (item.business ? 1 : 0);
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
const HOSPITAL_NAME = /\b(hospitals?|health service|health campus|multi-?purpose (?:service|centre|health)|MPS)\b/i;
const NOT_EMERGENCY = /\b(day (?:hospital|surgery|procedure)|rehab\w*|mental health|psychiatr\w*|veterinar\w*|vets?|animals?|pets?|equine|dental|dentists?|skin|hand unit|radiology|imaging|pathology|eye and ear|wellness|cancer|house|cottage|fertility|sleep|cosmetic|aesthetic\w*|hospice|palliative|aged care|nursing home|pharmacy|chemist|car ?park|parking|caf[eé]|kiosk|auxiliary|foundation|chapel|lodge|accommodation|school|clinic)\b/i;
// Google's own type must also say hospital: a clinic that calls itself a "medical hospital" is left out.
// The nearest public emergency department matters most: hospitals Google returns for an
// emergency department search come first, then other public hospitals, then private ones.
const EMERGENCY_NAME = /\bemergency (?:room|department|dept)\b/i;
const hospitalRank = (item) => (EMERGENCY_NAME.test(item.name) ? 0 : /\bprivate\b/i.test(item.name) ? 3 : item.ed ? 1 : 2);
// General practices and medical centres before other practices.
const clinicRank = (item) => (/\b(medical (?:centre|center|clinic|practice|group)|family (?:medical|practice|doctors)|general practice|GP|doctors)\b/i.test(item.name) ? 0 : 1);
// A listing named as an emergency department is kept whatever Google types it (often "service").
const isHospital = (name, type = 'hospital') => (/hospital/i.test(type) || (EMERGENCY_NAME.test(name) && HOSPITAL_NAME.test(name))) && HOSPITAL_NAME.test(name) && !NOT_EMERGENCY.test(name) && !/\b(pty|ltd|limited|medical hospital)\b/i.test(name);
// A general practice or medical centre. Specialist and cosmetic practices are left out.
const NOT_GENERAL = /\b(travel\w*|mental|youth|fit lab|skin|aesthetic\w*|cosmetic\w*|beauty|laser|skin cancer|skin clinic|dermatolog\w*|dental|dentists?|orthodont\w*|physio\w*|chiro\w*|osteo\w*|podiatr\w*|optom\w*|optical|eye|hearing|audiolog\w*|psycholog\w*|counsell\w*|fertility|IVF|vet\w*|animal|pharmacy|chemist|radiology|imaging|x-?ray|pathology|blood|massage|naturopath\w*|acupunct\w*|weight loss|sleep|plastic surg\w*|vein|hair|botox|dietitian|speech|cardiolog\w*|specialists?|surgeons?)\b/i;
// The name must read as a general practice or medical centre, not a company or one specialist.
const GENERAL_NAME = /\b(medical|clinic|doctors|GP|general practice|family practice|health)\b/i;
const isGeneralClinic = (name) => GENERAL_NAME.test(name) && !NOT_GENERAL.test(name) && !/\b(pty|ltd|limited|solutions|hospitals?)\b/i.test(name);

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
    const found = await post(SEARCH_TEXT, { textQuery: address, regionCode: 'au', languageCode: 'en-AU', pageSize: 1 }, 'places.location');
    const centre = found.places && found.places[0] && found.places[0].location;
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
    const [nearHospitals, typedHospitals, edSearch, edNearest, clinics, clinicSearch] = await Promise.all([
      safe('nearby hospitals', near(['hospital'], 20)),
      safe('typed hospitals', text('hospital', { includedType: 'hospital', strictTypeFiltering: true, rankPreference: 'DISTANCE' })),
      safe('emergency departments', text('public hospital emergency department', { pageSize: 10 })),
      safe('nearest emergency departments', text('hospital emergency department', { rankPreference: 'DISTANCE' })),
      safe('nearby clinics', near(['medical_clinic', 'medical_center', 'doctor'], 20)),
      safe('medical centres', text('medical centre general practice', { rankPreference: 'DISTANCE' })),
    ]);
    const list = (data, fallbackType = '') => (data.places || [])
      .filter((place) => place.displayName && place.displayName.text && place.location)
      .map((place) => ({ id: place.id || '', name: place.displayName.text, address: String(place.formattedAddress || '').replace(/,\s*Australia$/i, ''), km: Math.round(km(centre, place.location) * 10) / 10, type: String(place.primaryType || fallbackType), ed: fallbackType === 'ed' }));
    // Each place once: by Google's id, then by name, then (for practices) by the first two words of the name.
    // Best first (rank, then distance), then each place once: by Google's id, by name without
    // "emergency room", and by the first two words of the name, so a hospital and its emergency
    // department listing, or one practice's several listings, show once.
    const nearest = (items, keep, count, rank) => {
      const ed = new Set(items.filter((item) => item.ed).map((item) => item.id || item.name.toLowerCase()));
      const seen = new Set();
      return items
        .filter((item) => keep(item.name, item.type === 'ed' ? 'hospital' : item.type))
        .map((item) => ({ ...item, ed: ed.has(item.id || item.name.toLowerCase()) }))
        .sort((a, b) => rank(a) - rank(b) || a.km - b.km)
        .filter((item) => {
          const plain = item.name.toLowerCase().replace(EMERGENCY_NAME, ' ').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
          const keys = [item.id, plain, plain.split(' ').slice(0, 2).join(' ')].filter(Boolean);
          if (keys.some((k) => seen.has(k))) return false;
          keys.forEach((k) => seen.add(k));
          return true;
        })
        .slice(0, count)
        .map(({ type, id, ed: _ed, ...item }) => item);
    };
    const hospitalPool = [...list(nearHospitals, 'hospital'), ...list(typedHospitals, 'hospital'), ...list(edSearch, 'ed'), ...list(edNearest, 'ed')];
    const clinicPool = [...list(clinics), ...list(clinicSearch)];
    if (raw) {
      const show = (items, keep) => items.map((item) => ({ ...item, kept: keep(item.name, item.type === 'ed' ? 'hospital' : item.type) })).sort((a, b) => a.km - b.km);
      return { centre, errors, hospitals: show(hospitalPool, isHospital), clinics: show(clinicPool, isGeneralClinic) };
    }
    if (errors.length === 6) throw new Error(errors.join('; '));
    // At a remote site the next hospitals can be hundreds of kilometres away: past 150 km (or
    // twice the first one's distance) they are left out, but the first is always kept.
    const ranked = nearest(hospitalPool, isHospital, 5, hospitalRank);
    const hospitals = ranked.filter((item, index) => index === 0 || item.km <= Math.max(150, ranked[0].km * 2));
    const result = { enabled: true, hospitals, clinics: nearest(clinicPool, isGeneralClinic, 3, clinicRank) };
    if (careCache.size >= CACHE_LIMIT) careCache.delete(careCache.keys().next().value);
    careCache.set(key, { at: Date.now(), result });
    return result;
  } catch (error) {
    return { enabled: true, hospitals: [], clinics: [], error: 'Hospital suggestions are not available right now. Type the hospital.' };
  }
}

module.exports = { suggest, nearbyCare, enabled, km, isHospital, isGeneralClinic };
