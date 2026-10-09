// Sending the page and the server's answers quickly over mobile data (goal 7). Text is compressed
// (Brotli, or gzip for older browsers), and the browser keeps what it can:
// - the page's scripts are named with a fingerprint of their content (app.js?v=1a2b3c4d), so a
//   phone keeps them for a year and fetches them again only when they change;
// - the pages themselves are checked again on every visit (a short "not changed" answer);
// - icons are kept for a day;
// - the server's own answers are not kept unless the route says so, as most are a person's own.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const TEXT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};
// Below this size compressing saves less than it costs.
const MIN_BYTES = 1024;
const YEAR = 'public, max-age=31536000, immutable';
const REVALIDATE = 'no-cache';
const DAY = 'public, max-age=86400';
// Where the service worker's version goes (sw.js).
const SHELL_MARK = '__SHELL_VERSION__';

// The encoding to send: Brotli where the browser takes it, else gzip, else none.
function pickEncoding(req) {
  const accept = String(req.headers['accept-encoding'] || '').toLowerCase();
  const takes = (name) => new RegExp(`(^|,)\\s*${name}\\s*(;\\s*q=(?!0(\\.0*)?\\s*(,|$))[\\d.]+)?\\s*(,|$)`).test(accept);
  if (takes('br')) return 'br';
  if (takes('gzip')) return 'gzip';
  return '';
}

function compress(buffer, encoding, { quick = false } = {}) {
  if (encoding === 'br') {
    return zlib.brotliCompressSync(buffer, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: quick ? 5 : 11,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buffer.length,
      },
    });
  }
  return zlib.gzipSync(buffer, { level: quick ? 6 : 9 });
}

const fingerprint = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 12);

// The public folder's text files, read once and kept with their compressed forms until the file
// changes on disk.
function staticFiles(root) {
  const base = path.resolve(root);
  const cache = new Map();

  function fileFor(urlPath) {
    let name;
    try { name = decodeURIComponent(urlPath); } catch { return null; }
    if (name.endsWith('/')) name += 'index.html';
    if (name.includes('\0') || name.split('/').some((part) => part.startsWith('.'))) return null;
    const full = path.resolve(base, `.${name}`);
    if (!full.startsWith(base + path.sep)) return null;
    return TEXT_TYPES[path.extname(full).toLowerCase()] ? full : null;
  }

  // Reads a file, or gives the kept copy when the file has not changed.
  function load(full) {
    let stat;
    try { stat = fs.statSync(full); } catch { return null; }
    if (!stat.isFile()) return null;
    const kept = cache.get(full);
    if (kept && kept.mtimeMs === stat.mtimeMs && kept.size === stat.size && depsCurrent(kept)) return kept;
    let body = fs.readFileSync(full);
    const deps = {};
    // Each page names its scripts and styles with their fingerprint, so a changed file is a new
    // address and the year-long keep never serves an old copy.
    if (full.endsWith('.html')) {
      body = Buffer.from(body.toString('utf8').replace(/(<(?:script|link)\b[^>]*?\b(?:src|href)=")(\/[A-Za-z0-9._/-]+\.(?:js|css))(")/g, (whole, before, ref, after) => {
        const dep = fileFor(ref);
        const entry = dep && dep !== full ? load(dep) : null;
        if (!entry) return whole;
        deps[dep] = entry.version;
        return `${before}${ref}?v=${entry.version}${after}`;
      }));
    }
    // The offline page's service worker (sw.js) is given its version: a fingerprint of itself and
    // the files it keeps, so a release that changes any of them replaces the phone's kept copy.
    if (full.endsWith('.js') && body.includes(SHELL_MARK)) {
      const text = body.toString('utf8');
      const list = (/\bSHELL\s*=\s*\[([^\]]*)\]/.exec(text) || [])[1] || '';
      const parts = [text];
      for (const [, ref] of list.matchAll(/'(\/[A-Za-z0-9._/-]+)'/g)) {
        const dep = fileFor(ref);
        const shellFile = dep && dep !== full ? load(dep) : null;
        if (!shellFile) continue;
        deps[dep] = shellFile.version;
        parts.push(shellFile.version);
      }
      body = Buffer.from(text.split(SHELL_MARK).join(fingerprint(parts.join('\n'))));
    }
    const entry = {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      body,
      deps,
      version: fingerprint(body),
      type: TEXT_TYPES[path.extname(full).toLowerCase()],
      encoded: {},
    };
    entry.etag = `"${entry.version}"`;
    cache.set(full, entry);
    return entry;
  }

  function depsCurrent(entry) {
    return Object.entries(entry.deps).every(([dep, version]) => {
      const now = load(dep);
      return now && now.version === version;
    });
  }

  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const full = fileFor(req.path);
    const entry = full && load(full);
    if (!entry) return next();
    const html = entry.type.startsWith('text/html');
    const versioned = req.query && req.query.v === entry.version;
    const encoding = entry.body.length >= MIN_BYTES ? pickEncoding(req) : '';
    res.setHeader('Content-Type', entry.type);
    res.setHeader('ETag', encoding ? `"${entry.version}-${encoding}"` : entry.etag);
    res.setHeader('Cache-Control', versioned ? YEAR : html || /\.(js|css|json|webmanifest)$/.test(full) ? REVALIDATE : DAY);
    res.setHeader('Vary', 'Accept-Encoding');
    if (req.fresh) return res.status(304).end();
    let body = entry.body;
    if (encoding) {
      if (!entry.encoded[encoding]) entry.encoded[encoding] = compress(entry.body, encoding);
      // Compressing a tiny file can make it bigger; then it goes as it is.
      if (entry.encoded[encoding].length < entry.body.length) {
        body = entry.encoded[encoding];
        res.setHeader('Content-Encoding', encoding);
      }
    }
    res.setHeader('Content-Length', body.length);
    if (req.method === 'HEAD') return res.end();
    return res.end(body);
  };
}

// Images and other files the text handler leaves: kept for a day.
const staticOptions = { setHeaders: (res) => res.setHeader('Cache-Control', DAY) };

const COMPRESSIBLE = /^(application\/(json|javascript|xml|manifest\+json)|text\/|image\/svg\+xml)/i;

// The server's answers. JSON and text bodies are compressed. Nothing is kept by the browser or a
// proxy unless the route sets its own Cache-Control, because most answers are a person's own SWMS,
// account or sign-on.
function apiResponses(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  const send = res.send;
  res.send = function sendCompressed(body) {
    // res.json sends a string, and res.send calls itself again for objects; both reach here.
    const text = typeof body === 'string' || Buffer.isBuffer(body);
    const type = String(this.getHeader('Content-Type') || (typeof body === 'string' ? 'text/html' : ''));
    const size = text ? Buffer.byteLength(body) : 0;
    if (!text || size < MIN_BYTES || !COMPRESSIBLE.test(type) || this.getHeader('Content-Encoding') || req.method === 'HEAD' || this.statusCode === 204 || this.statusCode === 304) {
      return send.call(this, body);
    }
    this.vary('Accept-Encoding');
    const encoding = pickEncoding(req);
    if (!encoding) return send.call(this, body);
    const raw = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
    // The ETag is taken from the uncompressed answer, so a repeat request can still get "not changed".
    if (!this.getHeader('ETag') && req.method === 'GET') this.setHeader('ETag', `W/"${fingerprint(raw)}-${encoding}"`);
    if (req.method === 'GET' && req.fresh) {
      this.removeHeader('Content-Type');
      return this.status(304).end();
    }
    if (typeof body === 'string' && !/charset=/i.test(type)) this.setHeader('Content-Type', `${type}; charset=utf-8`);
    this.setHeader('Content-Encoding', encoding);
    return send.call(this, compress(raw, encoding, { quick: true }));
  };
  next();
}

module.exports = { staticFiles, staticOptions, apiResponses, pickEncoding, MIN_BYTES, SHELL_MARK };
