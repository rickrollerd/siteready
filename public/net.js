// Lost signal on site (goal 7). When a request fails because there is no signal, the page says so in
// plain words instead of nothing or "Failed to fetch", and the request waits. Try again (or the
// phone getting signal back) sends it again; Close gives up and the page shows the same plain
// message where it shows its other errors. Address, step and ABN look-ups made while typing do not
// wait: they fail quietly, as they do now.
(() => {
  const native = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
  if (!native || window.siteReadyNet) return;
  const script = document.currentScript;
  const MESSAGE = (script && script.dataset.message) || 'No signal. Your work is kept on this phone; try again when you have signal.';
  const QUIET = /\/api\/(address|steps\/search|abn)(\?|$)/;
  const waiting = [];
  let bar = null;

  // Browsers word a failed connection differently: Chrome "Failed to fetch", Safari "Load failed"
  // (older Safari "The network connection was lost."), Firefox "NetworkError when attempting to
  // fetch resource". A mistake in the page's own request is not mistaken for no signal.
  function noSignal(error) {
    if (!error || error.name === 'AbortError') return false;
    if (navigator.onLine === false) return true;
    return error.name === 'TypeError' && /^failed to fetch$|^load failed$|^networkerror|network connection was lost|internet connection appears to be offline/i.test(String(error.message || '').trim());
  }

  const plainError = () => Object.assign(new Error(MESSAGE), { noSignal: true });

  function show() {
    if (!bar) {
      const style = document.createElement('style');
      style.textContent = `.net-bar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 100; background: #fff4d1; color: #1c2430; border-top: 2px solid #c77700; padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); box-shadow: 0 -4px 16px rgba(0,0,0,0.15); font-size: 16px; line-height: 1.4; }
        .net-bar p { margin: 0 auto 10px; max-width: 760px; font-weight: 600; }
        .net-bar div { display: flex; gap: 8px; max-width: 760px; margin: 0 auto; }
        .net-bar button { min-height: 44px; min-width: 44px; padding: 10px 16px; border-radius: 6px; font: inherit; font-weight: 600; cursor: pointer; border: 1px solid #1f4e3d; }
        .net-bar .net-retry { background: #1f4e3d; color: #fff; flex: 1 1 auto; }
        .net-bar .net-close { background: #fff; color: #1f4e3d; }
        body.net-waiting { padding-bottom: 140px; }
        @media print { .net-bar { display: none; } }`;
      document.head.appendChild(style);
      bar = document.createElement('div');
      bar.className = 'net-bar';
      bar.setAttribute('role', 'alert');
      bar.innerHTML = `<p></p><div><button type="button" class="net-retry">Try again</button><button type="button" class="net-close">Close</button></div>`;
      bar.querySelector('p').textContent = MESSAGE;
      bar.querySelector('.net-retry').addEventListener('click', retry);
      bar.querySelector('.net-close').addEventListener('click', giveUp);
    }
    if (!bar.isConnected) document.body.appendChild(bar);
    document.body.classList.add('net-waiting');
  }

  function hide() {
    if (bar && bar.isConnected) bar.remove();
    document.body.classList.remove('net-waiting');
  }

  async function guarded(input, init) {
    try {
      return await native(input, init);
    } catch (error) {
      if (!noSignal(error)) throw error;
      if (QUIET.test(String(input && input.url ? input.url : input))) throw plainError();
      return new Promise((resolve, reject) => {
        waiting.push({ input, init, resolve, reject });
        show();
      });
    }
  }

  // Each waiting request is sent again; one that fails again waits again.
  function retry() {
    const list = waiting.splice(0);
    hide();
    list.forEach((item) => guarded(item.input, item.init).then(item.resolve, item.reject));
  }

  function giveUp() {
    const list = waiting.splice(0);
    hide();
    list.forEach((item) => item.reject(plainError()));
  }

  // A worker's sign-on details kept on this phone (sign-keep.js) are removed 24 hours after they
  // were first kept, when any page with this script opens.
  const SIGNON_PREFIX = 'siteready.signon.';
  const SIGNON_HOURS = 24;
  function purgeSignOns(now = Date.now()) {
    let store = null;
    try { store = window.localStorage; } catch { return; }
    if (!store || typeof store.key !== 'function') return;
    try {
      for (let i = store.length - 1; i >= 0; i -= 1) {
        const key = store.key(i);
        if (!key || !key.startsWith(SIGNON_PREFIX)) continue;
        let kept = 0;
        try { kept = Number(JSON.parse(store.getItem(key)).kept) || 0; } catch { kept = 0; }
        if (!(now - kept < SIGNON_HOURS * 60 * 60 * 1000)) store.removeItem(key);
      }
    } catch { /* storage not readable */ }
  }

  // The offline page (sw.js): a page opened or reloaded with no signal shows SiteReady's own
  // "No signal" page instead of the browser's error. Not in the phone app shells.
  function registerOffline() {
    try {
      if (!('serviceWorker' in navigator) || window.Capacitor || window.isSecureContext === false) return;
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {});
    } catch { /* not supported */ }
  }

  window.fetch = guarded;
  window.addEventListener('online', () => { if (waiting.length) retry(); });
  purgeSignOns();
  if (document.readyState === 'complete') registerOffline();
  else window.addEventListener('load', registerOffline);
  window.siteReadyNet = { MESSAGE, noSignal, waiting: () => waiting.length, retry, giveUp, purgeSignOns };
})();
