// A reference for each downloaded SWMS. It is printed in the footer with the business
// it was prepared for, and kept against the account, so a SWMS (even one edited in Word)
// can be traced to the account that made it.
const crypto = require('crypto');
const db = require('./db');
const { findState } = require('./legislation');

// Letters and digits that cannot be misread for each other (no 0/O, 1/I/L).
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function newRef() {
  const bytes = crypto.randomBytes(8);
  const chars = [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]).join('');
  return `SR-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

// The job's state and postcode, from the form. The rest of the address is not kept.
function placeOf(input = {}) {
  const postcode = (String(input.workplace || '').match(/\b(\d{4})\b(?!.*\b\d{4}\b)/) || [])[1] || '';
  const state = findState(input.state);
  return { state: state ? state.id : '', postcode };
}

// link: the saved SWMS and revision the reference is printed on, and a fingerprint of its content.
async function issueRef(company, title = '', place = {}, link = {}) {
  const ref = newRef();
  if (db.enabled()) {
    try {
      await db.query('INSERT INTO swms_refs (ref, company_id, company_name, abn, title, state, postcode, created_at, swms_id, revision, content_hash) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
        [ref, company ? company.id : null, (company && company.name) || '', (company && company.abn) || '', String(title || '').slice(0, 200),
          String(place.state || '').slice(0, 3), String(place.postcode || '').slice(0, 4), new Date(),
          link.swmsId || null, link.revision || null, link.contentHash || null]);
    } catch {
      // The reference still goes on the SWMS.
    }
  }
  return ref;
}

async function findRef(ref) {
  if (!db.enabled()) return null;
  return db.one('SELECT ref, company_id, company_name, abn, title, state, postcode, created_at, swms_id, revision, content_hash FROM swms_refs WHERE ref = $1', [String(ref || '').trim().toUpperCase()]);
}

module.exports = { issueRef, findRef, newRef, placeOf };
