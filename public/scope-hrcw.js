// The high risk construction work (HRCW) flag of a work package read from a scope, in the words
// the package list, the task cards and the scope review report all use. The flag itself is worked
// out on the server by the SWMS's own rules (draft.js screenHighRisk). Used by the browser and the
// report.
(function (root) {
  // Said once, above the work packages on the page and in the report.
  const HRCW_NOTE = 'Each work package shows the high risk construction work its work involves, worked out by the same rules its SWMS uses. High risk construction work needs a SWMS by law. Where a package says likely or depends on, the scope does not say enough (a height, a depth, traffic), and the SWMS questions settle it.';

  // flag: { categories: [{ short, likely, dependsOn }], dependsOn: [{ short, on }], offSite }
  function hrcwSummary(flag) {
    const categories = (flag && flag.categories) || [];
    const depends = (flag && flag.dependsOn) || [];
    const lines = [
      ...categories.map((item) => (item.likely ? `${item.short}: likely, depends on ${item.dependsOn}` : item.short)),
      ...depends.map((item) => `${item.short}: depends on ${item.on}`),
    ];
    if (categories.some((item) => !item.likely)) {
      return { status: 'yes', tag: 'High risk', heading: 'High risk construction work: a SWMS is required by law', lines };
    }
    if (categories.length) {
      return { status: 'likely', tag: 'Likely high risk', heading: 'Likely high risk construction work: if it is, a SWMS is required by law. The SWMS questions settle it', lines };
    }
    if (depends.length) {
      return { status: 'depends', tag: 'May be high risk', heading: 'May be high risk construction work. The SWMS questions settle it', lines };
    }
    if (flag && flag.offSite) {
      return { status: 'none', tag: '', heading: 'Off-site work: not high risk construction work', lines: ['A SWMS may still be required by the principal contractor for any of it done on site.'] };
    }
    return { status: 'none', tag: '', heading: 'No high risk construction work found in this work', lines: ['Its SWMS still asks about falls from height.', 'A SWMS may still be required by the principal contractor.'] };
  }

  const api = { hrcwSummary, HRCW_NOTE };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteReadyHrcw = api;
})(typeof window !== 'undefined' ? window : globalThis);
