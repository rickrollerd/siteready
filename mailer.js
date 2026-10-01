// Sends sign-in links and review reminders. SMTP_HOST, SMTP_PORT, SMTP_USERNAME,
// SMTP_PASSWORD and MAIL_FROM set the mail server. Without them, outside
// production, the message goes to the server log so sign-in can be tried locally.
const nodemailer = require('nodemailer');

let transport = null;
let capture = null;

function configured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USERNAME && process.env.SMTP_PASSWORD);
}

function mailTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 465);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USERNAME, pass: process.env.SMTP_PASSWORD },
    });
  }
  return transport;
}

// Tests read the messages instead of sending them.
function captureMail(fn) {
  capture = fn;
}

async function sendMail({ to, subject, text }) {
  if (capture) return capture({ to, subject, text });
  if (!configured()) {
    if (process.env.NODE_ENV === 'production') throw Object.assign(new Error('Email is not set up on this server.'), { status: 503, publicMessage: true });
    console.log(`Email to ${to}: ${subject}\n${text}`);
    return null;
  }
  try {
    return await mailTransport().sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USERNAME, to, subject, text });
  } catch (error) {
    console.error(`Email to ${to} could not be sent:`, error.message);
    throw Object.assign(new Error('The email could not be sent. Try again in a few minutes.'), { status: 503, publicMessage: true });
  }
}

module.exports = { sendMail, captureMail, configured };
