// The offline page (goal 7). When a SiteReady page is opened or reloaded with no signal, the
// phone shows SiteReady's own page saying so, and that typed work is kept, instead of the
// browser's error. Only that page is kept here: never the server's answers or anything personal.
// With signal every page comes from the server as before, so a page is never shown from an old
// copy. The server writes the version below from this file and the files it keeps (delivery.js),
// so a release that changes any of them installs afresh and removes the old copy.
const VERSION = '__SHELL_VERSION__';
const PREFIX = 'siteready-shell-';
const CACHE = `${PREFIX}${VERSION}`;
const OFFLINE = '/offline.html';
const SHELL = ['/offline.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE)
    .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((names) => Promise.all(names.filter((name) => name.startsWith(PREFIX) && name !== CACHE).map((name) => caches.delete(name))))
    .then(() => self.clients.claim()));
});

// Only opening a page is handled, and only when the server cannot be reached. The server's
// answers and downloads (/api) and everything a page loads go straight through, untouched.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(request).catch(async () => {
    const page = (await caches.match(OFFLINE, { cacheName: CACHE })) || (await caches.match(OFFLINE));
    return page || Response.error();
  }));
});
