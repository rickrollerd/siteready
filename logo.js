// The company logo arrives as a data URL from the browser. Only small PNG and
// JPEG images are accepted, and their size is read from the file itself.
const MAX_LOGO_BYTES = 400 * 1024;

function pngSize(data) {
  const signature = '89504e470d0a1a0a';
  if (data.length < 24 || data.subarray(0, 8).toString('hex') !== signature) return null;
  if (data.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

function jpegSize(data) {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) return null;
    const marker = data[offset + 1];
    if (marker === 0xff) { offset += 1; continue; }
    const length = data.readUInt16BE(offset + 2);
    // Start of frame markers carry the height and width.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { width: data.readUInt16BE(offset + 7), height: data.readUInt16BE(offset + 5) };
    }
    offset += 2 + length;
  }
  return null;
}

function readLogo(value) {
  if (typeof value !== 'string' || !value) return null;
  const match = /^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) return null;
  const data = Buffer.from(match[2], 'base64');
  if (!data.length || data.length > MAX_LOGO_BYTES) return null;
  const type = match[1] === 'png' ? 'png' : 'jpg';
  const size = type === 'png' ? pngSize(data) : jpegSize(data);
  if (!size || !size.width || !size.height || size.width > 4000 || size.height > 4000) return null;
  return { type, data, ...size };
}

// Fits the logo in the page header without changing its shape.
function fitLogo(logo, maxWidth = 180, maxHeight = 60) {
  const scale = Math.min(maxWidth / logo.width, maxHeight / logo.height, 1);
  return { width: Math.round(logo.width * scale), height: Math.round(logo.height * scale) };
}

module.exports = { readLogo, fitLogo, MAX_LOGO_BYTES };
