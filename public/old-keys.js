// The app was called SiteReady until October 2026 (owner D299). What a browser kept under the old
// names (the sign-in, work not yet saved, the project, the company profile, a worker's sign-on not yet
// sent) is moved once to the SiteWrite names before any other script reads it, so the change of name
// signs no one out and loses no work. A key already kept under the new name is not overwritten. Should
// storage be off or full, the old key stays where it is.
(function moveOldKeys(root) {
  const OLD = /^siteready([.-])/;
  let store = null;
  try { store = root.localStorage; } catch { return; }
  if (!store) return;
  const keys = [];
  try { for (let i = 0; i < store.length; i += 1) keys.push(store.key(i)); } catch { return; }
  for (const key of keys) {
    if (!OLD.test(String(key || ''))) continue;
    const next = String(key).replace(OLD, 'sitewrite$1');
    try {
      if (store.getItem(next) === null) store.setItem(next, store.getItem(key));
      store.removeItem(key);
    } catch { /* kept under the old name */ }
  }
}(typeof window !== 'undefined' ? window : globalThis));
