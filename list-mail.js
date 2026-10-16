// The emails SiteLink sends a subcontractor about its SWMS list (Goal 12 stage 5). The wording is the
// owner's (D306 item 2, D309), tidied: who reviewed the scope, a dot point list of the SWMS titles, the
// submission due date the lead set, and a link to sign in or start an account. Nothing else: no
// attachment, no picture and nothing that tracks opening. A short last line says who sent it through
// SiteWrite and how to stop these emails.
//
// Each template has a version. The version that went out is kept with every email sent
// (mail_messages.template_version), so it is always known which wording a subcontractor got. Change
// the version whenever the wording changes.
const TEMPLATES = {
  // The first email of the list to an address.
  list_sent: { version: 1 },
  // The list again after the lead changed it, or its due date, saying what changed.
  list_changed: { version: 1 },
  // A reminder of the SWMS not yet received.
  reminder: { version: 1 },
};

// "Friday 30 October 2026" from "2026-10-30".
function longDue(date) {
  const day = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(day.getTime())) return String(date || '');
  return new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(day).replace(',', '');
}
// "30 October 2026", for a subject line.
function shortDue(date) {
  const day = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(day.getTime())) return String(date || '');
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(day);
}

const dots = (titles) => titles.map((title) => `• ${title}`).join('\n');
// One line of a header or a name: no line breaks, so a typed name cannot add a line to the email.
const line = (text) => String(text || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

// The From name: "{person} via SiteWrite" (D285, D306).
const fromName = (person) => `${line(person)} via SiteWrite`;

// The email. kind: list_sent, list_changed or reminder. items: the titles to list. changes, for
// list_changed: { added, removed, changed } (titles) and dueWas (the earlier due date, when it moved).
// link and stopLink are the page links; the lead's preview passes stand-ins in their place.
function compose({ kind, person, builder, project, items, due, changes = null, dueWas = '', link, stopLink, today = '' }) {
  const template = TEMPLATES[kind];
  if (!template) throw new Error(`No email template ${kind}.`);
  const who = `${line(person)} from ${line(builder)}`;
  const projectName = line(project);
  const lines = [];
  const added = new Set((changes && changes.added) || []);
  const reworded = new Set((changes && changes.changed) || []);
  const shown = items.map((title) => (added.has(title) ? `${title} (new)` : reworded.has(title) ? `${title} (work changed)` : title));
  let subject;
  if (kind === 'list_sent') {
    subject = `SWMS required for ${projectName} by ${shortDue(due)}`;
    lines.push(`${who} has reviewed your scope of works for ${projectName} and has confirmed they require the following SWMS, which are ready for you to review in SiteWrite:`);
  } else if (kind === 'list_changed') {
    const listMoved = Boolean(changes && ((changes.added || []).length || (changes.removed || []).length || (changes.changed || []).length));
    subject = `Updated: SWMS required for ${projectName} by ${shortDue(due)}`;
    lines.push(listMoved
      ? `${who} has changed the SWMS they require for ${projectName}. They now require the following SWMS, which are ready for you to review in SiteWrite:`
      : `${who} has changed the submission due date for ${projectName}. They require the following SWMS, which are ready for you to review in SiteWrite:`);
  } else {
    subject = `Reminder: SWMS required for ${projectName} by ${shortDue(due)}`;
    lines.push(`${who} is reminding you that they require the following SWMS for ${projectName}, which are ready for you to review in SiteWrite:`);
  }
  lines.push('', dots(shown));
  if (kind === 'list_changed' && changes && (changes.removed || []).length) lines.push('', 'No longer required:', dots(changes.removed));
  const past = today && due < today;
  if (kind === 'reminder' && past) lines.push('', `The submission due date was ${longDue(due)}.`);
  else lines.push('', `Submission due date: ${longDue(due)}${dueWas && dueWas !== due ? ` (was ${longDue(dueWas)})` : ''}`);
  lines.push('', 'To review them, sign in to SiteWrite or start an account:', link);
  lines.push('', '--', `Sent through SiteWrite for ${line(builder)}. To stop these emails from ${line(builder)}: ${stopLink}`);
  return { template: kind, version: template.version, subject, text: lines.join('\n') };
}

module.exports = { TEMPLATES, compose, fromName, longDue, shortDue };
