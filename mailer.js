// Sends every email the app sends: sign-in links, review reminders, and SiteLink's lists to
// subcontractors (Goal 12 stage 5). A message is { to, subject, text }, and may carry a From name
// (from: { name, address }), a Reply-To address (replyTo) and extra headers (headers). Mail is plain
// text only: there is no HTML, so there is no image in it, and nothing tracks whether it was opened
// (D306 item 3: "opened" is a click on the link only).
//
// Which service sends it (the provider adapter, D306 item 1):
//   - Postmark, when POSTMARK_SERVER_TOKEN is set (one service that sends and receives, on
//     sitewrite.com.au once the domain's records are set up). POSTMARK_MESSAGE_STREAM names the
//     stream (default "outbound"). Open and link tracking are always switched off.
//   - Otherwise SMTP, as before: SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD and MAIL_FROM.
//   MAIL_PROVIDER=smtp or postmark chooses one when both are set.
// The From address is MAIL_FROM (or the SMTP user). A SiteLink list may name its own address,
// PROJECT_MAIL_FROM_ADDRESS, used with Postmark, whose sending domain must hold it. Over SMTP the From
// address stays MAIL_FROM, as a mail account sends only as itself; the From name still shows where the
// mail server keeps it. Without any service, outside production, the message goes to the server log
// so sign-in can be tried locally.
const nodemailer = require('nodemailer');

let transport = null;
let capture = null;
let divert = null;
// Tests replace the network call to Postmark.
let send = (url, options) => fetch(url, options);

const POSTMARK_URL = 'https://api.postmarkapp.com/email';
const value = (name) => String(process.env[name] || '').trim();

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USERNAME && process.env.SMTP_PASSWORD);
}
const postmarkConfigured = () => Boolean(value('POSTMARK_SERVER_TOKEN'));

// The service that sends: 'postmark', 'smtp' or '' (none set up).
function provider() {
  const chosen = value('MAIL_PROVIDER').toLowerCase();
  if (chosen === 'smtp' && smtpConfigured()) return 'smtp';
  if (chosen === 'postmark' && postmarkConfigured()) return 'postmark';
  if (postmarkConfigured()) return 'postmark';
  if (smtpConfigured()) return 'smtp';
  return '';
}
const configured = () => Boolean(provider());

function mailTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 465);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USERNAME, pass: process.env.SMTP_PASSWORD },
      // Fail in seconds, not minutes, when the host blocks mail ports (Railway does below the Pro plan),
      // so the page says the email could not be sent instead of the request timing out.
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  }
  return transport;
}

// Tests read the messages instead of sending them.
function captureMail(fn) {
  capture = fn;
}

// Staging test hooks keep mail to test addresses instead of sending it.
function divertMail(fn) {
  divert = fn;
}

function usePostmarkFetch(next) {
  send = next || ((url, options) => fetch(url, options));
}

// The address mail is sent from: the one the message names when Postmark sends it, else MAIL_FROM.
function fromAddress(from, via) {
  const own = value('MAIL_FROM') || value('SMTP_USERNAME');
  if (via === 'postmark' && from && from.address) return from.address;
  return own;
}

// A display name in a From header: quoted, with no quote, backslash or line break in it.
const displayName = (name) => String(name || '').replace(/["\\\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
function fromHeader(from, via) {
  const address = fromAddress(from, via);
  const name = displayName(from && from.name);
  return name ? `"${name}" <${address}>` : address;
}

// One header value on one line: a line break in a value would start a new header.
const headerValue = (text) => String(text || '').replace(/[\r\n]+/g, ' ').trim();
function cleanHeaders(headers) {
  const out = {};
  for (const [name, text] of Object.entries(headers || {})) {
    if (/^[A-Za-z0-9-]{1,60}$/.test(name)) out[name] = headerValue(text);
  }
  return out;
}

async function viaPostmark(message) {
  const body = {
    From: fromHeader(message.from, 'postmark'),
    To: message.to,
    Subject: headerValue(message.subject),
    TextBody: message.text,
    MessageStream: value('POSTMARK_MESSAGE_STREAM') || 'outbound',
    // D306 item 3: no tracking image and no rewritten links. "Opened" is a click on SiteWrite's own link.
    TrackOpens: false,
    TrackLinks: 'None',
  };
  if (message.replyTo) body.ReplyTo = headerValue(message.replyTo);
  const headers = Object.entries(cleanHeaders(message.headers)).map(([Name, Value]) => ({ Name, Value }));
  if (headers.length) body.Headers = headers;
  const response = await send(POSTMARK_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Postmark-Server-Token': value('POSTMARK_SERVER_TOKEN') },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  // Postmark's own words never reach a person or the log: only the status and its error code.
  if (!response.ok || (data && data.ErrorCode)) throw new Error(`Postmark answered ${response.status}${data && data.ErrorCode ? ` (code ${data.ErrorCode})` : ''}.`);
  return { provider: 'postmark', id: String((data && data.MessageID) || '') };
}

async function viaSmtp(message) {
  const name = displayName(message.from && message.from.name);
  const address = fromAddress(message.from, 'smtp');
  const result = await mailTransport().sendMail({
    from: name ? { name, address } : address,
    to: message.to,
    subject: message.subject,
    text: message.text,
    ...(message.replyTo ? { replyTo: headerValue(message.replyTo) } : {}),
    ...(message.headers ? { headers: cleanHeaders(message.headers) } : {}),
  });
  return { provider: 'smtp', id: String((result && result.messageId) || '') };
}

// Sends one message. Returns { provider, id } when a service sent it, or null when it was kept (the
// test inbox, a test, or the log on a local copy).
async function sendMail({ to, subject, text, from = null, replyTo = '', headers = null }) {
  const message = { to, subject, text, ...(from ? { from } : {}), ...(replyTo ? { replyTo } : {}), ...(headers ? { headers } : {}) };
  if (divert && await divert(message)) return null;
  if (capture) { await capture(message); return null; }
  const via = provider();
  if (!via) {
    if (process.env.NODE_ENV === 'production') throw Object.assign(new Error('Email is not set up on this server.'), { status: 503, publicMessage: true });
    console.log(`Email to ${to}: ${subject}\n${text}`);
    return null;
  }
  try {
    return via === 'postmark' ? await viaPostmark(message) : await viaSmtp(message);
  } catch (error) {
    console.error(`Email to ${to} could not be sent:`, error.message);
    throw Object.assign(new Error('The email could not be sent. Try again in a few minutes.'), { status: 503, publicMessage: true });
  }
}

module.exports = { sendMail, captureMail, divertMail, configured, provider, usePostmarkFetch, fromHeader, POSTMARK_URL };
