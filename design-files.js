// Files of the designs a SWMS relies on (designs.js; owner, 11 October 2026): the engineer's or
// temporary works design as a PDF, PNG or JPEG, up to 10 MB, kept with the saved SWMS revision that
// names it, so the business and its reviewer can open it from the SWMS. The file is optional: the
// design's number, revision, author and date are what print.
//
// Where the file goes (owner decision D215): an S3-compatible storage bucket (a Railway bucket) when
// its settings are present; otherwise, for tests and local runs, Postgres, as the company logo is
// kept. Production without the bucket takes no files (the page says so) rather than filling the
// database. The bucket's settings, under the app's own names (set them as references to the
// Railway bucket's BUCKET, ACCESS_KEY_ID, SECRET_ACCESS_KEY, REGION and ENDPOINT):
//   DESIGN_FILES_BUCKET, DESIGN_FILES_BUCKET_KEY_ID, DESIGN_FILES_BUCKET_SECRET,
//   DESIGN_FILES_BUCKET_REGION (default auto), DESIGN_FILES_BUCKET_ENDPOINT, and
//   DESIGN_FILES_BUCKET_PATH_STYLE=on for a bucket that uses path-style addresses.
// The same bucket serves the kept checked SWMS (file-store.js) under their own prefix: objects here are
// under design-files/, signed with file-store.js's request signing.
//
// A file is checked by its content, not its name: the first bytes must be a PDF, PNG or JPEG, the
// image must read as one, and a PDF must not carry scripts, launch actions or embedded files. It is
// sent back only to signed-in users of the business that uploaded it, never by a public link.
//
// Files stay while any saved revision of the business's SWMS names them (design_file_uses). A file
// uploaded but never saved with a SWMS goes after 7 days; a file whose SWMS are all removed (30 days
// after deletion) goes with them; all of a business's files go when the business is deleted
// (business-removal.js).
const crypto = require('crypto');
const db = require('./db');
const { isProduction } = require('./secret-keys');

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_MB = 10;
const UNSAVED_DAYS = 7;
const TYPES = { pdf: 'application/pdf', png: 'image/png', jpeg: 'image/jpeg' };
const EXTENSION = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg' };
const fail = (status, message) => Object.assign(new Error(message), { status, publicMessage: true });

// ---- What the file is, read from its bytes ----

function pngReads(data) {
  if (data.length < 33 || data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || data.subarray(12, 16).toString('ascii') !== 'IHDR') return false;
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  return width > 0 && height > 0 && width <= 30000 && height <= 30000 && data.includes(Buffer.from('IEND'));
}
function jpegReads(data) {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) return false;
  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) return false;
    const marker = data[offset + 1];
    if (marker === 0xff) { offset += 1; continue; }
    // A start of frame marker carries the image's height and width.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return data.readUInt16BE(offset + 5) > 0 && data.readUInt16BE(offset + 7) > 0;
    offset += 2 + data.readUInt16BE(offset + 2);
  }
  return false;
}
// PDF actions that run or open something when the file is viewed. A design drawing has none.
const PDF_ACTIVE = /\/(?:JavaScript|JS|Launch|EmbeddedFiles?|RichMedia|SubmitForm|ImportData)\b/;
function pdfReads(data) {
  if (data.length < 64 || data.subarray(0, 5).toString('latin1') !== '%PDF-') return false;
  return data.subarray(Math.max(0, data.length - 2048)).toString('latin1').includes('%%EOF');
}

// The file's type from its content: 'application/pdf', 'image/png' or 'image/jpeg', or a refusal.
function checkFile(data) {
  if (!Buffer.isBuffer(data) || !data.length) throw fail(400, 'The file is empty. Choose the design file again.');
  if (data.length > MAX_BYTES) throw fail(413, `The file is larger than ${MAX_MB} MB. Attach a smaller copy (for example the drawing sheets only), or give the reference without the file.`);
  if (pdfReads(data)) {
    if (PDF_ACTIVE.test(data.toString('latin1'))) throw fail(415, 'This PDF has scripts, actions or embedded files in it, so SiteReady does not keep it. Save it again as a plain PDF (print to PDF), or give the reference without the file.');
    return TYPES.pdf;
  }
  if (pngReads(data)) return TYPES.png;
  if (jpegReads(data)) return TYPES.jpeg;
  throw fail(415, 'This file is not a PDF, PNG or JPEG that SiteReady can read. Attach the design as a PDF or a photo, or give the reference without the file.');
}

// A file name to keep: no path, no control characters, the right ending for its type.
function fileName(name, type) {
  const base = String(name || '').replace(/^.*[\\/]/, '').replace(/[\u0000-\u001f\u007f"<>|*?:]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150) || 'Design';
  const extension = EXTENSION[type];
  return new RegExp(`\\.${extension === 'jpg' ? 'jpe?g' : extension}$`, 'i').test(base) ? base : `${base.replace(/\.[A-Za-z0-9]{1,5}$/, '')}.${extension}`;
}

// ---- The storage bucket (S3-compatible), or the database ----

function bucketSettings() {
  const value = (name) => String(process.env[name] || '').trim();
  const settings = {
    bucket: value('DESIGN_FILES_BUCKET'),
    keyId: value('DESIGN_FILES_BUCKET_KEY_ID'),
    secret: value('DESIGN_FILES_BUCKET_SECRET'),
    region: value('DESIGN_FILES_BUCKET_REGION') || 'auto',
    endpoint: value('DESIGN_FILES_BUCKET_ENDPOINT').replace(/\/+$/, ''),
    pathStyle: value('DESIGN_FILES_BUCKET_PATH_STYLE').toLowerCase() === 'on',
  };
  return settings.bucket && settings.keyId && settings.secret && /^https?:\/\//.test(settings.endpoint) ? settings : null;
}
const bucketConfigured = () => Boolean(bucketSettings());
// Files can be attached: with the bucket, or anywhere but production without it.
const enabled = () => bucketConfigured() || !isProduction();

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
// Requests are signed as the kept checked SWMS's are (file-store.js, AWS signature version 4).
const { signature } = require('./file-store');

// Tests replace the network call to the bucket.
let send = (url, options) => fetch(url, options);
function useBucketFetch(next) {
  send = next || ((url, options) => fetch(url, options));
}

async function bucketRequest(method, objectKey, body = null, contentType = '') {
  const s = bucketSettings();
  if (!s) throw new Error('The storage bucket is not set up.');
  const endpoint = new URL(s.endpoint);
  const encoded = objectKey.split('/').map(encodeURIComponent).join('/');
  const host = s.pathStyle ? endpoint.host : `${s.bucket}.${endpoint.host}`;
  const path = s.pathStyle ? `/${encodeURIComponent(s.bucket)}/${encoded}` : `/${encoded}`;
  const payload = body || Buffer.alloc(0);
  const headers = { host, 'x-amz-content-sha256': sha256(payload), 'x-amz-date': new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '') };
  const authorization = signature({ method, path, headers, region: s.region, keyId: s.keyId, secret: s.secret });
  const response = await send(`${endpoint.protocol}//${host}${path}`, { method, headers: { ...headers, authorization, ...(contentType ? { 'content-type': contentType } : {}) }, body: body || undefined });
  if (method === 'DELETE' && response.status === 404) return null;
  // The bucket's own words never reach a person: only the status is passed on.
  if (!response.ok) throw new Error(`The storage bucket answered ${response.status}.`);
  return method === 'GET' ? Buffer.from(await response.arrayBuffer()) : null;
}
const objectKey = (id) => `design-files/${id}`;

async function putData(id, data, type) {
  if (bucketConfigured()) {
    await bucketRequest('PUT', objectKey(id), data, type);
    return 'bucket';
  }
  await db.query('INSERT INTO design_file_data (file_id, data) VALUES ($1, $2)', [id, data.toString('base64')]);
  return 'database';
}
async function getData(row) {
  if (row.storage === 'bucket') return bucketRequest('GET', objectKey(row.id));
  const kept = await db.one('SELECT data FROM design_file_data WHERE file_id = $1', [row.id]);
  return kept ? Buffer.from(kept.data, 'base64') : null;
}
async function removeData(row) {
  if (row.storage === 'bucket') await bucketRequest('DELETE', objectKey(row.id));
  await db.query('DELETE FROM design_file_data WHERE file_id = $1', [row.id]);
}

// ---- Files of a business ----

const newId = () => `df_${crypto.randomBytes(18).toString('base64url')}`;
const view = (row) => ({ id: row.id, name: row.name, type: row.content_type, size: Number(row.size) });

// Keeps an uploaded file for the business. Returns { id, name, type, size }.
async function saveUpload({ companyId, userId, data, name }) {
  if (!enabled()) throw fail(503, 'Attaching design files is not switched on yet. Give the design\'s reference without the file.');
  const type = checkFile(data);
  const id = newId();
  const storage = await putData(id, data, type);
  const row = { id, company_id: companyId, name: fileName(name, type), content_type: type, size: data.length, sha256: sha256(data), storage, created_by: userId || '', created_at: new Date() };
  await db.query('INSERT INTO design_files (id, company_id, name, content_type, size, sha256, storage, created_by, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [row.id, row.company_id, row.name, row.content_type, row.size, row.sha256, row.storage, row.created_by, row.created_at]);
  return view(row);
}

// The file row, only for the business that holds it.
const ownFile = (companyId, id) => db.one('SELECT * FROM design_files WHERE id = $1 AND company_id = $2', [String(id || ''), companyId]);

// The file ids a SWMS input names that the business does not hold (gone, or never theirs).
async function missingFiles(companyId, input) {
  const { fileIds } = require('./designs');
  const missing = [];
  for (const id of fileIds(input)) if (!(await ownFile(companyId, id))) missing.push(id);
  return missing;
}
// Refuses a save naming a file the business does not hold, with the design it was attached to.
async function needFiles(companyId, input) {
  const missing = await missingFiles(companyId, input);
  if (!missing.length) return;
  const rows = (input.designs || []).filter((row) => row.file && missing.includes(row.file.id)).map((row) => row.what || 'a design');
  throw fail(400, `The file attached to ${rows.join('; ')} is no longer held. Attach it again, or save without the file.`);
}

// Records that a saved revision names its files, so they are kept with it.
async function recordUses(companyId, swmsId, revision, input) {
  const { fileIds } = require('./designs');
  for (const id of fileIds(input)) {
    if (!(await ownFile(companyId, id))) continue;
    const seen = await db.one('SELECT file_id FROM design_file_uses WHERE file_id = $1 AND swms_id = $2 AND revision = $3', [id, swmsId, revision]);
    if (!seen) await db.query('INSERT INTO design_file_uses (file_id, swms_id, revision, created_at) VALUES ($1, $2, $3, $4)', [id, swmsId, revision, new Date()]);
  }
}

// A file a saved SWMS of the business names, in any revision: { row, data }, or null.
async function fileForSwms(companyId, swmsId, fileId) {
  const row = await db.one('SELECT * FROM design_files WHERE id = $1 AND company_id = $2 AND id IN (SELECT file_id FROM design_file_uses WHERE swms_id = $3)', [String(fileId || ''), companyId, String(swmsId || '')]);
  if (!row) return null;
  const data = await getData(row);
  return data ? { row, data } : null;
}
// A file the business uploaded, saved with a SWMS or not yet: for the page before saving.
async function fileOfCompany(companyId, fileId) {
  const row = await ownFile(companyId, fileId);
  if (!row) return null;
  const data = await getData(row);
  return data ? { row, data } : null;
}

// Sends a file to a signed-in user of its business: never cached, never read as another type, shown
// in the browser's own viewer.
function sendFile(res, { row, data }) {
  res.setHeader('Content-Type', row.content_type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', `inline; filename="${row.name.replace(/[^A-Za-z0-9 ._-]+/g, '_')}"; filename*=UTF-8''${encodeURIComponent(row.name)}`);
  res.send(data);
}

// Removes files no saved revision names: uploaded and never saved for 7 days, or whose SWMS have all
// been removed. Returns how many went.
async function removeUnused(now = new Date()) {
  const cutoff = new Date(now.getTime() - UNSAVED_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db.query('SELECT * FROM design_files WHERE created_at < $1 AND id NOT IN (SELECT file_id FROM design_file_uses)', [cutoff]);
  for (const row of rows) {
    await removeData(row);
    await db.query('DELETE FROM design_files WHERE id = $1', [row.id]);
  }
  return rows.length;
}

// Every file of a business, for deleting the business: its stored data first, then its rows.
// Returns the counts removed from each table. Safe to run again.
async function removeForCompany(companyId) {
  const rows = await db.query('SELECT * FROM design_files WHERE company_id = $1', [companyId]);
  for (const row of rows) await removeData(row);
  const uses = await db.query('DELETE FROM design_file_uses WHERE file_id IN (SELECT id FROM design_files WHERE company_id = $1) RETURNING 1 AS gone', [companyId]);
  const files = await db.query('DELETE FROM design_files WHERE company_id = $1 RETURNING 1 AS gone', [companyId]);
  return { design_file_uses: uses.length, design_files: files.length, design_file_data: rows.filter((row) => row.storage === 'database').length };
}

// The files of a SWMS, for the export: [{ row, data, revisions }].
async function filesOfSwms(companyId, swmsId) {
  const files = await db.query('SELECT * FROM design_files WHERE company_id = $1 AND id IN (SELECT file_id FROM design_file_uses WHERE swms_id = $2) ORDER BY created_at', [companyId, swmsId]);
  const uses = await db.query('SELECT file_id, revision FROM design_file_uses WHERE swms_id = $1 ORDER BY revision', [swmsId]);
  const rows = uses.flatMap((use) => files.filter((file) => file.id === use.file_id).map((file) => ({ ...file, revision: use.revision })));
  const out = new Map();
  for (const row of rows) {
    if (!out.has(row.id)) out.set(row.id, { row, revisions: [] });
    out.get(row.id).revisions.push(Number(row.revision));
  }
  for (const item of out.values()) item.data = await getData(item.row).catch(() => null);
  return [...out.values()].filter((item) => item.data);
}

// The line the server logs at start in production without the bucket, or null.
function storageProblem() {
  return isProduction() && !bucketConfigured()
    ? 'Design files: the storage bucket is not set up (DESIGN_FILES_BUCKET, DESIGN_FILES_BUCKET_KEY_ID, DESIGN_FILES_BUCKET_SECRET, DESIGN_FILES_BUCKET_ENDPOINT), so files cannot be attached. Design references still print.'
    : null;
}

module.exports = {
  MAX_BYTES, MAX_MB, UNSAVED_DAYS, checkFile, fileName, enabled, bucketConfigured, bucketSettings, signature, useBucketFetch,
  saveUpload, ownFile, missingFiles, needFiles, recordUses, fileForSwms, fileOfCompany, sendFile, removeUnused, removeForCompany, filesOfSwms, storageProblem,
};
