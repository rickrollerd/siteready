// The high risk construction work (HRCW) flag of a work package read from a scope, in the words
// the package list, the task cards and the scope review report all use. The flag itself is worked
// out on the server by the SWMS's own rules (draft.js screenHighRisk). Used by the browser and the
// report.
(function (root) {
  // Said once, above the work packages on the page and in the report.
  const HRCW_NOTE = 'Each work package says whether its work is high risk construction work, which needs a SWMS by law. SiteReady works this out with the same rules it uses for the SWMS. Where the scope does not say enough, such as a height or a depth, the SWMS questions will confirm it.';

  // flag: { categories: [{ short, likely, dependsOn }], dependsOn: [{ short, on }], offSite }
  function hrcwSummary(flag) {
    const categories = (flag && flag.categories) || [];
    const depends = (flag && flag.dependsOn) || [];
    const named = [
      ...categories.map((item) => (item.likely ? `${item.short}, depending on ${item.dependsOn}` : item.short)),
      ...depends.map((item) => `${item.short}, depending on ${item.on}`),
    ];
    const list = named.join('; ');
    if (categories.some((item) => !item.likely)) {
      return { status: 'yes', tag: 'High risk', heading: 'This work needs a SWMS by law', lines: [`It is high risk construction work (${list})`] };
    }
    if (categories.length) {
      return { status: 'likely', tag: 'Likely high risk', heading: 'This work probably needs a SWMS by law', lines: [`It is likely to be high risk construction work (${list})`, 'The SWMS questions will confirm it'] };
    }
    if (depends.length) {
      return { status: 'depends', tag: 'May be high risk', heading: 'This work may need a SWMS by law', lines: [`It could be high risk construction work (${list})`, 'The SWMS questions will confirm it'] };
    }
    if (flag && flag.offSite) {
      return { status: 'none', tag: '', heading: 'Off-site work does not need a SWMS by law', lines: ['The builder may still ask for one for any of it done on site'] };
    }
    return { status: 'none', tag: '', heading: 'This work may not need a SWMS by law', lines: ['No high risk construction work was found in it', 'The builder may still ask for a SWMS, and its SWMS still asks about falls from height'] };
  }

  const api = { hrcwSummary, HRCW_NOTE };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteReadyHrcw = api;
})(typeof window !== 'undefined' ? window : globalThis);
