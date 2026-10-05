// The pop-up that lists the clauses the AI found in conflict, with advice to raise them with
// the builder and a button for the scope review report. It does not block the page: the tasks
// stay usable while it is open. Used by the browser and the tests.
(function (root) {
  const esc = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const ADVICE = 'Raise each of these with the builder before you price or start the work. Ask which clause applies, and get the answer in writing.';

  // The dialog's HTML, or '' when there are no conflicts.
  function conflictDialog(conflicts) {
    const list = (conflicts || []).filter(Boolean);
    if (!list.length) return '';
    const title = list.length === 1 ? 'Two clauses in the scope conflict' : `${list.length} conflicts between clauses in the scope`;
    return `<dialog class="conflict-dialog" id="conflict-dialog" aria-labelledby="conflict-dialog-title" aria-describedby="conflict-dialog-advice">
  <h2 id="conflict-dialog-title" tabindex="-1">${title}</h2>
  <p id="conflict-dialog-advice">${ADVICE}</p>
  <ol class="conflict-list">${list.map((item) => `
    <li>
      <p><strong>Clause A${item.clauseA ? ` (${esc(item.clauseA)})` : ''} says:</strong> "${esc(item.quoteA)}"</p>
      <p><strong>Clause B${item.clauseB ? ` (${esc(item.clauseB)})` : ''} says:</strong> "${esc(item.quoteB)}"</p>
      <p><strong>Why this matters:</strong> ${esc(item.why)}</p>
      <p><strong>Confidence:</strong> ${esc(item.confidence || 'Not given')}</p>
    </li>`).join('')}
  </ol>
  <div class="actions">
    <button type="button" data-scope-report>Download the scope review report (Word)</button>
    <button type="button" class="secondary" data-conflict-close>Close</button>
  </div>
</dialog>`;
  }

  const api = { conflictDialog, ADVICE };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteReadyConflicts = api;
})(typeof window !== 'undefined' ? window : globalThis);
