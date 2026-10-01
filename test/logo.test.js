const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { readLogo, fitLogo } = require('../logo');
const { prepareDraft } = require('../draft');
const { draftToDocx } = require('../docx-draft');

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let k = 0; k < 8; k += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour
  const rows = Buffer.alloc((width * 3 + 1) * height, 0x40);
  for (let y = 0; y < height; y += 1) rows[y * (width * 3 + 1)] = 0;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dataUrl = (buffer, type = 'png') => `data:image/${type};base64,${buffer.toString('base64')}`;

test('a small PNG logo is read with its size', () => {
  const logo = readLogo(dataUrl(png(300, 100)));
  assert.equal(logo.type, 'png');
  assert.equal(logo.width, 300);
  assert.equal(logo.height, 100);
  assert.deepEqual(fitLogo(logo), { width: 180, height: 60 });
});

test('a logo that is not a PNG or JPEG, or is too large, is ignored', () => {
  assert.equal(readLogo('data:image/svg+xml;base64,PHN2Zz4='), null);
  assert.equal(readLogo('data:image/png;base64,aGVsbG8='), null);
  assert.equal(readLogo(dataUrl(Buffer.alloc(500 * 1024, 1))), null);
  assert.equal(readLogo('https://example.com/logo.png'), null);
  assert.equal(readLogo(undefined), null);
});

test('the company details and logo go in the Word file header', async () => {
  const draft = prepareDraft({
    state: 'nsw',
    task: 'Replace a 3m length of fence.',
    fallRisk: 'no',
    company: 'Smith Fencing Pty Ltd',
    companyAbn: '12 345 678 901',
    companyPhone: '02 9000 0000',
  });
  assert.equal(draft.companyDetails, 'ABN 12 345 678 901 · 02 9000 0000');
  const buffer = await draftToDocx(draft, { logo: readLogo(dataUrl(png(120, 40))) });
  const text = buffer.toString('latin1');
  assert.match(text, /word\/header1\.xml/);
  assert.match(text, /word\/media\//);
});

test('a draft with no company details has no header', async () => {
  const draft = prepareDraft({ state: 'qld', task: 'Replace a 3m length of fence.', fallRisk: 'no' });
  assert.equal(draft.companyDetails, '');
  const text = (await draftToDocx(draft)).toString('latin1');
  assert.doesNotMatch(text, /word\/header1\.xml/);
});
