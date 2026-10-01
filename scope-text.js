// Reads the text of a scope of works: a Word file (.docx), a PDF, or plain text.
const mammoth = require('mammoth');
const { PDFParse } = require('pdf-parse');

const MAX_TEXT = 400000;

function fail(message) {
  return Object.assign(new Error(message), { status: 400, publicMessage: true });
}

async function scopeText(body) {
  if (typeof body.text === 'string' && body.text.trim()) return body.text.slice(0, MAX_TEXT);
  const file = body.file && typeof body.file === 'object' ? body.file : null;
  if (!file || typeof file.data !== 'string' || !file.data) throw fail('Attach the scope or paste it first.');
  const name = String(file.name || '').toLowerCase();
  const data = Buffer.from(file.data, 'base64');
  let text = '';
  if (name.endsWith('.docx')) {
    text = (await mammoth.extractRawText({ buffer: data }).catch(() => { throw fail('The Word file could not be read. Save it again as .docx, or paste the scope.'); })).value;
  } else if (name.endsWith('.pdf')) {
    const parser = new PDFParse({ data });
    try {
      text = (await parser.getText()).text.replace(/^-- \d+ of \d+ --$/gm, '');
    } catch {
      throw fail('The PDF could not be read. Paste the scope instead.');
    } finally {
      await parser.destroy().catch(() => {});
    }
    if (!text.trim()) throw fail('The PDF has no text to read, which happens with a scanned page. Paste the scope instead.');
  } else if (name.endsWith('.txt')) {
    text = data.toString('utf8');
  } else if (name.endsWith('.doc')) {
    throw fail('Older Word files (.doc) cannot be read. Save it as .docx, or paste the scope.');
  } else {
    throw fail('Attach a Word file (.docx), a PDF or a text file, or paste the scope.');
  }
  return text.slice(0, MAX_TEXT);
}

module.exports = { scopeText };
