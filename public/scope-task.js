// The task for a work package the AI read from a scope of works. Used by the browser and the tests.
//
// packageTask keeps where each activity is done, its conditions and its plant, so the high risk check
// sees "near roads", "energised switchboards" or "road sweeper". It is the words SiteWrite reads the
// work from; it is not printed.
//
// Owner, 13 October 2026 (D251, D252): the task a SWMS prints is a plain list of the work in short plain
// words, with no project name, no builder name and no brackets of places, conditions or plant
// (plainTask). The conditions go into the matching site questions (scopeSite) and the plant into the
// plant list (it is read from the words above), for the user to check.
(function (root) {
  // A note in brackets inside a condition or plant entry becomes part of the list.
  const note = (text) => String(text || '').replace(/\s*\(([^)]*)\)/g, ', $1').replace(/[\s.;,]+$/, '').trim();
  // What the scope leaves out ("scissor lifts excluded", "by others") is not a condition of
  // this work, so it is dropped rather than read as plant or work on site.
  const OUT = /\b(excluded|excluding|exclusions?|by others|not included|not part of)\b/i;
  const kept = (text) => note(text).split(/\s*;\s*/).filter((part) => part && !OUT.test(part)).join('; ');

  function packageTask(rows) {
    return (rows || []).map((row) => {
      const conditions = kept(row.conditions);
      const plant = kept(row.plant);
      const notes = [note(row.where), conditions ? `conditions: ${conditions}` : '', plant ? `plant: ${plant}` : ''].filter(Boolean);
      return `${String(row.activity || '').replace(/\.$/, '')}${notes.length ? ` (${notes.join('; ')})` : ''}.`;
    }).join(' ');
  }

  // A bracket that names a place, a condition or plant comes off the plain task; one that lists the
  // items of the work ("cast in items (plates, ferrules, conduits)") becomes part of the sentence.
  const PLACE = /\b(levels?|floors?|roofs?|zones?|areas?|stages?|buildings?|blocks?|basements?|ground|lots?|rooms?|stairs?|suspended|slabs?|sites?|wings?|towers?|podiums?|carparks?|grid(?:line)?s?|throughout|all)\b/i;
  const CONDITION = /\b(if required|as required|where required|as directed|as shown|as set out|hours?|night|weekends?|out of hours|by others|tbc|tbd|to be (?:determined|confirmed)|approved|live|operating|energised|occupied|near|adjacent|within|unless|incidental)\b/i;
  const PLANT = /\b(cranes?|pumps?|ewps?|scissor|boom|forklifts?|telehandlers?|excavators?|trucks?|hoists?|saws?|grinders?|trowels?|vibrators?|lifts?|bobcats?|loaders?|rollers?|generators?|compressors?)\b/i;
  // A project, building or builder named by its own name: "for the Northside Correctional Centre",
  // "at Smith Street Apartments", "for Acme Builders". Plain words ("the site", "the builder") stay.
  const NAMED = /\s+(?:for|at|on|to|by|with)\s+(?:the\s+)?(?:[A-Z][\w'&-]*\s+){0,5}(?:Project|Development|Centre|Center|Hospital|School|Campus|Precinct|Apartments|Tower|Complex|Builders?|Constructions?|Construction|Group|Pty Ltd|Limited|Ltd)\b(?:\s+(?:[A-Z][\w'&-]*|\d+))*/g;

  function plainLine(row) {
    let text = String(row.activity || '').replace(/\s+/g, ' ').trim();
    text = text.replace(NAMED, '');
    // One word in brackets straight after the first verb says how it is done ("Seal (paint) bottoms of doors"): it reads
    // "Seal or paint", not "Seal: paint bottoms of doors" (messy round 14, A run 4).
    text = text.replace(/^([A-Za-z]+)\s*\(([a-z]+)\)\s+/, (whole, verb, other) => `${verb} or ${other} `);
    text = text.replace(/\s*\(([^)]*)\)/g, (whole, inside) => {
      const words = inside.trim();
      if (!words || PLACE.test(words) || CONDITION.test(words) || PLANT.test(words)) return '';
      // A bracket that carries on the sentence ("(and CCTV and duress)", "(including the risers)") reads
      // on from it, not after a colon (messy round 8: "for access control: and CCTV and duress").
      if (/^(?:and|or|plus|with)\b/i.test(words)) return ` ${words}`;
      if (/^(?:including|incl\.?|such as|e\.?g\.?)\s/i.test(words)) return `, ${words.replace(/^incl\.?\s/i, 'including ')}`;
      // So does what is left out (messy round 9, wording 1: "Install gas services: excluding storage tank").
      if (/^(?:excluding|excl\.?|except|other than|not including|but not|without)\s/i.test(words)) return `, ${words.replace(/^excl\.?\s/i, 'excluding ')}`;
      return `: ${words}`;
    });
    text = text.replace(/\s+([,.;:])/g, '$1').replace(/[\s.;,:]+$/, '').trim();
    // One word alone is not a sentence of work (messy round 9, wording 2: "Roadsaw." stood alone).
    if (/^road ?saw(?:s|ing)?$/i.test(text)) text = 'Saw cut existing roads and pavements';
    else if (/^[a-z-]+$/i.test(text)) text = `${text} work`;
    return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}.` : '';
  }

  // The work, one short sentence each, in the order the scope gives it.
  function plainTask(rows) {
    const lines = [];
    for (const row of rows || []) {
      const line = plainLine(row);
      if (line && !lines.some((other) => other.toLowerCase() === line.toLowerCase())) lines.push(line);
    }
    return lines.join(' ');
  }

  // Where the work is done, its conditions and its plant, as notes SiteWrite reads with the task when
  // the user has changed the task's words. Not printed.
  function scopeNotes(rows) {
    const parts = [];
    for (const row of rows || []) {
      const conditions = kept(row.conditions);
      const plant = kept(row.plant);
      const bits = [note(row.where) ? `Where: ${note(row.where)}` : '', conditions ? `Conditions: ${conditions}` : '', plant ? `Plant: ${plant}` : ''].filter(Boolean);
      if (bits.length) parts.push(`${bits.join('. ')}.`);
    }
    return [...new Set(parts)].join(' ');
  }

  // The site question each kind of condition answers (legislation.js SITE_FIELDS). A condition that
  // matches none (working hours, for example) is a term of the contract, not a site condition.
  const SITE_RULES = [
    ['publicInterface', /\b(public|footpaths?|roads?|traffic|pedestrians?|neighbou?rs?|occupied|operating|facilit(?:y|ies)|tenants?|patients?|visitors?|shoppers?|school)\b/i],
    ['liveServices', /\b(live|energis\w*|power|electric\w*|services?|gas|water mains?|switch ?boards?|overhead|cables?)\b/i],
    ['otherTrades', /\b(trades?|shared|other contractors?|concurrent|live pours?|above|below|crane overhead)\b/i],
    ['ground', /\b(ground|soil|excavat\w*|slabs?|decks?|loads?|wet|mud\w*|slopes?|batters?|boggy)\b/i],
    ['access', /\b(access|gates?|loading zones?|hoists?|stair ?towers?|security|escorts?|deliver\w*|laydown)\b/i],
  ];
  // A condition SiteWrite offers is never one its own site check would refuse or call too thin to act on (messy
  // round 13: "Existing services." passed as Live services though it names no service, and "Other trades working on
  // site." was offered for Other trades and then refused). Such a condition is not offered.
  const gate = () => root.SiteWriteGate || (typeof require === 'function' ? require('./gate-rules') : null);
  // Nor is one that names nothing a crew can act on, though SiteWrite's own rule lets it pass (messy round 14, A runs 1
  // and 4: "Other trades working in the buildings." and "Work alongside other trades." name no trade, and "Fans,
  // ductwork and electrical controls by other trades." is others' work, not a live service). A condition is offered
  // for Other trades only where it names a trade or where they work, and for Live services only where it names a
  // service that is not others' work.
  const TRADE_NAMED = /\b(?:electric\w*|sparky|sparkies|plumb\w*|hydraulic\w*|mechanical|hvac|air ?con\w*|fire\w*|sprinkler\w*|carpent\w*|joiner\w*|joinery|til(?:er|ers|ing)|paint\w*|plaster\w*|ceiling\w*|partition\w*|concret\w*|formwork\w*|steel ?fix\w*|reo|steel\w*|scaffold\w*|cranes?|crane crew|rigg\w*|roof\w*|glaz\w*|windows?|facade\w*|cladding|landscap\w*|civil\w*|earthwork\w*|demoli\w*|asbestos|clean\w*|security|data|comms|cabling|lifts?|floor ?(?:layers?|finish\w*|cover\w*)|carpet\w*|vinyl|waterproof\w*|insulat\w*|duct\w*|fans?|kitchens?|masonry|brick\w*|block ?lay\w*|render\w*|signage|traffic control\w*|survey\w*|cabinet\w*|services trades?|pump\w*|piling|drill\w*|welders?|fitters?|electricians?|labourers?)\b/i;
  const WHERE_NAMED = /\b(?:above|below|beneath|overhead|same (?:level|floor|area|room|zone)|levels? \d+|floors? \d+|L\d+|ground floor|basement|roof|plant ?room|riser|shaft|zone \w+|next door|adjacent (?:room|area|level|unit|lot))\b/i;
  const OTHERS_WORK = /\bby (?:other trades|others|other contractors|another contractor|the builder|the main contractor|the head contractor)\b/i;
  // A condition is offered for Public interface only where it names people or traffic near the work, and for Access only
  // where it names a way in or up (messy round 15, A runs 2 and 4: "Existing live HV network of an operating facility."
  // and "Buildings isolated from the network in an operating facility." were offered as Public interface, and "Vehicle
  // access point." as Access). A live network goes to Live services.
  const PUBLIC_NAMED = /\b(?:public|footpaths?|roads?|streets?|traffic|pedestrians?|neighbou?rs?|occupied|occupants?|tenants?|patients?|visitors?|shoppers?|customers?|students?|pupils?|children|staff|residents?|school|car ?parks?|people)\b/i;
  const ACCESS_NAMED = /\b(?:gates?|stairs?|stair ?towers?|hoists?|lifts?|ladders?|ramps?|loading (?:zones?|docks?|bays?)|laydown|lanes?|driveways?|entr(?:y|ies|ance|ances)|via|through|off|levels?|floors?|escort\w*|security|induct\w*|swipe|passes|permits?|street|st|road|rd|deliver\w*|hours?|times?)\b/i;
  // An occupied or operating facility has people in it, unless the condition is about its network or services.
  const SERVICE_NAMED = /\b(?:networks?|hv|lv|high voltage|low voltage|power|electric\w*|energis\w*|gas|water mains?|switch ?boards?|cables?|services?|substations?|isolat\w*)\b/i;
  const namesSomething = (id, text) => (id === 'otherTrades' ? TRADE_NAMED.test(text) || WHERE_NAMED.test(text)
    : id === 'liveServices' ? !OTHERS_WORK.test(text)
      : id === 'publicInterface' ? PUBLIC_NAMED.test(text) || (/\b(?:occupied|operating|in use|live)\b/i.test(text) && !SERVICE_NAMED.test(text))
        : id === 'access' ? ACCESS_NAMED.test(text) : true);
  const offerable = (id, text) => { const rules = gate(); return (!rules || !rules.siteNeed || !rules.siteNeed(id, text)) && namesSomething(id, text); };
  function scopeSite(rows) {
    const out = {};
    for (const row of rows || []) {
      for (const part of kept(row.conditions).split(/\s*;\s*/).filter(Boolean)) {
        // Work by other trades is an Other trades condition, whatever services it names.
        // The first site question the condition answers for this crew: a facility's live network is a live service, not
        // the public (messy round 15, A run 2).
        const text = `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
        const rule = OTHERS_WORK.test(part) ? SITE_RULES.find(([id]) => id === 'otherTrades') : SITE_RULES.find(([id, pattern]) => pattern.test(part) && offerable(id, text));
        if (!rule) continue;
        if (!offerable(rule[0], text)) continue;
        out[rule[0]] = [...new Set([...(out[rule[0]] || []), text])];
      }
    }
    return Object.fromEntries(Object.entries(out).map(([id, list]) => [id, `${list.join('. ')}.`]));
  }

  // The scope's conditions for one site question, cleaned to offer as suggestions the user accepts, not
  // as a finished answer (messy round 3: "Energised buildings. Energised HV. ... Energised buildings."
  // and "Access: Security guards." printed in every SWMS). Each condition once, without a leading label
  // ("Access:"), with its first letter a capital and a full stop. texts: the condition text from each SWMS.
  function siteSuggestions(texts, id) {
    const out = [];
    const key = (line) => line.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    for (const text of texts || []) {
      for (const part of String(text || '').split(/(?<=[.;])\s+|\s*;\s*/)) {
        let line = part.replace(/^\s*[A-Z][A-Za-z ]{0,24}:\s*/, '').replace(/\s+/g, ' ').replace(/[\s.;,]+$/, '').trim();
        if (line.split(' ').length < 2 && !/\d/.test(line)) continue;
        line = `${line.charAt(0).toUpperCase()}${line.slice(1)}.`;
        if (id && !offerable(id, line)) continue;
        if (!out.some((other) => key(other) === key(line))) out.push(line);
      }
    }
    return out.slice(0, 12);
  }

  // The plant the scope names for the work, for the plant list to check.
  // A note in brackets on a plant item ("Drill (not named)", "Heat welding equipment (heat weld named)") is not plant, and
  // nor is a product the row names with it ("epoxy adhesive", "Adhesive (direct stick)"): messy round 14, A runs 2 and 4, the
  // plant chips read "Heat welding equipment, heat weld named, epoxy adhesive, Adhesive, direct stick" and "Drill, not named".
  const NOT_PLANT = /\b(?:adhesives?|glues?|epox\w*|sealants?|silicone|mastics?|paints?|primers?|membranes?|grouts?|mortars?|compounds?|chemicals?|products?|materials?|consumables?|fixings?|levell?ing compounds?)\b/i;
  function scopePlant(rows) {
    const out = [];
    for (const row of rows || []) {
      const parts = String(row.plant || '').replace(/\s*\([^)]*\)/g, ' ').split(/\s*[;,]\s*/).map((part) => part.replace(/\s+/g, ' ').replace(/[\s.]+$/, '').trim()).filter(Boolean);
      for (const part of parts) if (!OUT.test(part) && !NOT_PLANT.test(part) && !/\b(?:not |un)named\b/i.test(part) && !out.some((item) => item.toLowerCase() === part.toLowerCase())) out.push(part);
    }
    return out;
  }

  // The words a SWMS from a scope is read from, kept with it: the plain task as first given, the full
  // words, and the notes to read with a task the user has changed (draft.js scopeWords).
  const scopeWords = (rows) => ({ plain: plainTask(rows), full: packageTask(rows), notes: scopeNotes(rows) });

  const api = { packageTask, plainTask, scopeNotes, scopeSite, scopePlant, scopeWords, siteSuggestions };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteWriteScopeTask = api;
})(typeof window !== 'undefined' ? window : globalThis);
