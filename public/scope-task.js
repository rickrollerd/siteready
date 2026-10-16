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
  const CONDITION = /\b(if required|as required|where required|as directed|as shown|as set out|hours?|night|weekends?|out of hours|by others|tbc|tbd|to be (?:determined|confirmed)|approved|live|operating|energised|occupied|near|adjacent|within|unless)\b/i;
  const PLANT = /\b(cranes?|pumps?|ewps?|scissor|boom|forklifts?|telehandlers?|excavators?|trucks?|hoists?|saws?|grinders?|trowels?|vibrators?|lifts?|bobcats?|loaders?|rollers?|generators?|compressors?)\b/i;
  // A project, building or builder named by its own name: "for the Northside Correctional Centre",
  // "at Smith Street Apartments", "for Acme Builders". Plain words ("the site", "the builder") stay.
  const NAMED = /\s+(?:for|at|on|to|by|with)\s+(?:the\s+)?(?:[A-Z][\w'&-]*\s+){0,5}(?:Project|Development|Centre|Center|Hospital|School|Campus|Precinct|Apartments|Tower|Complex|Builders?|Constructions?|Construction|Group|Pty Ltd|Limited|Ltd)\b(?:\s+(?:[A-Z][\w'&-]*|\d+))*/g;

  function plainLine(row) {
    let text = String(row.activity || '').replace(/\s+/g, ' ').trim();
    text = text.replace(NAMED, '');
    text = text.replace(/\s*\(([^)]*)\)/g, (whole, inside) => {
      const words = inside.trim();
      if (!words || PLACE.test(words) || CONDITION.test(words) || PLANT.test(words)) return '';
      // A bracket that carries on the sentence ("(and CCTV and duress)", "(including the risers)") reads
      // on from it, not after a colon (messy round 8: "for access control: and CCTV and duress").
      if (/^(?:and|or|plus|with)\b/i.test(words)) return ` ${words}`;
      if (/^(?:including|incl\.?|such as|e\.?g\.?)\s/i.test(words)) return `, ${words.replace(/^incl\.?\s/i, 'including ')}`;
      return `: ${words}`;
    });
    text = text.replace(/\s+([,.;:])/g, '$1').replace(/[\s.;,:]+$/, '').trim();
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
  function scopeSite(rows) {
    const out = {};
    for (const row of rows || []) {
      for (const part of kept(row.conditions).split(/\s*;\s*/).filter(Boolean)) {
        const rule = SITE_RULES.find(([, pattern]) => pattern.test(part));
        if (!rule) continue;
        const text = `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
        out[rule[0]] = [...new Set([...(out[rule[0]] || []), text])];
      }
    }
    return Object.fromEntries(Object.entries(out).map(([id, list]) => [id, `${list.join('. ')}.`]));
  }

  // The scope's conditions for one site question, cleaned to offer as suggestions the user accepts, not
  // as a finished answer (messy round 3: "Energised buildings. Energised HV. ... Energised buildings."
  // and "Access: Security guards." printed in every SWMS). Each condition once, without a leading label
  // ("Access:"), with its first letter a capital and a full stop. texts: the condition text from each SWMS.
  function siteSuggestions(texts) {
    const out = [];
    const key = (line) => line.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    for (const text of texts || []) {
      for (const part of String(text || '').split(/(?<=[.;])\s+|\s*;\s*/)) {
        let line = part.replace(/^\s*[A-Z][A-Za-z ]{0,24}:\s*/, '').replace(/\s+/g, ' ').replace(/[\s.;,]+$/, '').trim();
        if (line.split(' ').length < 2 && !/\d/.test(line)) continue;
        line = `${line.charAt(0).toUpperCase()}${line.slice(1)}.`;
        if (!out.some((other) => key(other) === key(line))) out.push(line);
      }
    }
    return out.slice(0, 12);
  }

  // The plant the scope names for the work, for the plant list to check.
  function scopePlant(rows) {
    const out = [];
    for (const row of rows || []) for (const part of kept(row.plant).split(/\s*[;,]\s*/).filter(Boolean)) if (!out.some((item) => item.toLowerCase() === part.toLowerCase())) out.push(part);
    return out;
  }

  // The words a SWMS from a scope is read from, kept with it: the plain task as first given, the full
  // words, and the notes to read with a task the user has changed (draft.js scopeWords).
  const scopeWords = (rows) => ({ plain: plainTask(rows), full: packageTask(rows), notes: scopeNotes(rows) });

  const api = { packageTask, plainTask, scopeNotes, scopeSite, scopePlant, scopeWords, siteSuggestions };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteWriteScopeTask = api;
})(typeof window !== 'undefined' ? window : globalThis);
