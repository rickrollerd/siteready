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

module.exports = { suggest, enabled };
