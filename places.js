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

async function nearbyCare(rawAddress, { fetchImpl = fetch, timeoutMs = 6000 } = {}) {
  const address = cleanQuery(rawAddress);
  if (!enabled()) return { enabled: false, hospitals: [], clinics: [] };
  if (address.length < 8) return { enabled: true, hospitals: [], clinics: [], error: 'Enter the job address first.' };
  const key = address.toLowerCase();
  const hit = careCache.get(key);
  if (hit && Date.now() - hit.at < CARE_MS) return hit.result;
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
    const near = (types, count, radius) => post(SEARCH_NEARBY, {
      includedTypes: types,
      maxResultCount: count,
      rankPreference: 'DISTANCE',
      languageCode: 'en-AU',
      regionCode: 'au',
      locationRestriction: { circle: { center: centre, radius } },
    }, 'places.displayName,places.formattedAddress,places.location');
    const [hospitals, clinics] = await Promise.all([near(['hospital'], 5, 50000), near(['medical_clinic', 'medical_center', 'doctor'], 3, 20000)]);
    const list = (data) => (data.places || [])
      .filter((place) => place.displayName && place.displayName.text && place.location)
      .map((place) => ({ name: place.displayName.text, address: String(place.formattedAddress || '').replace(/,\s*Australia$/i, ''), km: Math.round(km(centre, place.location) * 10) / 10 }));
    const result = { enabled: true, hospitals: list(hospitals), clinics: list(clinics) };
    if (careCache.size >= CACHE_LIMIT) careCache.delete(careCache.keys().next().value);
    careCache.set(key, { at: Date.now(), result });
    return result;
  } catch (error) {
    return { enabled: true, hospitals: [], clinics: [], error: 'Hospital suggestions are not available right now. Type the hospital.' };
  }
}

module.exports = { suggest, nearbyCare, enabled, km };
