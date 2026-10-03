// Job address suggestions from Google Places API (New) Autocomplete.
// The key stays on the server (GOOGLE_PLACES_API_KEY). Without a key, no suggestions
// are given and the address is typed in full.
const { stateFromAddress } = require('./public/address');

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

// Suggestions as { text, state }, Australian addresses only.
async function suggest(rawQuery, { fetchImpl = fetch, timeoutMs = 4000 } = {}) {
  const query = cleanQuery(rawQuery);
  if (!enabled()) return { enabled: false, suggestions: [] };
  if (query.length < 3) return { enabled: true, suggestions: [] };
  const key = query.toLowerCase();
  const cached = fromCache(key);
  if (cached) return { enabled: true, suggestions: cached };
  if (!underCap()) return { enabled: true, suggestions: [], error: 'Address suggestions are paused for today. Type the full address.' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY },
      body: JSON.stringify({ input: query, includedRegionCodes: ['au'], languageCode: 'en-AU' }),
      signal: controller.signal,
    });
    if (!response.ok) return { enabled: true, suggestions: [], error: `Address lookup failed (${response.status}).` };
    const data = await response.json();
    const suggestions = (data.suggestions || [])
      .map((item) => item.placePrediction && item.placePrediction.text && item.placePrediction.text.text)
      .filter(Boolean)
      .map((text) => text.replace(/,\s*Australia$/i, ''))
      .map((text) => ({ text, state: stateFromAddress(text).state }))
      .slice(0, 6);
    toCache(key, suggestions);
    return { enabled: true, suggestions };
  } catch (error) {
    return { enabled: true, suggestions: [], error: 'Address lookup is not available right now.' };
  } finally {
    clearTimeout(timer);
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
const NOT_EMERGENCY = /\b(day (?:hospital|surgery|procedure)|rehab\w*|mental health|psychiatr\w*|veterinar\w*|vets?|animals?|pets?|equine|dental|dentists?|skin|hand unit|eye and ear|wellness|cancer|house|cottage|fertility|sleep|cosmetic|aesthetic\w*|hospice|palliative|aged care|nursing home|pharmacy|chemist|car ?park|parking|caf[eé]|kiosk|auxiliary|foundation|chapel|lodge|accommodation|school|clinic)\b/i;
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
    const hospitals = nearest(hospitalPool, isHospital, 5, hospitalRank);
    const result = { enabled: true, hospitals, clinics: nearest(clinicPool, isGeneralClinic, 3, clinicRank) };
    if (careCache.size >= CACHE_LIMIT) careCache.delete(careCache.keys().next().value);
    careCache.set(key, { at: Date.now(), result });
    return result;
  } catch (error) {
    return { enabled: true, hospitals: [], clinics: [], error: 'Hospital suggestions are not available right now. Type the hospital.' };
  }
}

module.exports = { suggest, nearbyCare, enabled, km, isHospital, isGeneralClinic };
