// The parts of a SWMS a named person ticks as checked before it is downloaded or saved (Goal 12,
// D286): job steps; hazards and controls (with PPE and hazardous substances); plant; emergency; and
// site details. Each part has a fingerprint of what it prints, so a tick is for the part as it was
// read: a change to the part after it was ticked clears the tick on the page, and the server refuses
// a save whose fingerprints do not match the draft it prints. In the browser and on the server, in
// the same style as scope-choice.js.
(function checkParts(root) {
  const PARTS = [
    { id: 'steps', label: 'Job steps', hint: 'The steps, their order and who does each.', words: 'the job steps', them: true },
    { id: 'hazards', label: 'Hazards and controls', hint: 'Including PPE and hazardous substances.', words: 'the hazards and controls', them: true },
    { id: 'plant', label: 'Plant', hint: 'Plant and equipment, licences, tickets and training.', words: 'the plant', them: false },
    { id: 'emergency', label: 'Emergency', hint: 'Emergency arrangements, hospital, first aider and muster point.', words: 'the emergency arrangements', them: true },
    { id: 'site', label: 'Site details', hint: 'People, site conditions, site rules and designs.', words: 'the site details', them: true },
  ];
  const IDS = PARTS.map((part) => part.id);
  const byId = (id) => PARTS.find((part) => part.id === id);

  // JSON with its keys in order, so the same content always reads the same.
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
    return JSON.stringify(value === undefined ? null : value);
  }

  // A 64-bit fingerprint (two 32-bit halves), the same in the browser and on the server. It only
  // tells whether a part changed: the server works the fingerprints out again itself.
  function hash(text) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return `${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
  }

  const list = (value) => (Array.isArray(value) ? value : []);
  const text = (value) => String(value == null ? '' : value);

  // What each part prints, from the draft. The date, the revision and the business's own details are
  // left out: they are not read and ticked (the date moves on every day). So is a review date filled
  // from the date (D289), which moves on with it. So is the paragraph on how the
  // controls are monitored and reviewed: SiteWrite writes it from the reviewer and the plant, which are
  // in their own parts. The hazards and controls of each step are taken in a fixed order, so moving a
  // step clears only the job steps.
  function partContent(draft) {
    const d = draft || {};
    const steps = list(d.jobSteps);
    return {
      steps: steps.map((step) => ({ step: text(step.step), responsible: text(step.responsible) })),
      hazards: {
        highRisk: list(d.highRisk),
        controls: list(d.controls).map((item) => ({ level: text(item && item.level), text: text(item && item.text) })),
        steps: steps.map((step) => stable({
          hazards: list(step.hazards), controls: list(step.controls), risk: step.risk || null,
          ppeLines: list(step.ppeLines), substanceLines: list(step.substanceLines),
        })).sort(),
        ppe: list(d.ppe).map((group) => ({ area: text(group.area), worn: list(group.items).filter((item) => item && item.ticked).map((item) => ({ label: text(item.label), steps: Array.isArray(item.steps) ? item.steps : null })) })),
        substances: d.substances || null,
      },
      plant: { plant: list(d.plant), qualifications: list(d.qualifications) },
      emergency: { emergency: list(d.emergency), hospital: text(d.hospital), firstAider: text(d.firstAider), musterPoint: text(d.musterPoint) },
      site: {
        principalContractor: text(d.principalContractor), workplace: text(d.workplace), siteManager: text(d.siteManager), scaffoldSupervisor: text(d.scaffoldSupervisor),
        craneOperator: text(d.craneOperator), task: text(d.task), residential: text(d.residential), fallRisk: text(d.fallRisk), swmsRef: text(d.swmsRef),
        worksManager: text(d.worksManager), worksManagerPhone: text(d.worksManagerPhone), complianceResponsible: text(d.complianceResponsible), reviewer: text(d.reviewer),
        reviewDate: d.reviewDateFilled ? '' : text(d.reviewDate), preparedBy: text(d.preparedBy),
        conditions: list(d.site), references: list(d.references), designs: list(d.designs), siteRules: list(d.siteRules),
      },
    };
  }

  // { steps, hazards, plant, emergency, site }: each part's fingerprint.
  function partHashes(draft) {
    const content = partContent(draft);
    return Object.fromEntries(IDS.map((id) => [id, hash(stable(content[id]))]));
  }

  // The parts ticked whose fingerprint no longer matches the draft's (in the order of PARTS).
  function staleParts(ticked, now) {
    const given = ticked || {};
    return IDS.filter((id) => typeof given[id] === 'string' && given[id] !== (now || {})[id]);
  }

  const joinWords = (words) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);

  // "You changed the job steps after ticking them. Tick them again."
  function staleMessage(ids) {
    const parts = (ids || []).map(byId).filter(Boolean);
    if (!parts.length) return '';
    const them = parts.length > 1 || parts[0].them;
    return `You changed ${joinWords(parts.map((part) => part.words))} after ticking ${them ? 'them' : 'it'}. Tick ${them ? 'them' : 'it'} again.`;
  }

  const labels = (ids) => (ids || []).map(byId).filter(Boolean).map((part) => part.label);

  const api = { PARTS, IDS, stable, hash, partContent, partHashes, staleParts, staleMessage, labels, joinWords };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteWriteCheckParts = api;
}(typeof window !== 'undefined' ? window : globalThis));
