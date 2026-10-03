// The state a job address is in. The law that applies is the law where the work is done,
// so the SWMS state comes from the job address. Used by the server and the browser.
(function (root) {
  const NAMES = [
    ['act', /\b(?:ACT|Australian Capital Territory)\b/],
    ['nsw', /\b(?:NSW|New South Wales)\b/],
    ['vic', /\b(?:VIC|Victoria)\b/],
    ['qld', /\b(?:QLD|Queensland)\b/],
    ['sa', /\b(?:SA|South Australia)\b/],
    ['wa', /\b(?:WA|Western Australia)\b/],
    ['tas', /\b(?:TAS|Tasmania)\b/],
    ['nt', /\b(?:NT|Northern Territory)\b/],
  ];

  // Postcodes on or near a state border, used by places in more than one state.
  const SHARED_POSTCODES = new Set(['0872', '2406', '2540', '2611', '2620', '3644', '3691', '3707', '4383', '4385']);

  // The state for a postcode, from the standard postcode ranges, or '' when it is not certain.
  function stateFromPostcode(code) {
    if (!/^\d{4}$/.test(code) || SHARED_POSTCODES.has(code)) return '';
    const n = Number(code);
    if ((n >= 200 && n <= 299) || (n >= 2600 && n <= 2618) || (n >= 2900 && n <= 2920)) return 'act';
    if (n >= 800 && n <= 999) return 'nt';
    if ((n >= 1000 && n <= 2599) || (n >= 2619 && n <= 2899) || (n >= 2921 && n <= 2999)) return 'nsw';
    if ((n >= 3000 && n <= 3999) || (n >= 8000 && n <= 8999)) return 'vic';
    if ((n >= 4000 && n <= 4999) || (n >= 9000 && n <= 9999)) return 'qld';
    if (n >= 5000 && n <= 5999) return 'sa';
    if (n >= 6000 && n <= 6999) return 'wa';
    if (n >= 7000 && n <= 7999) return 'tas';
    return '';
  }

  // { state, from } for an address: from the state named in it ('name'), or its postcode ('postcode').
  // The last state named wins, so "Victoria Park WA 6100" is Western Australia.
  function stateFromAddress(text) {
    const address = String(text || '');
    let best = { state: '', from: '', at: -1 };
    for (const [id, pattern] of NAMES) {
      const global = new RegExp(pattern.source, 'g');
      for (const match of address.matchAll(global)) {
        // "Victoria" or "Queensland" before a street or place word is a name, not the state.
        const after = address.slice(match.index + match[0].length);
        if (/^\s+(?:Park|Point|Street|St|Road|Rd|Avenue|Ave|Parade|Terrace|Square|Harbour|Bridge|Place|Lane|Drive|Dr)\b/.test(after)) continue;
        if (match.index > best.at) best = { state: id, from: 'name', at: match.index };
      }
    }
    if (best.state) return { state: best.state, from: best.from };
    const postcodes = address.match(/\b\d{4}\b/g) || [];
    const last = postcodes[postcodes.length - 1];
    const state = last ? stateFromPostcode(last) : '';
    return state ? { state, from: 'postcode' } : { state: '', from: '' };
  }

  const api = { stateFromAddress, stateFromPostcode };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteReadyAddress = api;
})(typeof window !== 'undefined' ? window : globalThis);
