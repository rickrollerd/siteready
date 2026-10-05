// The task for a work package the AI read from a scope of works. Each activity keeps where
// it is done, its conditions and its plant, so the high risk check sees "near roads",
// "energised switchboards" or "road sweeper". Used by the browser and the tests.
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

  const api = { packageTask };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteReadyScopeTask = api;
})(typeof window !== 'undefined' ? window : globalThis);
