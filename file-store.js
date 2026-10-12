// Where the original of each kept SWMS is stored (checked-swms.js). In production it goes in a
// storage bucket (S3-compatible, a Railway bucket; owner decision D215). Without the bucket's
// settings, production keeps no originals (the text and check result are still kept) and says so in
// the log at start. Local copies, tests and staging without a bucket use Postgres instead, as the
// logo is kept today, up to a size cap.
//
// A Railway bucket's Credentials tab gives BUCKET, ACCESS_KEY_ID, SECRET_ACCESS_KEY, REGION and
// ENDPOINT. The app reads them under its own names, set as references to the bucket's, so they cannot
// be mixed up with any other service's: CHECKED_SWMS_BUCKET, CHECKED_SWMS_BUCKET_KEY_ID,
// CHECKED_SWMS_BUCKET_SECRET, CHECKED_SWMS_BUCKET_REGION and CHECKED_SWMS_BUCKET_ENDPOINT, and
// CHECKED_SWMS_BUCKET_PATH_STYLE=on for a bucket the Credentials tab says uses path-style URLs.
//
// Requests to the bucket are signed here (AWS signature version 4), so no storage library is needed.
const crypto = require('crypto');
const db = require('./db');
const { isProduction } = require('./secret-keys');

// Postgres holds an original only up to this size (5 MB unless set). A larger one is not kept
// without a bucket; its text and check result still are.
const DB_MAX_MB = 5;
const dbMaxBytes = () => {
  const mb = Number(process.env.KEEP_CHECKED_SWMS_DB_MAX_MB);
  return Math.round((Number.isFinite(mb) && mb > 0 ? mb : DB_MAX_MB) * 1024 * 1024);
};

function bucketSettings() {
  const value = (name) => String(process.env[name] || '').trim();
  const settings = {
    bucket: value('CHECKED_SWMS_BUCKET'),
    keyId: value('CHECKED_SWMS_BUCKET_KEY_ID'),
    secret: value('CHECKED_SWMS_BUCKET_SECRET'),
    region: value('CHECKED_SWMS_BUCKET_REGION') || 'auto',
    endpoint: value('CHECKED_SWMS_BUCKET_ENDPOINT').replace(/\/+$/, ''),
    pathStyle: value('CHECKED_SWMS_BUCKET_PATH_STYLE').toLowerCase() === 'on',
  };
  return settings.bucket && settings.keyId && settings.secret && /^https?:\/\//.test(settings.endpoint) ? settings : null;
}
const bucketConfigured = () => Boolean(bucketSettings());

// ---- Signing a request (AWS signature version 4, as S3 and Railway buckets expect) ----

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, text) => crypto.createHmac('sha256', key).update(text).digest();

// The Authorization header for a request. headers: every header to sign, host included, with lower
// case names; x-amz-date and x-amz-content-sha256 among them.
function signature({ method, path, query = '', headers, region, keyId, secret }) {
  const names = Object.keys(headers).map((name) => name.toLowerCase()).sort();
  const canonicalHeaders = names.map((name) => `${name}:${String(headers[name]).trim()}\n`).join('');
  const signedHeaders = names.join(';');
  const canonical = [method, path, query, canonicalHeaders, signedHeaders, headers['x-amz-content-sha256']].join('\n');
  const amzDate = headers['x-amz-date'];
  const scope = `${amzDate.slice(0, 8)}/${region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${secret}`, amzDate.slice(0, 8)), region), 's3'), 'aws4_request');
  const signed = crypto.createHmac('sha256', key).update(toSign).digest('hex');
  return `AWS4-HMAC-SHA256 Credential=${keyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signed}`;
}

// One request to the bucket for an object. Throws on any answer but 2xx (and 404 for a delete).
async function bucketRequest(method, objectKey, body = null, contentType = '') {
  const s = bucketSettings();
  if (!s) throw new Error('The storage bucket is not set up.');
  const endpoint = new URL(s.endpoint);
  const encoded = objectKey.split('/').map(encodeURIComponent).join('/');
  const host = s.pathStyle ? endpoint.host : `${s.bucket}.${endpoint.host}`;
  const path = s.pathStyle ? `/${encodeURIComponent(s.bucket)}/${encoded}` : `/${encoded}`;
  const payload = body || Buffer.alloc(0);
  const headers = {
    host,
    'x-amz-content-sha256': sha256(payload),
    'x-amz-date': new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''),
  };
  const authorization = signature({ method, path, headers, region: s.region, keyId: s.keyId, secret: s.secret });
  const response = await fetch(`${endpoint.protocol}//${host}${path}`, {
    method,
    headers: { ...headers, authorization, ...(contentType ? { 'content-type': contentType } : {}) },
    body: body || undefined,
  });
  if (method === 'DELETE' && response.status === 404) return null;
  // The bucket's own words never reach a person: only the status is passed on.
  if (!response.ok) throw new Error(`The storage bucket answered ${response.status}.`);
  return method === 'GET' ? Buffer.from(await response.arrayBuffer()) : null;
}

const objectKey = (id) => `checked-swms/${id}`;

// Stores one original. Returns where it went: { storage: 'bucket' | 'database' | 'none', note }.
async function putFile(id, data, contentType) {
  if (bucketConfigured()) {
    await bucketRequest('PUT', objectKey(id), data, contentType);
    return { storage: 'bucket', note: '' };
  }
  if (isProduction()) return { storage: 'none', note: 'Original not kept: the storage bucket is not set up (CHECKED_SWMS_BUCKET and its settings).' };
  if (data.length > dbMaxBytes()) {
    return { storage: 'none', note: `Original not kept: ${Math.round(data.length / 1024)} KB is over the ${Math.round(dbMaxBytes() / 1024)} KB the database holds without a storage bucket.` };
  }
  await db.query('INSERT INTO checked_swms_files (swms_id, data) VALUES ($1, $2) ON CONFLICT (swms_id) DO UPDATE SET data = $2', [id, data.toString('base64')]);
  return { storage: 'database', note: '' };
}

// The original as stored, or null when it is not held.
async function getFile(id, storage) {
  if (storage === 'bucket') return bucketRequest('GET', objectKey(id));
  if (storage === 'database') {
    const row = await db.one('SELECT data FROM checked_swms_files WHERE swms_id = $1', [id]);
    return row ? Buffer.from(row.data, 'base64') : null;
  }
  return null;
}

// Removes one original, wherever it is. Safe to run again.
async function removeFile(id, storage) {
  if (storage === 'bucket') await bucketRequest('DELETE', objectKey(id));
  await db.query('DELETE FROM checked_swms_files WHERE swms_id = $1', [id]);
}

// The line the server logs at start when keeping is on in production without a bucket, or null.
function storageProblem() {
  return isProduction() && !bucketConfigured()
    ? 'KEEP_CHECKED_SWMS is on but the storage bucket is not set up (CHECKED_SWMS_BUCKET, CHECKED_SWMS_BUCKET_KEY_ID, CHECKED_SWMS_BUCKET_SECRET, CHECKED_SWMS_BUCKET_ENDPOINT): originals of checked SWMS are not kept, only their text and results.'
    : null;
}

module.exports = { storageProblem, bucketConfigured, bucketSettings, putFile, getFile, removeFile, signature, dbMaxBytes, DB_MAX_MB };
