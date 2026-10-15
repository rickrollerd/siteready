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

  // What a person types in the address box, in lower case and part way through ("12 smith st darwin",
  // "88 phillip st parramatta", "200 st georges tce perth"): the state it names, and the place words
  // after the street (messy round 3, 14 October 2026: the first suggestion for a Darwin, Perth or
  // Hobart address was in Queensland, and picking it set Queensland law). A capital city or a large
  // regional town names its state; a place name shared by two states is left out.
  const PLACES = [
    ['nsw', 'sydney|north sydney|parramatta|newcastle|wollongong|wagga wagga|dubbo|tamworth|albury|bathurst|penrith|liverpool|blacktown|chatswood|gosford|coffs harbour|port macquarie|lismore|broken hill|queanbeyan|goulburn|armidale|maitland|campbelltown'],
    ['vic', 'melbourne|port melbourne|geelong|ballarat|bendigo|shepparton|mildura|warrnambool|dandenong|frankston|wodonga|traralgon|sunbury|werribee'],
    ['qld', 'brisbane|gold coast|sunshine coast|townsville|cairns|toowoomba|mackay|rockhampton|bundaberg|gladstone|woolloongabba|maroochydore|caloundra|southport|hervey bay'],
    ['sa', 'adelaide|mount gambier|whyalla|port augusta|port lincoln|murray bridge|port pirie'],
    ['wa', 'perth|fremantle|bunbury|geraldton|kalgoorlie|joondalup|rockingham|mandurah|karratha|port hedland|broome|albany'],
    ['tas', 'hobart|launceston|devonport|burnie|glenorchy'],
    ['nt', 'darwin|alice springs|katherine|tennant creek|casuarina'],
    ['act', 'canberra|belconnen|tuggeranong|gungahlin|woden|fyshwick'],
  ];
  const STREET_WORD = '(?:street|st|road|rd|avenue|ave|parade|pde|terrace|tce|drive|dr|lane|ln|highway|hwy|boulevard|blvd|place|pl|court|ct|crescent|cres|way|close|cl|circuit|cct|esplanade|esp|square|sq|grove|gr|mall|row|walk)';
  // A word after a place name that makes it another place ("Albany Creek" is in Queensland).
  const NOT_THE_PLACE = `(?:${STREET_WORD.slice(3, -1)}|creek|park|hills?|heights|beach|bay|valley|vale|airport|north|south|east|west)`;
  const SHORT = /\b(nsw|vic|qld|sa|wa|tas|nt|act)\b(?:\s+\d{4})?\s*$/i;
  const LONG = [['act', /\baustralian capital territory\b/i], ['nsw', /\bnew south wales\b/i], ['vic', /\bvictoria\b(?!\s+(?:park|point|street|st|road|rd|avenue|ave|parade|terrace|square|harbour|bridge|place|lane|drive|dr)\b)/i], ['qld', /\bqueensland\b(?!\s+(?:street|st|road|rd|avenue|ave|parade|terrace|place|lane|drive|dr)\b)/i], ['sa', /\bsouth australia\b/i], ['wa', /\bwestern australia\b/i], ['tas', /\btasmania\b/i], ['nt', /\bnorthern territory\b/i]];
  function stateFromTyped(text) {
    const typed = String(text || '').replace(/\s+/g, ' ').trim();
    const named = stateFromAddress(typed);
    if (named.from === 'name') return named;
    const short = SHORT.exec(typed);
    if (short) return { state: short[1].toLowerCase(), from: 'name' };
    for (const [id, pattern] of LONG) if (pattern.test(typed)) return { state: id, from: 'name' };
    // A postcode is the last word, not the street number at the front.
    const code = /(?:^|\s)(\d{4})\s*$/.exec(typed);
    if (code && !/^\d{4}\s*$/.test(typed)) { const state = stateFromPostcode(code[1]); if (state) return { state, from: 'postcode' }; }
    // The last place named that is not a street's name ("88 adelaide st" is a street).
    let best = { state: '', from: '', at: -1 };
    for (const [id, names] of PLACES) {
      for (const match of typed.matchAll(new RegExp(`\\b(?:${names})\\b(?!\\s+${NOT_THE_PLACE}\\b)`, 'gi'))) {
        if (match.index > best.at) best = { state: id, from: 'place', at: match.index };
      }
    }
    return best.state ? { state: best.state, from: 'place' } : { state: '', from: '' };
  }

  // The suburb or town words typed after the street ("parramatta" in "88 phillip st parramatta"), in
  // lower case, without a state or postcode: a suggestion that names them fits what was typed.
  function placeWords(text) {
    const words = String(text || '').toLowerCase().replace(/[,]+/g, ' ').split(/\s+/).filter(Boolean);
    let at = -1;
    words.forEach((word, i) => { if (i > 0 && new RegExp(`^${STREET_WORD}$`).test(word)) at = i; });
    if (at < 0) return [];
    return words.slice(at + 1).filter((word) => word.length > 1 && !/^\d+$/.test(word) && !/^(?:nsw|vic|qld|sa|wa|tas|nt|act|australia)$/.test(word));
  }

  const api = { stateFromAddress, stateFromPostcode, stateFromTyped, placeWords };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteWriteAddress = api;
})(typeof window !== 'undefined' ? window : globalThis);
