// What a worker has read and typed on the sign-on page is kept on their phone (goal 7), so a
// reload or lost signal does not lose it: the read (so its time and questions carry on), how long
// each section was on screen, where they were on the page, the answers, name, company, supervisor,
// the ticks and the signature. A worker's details are kept no longer than needed: removed once
// they have signed on, when the link is no longer valid, and 24 hours after they were first kept
// (net.js removes old ones when any SiteReady page opens).
(() => {
  if (window.siteReadySignKeep) return;
  const PREFIX = 'siteready.signon.';
  const HOURS = 24;
  const keyFor = (token) => PREFIX + String(token || '').slice(0, 128);
  const fresh = (state, now) => Boolean(state) && Number(state.kept) > 0 && now - Number(state.kept) < HOURS * 60 * 60 * 1000;

  function storage() {
    try { return window.localStorage || null; } catch { return null; }
  }

  function clear(token) {
    try { storage().removeItem(keyFor(token)); } catch { /* nothing kept */ }
  }

  // The kept sign-on for this link, or null. One past its 24 hours is removed, not used.
  function read(token, now = Date.now()) {
    let state = null;
    try { state = JSON.parse(storage().getItem(keyFor(token)) || 'null'); } catch { state = null; }
    if (state && fresh(state, now) && typeof state === 'object') return state;
    if (state) clear(token);
    return null;
  }

  // A phone short of space keeps the rest without the signature drawing.
  function write(token, state) {
    const store = storage();
    if (!store || !token) return false;
    try {
      store.setItem(keyFor(token), JSON.stringify(state));
      return true;
    } catch {
      try {
        store.setItem(keyFor(token), JSON.stringify({ ...state, signature: '' }));
        return true;
      } catch {
        return false;
      }
    }
  }

  window.siteReadySignKeep = { PREFIX, HOURS, fresh, read, write, clear };
})();
