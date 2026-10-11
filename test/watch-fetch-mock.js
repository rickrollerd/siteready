// Loaded with --require by test/legislation-watch.test.js: the watch's page requests are answered
// from WATCH_MOCK (a JSON file of address to page), so a mock change is run without the internet.
const fs = require('fs');

// node --test also loads this file on its own, without WATCH_MOCK: then it does nothing.
if (process.env.WATCH_MOCK) {
  const pages = JSON.parse(fs.readFileSync(process.env.WATCH_MOCK, 'utf8'));
  globalThis.fetch = async (url) => {
    const body = pages[String(url)];
    if (body == null) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => body };
  };
}
