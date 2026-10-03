// ABN lookup from the Australian Business Register's ABN Lookup web service, so a business
// only types its ABN. ABR_GUID is the free GUID the ABR issues on registration. The register
// gives the legal name, trading names, status, state and postcode, not the street address.

const URL = 'https://abr.business.gov.au/json/AbnDetails.aspx';
const cache = new Map();
const CACHE_MS = 24 * 60 * 60 * 1000;

const enabled = () => Boolean(process.env.ABR_GUID);

// The register answers as JSONP: callback({...}).
function parse(text) {
  const match = /^[^(]*\(([\s\S]*)\)\s*;?\s*$/.exec(String(text || '').trim());
  return JSON.parse(match ? match[1] : text);
}

// "SMITH, JOHN" (how the register lists a sole trader) reads as "John Smith".
function readableName(name) {
  const value = String(name || '').trim();
  const person = /^([A-Z'’-]+), ([A-Z'’ -]+)$/.exec(value);
  if (!person) return value;
  const title = (word) => word.toLowerCase().replace(/(^|[\s'’-])([a-z])/g, (_m, lead, letter) => lead + letter.toUpperCase());
  return `${title(person[2])} ${title(person[1])}`;
}

async function lookupAbn(raw, { fetchImpl = fetch, timeoutMs = 6000 } = {}) {
  const abn = String(raw || '').replace(/\D/g, '');
  if (!enabled()) return { enabled: false };
  if (!require('./accounts').validAbn(abn)) return { enabled: true, found: false, error: 'That is not a valid ABN.' };
  const hit = cache.get(abn);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${URL}?abn=${abn}&callback=callback&guid=${encodeURIComponent(process.env.ABR_GUID)}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`ABN lookup failed (${response.status})`);
    const data = parse(await response.text());
    if (!data.Abn || data.Message) {
      return { enabled: true, found: false, error: 'The ABN was not found on the Australian Business Register.' };
    }
    const result = {
      enabled: true,
      found: true,
      abn: data.Abn,
      active: String(data.AbnStatus || '').toLowerCase() === 'active',
      status: data.AbnStatus || '',
      entityName: readableName(data.EntityName),
      businessNames: [...new Set((data.BusinessName || []).map((item) => String(item).trim()).filter(Boolean))].slice(0, 6),
      state: data.AddressState || '',
      postcode: data.AddressPostcode || '',
      gst: Boolean(data.Gst),
    };
    if (cache.size > 2000) cache.delete(cache.keys().next().value);
    cache.set(abn, { at: Date.now(), result });
    return result;
  } catch (error) {
    return { enabled: true, found: false, error: 'The ABN lookup is not available right now. Type your business details.' };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { lookupAbn, readableName, parse, enabled };
