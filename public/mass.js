// A load rating in kPa or kN printed with the mass it stands for (D263, owner, 13 October 2026):
// "In addition to the KPA rating, convert to tonnes and show that next to it in brackets. This helps
// the workers." So "100 kPa" prints as "100 kPa (about 10 tonnes per square metre)" and "15 kN" as
// "15 kN (about 1.5 tonnes)".
//
// The conversion is the formwork code's own: "2kPa which is equivalent to a mass of 200kg per square
// metre" and 2 kN "approximately 200 kg", that is 1 kPa to 100 kg per square metre and 1 kN to 100 kg.
// The true figure is 1000 / 9.81 = 102 kg, so the mass printed is about 2% under it: on the safe side
// for a rating (a deck rated 2 kPa carries a little more than the 200 kg printed).
//
// Only load ratings are converted: a pressure (a gas or water test to 1500 kPa, a regulator) and a
// force (an arrest force of 6 kN, a stressing load) are not masses and print as they are. The
// figures stay as written; the mass goes after them, once. Used by the page, the Word file and the
// PDF (docx-draft.js, pdf-draft.js), so all three print it alike.
(function (root) {
  const NUMBER = '(\\d+(?:[.,]\\d+)?)';
  const RANGE = `${NUMBER}(?:\\s*(?:to|-|–)\\s*${NUMBER})?`;
  // kPa (and kN per square metre, the same unit), then kN on its own. A unit already followed by its
  // mass is left alone.
  const RATING = new RegExp(`(\\(?)${RANGE}\\s?(kPa|kN\\s?/\\s?m(?:2|²)|kN per square metre|kN)(?![\\w/·.-]*\\w)(\\)?)(?!\\s*[(,]\\s*about\\b)`, 'g');
  // What makes the figure a pressure or a force, said before it in the same sentence.
  const PRESSURE = /\b(?:test\w*|gas|air|water|nitrogen|oxygen|regulators?|hydrostatic|pneumatic|vacuum|pumps?|hoses?|pipe\w*|pressuri[sz]\w*|psi)\b|\b(?<!bearing )pressures?\b/i;
  const FORCE = /\b(?:forces?|arrest\w*|torque|tension\w*|stress\w*|jack\w* to|pull\w* (?:test|out))\b/i;

  const value = (text) => Number(String(text).replace(',', '.'));
  // A mass in kg, as a worker reads it: kg under a tonne, tonnes from a tonne up.
  function massText(kg) {
    if (kg < 1000) return `${Math.round(kg)} kg`;
    const tonnes = Math.round(kg / 10) / 100;
    return `${String(tonnes)} ${tonnes === 1 ? 'tonne' : 'tonnes'}`;
  }
  // The mass of a range: "500 kg to 1 tonne".
  function rangeText(low, high) {
    if (low === null) return massText(high * 100);
    const a = massText(low * 100);
    const b = massText(high * 100);
    const unit = (text) => text.replace(/^[\d.]+ /, '');
    return unit(a) === unit(b) || (unit(a) === 'tonne' && unit(b) === 'tonnes') ? `${a.replace(/ \w+$/, '')} to ${b}` : `${a} to ${b}`;
  }

  // The text with each load rating's mass after it.
  function withMass(text) {
    const source = String(text ?? '');
    if (!/\bk(?:Pa|N)\b/.test(source)) return source;
    return source.replace(RATING, (whole, open, first, second, unit, close, at) => {
      const low = second === undefined ? null : value(first);
      const high = value(second === undefined ? first : second);
      if (!Number.isFinite(high) || high <= 0 || (low !== null && !Number.isFinite(low))) return whole;
      // The sentence before the figure says whether it is a pressure or a force.
      const before = source.slice(0, at + open.length).split(/[.;:!?]\s/).pop().slice(-90);
      const perArea = unit !== 'kN';
      if (perArea ? PRESSURE.test(before) : FORCE.test(before) || PRESSURE.test(before)) return whole;
      const mass = `about ${rangeText(low, high)}${perArea ? ' per square metre' : ''}`;
      const figure = whole.slice(open.length, whole.length - close.length);
      // "(100 kPa)" becomes "(100 kPa, about 10 tonnes per square metre)".
      if (open && close) return `(${figure}, ${mass})`;
      // Inside brackets already, the mass goes between commas, not in brackets of its own:
      // "(12 kN, about 1.2 tonnes, where only a limited free fall is possible)".
      const prior = source.slice(0, at + open.length);
      const inside = open || (prior.match(/\(/g) || []).length > (prior.match(/\)/g) || []).length;
      if (inside) {
        const next = source.charAt(at + whole.length);
        return `${open}${figure}, ${mass}${close || /^[,.;)]?$/.test(next) ? '' : ','}${close}`;
      }
      return `${figure} (${mass})`;
    });
  }

  // An HTML string with the mass after each rating in its text, not in its tags or attributes, and
  // not in a box the user types in.
  function withMassHtml(html) {
    return String(html ?? '').split(/(<textarea[\s\S]*?<\/textarea>)/i).map((part) => (/^<textarea/i.test(part) ? part : part.replace(/>([^<]+)</g, (whole, text) => `>${withMass(text)}<`))).join('');
  }

  const api = { withMass, withMassHtml, massText };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteReadyMass = api;
})(typeof window !== 'undefined' ? window : globalThis);
