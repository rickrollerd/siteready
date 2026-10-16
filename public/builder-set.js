// The details a main contractor sets for every contractor on its project (Goal 12 stage 6, plan
// section D): the job address, the principal contractor's name and the site details (muster point,
// first aider, first aid location, hospital or medical centre, scaffold supervisor, site manager and
// site rules). A subcontractor opening the builder's list finds them filled in, each marked "Set by
// {builder}". It can change one; it is then warned, by the builder's name, and the change is kept as
// an override the builder sees when the SWMS is submitted (stage 7).
//
// The merge for the page every SWMS of the list shares, in the plan's order:
//   1. the company's own details (name, ABN, address, phone, email), which nothing replaces;
//   2. the builder's details, set by the builder;
//   3. the subcontractor's own answers, which win over the builder's, with the warning.
// A builder's detail the subcontractor never changed follows the builder: when the builder sets a new
// version, the new value is filled in. One the subcontractor changed stays as it typed it.
// Used by the browser (scope.js, from-builders.js) and the server (sitelink-subbie.js).
(function (root) {
  // Each detail the builder sets: its key in a SWMS's input, the box on the page, and its name.
  const FIELDS = [
    { key: 'workplace', field: 'workplace', label: 'Job address', from: 'project' },
    { key: 'principalContractor', field: 'principal', label: 'Principal contractor', from: 'project' },
    { key: 'siteManager', field: 'site-manager', label: 'Site manager' },
    { key: 'scaffoldSupervisor', field: 'scaffold-supervisor', label: 'Scaffold supervisor' },
    { key: 'hospital', field: 'hospital', label: 'Hospital or medical centre' },
    { key: 'firstAider', field: 'first-aider', label: 'First aider' },
    { key: 'firstAidLocation', field: 'first-aid-location', label: 'First aid location' },
    { key: 'musterPoint', field: 'muster-point', label: 'Muster point' },
    { key: 'siteRules', field: 'site-rules', label: 'Site rules', list: true },
  ];
  const KEYS = FIELDS.map((item) => item.key);
  // The company's own details: always the subcontractor's company, never the builder's.
  const COMPANY_KEYS = ['company', 'companyName', 'companyAbn', 'companyAddress', 'companyPhone', 'companyEmail', 'companyLogo', 'logo', 'subcontractor'];

  // Site rules are a list; on the page they are one rule to a line.
  const linesOf = (value) => (Array.isArray(value) ? value : String(value || '').split(/\r?\n/))
    .map((line) => String(line || '').replace(/^\s*(?:[-*•·]|\d{1,2}[.)])\s+/, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const asText = (field, value) => (field && field.list ? linesOf(value).join('\n') : String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim());
  // Two answers are the same when they say the same words: case, spacing and a last full stop aside.
  // Typing a detail back as the builder set it is no change (messy run: changed, then changed back).
  const plain = (field, value) => asText(field, value).toLowerCase().replace(/[.\s]+$/g, '').replace(/\s+/g, ' ');
  const same = (field, a, b) => plain(field, a) === plain(field, b);
  const fieldOf = (key) => FIELDS.find((item) => item.key === key) || null;

  // What the builder set for this list: { key: { value, label } } for each detail it gave. project is
  // the builder's project ({ workplace, pcName }), details its current site details.
  function builderSetOf(project, details) {
    const out = {};
    const given = { ...(details || {}), workplace: project && project.workplace, principalContractor: project && (project.pcName || project.pc_name) };
    for (const field of FIELDS) {
      const value = asText(field, given[field.key]);
      if (value) out[field.key] = { value, label: field.label };
    }
    return out;
  }

  // The builder's details the subcontractor has changed: [{ key, label, set, now }]. A detail it
  // emptied counts as changed; one the page does not give at all does not. Nothing the builder did
  // not set is listed.
  function overridesOf(builderSet, page) {
    const out = [];
    for (const field of FIELDS) {
      const set = builderSet && builderSet[field.key];
      if (!set || (page || {})[field.key] === undefined) continue;
      const now = asText(field, (page || {})[field.key]);
      if (!same(field, now, set.value)) out.push({ key: field.key, label: field.label, set: set.value, now });
    }
    return out;
  }

  // The page every SWMS of the list shares, merged as above. page is what the subcontractor last had,
  // seen the builder's details as they were then ({ key: value }), company the subcontractor's own.
  // Returns the page and the builder's details as now seen.
  function mergePage({ company, builderSet, page, seen }) {
    const out = { ...(page || {}) };
    for (const key of COMPANY_KEYS) delete out[key];
    const before = seen || {};
    for (const field of FIELDS) {
      const set = builderSet && builderSet[field.key];
      if (!set) continue;
      const had = out[field.key];
      // Never given, or as the builder had set it: the builder's detail as it is now.
      const untouched = had === undefined || (!asText(field, had) && before[field.key] === undefined) || same(field, had, before[field.key]);
      if (untouched) out[field.key] = field.list ? linesOf(set.value) : set.value;
    }
    const own = companyDetails(company);
    return { page: { ...out, ...own }, seen: Object.fromEntries(Object.entries(builderSet || {}).map(([key, set]) => [key, set.value])) };
  }

  // The company's own details, as a SWMS's input names them.
  function companyDetails(company) {
    const c = company || {};
    return { company: String(c.name || '').trim(), companyAbn: String(c.abn || '').trim(), companyAddress: String(c.address || '').trim(), companyPhone: String(c.phone || '').trim(), companyEmail: String(c.email || '').trim() };
  }

  // Anything a page or a SWMS's input holds of a company, taken out before it is kept for a list: the
  // company's details come from its own profile each time.
  function withoutCompany(values) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) return values;
    const out = { ...values };
    for (const key of COMPANY_KEYS) delete out[key];
    return out;
  }

  // The warning under a builder's detail that was changed (plan section D).
  function changedWarning(builder, set) {
    return `This was set by ${builder}. They asked all contractors to use: "${String(set).replace(/\n/g, '; ')}". ${builder} will see this change when you submit.`;
  }

  // A name with its possessive: "Marlowe Ridge Builders'" for a name ending in s, else "Corbel's" (messy
  // round 7: "Marlowe Ridge Builders's list").
  const possessive = (name) => { const text = String(name || '').trim(); return /s$/i.test(text) ? `${text}'` : `${text}'s`; };

  const api = { FIELDS, KEYS, COMPANY_KEYS, builderSetOf, overridesOf, mergePage, companyDetails, withoutCompany, changedWarning, linesOf, asText, same, fieldOf, possessive };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteWriteBuilderSet = api;
})(typeof window !== 'undefined' ? window : globalThis);
