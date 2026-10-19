// The SWMS chosen from a scope, prepared in one go, then checked and downloaded together.
//
// Owner, 13 October 2026 (D239): "SWMS chosen from a scope are all done in one go: site details asked
// once, then one page with each SWMS's own questions in its own section, answers that suit all filled
// across and changeable, one button prepares all."
// D240: "can we review the swms before downloading, we need to be able to. This allows the user to then
// see if its correct, if its not correct we need a button that allows the user to change the wording
// in the specific step in the review section plus Review each, download all".
//
// The page has three parts: the site details for every SWMS (the job address and people above, the
// site questions and who runs the crane), then each SWMS's own questions, then Prepare all. Prepared,
// the list shows each SWMS with what it still needs; Check opens it in the usual draft, where Change
// this step and the control changes work as before (and are learned from), and one button downloads
// them all as Word and PDF in one zip once each has cleared its checks. Each saves as its own SWMS
// and revision. The project, with every answer, is kept on this device (scope.js).
(() => {
  const S = window.SiteWrite;
  const { api, esc } = S;
  const $ = (id) => document.getElementById(id);
  const fill = () => window.SiteWriteDesignFill || null;
  const gate = () => window.SiteWriteGate || null;

  let project = null;
  let hooks = null;
  // Each SWMS's questions as the server last gave them, by its place in the list.
  const asked = new Map();
  const askSeq = new Map();
  const askTimers = new Map();

  // The details above the page every SWMS shares, and what the download needs of them (download-gate.js,
  // public/gate-rules.js PEOPLE_FIELDS): the works manager and contact phone too (D289). The scaffold
  // supervisor is asked only where a SWMS involves a scaffold.
  const PEOPLE = gate() && gate().PEOPLE_FIELDS
    ? gate().PEOPLE_FIELDS.filter((item) => !item.scaffold).map((item) => [item.field, item.label])
    : [['workplace', 'Job address'], ['principal', 'Principal contractor'], ['works-manager', 'Works manager'], ['works-manager-phone', 'Works manager phone'], ['compliance-responsible', 'Person who makes sure the SWMS is followed'],
      ['reviewer', 'Person who reviews the controls'], ['first-aider', 'First aider'], ['muster-point', 'Muster point']];
  const SCAFFOLD = ['scaffold-supervisor', 'Scaffold supervisor'];
  // How a person's box is judged, as the download gate judges it, so its reason shows at the box.
  const peopleRule = (field) => {
    const rules = gate();
    const item = rules && rules.PEOPLE_FIELDS ? rules.PEOPLE_FIELDS.find((entry) => entry.field === field) : null;
    return item ? rules.fieldRule(item) : null;
  };
  const SITE = [
    ['liveServices', 'Live services', 'Power, gas, water, data or other live services in or near the work, including overhead power lines. Write None if there are none.'],
    ['publicInterface', 'Public interface', 'Where the public, traffic or neighbours are close to the work. Write None if they are not.'],
    ['otherTrades', 'Other trades', 'Other trades working nearby, or above or below you. Write None if there are none.'],
    ['ground', 'Ground', 'Soft or sloping ground, open excavations, or slab and deck loads. Write None if none apply.'],
    ['access', 'Access', 'How the crew gets to the work area, and how plant and materials get there.'],
  ];
  const CRANE = [['none', 'No crane'], ['company', 'A crane company'], ['own', 'Our company']];
  // With a crane company, who slings the loads and directs the crane (D258), asked once for every SWMS.
  const SLINGING = [['crane', 'Crane company\'s dogman'], ['ours', 'Our crew']];
  const SLINGING_ASK = 'Say who slings the loads and directs the crane: the crane company\'s dogman, or our crew.';
  const slingingNow = () => {
    if (shared().slinging === undefined) shared().slinging = (project.from || {}).slinging || (project.items.find((item) => item.slinging) || {}).slinging || '';
    return shared().slinging;
  };
  const PAGE_KEYS = ['state', 'residential', 'company', 'companyAbn', 'companyAddress', 'companyPhone', 'companyEmail', 'workplace', 'principalContractor', 'siteManager', 'scaffoldSupervisor', 'hospital', 'firstAider', 'musterPoint', 'firstAidLocation', 'siteRules', 'worksManager', 'worksManagerPhone', 'complianceResponsible', 'reviewer', 'reviewDate', 'date', 'preparedBy'];

  const shared = () => {
    project.shared = project.shared || {};
    project.shared.designs = project.shared.designs || {};
    project.shared.emergency = project.shared.emergency || {};
    return project.shared;
  };
  const save = () => hooks.save();

  // ---- A main contractor's list (Goal 12 stage 6) ----
  // The list's SWMS are the builder's ("it is the list"); the company can take one off its list here,
  // with a warning that names the builder, and add SWMS of its own, which are not sent. The site
  // details the builder set are filled in above, marked "Set by {builder}" (from-builders.js).
  const builder = () => (hooks && hooks.builder ? hooks.builder() : null);
  const builderName = () => { const b = builder(); return b ? b.builder.name : ''; };
  // builder-set.js loads after this file, and a list kept on the device is drawn before it has loaded
  // (messy round 8: the fallback called itself, "Maximum call stack size exceeded" on every load).
  const poss = (name) => {
    if (window.SiteWriteBuilderSet) return window.SiteWriteBuilderSet.possessive(name);
    const text = String(name || '').trim();
    return /s$/i.test(text) ? `${text}'` : `${text}'s`;
  };
  const OWN_TAG = '<span class="pill own-tag">Your own, not sent</span>';
  // The open SWMS's title on the builder's list, which names its download (messy round 7: the file was
  // named after the task).
  S.listSwmsTitle = () => { const item = project && builder() && project.items[project.current]; return item && item.requiredId ? item.title : ''; };
  const isOwn = (item) => Boolean(builder() && item && !item.requiredId);
  // The top of the page for a builder's list: who needs these SWMS, for which job, by when, and the
  // builder's answers to the points in the scope.
  function builderTop(stageLede) {
    const b = builder();
    const name = b.builder.name;
    const own = project.items.filter((item) => !item.requiredId).length;
    const required = project.items.length - own;
    const due = b.due && b.due.shown ? ` Due ${esc(b.due.shown)}${b.due.past ? ', which has passed' : ''}.` : '';
    const contact = b.contact && b.contact.name ? `<p class="meta">Questions about this list? Contact ${esc(b.contact.name)}${b.contact.position ? `, ${esc(b.contact.position)},` : ''} at ${esc(name)}${b.contact.email ? `: ${esc(b.contact.email)}` : ''}${b.contact.phone ? ` or ${esc(b.contact.phone)}` : ''}.</p>` : '';
    const answers = (b.answers || []).length ? `<details class="go-answers"><summary>${esc(poss(name))} answers to points in the scope (${b.answers.length})</summary><ul>${b.answers.map((answer) => `<li><span class="meta">${esc(answer.question)}${answer.activity ? ` (${esc(answer.activity)})` : ''}</span><br><strong>${esc(answer.answer)}</strong></li>`).join('')}</ul></details>` : '';
    return `<div class="project-head"><h2>SWMS for ${esc(name)}</h2><button type="button" class="small secondary" data-list-close>Close</button></div>
      <div class="from-builder-head">
        <p><strong>${esc(name)}</strong>${b.builder.verified ? '' : ' <span class="pill">Unverified</span>'} needs these SWMS from ${esc(b.subcontractor.name)} for <strong>${esc(b.project.name)}</strong> at ${esc(b.project.workplace)}.${due}</p>
        <p class="meta">${required === 1 ? 'One SWMS is' : `${required} SWMS are`} on ${esc(poss(name))} list${own ? `, and ${own === 1 ? 'one is' : `${own} are`} your own` : ''}. The site details ${esc(name)} set are filled in above, each marked "Set by ${esc(name)}". Your company's details come from your own company profile. ${esc(name)} sees only the SWMS you submit to it, and which ones you take off its list. It does not see your drafts.</p>
        <p class="meta" id="list-saved" role="status">${esc(S.listSavedLine ? S.listSavedLine() : '')}</p>
        <p class="${b.note ? 'warning' : 'note hidden'}" id="list-note" role="status">${esc(b.note || '')}</p>
        <div id="list-overrides"></div>
        ${answers}${contact}${logHtml()}
      </div>
      ${stageLede}`;
  }
  // A SWMS on the builder's list, or the company's own, said at the top of its section.
  function itemFrom(index) {
    const b = builder();
    const item = project.items[index];
    if (!b || !item) return '';
    const name = esc(b.builder.name);
    if (!item.requiredId) {
      const was = item.wasRequired ? `${name} has taken this SWMS off its list since. ` : '';
      return `<p class="meta go-item-from">Your own SWMS. ${was}It is saved under your company and downloads with the others, but it is not sent to ${name}. <button type="button" class="link" data-go-own-swms-remove="${index}" aria-label="${esc(`Remove your SWMS ${item.title}`)}">Remove it</button></p>`;
    }
    const risk = item.highRisk && item.highRisk.heading ? ` <strong>${esc(item.highRisk.heading)}.</strong>${item.highRisk.line ? ` ${esc(String(item.highRisk.line).replace(/([^.])$/, '$1.'))}` : ''}` : '';
    const clauses = (item.clauses || []).length ? ` From scope ${item.clauses.length === 1 && !/[,;&]|\band\b/.test(item.clauses[0]) ? 'clause' : 'clauses'} ${esc(item.clauses.join('; '))}.` : '';
    const coversNames = (item.alsoCovers || []).map((one) => String(one).replace(/^trade installation:\s*/i, '').replace(/^./, (letter) => letter.toLowerCase()));
    const also = coversNames.length ? ` Also covers: ${esc(coversNames.length > 1 ? `${coversNames.slice(0, -1).join(', ')} and ${coversNames[coversNames.length - 1]}` : coversNames[0])}.` : '';
    return `${item.workChanged ? `<p class="note">${esc(item.workChanged)} The task below is the work as it is now.</p>` : item.newOnList ? `<p class="note">New on ${poss(name)} list.</p>` : ''}
      <p class="meta go-item-from">On ${poss(name)} list.${risk}${clauses}${also} <button type="button" class="link" data-go-take-off="${index}" aria-label="${esc(`Take ${item.title} off my list`)}">Take it off my list</button></p>
      ${(item.draftNotes || []).length ? `<div class="note go-draft-notes"><p><strong>Notes from ${poss(name)} scope</strong></p><ul>${item.draftNotes.map((entry) => `<li>${esc(entry.text)}${entry.clause ? ` <span class="meta">(clause ${esc(entry.clause)})</span>` : ''}${entry.settled ? ` <span class="go-note-settled"><strong>Settled:</strong> ${esc(poss(b.builder.name))} answer is "${esc(String(entry.settled).replace(/[.\s]+$/, ''))}".</span>` : ''}</li>`).join('')}</ul></div>` : ''}`;
  }
  // SWMS taken off the list here: the builder still expects them, and each can be put back.
  function offListHtml() {
    const b = builder();
    const off = (b && project.offList) || [];
    if (!off.length) return '';
    const name = esc(b.builder.name);
    return `<div class="warning go-off-list" id="go-off-list"><p><strong>Taken off your list (${off.length}).</strong> ${name} asked for ${off.length === 1 ? 'this SWMS, and still expects it' : 'these SWMS, and still expects them'}. ${name} sees that you took ${off.length === 1 ? 'it' : 'them'} off, as not submitted.</p><ul>${off.map((item, i) => `<li>${esc(item.title)} <button type="button" class="link" data-go-put-back="${i}" aria-label="${esc(`Put ${item.title} back on my list`)}">Put it back</button></li>`).join('')}</ul></div>`;
  }
  // Where a SWMS was just taken off: a note in its place, with Put back, so the page does not move and
  // the next SWMS's "Take it off my list" is not left under the thumb (messy round 7, as SiteLink does
  // for the lead). { requiredId, at, title }
  let goneNote = null;
  function goneHtml() {
    const b = builder();
    const off = (b && project.offList) || [];
    const i = goneNote ? off.findIndex((one) => one.requiredId === goneNote.requiredId) : -1;
    if (i < 0) return '';
    const name = esc(b.builder.name);
    return `<div class="warning go-gone" id="go-gone" role="status"><p><strong>${esc(off[i].title)} is taken off your list.</strong> ${name} still expects it, and sees that you took it off, as not submitted.</p>
      <div class="actions"><button type="button" class="small secondary" data-go-put-back="${i}" aria-label="${esc(`Put ${off[i].title} back on my list`)}">Put it back</button></div></div>`;
  }
  // ---- Submitting to the main contractor (Goal 12 stage 7) ----
  // A SWMS on the builder's list is submitted once it has passed SiteWrite's check and been ticked part
  // by part. Submitting saves it as its revision in My SWMS, as a download does, and the builder reviews
  // that revision. The row says what was submitted, the response, and each condition, which the company
  // marks done for the builder to confirm.
  const sentOf = (item) => { const b = builder(); return b && b.sent && item && item.requiredId ? (b.sent.items || {})[item.requiredId] || null : null; };
  const checkKey = (check) => (check && check.partHashes ? `${JSON.stringify(check.partHashes)}|${check.name}|${check.role}` : '');
  // The parts as they printed when submitted, from the server, against the check here now: the same on
  // every device and after a reload (messy round 8: "Changed since you submitted it" with nothing changed
  // on a second device, and Submit then said nothing had changed).
  const PART_IDS = () => ((window.SiteWriteCheckParts && window.SiteWriteCheckParts.IDS) || ['steps', 'hazards', 'plant', 'emergency', 'site']);
  const sameParts = (a, b) => Boolean(a && b) && PART_IDS().every((id) => a[id] === b[id]);
  function submitState(item) {
    const check = checkOf(item);
    const sent = sentOf(item);
    const latest = sent && sent.latest && sent.latest.channel === 'sitewrite' ? sent.latest : null;
    // Submitted with this same check: nothing new to send. A submission from before the server kept its
    // parts is matched as this page last submitted it.
    const same = Boolean(latest && check && (latest.partHashes
      ? sameParts(latest.partHashes, check.partHashes) || (item.submittedKey === checkKey(check) && item.submittedRevision === latest.revision)
      : item.submittedKey && item.submittedKey === checkKey(check) && item.submittedRevision === latest.revision));
    return { check, latest, same, can: Boolean(builder() && item.requiredId && check && item.status === 'ready' && item.body && !item.stale && !same) };
  }
  const CONDITION_STATE = { outstanding: 'To do', done: 'Marked done', closed: 'Confirmed done' };
  // What the company typed for each condition, kept until that condition is marked done (messy round 9,
  // stuck point 2: the note typed for one condition was lost when another was marked, as the list was
  // drawn again). Kept on this device too, so a reload or a lost answer keeps it.
  const COND_NOTES_KEY = 'sitewrite.condNotes';
  const condNotes = (() => { try { return JSON.parse(localStorage.getItem(COND_NOTES_KEY) || '{}') || {}; } catch { return {}; } })();
  const keepCondNote = (id, text) => {
    if (String(text || '').trim()) condNotes[id] = String(text).slice(0, 500); else delete condNotes[id];
    try { localStorage.setItem(COND_NOTES_KEY, JSON.stringify(condNotes)); } catch { /* kept for this page only */ }
  };
  function conditionHtml(entry) {
    const name = esc(builderName());
    const status = `<span class="pill cond-${esc(entry.status)}">${CONDITION_STATE[entry.status] || esc(entry.status)}</span>`;
    let more = '';
    if (entry.status === 'outstanding') {
      more = `${entry.backNote ? `<span class="meta">Sent back by ${esc(entry.backBy)} on ${esc(entry.backOn)}: ${esc(entry.backNote)}${/[.!?]$/.test(entry.backNote) ? '' : '.'}</span>` : ''}
        <span class="cond-do"><label class="meta" for="cond-note-${esc(entry.id)}">What you did (optional)</label><input type="text" id="cond-note-${esc(entry.id)}" maxlength="500" data-cond-note="${esc(entry.id)}" autocomplete="off" value="${esc(condNotes[entry.id] || '')}">
        <button type="button" class="small" data-cond-done="${esc(entry.id)}">Mark as done</button></span>`;
    } else if (entry.status === 'done') {
      more = `<span class="meta">Marked done by ${esc(entry.doneBy)} on ${esc(entry.doneOn)}${entry.doneNote ? `: ${esc(entry.doneNote.replace(/[.\s]+$/, ''))}` : ''}. Waiting for ${name} to confirm. <button type="button" class="link" data-cond-undo="${esc(entry.id)}">Not done after all</button></span>`;
    } else if (entry.status === 'closed') {
      more = `${entry.doneBy ? `<span class="meta">Marked done by ${esc(entry.doneBy)} on ${esc(entry.doneOn)}${entry.doneNote ? `: ${esc(entry.doneNote.replace(/[.\s]+$/, ''))}` : ''}.</span>` : ''}<span class="meta">${name} confirmed it on ${esc(entry.closedOn)}.</span>`;
    }
    return `<li class="cond" id="cond-${esc(entry.id)}"><span>${status} ${esc(entry.text)}${entry.revision ? ` <span class="meta cond-rev">(revision ${esc(entry.revision)})</span>` : ''}</span>${more}</li>`;
  }
  // What was submitted for a SWMS on the list, its response and its conditions, under its row.
  function sentHtml(item) {
    const b = builder();
    if (!b || !item.requiredId) return '';
    const name = esc(b.builder.name);
    const sent = sentOf(item);
    const state = submitState(item);
    // A refusal shows until the next press; "already submitted" only while the SWMS is as it was then.
    const noteShown = item.submitNote && (!item.submitNote.ok || item.submitNote.key === checkKey(state.check));
    const note = noteShown ? `<span class="${item.submitNote.ok ? 'meta go-submit-ok' : 'error'}" role="status">${esc(item.submitNote.text)}</span>` : '';
    if (!sent || !sent.latest) return `<span class="meta go-sent">Not submitted to ${name} yet.</span>${note}`;
    const latest = sent.latest;
    const what = latest.channel === 'outside'
      ? `${name} recorded a SWMS it received for this outside SiteWrite (${esc(latest.file ? latest.file.name : 'a file')}) on ${esc(latest.on)}.`
      : `Submitted to ${name} on ${esc(latest.on)}, revision ${esc(latest.revision)}.`;
    const review = latest.review;
    const earlier = (sent.earlier || []).find((one) => one.review);
    const reviewText = review
      ? `<b>${esc(review.label)}</b> by ${esc(review.name)}, ${esc(review.company)}, ${esc(review.date)}.${review.response === 'changes' && review.text ? `<span class="pre go-changes">${esc(review.text)}</span>` : ''}`
      : `Not reviewed yet.${earlier ? ` Revision ${esc(earlier.revision)} was ${esc(earlier.review.label)}.` : ''}`;
    const changed = latest.channel === 'sitewrite' && !state.same && state.check && (latest.partHashes || item.submittedKey)
      ? ` <b>Changed since you submitted it.</b> Submit it again to send the new revision.` : '';
    const overrides = (latest.overrides || []).length ? ` ${name} sees that it changes details it set: ${esc(latest.overrides.map((one) => one.label.toLowerCase()).join(', '))}.` : '';
    const conditions = (sent.conditions || []).length ? `<ul class="go-conditions">${sent.conditions.map(conditionHtml).join('')}</ul>` : '';
    return `<span class="go-sent"><span class="meta">${what}${overrides} ${reviewText}${changed}</span>${conditions}</span>${note}`;
  }
  // A detail the builder set, changed for this SWMS alone while it was open (messy round 8, stuck point 4).
  function ownDetailsLine(item) {
    const b = builder();
    const set = window.SiteWriteBuilderSet;
    const keys = Object.keys((b && item.pageOwn) || {});
    if (!keys.length || !set) return '';
    const labels = keys.map((key) => (set.fieldOf(key) || { label: key }).label.toLowerCase());
    // Once submitted, the line under it says the builder sees the change.
    const sent = sentOf(item);
    return `<span class="meta go-own-detail">For this SWMS only, you changed ${labels.length === 1 ? 'a detail' : 'details'} ${esc(b.builder.name)} set: ${esc(labels.join(', '))}.${(sent && sent.latest) || !item.requiredId ? '' : ` ${esc(b.builder.name)} sees it when you submit.`}</span>`;
  }
  // The log both sides see, at the top of the list.
  function logHtml() {
    const b = builder();
    const log = (b && b.sent && b.sent.log) || [];
    if (!log.length) return '';
    return `<details class="go-log"><summary>Log with ${esc(b.builder.name)} (${log.length})</summary><ul class="plain">${log.map((entry) => `<li><span class="meta">${esc(entry.when)}</span> ${esc(entry.text)}</li>`).join('')}</ul></details>`;
  }
  // The button under the list: every SWMS checked and not yet submitted as it is now.
  function submitHtml() {
    const b = builder();
    if (!b) return '';
    const name = esc(b.builder.name);
    const can = project.items.filter((item) => submitState(item).can);
    const required = project.items.filter((item) => item.requiredId);
    const sent = required.filter((item) => { const s = sentOf(item); return s && s.latest; }).length;
    // Out of every SWMS on the builder's list, those taken off here too.
    const total = (b.listItems || []).length || required.length;
    const off = (project.offList || []).length;
    const label = can.length === 1 ? `Submit the checked SWMS to ${name}` : `Submit the ${can.length} checked SWMS to ${name}`;
    return `<div class="go-submit" id="go-submit">
      <h3>Submit to ${name}</h3>
      <p class="meta">${sent ? `${sent} of the ${total} SWMS on ${poss(name)} list ${sent === 1 ? 'is' : 'are'} submitted${off ? `, and ${off === 1 ? 'one is' : `${off} are`} taken off your list` : ''}. ` : ''}A SWMS on ${poss(name)} list can be submitted once it is checked part by part. Submitting saves it in My SWMS as its revision, and ${name} reviews that revision. Your own SWMS are not sent.</p>
      ${submitSaid ? `<p class="${submitSaid.ok ? 'note' : 'error'}" role="status" id="go-submit-said">${esc(submitSaid.text)}</p>` : ''}
      <div class="actions"><button type="button" id="go-submit-all"${can.length ? '' : ' disabled'}>${can.length ? label : `Submit to ${name}`}</button></div>
      ${can.length ? '' : `<p class="meta">${sent === required.length && required.length ? `Each SWMS here from ${poss(name)} list is submitted. Change one and check it again to submit it again.` : 'Nothing to submit yet: check each SWMS first.'}</p>`}
    </div>`;
  }
  // The row's buttons: Check, and Submit to {builder} on a builder's list once it is checked.
  function rowButtons(item, index, firstToCheck) {
    const check = `<button type="button" class="${index === firstToCheck ? '' : 'secondary '}small" data-project-open="${index}">${checkOf(item) ? 'Check it again' : 'Check this SWMS'}</button>`;
    if (!builder()) return check;
    return `<span class="go-row-buttons">${check}${submitState(item).can ? `<button type="button" class="small" data-go-submit="${index}">Submit to ${esc(builderName())}</button>` : ''}</span>`;
  }
  let submitSaid = null;
  async function submitItems(indexes, button) {
    const b = builder();
    const items = indexes.map((index) => project.items[index]).filter((item) => item && submitState(item).can);
    if (!b || !items.length) return;
    const was = button ? button.textContent : '';
    if (button) { button.disabled = true; button.textContent = 'Submitting...'; }
    const apply = (data) => {
      for (const done of data.submitted || []) {
        const item = project.items.find((one) => one.requiredId === done.requiredId);
        if (!item) continue;
        item.swmsId = done.swmsId || item.swmsId;
        item.submittedKey = checkKey(checkOf(item));
        item.submittedRevision = done.revision;
        if (done.repeated) item.submitNote = { ok: true, key: item.submittedKey, text: `Revision ${done.revision} was already submitted. Nothing has changed since.` };
        else delete item.submitNote;
      }
      for (const refused of data.refused || []) {
        const item = project.items.find((one) => one.requiredId === refused.requiredId);
        if (item) item.submitNote = { ok: false, text: `Not submitted: ${refused.message}` };
      }
      if (data.sent) b.sent = data.sent;
      submitSaid = data.message ? { ok: Boolean((data.submitted || []).length), text: data.message } : null;
      save();
      hooks.render();
    };
    try {
      const data = await S.call('POST', `/api/from-builders/${encodeURIComponent(b.id)}/submit`, {
        items: items.map((item) => ({ requiredId: item.requiredId, swms: { ...item.body, swmsTitle: item.title, swmsId: item.swmsId || undefined, check: checkOf(item) } })),
      });
      apply(data);
    } catch (error) {
      if (error.data && Array.isArray(error.data.refused)) apply(error.data);
      else { submitSaid = { ok: false, text: error.message }; hooks.render(); }
    } finally {
      if (button && document.body.contains(button)) { button.disabled = false; button.textContent = was; }
    }
    const at = items.length === 1 ? $(`go-row-${project.items.indexOf(items[0])}`) : $('go-submit');
    if (at && at.scrollIntoView) at.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  async function conditionAction(kind, id, button) {
    const b = builder();
    if (!b) return;
    const box = $(`cond-note-${id}`);
    button.disabled = true;
    try {
      const note = (box && box.value) || condNotes[id] || '';
      const data = await S.call('POST', `/api/from-builders/${encodeURIComponent(b.id)}/conditions/${encodeURIComponent(id)}/${kind}`, kind === 'done' ? { note } : {});
      // Sent with its condition: the note is now the condition's, as marked done.
      if (kind === 'done') keepCondNote(id, '');
      b.sent = data.sent;
      submitSaid = null;
      save();
      hooks.render();
      const row = $(`cond-${id}`);
      // The reply is said beside the condition (messy round 8: the row just changed, with no word).
      if (row && data.message) row.insertAdjacentHTML('beforeend', `<span class="meta go-submit-ok" role="status">${esc(data.message)}</span>`);
      if (row && row.scrollIntoView) row.scrollIntoView({ block: 'center' });
    } catch (error) {
      button.disabled = false;
      const row = $(`cond-${id}`);
      if (row) row.insertAdjacentHTML('beforeend', `<span class="error" role="alert">${esc(error.message)}</span>`);
    }
  }

  function ownSwmsHtml() {
    const b = builder();
    if (!b) return '';
    return `<section class="go-block" id="go-own-swms"><h3>3. SWMS of your own</h3>
      <p class="meta">Add a SWMS for other work your crew does on this job. It is your own: it is saved under your company and downloads with the others, but it is not sent to ${esc(b.builder.name)}.</p>
      <div class="field"><label for="go-own-title">Title</label><input id="go-own-title" type="text" maxlength="160" autocomplete="off"></div>
      <div class="field"><label for="go-own-task">The work<span class="hint">A plain list of the work, as it prints on the SWMS.</span></label><textarea id="go-own-task"></textarea></div>
      <div class="actions"><button type="button" class="secondary" id="go-own-add">Add your own SWMS</button></div><p class="error" id="go-own-error" role="alert"></p></section>`;
  }
  // The list changed shape (a SWMS taken off, put back or added): answers filled across follow their
  // SWMS, and each SWMS's questions are asked again in its new place.
  function listChanged(before) {
    if (S.remapProjectIndexes) S.remapProjectIndexes(before, project.items);
    for (const [key, value] of askSeq) askSeq.set(key, value + 1);
    asked.clear();
    project.current = 0;
    save();
    hooks.render();
  }

  // The site answers for every SWMS start empty. The scope's conditions (D252) are offered under each
  // box, cleaned and each once, for the user to accept (messy round 3: fragments and run-on repeats
  // were filled in as finished answers and printed in every SWMS).
  // The site answers a SWMS with its own still has as the project gave them: those still count as given
  // once for every SWMS (messy round 10, SiteLink blocker 4).
  function sharedIds(own) {
    const shared = sharedSite();
    const ids = SITE.map(([id]) => id).filter((id) => String((own || {})[id] || '').trim() && String((own || {})[id] || '').trim() === String(shared[id] || '').trim());
    return ids.length ? ids : undefined;
  }
  function sharedSite() {
    const site = shared();
    if (!site.site) {
      site.site = {};
      site.siteSuggest = siteSuggestFrom(project.items);
    }
    if (!site.siteSuggest) site.siteSuggest = siteSuggestFrom(project.items);
    return site.site;
  }
  function siteSuggestFrom(items) {
    const T = window.SiteWriteScopeTask;
    const out = {};
    for (const [id] of SITE) {
      const texts = items.map((item) => (item.site || {})[id]).filter(Boolean);
      const list = T && T.siteSuggestions ? T.siteSuggestions(texts, id) : texts;
      if (list.length) out[id] = list;
    }
    return out;
  }

  // The page's own details (the job address, the people, the state), as the SWMS form sends them.
  function pageBase() {
    const now = S.payload();
    return Object.fromEntries(PAGE_KEYS.map((key) => [key, now[key]]));
  }
  // The details on the page that are given (not empty).
  function pageGiven() {
    return Object.fromEntries(Object.entries(pageBase()).filter(([, value]) => (Array.isArray(value) ? value.length : String(value == null ? '' : value).trim())));
  }
  const questionDesign = (id) => { const rules = fill(); return (rules && rules.QUESTION_DESIGNS[id]) || null; };
  // The designs a SWMS uses: those asked at its questions and those its steps rely on, given once for
  // the project and used wherever the same design applies.
  function designIds(index) {
    const got = asked.get(index);
    if (!got) return [];
    const ids = (got.required || []).map((item) => questionDesign(item.id)).filter(Boolean).map((design) => design.id);
    for (const row of got.designs || []) if (row.needed && !ids.includes(row.id)) ids.push(row.id);
    return ids;
  }
  function designRow(id, what) {
    const rows = shared().designs;
    if (!rows[id]) rows[id] = { id, what: what || '', status: '', by: '', number: '', revision: '', date: '' };
    return rows[id];
  }
  // The designs a SWMS sends: the project's answer for each design it uses, and the answers given in
  // the SWMS itself for designs the project has no answer for, or that only it has (a design the user
  // added). An empty list never takes the SWMS's own answers away (messy round 4, run 3: "Not issued
  // yet", chosen while checking the SWMS, was lost when it was prepared again).
  function designsFor(index) {
    const item = project.items[index];
    const own = (item.body && Array.isArray(item.body.designs) ? item.body.designs : []).filter((row) => row && row.id);
    const ids = designIds(index);
    const fromProject = ids.map((id) => shared().designs[id]).filter((row) => row && row.status);
    const out = [...fromProject];
    for (const row of own) if (!out.some((other) => other.id === row.id)) out.push(row);
    return out;
  }
  // The task changed on this page from the words the scope reading gave it.
  const reworded = (item) => item.goTask !== undefined && String(item.goTask).replace(/\s+/g, ' ').trim() !== String(item.task || '').replace(/\s+/g, ' ').trim();
  function payloadFor(index) {
    const item = project.items[index];
    const designs = designsFor(index);
    // Emergency answers from the project's other SWMS, only those that fit this one (messy round 11).
    const emergency = S.emergencyAcross ? S.emergencyAcross(item) : shared().emergency;
    return {
      ...pageBase(),
      ...(builder() && item.pageOwn ? item.pageOwn : {}),
      // Unanswered until the user answers, or the scope clearly says (messy round 3); Prepare all
      // answers "No crane" where no task names one.
      crane: shared().crane || item.crane || '',
      slinging: (shared().crane || item.crane || '') === 'company' ? slingingNow() || item.slinging || '' : '',
      task: (item.goTask !== undefined ? item.goTask : item.task) || '',
      scopeTask: item.scopeTask || undefined,
      trade: item.trade || '',
      // A task reworded on this page starts from the steps its new words find, keeping the scope reading's steps those words
      // still name (messy round 14, A run 1: the reworded cool room task named a mobile scaffold, and "Use mobile scaffolds"
      // stayed unticked).
      kinds: (reworded(item) ? undefined : item.kinds) || undefined,
      priorKinds: reworded(item) && Array.isArray(item.kinds) && item.kinds.length ? [...item.kinds] : undefined,
      leaveOut: item.leaveOut || undefined,
      unmatched: item.unmatched || undefined,
      fallRisk: item.fallRisk || item.goFall || '',
      facts: { ...(item.facts || {}) },
      site: { ...(item.siteOwn || sharedSite()) },
      // Filled across to every SWMS: the high risk work these answers alone bring is not this SWMS's own
      // (messy round 8: "Open trenches near building 5 during pit work" made every SWMS trench work).
      siteShared: project.items.length < 2 ? undefined : !item.siteOwn ? true : sharedIds(item.siteOwn),
      designs: designs.length ? designs.map((row) => ({ ...row })) : undefined,
      emergency: Object.keys(emergency).length ? { ...emergency } : undefined,
      substancesNotUsed: notUsedOf(item).length ? notUsedOf(item) : undefined,
      // Work another SWMS of the project named this one as covering (D289).
      movedIn: hooks.movedInto ? hooks.movedInto(index) : undefined,
      // The user's own steps, written here or when the SWMS was checked (messy round 4, B fault 1).
      ownSteps: ownOf(item).length ? ownOf(item) : undefined,
      substancesNotUsedWhy: Object.keys(whyOf(item)).length ? whyOf(item) : undefined,
    };
  }

  // What this page sends for a SWMS, as it was when the SWMS was last prepared (here, or while it was
  // checked). Prepare all, Prepare it again and the list put into a prepared SWMS only what has changed
  // on this page since, so the work done inside it stays: the steps added or left out, the order, the
  // plant, the products, the user's own lines and the ticks (messy round 9, A fault 1: the one-go
  // page's step choices went back over the steps the user added, and the ticks of a SWMS that had not
  // changed were cleared).
  const sentKey = (value) => JSON.stringify(value === undefined ? null : value);
  function markSent(index) {
    const item = project && project.items[index];
    if (item) item.goSent = JSON.parse(JSON.stringify(payloadFor(index)));
  }
  function changesFor(index) {
    const item = project.items[index];
    const now = payloadFor(index);
    if (!item.body || !item.goSent) return now;
    return Object.fromEntries(Object.entries(now).filter(([key, value]) => sentKey(value) !== sentKey(item.goSent[key])));
  }

  // The types of hazardous substance ticked "Not required" for a SWMS (D277, D287): kept with its
  // prepared input, where its draft keeps them too, so a tick here or there is the same tick.
  const notUsedOf = (item) => [...((item.body && item.body.substancesNotUsed) || item.substancesNotUsed || [])];
  // The reason given for each type ticked "Not required" that the SWMS's own task or answers name (D292).
  const whyOf = (item) => ({ ...((item.body && item.body.substancesNotUsedWhy) || item.substancesNotUsedWhy || {}) });
  const wordsOf = (index) => {
    const item = project.items[index];
    const rules = window.SiteWriteSubstanceRules;
    return rules ? rules.ownWords({ task: item.goTask !== undefined ? item.goTask : item.task, facts: item.facts, site: item.siteOwn || sharedSite() }) : '';
  };
  // What a type ticked "Not required" still needs: a reason where the SWMS's own words name it.
  // The step that cuts or drills concrete and the steps that use each type, from the prepared draft, or
  // from the questions asked before it (messy round 8, run 3): "Not required" is refused beside them here
  // as in the SWMS, and so is a type the SWMS's own safety data sheet answer names.
  function notUsedNeed(index, type) {
    const rules = window.SiteWriteSubstanceRules;
    const item = project.items[index];
    const got = asked.get(index) || {};
    const silica = item.silicaStep || got.silicaStep || '';
    const uses = item.substanceUses || got.substanceUses || {};
    const sds = item.facts && typeof item.facts.safetyDataSheet === 'string' ? item.facts.safetyDataSheet : '';
    return rules && rules.notUsedNeed ? rules.notUsedNeed(type, whyOf(item)[type], wordsOf(index), stepsOf(index), sds, silica, null, uses[type] || null) : '';
  }
  // The job steps' words, from the prepared draft or the questions asked before it: a type they name asks its reason
  // here, as the SWMS does (messy round 14, A runs 1 and 2: refrigerants "Not required" was taken with no reason
  // here, then listed as still needed, while the SWMS asked the reason).
  const stepsOf = (index) => { const item = project.items[index]; const got = asked.get(index) || {}; return String(item.stepWords || got.stepWords || ''); };
  function setNotUsed(index, type, ticked) {
    const item = project.items[index];
    const now = new Set(notUsedOf(item));
    if (ticked) now.add(type); else now.delete(type);
    const list = [...now];
    item.substancesNotUsed = list;
    if (item.body) item.body = { ...item.body, substancesNotUsed: list.length ? list : undefined };
    syncNeeds(index, type);
    save();
  }
  function setWhy(index, type, text) {
    const item = project.items[index];
    const why = { ...whyOf(item), [type]: text };
    if (!String(text || '').trim()) delete why[type];
    item.substancesNotUsedWhy = Object.keys(why).length ? why : undefined;
    if (item.body) item.body = { ...item.body, substancesNotUsedWhy: item.substancesNotUsedWhy };
    syncNeeds(index, type);
    save();
  }
  // The list says at once what the SWMS still needs: the tick and the reason need no new draft.
  function syncNeeds(index, type) {
    const item = project.items[index];
    const rules = window.SiteWriteSubstanceRules;
    if (item.kind !== 'draft' || !rules) return;
    const label = `${TYPE_LABEL}${rules.promptName(type)}`;
    const covered = ((item.body && item.body.substances) || []).some((row) => row && (rules.coversType ? rules.coversType(row, type) : row.type === type) && String(row.product || '').trim());
    const ticked = notUsedOf(item).includes(type);
    const needs = (item.needs || []).filter((need) => need !== label);
    if (!covered && (!ticked || notUsedNeed(index, type))) needs.push(label);
    item.needs = needs;
    if (hooks.statusOf) item.status = hooks.statusOf(item);
  }
  // Each type the work usually uses, with its tick, in the SWMS's section. Products with their safety
  // data sheets are added in the SWMS's own draft.
  function typesHtml(index, types) {
    const item = project.items[index];
    const rules = window.SiteWriteSubstanceRules;
    if (!types.length || !rules) return '';
    const ticked = new Set(notUsedOf(item));
    const products = ((item.body && item.body.substances) || []).filter((row) => row && String(row.product || '').trim());
    const rows = types.filter((type) => rules.TYPES.includes(type)).map((type) => {
      const added = products.filter((row) => (rules.coversType ? rules.coversType(row, type) : row.type === type)).map((row) => row.product);
      const said = rules.namedIn ? rules.namedIn(type, wordsOf(index)) : '';
      // Fuel for the plant list's diesel or petrol plant asks a reason too (messy round 11, run 2).
      const got = asked.get(index) || {};
      const use = (item.substanceUses || got.substanceUses || {})[type];
      const fromPlant = !said && use && use.plant ? use.step : '';
      const fromSteps = !said && !fromPlant && rules.reasonAsked ? rules.reasonAsked(type, wordsOf(index), stepsOf(index)) : null;
      const named = said || fromPlant || (fromSteps ? fromSteps.word : '');
      const n = rules.TYPES.indexOf(type);
      // A tick refused whatever the reason (a step uses it, the SDS answer names it, a step cuts concrete)
      // says so under the tick, with or without a reason box.
      const need = ticked.has(type) && !added.length ? notUsedNeed(index, type) : '';
      const refused = need && !named ? `<p class="answer-note" id="go-why-need-${index}-${n}">${esc(need)}</p>` : '';
      const why = refused || (ticked.has(type) && named && !added.length ? `<div class="field go-why"><label for="go-why-${index}-${n}">Why is it not required?<span class="hint">${fromPlant ? `This SWMS's plant list has "${esc(fromPlant)}", which runs on diesel or petrol.` : fromSteps ? `This SWMS's job steps name "${esc(named)}".` : `This SWMS's task or answers name "${esc(named)}".`} Give a short reason, ${esc(rules.reasonExample ? rules.reasonExample(type) : 'for example "not used by our crew on this job"')}. It prints in the substances section.</span></label><input id="go-why-${index}-${n}" type="text" maxlength="200" data-go-why="${index}" data-type="${esc(type)}" value="${esc(whyOf(item)[type] || '')}"><p class="answer-note" id="go-why-need-${index}-${n}"${notUsedNeed(index, type) ? '' : ' hidden'}>${esc(notUsedNeed(index, type))}</p></div>` : '');
      return `<li>${esc(type)}${added.length ? ` <span class="meta">Added: ${esc(added.join('; '))}.</span>` : `<label class="check go-notused"><input type="checkbox" data-go-notused="${index}" data-type="${esc(type)}"${ticked.has(type) ? ' checked' : ''}> Not required</label>`}${why}</li>`;
    }).join('');
    const open = item.kind === 'draft' ? ` <button type="button" class="link" data-project-open="${index}">Open this SWMS to add a product</button>` : ' After Prepare all, open this SWMS with Check this SWMS to add one.';
    return `<div class="go-types"><p class="go-sub"><strong>Hazardous substances</strong></p><p class="meta">This work usually uses these. Tick "Not required" for each one not used on this job. For each one used, add the product from its safety data sheet in the SWMS itself.${open}</p><ul class="go-type-list">${rows}</ul></div>`;
  }

  // ---- Asking each SWMS's questions ----

  async function askItem(index) {
    const item = project.items[index];
    if (!item) return;
    const fall = item.fallRisk || item.goFall;
    if (!fall) { asked.set(index, { needsFall: true }); drawItem(index); coverEarly(index); return; }
    // No state is ticked until the job address is picked or the state chosen (D292 item 1): the
    // questions are asked once it is, and the page says so meanwhile.
    if (!document.querySelector('input[name="state"]:checked')) {
      // Work kept on this device is still coming back, with its state: the page waits for it.
      if (S.restoring && S.restoring() && S.restored) { S.restored.then(() => askItem(index)); return; }
      if (!(asked.get(index) || {}).needsState) { asked.set(index, { needsState: true }); drawItem(index); }
      setTimeout(() => askItem(index), 600);
      return;
    }
    const mine = (askSeq.get(index) || 0) + 1;
    askSeq.set(index, mine);
    try {
      // Asked again on a host's error before the page says so (app.js postJson, messy round 4).
      // Asked with the PPE its prepared draft ticks, where that brings questions (askedOnceOpened).
      const sent = { ...payloadFor(index), ...(Array.isArray(item.draftPpe) && item.draftPpe.length ? { ppe: item.draftPpe } : {}) };
      const { response, data } = S.postJson ? await S.postJson('/api/draft/questions', sent)
        : await fetch(api('/api/draft/questions'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sent) }).then(async (got) => ({ response: got, data: await got.json() }));
      if (askSeq.get(index) !== mine) return;
      if (!response.ok) { asked.set(index, { error: data.message || 'The questions could not be asked.' }); drawItem(index); return; }
      const before = asked.get(index);
      asked.set(index, data);
      // A question already on the page keeps its box while the user types; only new or gone ones redraw.
      // Waiting for the fall answer or the state is part of the shape: answered, the SWMS's questions are
      // drawn even when it has none (messy round 5, run 6: "Answer the fall question" stayed under a
      // fall answer filled from SWMS 1).
      const shape = (got) => JSON.stringify(got && !got.error ? [(got.required || []).map((q) => q.id), (got.designs || []).filter((row) => row.needed).map((row) => row.id), Boolean(got.standDown), got.substanceTypes || [], got.notCoveredLeft || [], Boolean(got.needsFall), Boolean(got.needsState)] : null);
      if (shape(before) !== shape(data) || !document.getElementById(`go-item-${index}`)) drawItem(index);
      else notesFor(index);
      refreshMissing();
    } catch (error) {
      // The questions already shown stay; with none yet, the page says why, with Try again.
      const now = asked.get(index);
      if (askSeq.get(index) === mine && (!now || now.needsState)) { asked.set(index, { error: error && error.serverDown ? `${error.message}` : 'No signal. The questions show once SiteWrite can be reached.', retry: true }); drawItem(index); }
    }
  }
  // Before the fall question is answered, the work with no job steps is still found and listed: it
  // does not rest on the fall answer (messy round 3: found only by opening each SWMS).
  async function coverEarly(index) {
    if (!document.querySelector('input[name="state"]:checked')) { setTimeout(() => coverEarly(index), 400); return; }
    try {
      // Asked again on a host's error, as the questions are (messy round 7, run 6: a 502 here went unsaid).
      const body = { ...payloadFor(index), fallRisk: 'no', residential: payloadFor(index).residential || 'no' };
      const { response, data } = S.postJson ? await S.postJson('/api/draft/questions', body)
        : await fetch(api('/api/draft/questions'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (got) => ({ response: got, data: await got.json() }));
      const now = asked.get(index);
      if (!response.ok || !now || !now.needsFall) return;
      asked.set(index, { ...now, notCovered: data.notCovered || [], notCoveredLeft: data.notCoveredLeft || [], notCoveredMain: data.notCoveredMain || [] });
      drawItem(index);
    } catch {
      // Listed once the fall question is answered.
    }
  }
  function askSoon(index) {
    clearTimeout(askTimers.get(index));
    askTimers.set(index, setTimeout(() => askItem(index), 700));
  }
  async function askAll() {
    for (let index = 0; index < project.items.length; index += 1) await askItem(index);
  }

  // ---- Drawing the page ----

  function peopleMissing() {
    return PEOPLE.filter(([id]) => { const el = $(id); return el && !el.value.trim(); });
  }
  function peopleBlock() {
    const missing = peopleMissing();
    return `<div id="go-people">${missing.length
      ? `<div class="note"><p>Still to fill in above, once for every SWMS:</p><ul class="go-people">${missing.map(([id, label]) => `<li><button type="button" class="link" data-go-field="${id}">${esc(label)}</button></li>`).join('')}</ul></div>`
      : '<p class="meta">The job address and the people above are filled in. They print on every SWMS.</p>'}</div>`;
  }

  function siteBoxes(prefix, values, attr) {
    return SITE.map(([id, label, hint]) => `<div class="field"><label for="${prefix}-${id}">${esc(label)}<span class="hint">${esc(hint)}</span></label>${prefix === 'go-site' ? suggestHtml(id, values[id] || '') : ''}<textarea id="${prefix}-${id}" ${attr} data-site-id="${id}">${esc(values[id] || '')}</textarea></div>`).join('');
  }
  // What the scope says for a site question, offered to accept: each press puts that line in the box.
  function suggestHtml(id, value) {
    const list = (shared().siteSuggest || {})[id] || [];
    if (!list.length) return '';
    const has = (line) => String(value).toLowerCase().includes(line.replace(/\.$/, '').toLowerCase());
    return `<div class="picks go-suggest"><span class="picks-label">From the scope. Press one to use it, then check it for this site:</span>${list.map((line, n) => `<button type="button" class="pick-button" data-go-suggest="${id}" data-n="${n}" aria-pressed="${has(line)}">${esc(line)}</button>`).join('')}</div>`;
  }

  // A project brought back after a reload or the phone's Back button says so, until the user carries on.
  let broughtBack = true;
  const backNote = () => (broughtBack && project && (project.stage === 'review' || project.items.some((item) => item.facts || item.goFall)) ? '<p class="note" id="go-back-note" role="status">Your work is back as you left it.</p>' : '');
  document.addEventListener('click', () => { broughtBack = false; preparedNote = ''; }, true);
  document.addEventListener('input', () => { broughtBack = false; }, true);

  function render(panel, current, given) {
    project = current;
    hooks = given;
    if (project.stage === 'review') {
      panel.innerHTML = reviewHtml().replace('<p class="error" id="project-error"></p>', `${backNote()}<p class="error" id="project-error"></p>`);
      // The scaffold supervisor's box shows where a SWMS involves a scaffold, so it can be given once.
      const scaffold = $('scaffold-supervisor-field');
      if (scaffold && scaffoldNeeded()) scaffold.classList.remove('hidden');
      sharedNotes();
      // Details given since the SWMS were prepared (brought back after a reload) are put into them. Only
      // details on the page count: one not brought back yet as the page loads (the state, the company)
      // never empties what a SWMS holds, and nothing is asked before the state is set (messy round 7, run
      // 1: a silent HTTP 400 on POST /api/draft at page load, "Choose a state.").
      const given = pageGiven();
      // So are emergency answers given in another SWMS of the project (D239: filled across).
      const acrossOf = (item) => Object.keys(S.emergencyAcross ? S.emergencyAcross(item) : shared().emergency);
      const stale = Boolean(given.state) && project.items.some((item) => item.body && (Object.entries(given).some(([key, value]) => !(item.pageOwn && key in item.pageOwn) && JSON.stringify(item.body[key]) !== JSON.stringify(value))
        || acrossOf(item).some((id) => (!item.emergencyAsked || item.emergencyAsked.includes(id)) && !((item.body.emergency || {})[id] || '').trim())));
      if (stale && !refreshing) { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => refreshAll({ given: true }), 300); }
      return;
    }
    const site = sharedSite();
    // Unanswered unless answered on the list of work packages, or the scope clearly says (messy round 3).
    const crane = shared().crane || (project.items.find((item) => item.crane) || {}).crane || '';
    shared().crane = crane;
    const n = project.items.length;
    const lede = n ? `<p class="lede">Answer the questions once on this page, then press <strong>Prepare all ${n} SWMS</strong>. You then check each one before they download together.</p>`
      : `<p class="warning">Every SWMS on ${esc(poss(builderName()))} list is taken off. Put one back below, or add one of your own.</p>`;
    panel.innerHTML = `${builder() ? builderTop(lede) : `<div class="project-head"><h2>Project SWMS</h2><button type="button" class="small secondary" id="project-fresh">Start fresh</button></div>
      <p class="lede">${n} SWMS from the scope. Answer the questions once on this page, then press <strong>Prepare all ${n} SWMS</strong>. You then check each one before they download together.</p>`}
      ${project.from ? '<div class="actions" style="margin-top:0"><button type="button" class="small secondary" id="project-change">Change the SWMS chosen</button></div>' : ''}
      ${backNote()}<p class="error" id="project-error"></p>
      <div id="go-kept-box">${keptHtml()}</div>
      <section class="go-block">
        <h3>1. Site details, for every SWMS</h3>
        ${peopleBlock()}
        ${residentialHtml()}
        <fieldset class="field choice" id="go-crane"><legend>Is a crane used, and who operates it?</legend>${CRANE.map(([value, label]) => `<label><input type="radio" name="go-crane" value="${value}"${crane === value ? ' checked' : ''}> ${label}</label>`).join(' ')}<p class="error" id="go-crane-error" role="alert"></p></fieldset>
        <fieldset class="field choice" id="go-slinging"${crane === 'company' ? '' : ' hidden'}><legend>Who slings the loads and directs the crane?</legend>${SLINGING.map(([value, label]) => `<label><input type="radio" name="go-slinging" value="${value}"${slingingNow() === value ? ' checked' : ''}> ${label}</label>`).join(' ')}<p class="error" id="go-slinging-error" role="alert"></p></fieldset>
        <p class="meta">The site questions below are answered once for every SWMS. ${(shared().siteFromScope || []).length ? 'Some are filled from the scope\'s conditions: check they are right for this site. ' : Object.keys(shared().siteSuggest || {}).length ? 'Where the scope names a condition, it is offered under the box: press it to use it, and check it is right for this site. ' : ''}A SWMS that differs can have its own in its section.</p>
        ${siteBoxes('go-site', site, 'data-go-shared-site')}
      </section>
      <section class="go-block">
        <h3>2. The questions for each SWMS</h3>
        <p class="meta">An answer that suits more than one SWMS is filled across, marked so, and can be changed in each. A design given once is used wherever the same design applies.</p>
        ${project.items.map((item, index) => `${goneNote && goneNote.at === index ? goneHtml() : ''}<details class="go-item" id="go-item-${index}" open><summary><strong>SWMS ${index + 1} of ${n}: ${esc(item.title)}</strong>${isOwn(item) ? ` ${OWN_TAG}` : ''}</summary><div class="go-body" id="go-body-${index}">${itemBody(index)}</div></details>`).join('')}
        ${goneNote && goneNote.at >= n ? goneHtml() : ''}
        ${offListHtml()}
      </section>
      ${ownSwmsHtml()}
      <div id="go-cover-sum">${coverSumHtml()}</div>
      ${n ? `<div class="actions go-prepare"><button type="button" id="go-prepare">Prepare all ${n} SWMS</button></div>` : ''}
      <div class="meta" id="go-status" role="status"></div>
      <div class="actions"><button type="button" class="small secondary" id="project-close">${builder() ? 'Close the list' : 'Close project'}</button></div>`;
    project.items.forEach((_item, index) => { reopenOwnForm(index); notesFor(index); });
    sharedNotes();
    if (!project.items.every((_item, index) => asked.has(index))) askAll();
  }

  function drawItem(index) {
    const body = $(`go-body-${index}`);
    if (!body) return;
    body.innerHTML = itemBody(index);
    reopenOwnForm(index);
    notesFor(index);
    drawCoverSum();
  }

  function itemBody(index) {
    const item = project.items[index];
    const got = asked.get(index);
    const task = item.goTask !== undefined ? item.goTask : item.task;
    const parts = [itemFrom(index), `<div class="field"><label for="go-task-${index}">Task<span class="hint">A plain list of the work, as it prints on the SWMS. Change it if it is not right.</span></label><textarea id="go-task-${index}" data-go-task="${index}">${esc(task)}</textarea></div>`];
    if (!item.fallRisk) {
      const from = item.fallFrom;
      parts.push(`<fieldset class="field choice"><legend>Could a person fall more than 2 metres during this work?</legend>${['yes', 'no'].map((value) => `<label><input type="radio" name="go-fall-${index}" data-go-fall="${index}" value="${value}"${item.goFall === value ? ' checked' : ''}> ${value === 'yes' ? 'Yes' : 'No'}</label>`).join(' ')}${from !== undefined ? `<p class="meta go-across">Filled from SWMS ${from + 1}. Change it here if this SWMS differs.</p>` : item.fallKept && item.goFall ? `<p class="meta">Kept for this SWMS: its own work suggests ${item.goFall === 'yes' ? 'work at height' : 'no work at height'}. Change it here if that is wrong.</p>` : item.fallHint && !item.goFall ? `<p class="meta">Not filled from another SWMS: this SWMS's own work suggests ${item.fallHint === 'yes' ? 'work at height' : 'no work at height'}. Answer it for this SWMS.</p>` : ''}</fieldset>`);
    }
    if (!got) parts.push('<p class="meta">Finding the questions for this SWMS...</p>');
    else if (got.needsState) parts.push('<p class="note">This SWMS\'s questions show once the state is set: pick the job address above from its list, or tick the state the job is in. <button type="button" class="link" data-go-field="workplace">Go to the job address</button></p>');
    else if (got.needsFall) parts.push('<p class="note">Answer the fall question to see this SWMS\'s questions.</p>', coverHtml(index));
    else if (got.error) parts.push(`<p class="error">${esc(got.error)}${got.retry ? ` <button type="button" class="link" data-go-ask-again="${index}">Try again</button>` : ''}</p>`);
    else {
      // This page has no Job steps list: the way on is said for this page (messy round 5, run 4: it
      // pointed to a "Job steps" list the project page does not have).
      if (got.standDown) parts.push(`<p class="warning">${esc(projectWayOn(got.standDown.message))}</p>`);
      parts.push(coverHtml(index));
      const required = got.required || [];
      parts.push(required.length ? required.map((question) => questionHtml(index, question)).join('') : '<p class="meta">No further question for this SWMS.</p>');
      const found = (got.designs || []).filter((row) => row.needed && !required.some((question) => (questionDesign(question.id) || {}).id === row.id));
      if (found.length) parts.push(`<p class="go-sub"><strong>Designs this work relies on</strong></p>${found.map((row) => designHtml(index, row.id, row.label || row.what, row.steps, '', row.held)).join('')}`);
      const own = Boolean(item.siteOwn);
      parts.push(`<div class="go-site-own">${own ? `<p class="meta">This SWMS has its own site answers. <button type="button" class="link" data-go-site-same="${index}">Use the answers for every SWMS</button></p>${siteBoxes(`go-site-${index}`, item.siteOwn, `data-go-own-site="${index}"`)}` : `<p class="meta">Site questions: the answers for every SWMS, above. <button type="button" class="link" data-go-site-own="${index}">Change them for this SWMS</button></p>`}</div>`);
      parts.push(typesHtml(index, got.substanceTypes || []));
      // Fixings the scope lists with its plant are not plant (messy round 6: "Dyna-bolts, masonry bolts").
      const scopePlant = (item.plant || []).filter((name) => !/\b(bolts?|dyna-?bolts?|screws?|anchors?|fixings?|nails?|rivets?|plugs?)\b/i.test(String(name)));
      if (scopePlant.length) parts.push(`<p class="meta">Plant the scope names: ${esc(scopePlant.join(', '))}. You confirm the plant when you check this SWMS.</p>`);
    }
    return parts.join('');
  }

  function projectWayOn(message) {
    return String(message || '').replace(/(?:To go on|Tick or add)[^.]*\bunder Job steps\b.*$/, 'To go on, write your own step for the work with "Write a step for this" below. Or press Prepare all, then Check this SWMS, and pick the job steps that cover the work under Job steps there.');
  }

  function questionHtml(index, question) {
    const item = project.items[index];
    const id = `go-${index}-${question.id}`;
    const value = (item.facts || {})[question.id] || '';
    const hint = question.prompt && question.prompt.replace(/\.$/, '') !== question.label ? `<span class="hint">${esc(question.prompt)}</span>` : '';
    if (question.choices) {
      const chosen = value || question.default || '';
      return `<fieldset class="field choice" data-go-q="${esc(question.id)}"><legend>${esc(question.label)}</legend>${hint}${question.choices.map((choice) => `<label style="display:flex;margin:0 0 8px"><input type="radio" name="${id}" data-go-fact="${index}" data-q="${esc(question.id)}" value="${esc(choice.value)}"${choice.value === chosen ? ' checked' : ''}> ${esc(choice.label)}</label>`).join('')}</fieldset>`;
    }
    const picks = (question.suggestions || []).length ? `<div class="picks"><span class="picks-label">Standard answers:</span>${question.suggestions.map((pick, n) => `<button type="button" class="pick-button" data-go-pick="${index}" data-q="${esc(question.id)}" data-n="${n}">${esc(pick.label)}</button>`).join('')}</div>` : '';
    const design = questionDesign(question.id);
    return `<div class="field" data-go-q="${esc(question.id)}"><label for="${id}">${esc(question.label)}${hint}</label>${picks}<textarea id="${id}" data-go-fact="${index}" data-q="${esc(question.id)}">${esc(value)}</textarea><p class="meta go-across" id="${id}-across" hidden></p><p class="answer-note" id="${id}-note" hidden></p><p class="blank-warning" id="${id}-blanks" hidden></p>${design ? designHtml(index, design.id, design.label, null, question.id, (((asked.get(index) || {}).designs || []).find((row) => row.id === design.id) || {}).held || null) : ''}</div>`;
  }

  // A design, given once for the project: whether it is issued, and its details.
  function designHtml(index, designId, label, steps, questionId = '', held = null) {
    const row = designRow(designId, label);
    const name = `go-design-${index}-${designId}`;
    const radio = (value, text) => `<label><input type="radio" name="${name}" data-go-design="${esc(designId)}" data-field="status" value="${value}"${row.status === value ? ' checked' : ''}> ${text}</label>`;
    const box = (key, text, hint, type = 'text') => `<div class="field"><label for="${name}-${key}">${text}${hint ? `<span class="hint">${hint}</span>` : ''}</label><input id="${name}-${key}" type="${type}" data-go-design="${esc(designId)}" data-field="${key}" maxlength="200" autocomplete="off" value="${esc(row[key] || '')}"></div>`;
    const usedElsewhere = project.items.some((_item, other) => other !== index && designIds(other).includes(designId));
    return `<fieldset class="field design-card go-design" data-status="${esc(row.status || '')}" data-design-id="${esc(designId)}"${questionId ? ` data-for-q="${esc(questionId)}"` : ''}><legend>${esc(row.what || label)}</legend>
      ${steps && steps.length ? `<p class="meta">Used in: ${esc(steps.join('; '))}.</p>` : ''}
      ${usedElsewhere ? '<p class="meta">Given once, used in every SWMS of this project that relies on it.</p>' : ''}
      <div class="choice design-status">${radio('given', 'I have it')}${radio('notIssued', 'Not issued yet')}${radio('notNeeded', 'Not needed for this work')}</div>
      <div class="design-given">${box('by', 'Who prepared it', 'The engineer or firm.')}<div class="design-pair">${box('number', 'Document or drawing number', 'From the title block.')}${box('revision', 'Revision', 'Leave it empty if it has none.')}</div>${box('date', 'Date on the design', '', 'date')}</div>
      <p class="note design-hold">${Array.isArray(held) && !held.length ? 'No step of this SWMS builds to this design, so no step is held. The SWMS says: "Not issued yet. Update this SWMS when it is issued."' : questionId ? 'The answer above prints as a hold point: the steps that rely on the design do not start until it is issued and the SWMS is updated. You can leave the answer empty.' : 'The steps that build to it print a hold point until the design is issued and the SWMS is updated.'}</p>
    </fieldset>`;
  }

  // The notes under each answer: filled from another SWMS, too thin to print, blanks to fill.
  function notesFor(index) {
    const item = project.items[index];
    const got = asked.get(index) || {};
    const weak = new Map((got.weak || []).map((entry) => [entry.id, `${entry.why || 'Too thin to print.'} ${entry.help}`]));
    const missing = new Map(((item.draftHelp || [])).map((entry) => [entry.id, entry.state === 'vague' ? `${entry.why || 'Too thin to print.'} ${entry.help}` : `Still needed. ${entry.help}`]));
    for (const question of got.required || []) {
      if (question.choices) continue;
      const id = `go-${index}-${question.id}`;
      const box = $(id);
      if (!box) continue;
      const across = $(`${id}-across`);
      const from = (item.filledFrom || {})[question.id];
      // Filled across, marked, and easy to change or clear for this SWMS alone (messy round 3).
      const acrossHtml = from === undefined ? '' : `Filled from SWMS ${from + 1}. Change it here if this SWMS differs, or <button type="button" class="link" data-go-across-clear="${index}" data-q="${esc(question.id)}">clear it for this SWMS</button>.`;
      if (across) { across.hidden = from === undefined; if (across.innerHTML !== acrossHtml) across.innerHTML = acrossHtml; }
      const note = $(`${id}-note`);
      const blanks = $(`${id}-blanks`);
      const warning = fill() ? fill().blankWarning(box.value) : '';
      // One message per answer: a blank left in it is said by the red warning alone.
      const text = warning ? '' : weak.has(question.id) ? weak.get(question.id) : (!box.value.trim() && missing.has(question.id)) ? missing.get(question.id) : '';
      if (note) { note.textContent = text; note.hidden = !text; }
      box.classList.toggle('answer-thin', Boolean(text));
      if (blanks) { blanks.textContent = warning; blanks.hidden = !warning; }
      box.classList.toggle('has-blank', Boolean(warning));
      // An answer with blanks shows as its sentence with a labelled box in each blank (D261, app.js).
      if (S.drawBlankForm) S.drawBlankForm(box);
    }
  }

  // The Northern Territory asks whether the work is residential (the fall height rests on it): asked
  // here for every SWMS, as the SWMS form asks it, which the one-go page hides (messy round 3).
  const residentialAsked = () => { const question = $('residential-question'); const legend = $('residential-legend'); return Boolean(question && question.classList && !question.classList.contains('hidden') && legend && String(legend.textContent || '').trim()); };
  const residentialNow = () => (document.querySelector('input[name="residential"]:checked') || {}).value || '';
  function residentialHtml() {
    if (!residentialAsked()) return '';
    const legend = $('residential-legend').textContent;
    const now = residentialNow();
    return `<fieldset class="field choice" id="go-residential"><legend>${esc(legend)}</legend>${[['yes', 'Yes'], ['no', 'No']].map(([value, label]) => `<label><input type="radio" name="go-residential" value="${value}"${now === value ? ' checked' : ''}> ${label}</label>`).join(' ')}<p class="error" id="go-residential-error" role="alert"></p></fieldset>`;
  }

  // ---- Work with no job steps, named before Prepare all (messy round 3) ----

  // The work in a SWMS SiteWrite has no job steps for and not yet dealt with: as the server found it
  // for the questions (before Prepare all), or from the prepared draft.
  function coverLeftOf(index) {
    const item = project.items[index];
    if (item.kind === 'draft' && Array.isArray(item.notCovered)) {
      const written = new Set(item.notCoveredWritten || []);
      const main = new Set(item.notCoveredMain || []);
      const named = new Set((item.body && item.body.notCoveredConfirmed) || []);
      return item.notCovered.filter((part) => !written.has(part) && (main.has(part) || !named.has(part)));
    }
    const got = asked.get(index);
    return got && Array.isArray(got.notCoveredLeft) ? got.notCoveredLeft : [];
  }
  const coverMainOf = (index) => {
    const item = project.items[index];
    const got = asked.get(index) || {};
    return new Set(item.kind === 'draft' ? (item.notCoveredMain || []) : (got.notCoveredMain || []));
  };
  // Work with no job steps, with "Write a step for this" for each piece (messy round 4, B fault 1: own
  // steps were offered only once a SWMS was prepared, and Prepare all refused a SWMS with no steps).
  // A SWMS SiteWrite would stand down for want of job steps gets the button for its work as a whole.
  function coverHtml(index) {
    const left = coverLeftOf(index);
    const got = asked.get(index) || {};
    const own = ownOf(project.items[index]);
    const stood = Boolean(got.standDown) && !left.length;
    if (!left.length && !stood && !own.length) return '';
    const main = coverMainOf(index);
    const moved = ((hooks.movedInto && hooks.movedInto(index)) || []).filter((entry) => left.includes(entry.part));
    const all = left.every((part) => main.has(part));
    const mine = own.length ? `<p><strong>Your own steps:</strong></p><ul class="go-own-list">${own.map((step) => `<li>${esc(step.name)}${step.part ? ` <span class="meta">(for: ${esc(step.part)})</span>` : ''} <button type="button" class="link" data-go-own-change="${index}" data-name="${esc(step.name)}">Change</button> <button type="button" class="link" data-go-own-remove="${index}" data-name="${esc(step.name)}">Remove</button></li>`).join('')}</ul>` : '';
    if (!left.length && !stood) return `<div class="note go-cover" id="go-cover-${index}">${mine}<p class="meta"${ownSaid && ownSaid.index === index ? ' role="status"' : ''}>${ownSaid && ownSaid.index === index ? esc(ownSaid.text) : 'They go into this SWMS when it is prepared.'} <button type="button" class="link" data-go-own-write="${index}" data-part="">Write another step</button></p></div>`;
    const writes = left.length
      ? `<ul class="go-own-writes">${left.map((part, n) => `<li><strong>${esc(part)}</strong> <button type="button" class="small" data-go-own-write="${index}" data-part="${n}">Write a step for this</button></li>`).join('')}</ul>`
      : `<p><button type="button" class="small" data-go-own-write="${index}" data-part="">Write a step for this</button> <span class="meta">for the work of this SWMS. A SWMS of your own steps is prepared like any other.</span></p>`;
    return `<div class="warning go-cover" id="go-cover-${index}">${left.length ? `<p><strong>SiteWrite has no job steps for:</strong> ${esc(left.join('; '))}.</p>` : ''}
      ${moved.length ? `<p>${moved.map((entry) => `"${esc(entry.part)}" was moved here from ${esc(entry.from)}`).join('; ')}: write its steps in this SWMS.</p>` : ''}
      ${mine}${writes}${ownSaid && ownSaid.index === index ? `<p class="meta" role="status">${esc(ownSaid.text)}</p>` : ''}
      <p class="meta">${left.length && !all ? 'Write your own step for each here, or when you check this SWMS. There you can also say which SWMS of this project covers it.' : 'Write your own step for each here, or when you check this SWMS.'} A step of a word or two is not enough: say what is done, the hazard and how it is controlled.</p></div>`;
  }
  // The user's own steps for a SWMS: kept with its prepared input once it has one, so the SWMS opened to
  // check has them, and its draft's own changes come back here.
  function ownOf(item) {
    if (!item) return [];
    if (item.body && Array.isArray(item.body.ownSteps)) return item.body.ownSteps;
    return Array.isArray(item.ownSteps) ? item.ownSteps : [];
  }
  function setOwn(index, list) {
    const item = project.items[index];
    const next = list.length ? list : undefined;
    item.ownSteps = next;
    if (item.body) item.body = { ...item.body, ownSteps: next };
    markStale([index], 'Your own steps changed.');
    save();
    askItem(index);
  }
  // The form for one step, under the button pressed: its name, hazards and controls one a line, and who.
  function ownForm(index, part, step, typed = null) {
    const value = typed ? { part, name: typed.name, hazards: [typed.hazards], controls: [typed.controls], who: typed.who }
      : step || { part, name: String(part || '').replace(/^[a-z]/, (letter) => letter.toUpperCase()), hazards: [], controls: [], who: 'Supervisor' };
    const id = (key) => `go-own-${key}-${index}`;
    return `<div class="own-step-form go-own-form" id="go-own-form-${index}" data-part="${esc(value.part || '')}" data-was="${esc(step ? step.name : '')}" role="group" aria-labelledby="${id('title')}">
      <p class="own-form-title" id="${id('title')}"><strong>${esc(value.part ? `${step ? 'Change your step' : 'Write a step'} for: ${value.part}` : step ? `Change your step: ${step.name}` : 'Write a step of your own')}</strong></p>
      <p class="meta">Write what is done, what could go wrong and how it is controlled on this job. The step prints in the SWMS marked as your own.</p>
      <div class="field"><label for="${id('name')}">Job step</label><input id="${id('name')}" type="text" maxlength="300" value="${esc(value.name)}"></div>
      <div class="field"><label for="${id('hazards')}">Hazards, one on each line</label><textarea id="${id('hazards')}" rows="4">${esc((value.hazards || []).join('\n'))}</textarea></div>
      <div class="field"><label for="${id('controls')}">Controls, one on each line</label><p class="meta">${esc(S.OWN_HIERARCHY || '')}</p><textarea id="${id('controls')}" rows="6">${esc((value.controls || []).join('\n'))}</textarea></div>
      <div class="field"><label for="${id('who')}">Who is responsible</label><input id="${id('who')}" type="text" maxlength="120" value="${esc(value.who || '')}"></div>
      <div class="actions"><button type="button" data-go-own-save="${index}">Save your step</button><button type="button" class="secondary" data-go-own-cancel="${index}">Cancel</button></div>
      <p class="error" role="alert" id="${id('error')}"></p></div>`;
  }
  function openOwnForm(button, index, part, step) {
    document.querySelectorAll('.go-own-form').forEach((el) => el.remove());
    const holder = button.closest('li') || button.closest('p') || button;
    holder.insertAdjacentHTML('afterend', ownForm(index, part, step));
    keepOwnForm(index);
    const form = $(`go-own-form-${index}`);
    if (form && form.scrollIntoView) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const name = $(`go-own-name-${index}`);
    if (name && name.focus) name.focus({ preventScroll: true });
  }
  // A step of your own half typed is kept with the project as it is typed, and opened again as it was after a
  // reload (messy round 12, A run 1: it came back empty; flow10 kept it inside one SWMS only).
  function keepOwnForm(index) {
    const form = $(`go-own-form-${index}`);
    if (!form || !project) return;
    const box = (key) => String(($(`go-own-${key}-${index}`) || {}).value || '');
    project.ownForm = { index, part: form.dataset.part || '', was: form.dataset.was || '', name: box('name'), hazards: box('hazards'), controls: box('controls'), who: box('who') };
    save();
  }
  function dropOwnForm() {
    if (project && project.ownForm) { delete project.ownForm; save(); }
  }
  // Drawn again with the SWMS's section (after a reload, or once its questions come back), where it was.
  function reopenOwnForm(index) {
    const kept = project && project.ownForm;
    if (!kept || kept.index !== index || !project.items[index] || document.querySelector(`#go-own-form-${index}.go-own-form`)) return;
    const step = kept.was ? ownOf(project.items[index]).find((other) => other.name === kept.was) || null : null;
    const at = kept.part ? coverLeftOf(index).indexOf(kept.part) : -1;
    const holder = document.querySelector(`[data-go-own-write="${index}"][data-part="${at < 0 ? '' : at}"]`) || document.querySelector(`[data-go-own-write="${index}"]`);
    const place = holder ? holder.closest('li') || holder.closest('p') || holder : $(`go-cover-${index}`) || $(`go-body-${index}`);
    if (!place) return;
    place.insertAdjacentHTML(holder ? 'afterend' : 'beforeend', ownForm(index, kept.part, step, kept));
  }
  const linesOf = (text) => String(text || '').split(/\n+/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  function saveOwn(index) {
    const form = $(`go-own-form-${index}`);
    if (!form) return;
    const was = form.dataset.was || '';
    const next = {
      part: form.dataset.part || '',
      name: String($(`go-own-name-${index}`).value || '').replace(/\s+/g, ' ').trim().slice(0, 300),
      hazards: linesOf($(`go-own-hazards-${index}`).value).slice(0, 20),
      controls: linesOf($(`go-own-controls-${index}`).value).slice(0, 30),
      who: String($(`go-own-who-${index}`).value || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    };
    const list = [...ownOf(project.items[index])];
    const wrong = S.ownStepProblem ? S.ownStepProblem(next, list, was) : (!next.name || !next.hazards.length || !next.controls.length ? ['own-name', 'Give the step a name, a hazard and a control.'] : null);
    if (wrong) {
      // Said under the box it is about, so it is on screen on a phone.
      const box = $(`go-${wrong[0]}-${index}`);
      const said = $(`go-own-error-${index}`);
      said.textContent = wrong[1];
      const field = box && box.closest ? box.closest('.field') : null;
      if (field && field.appendChild) field.appendChild(said);
      if (box && box.focus) box.focus();
      if (said.scrollIntoView) said.scrollIntoView({ block: 'nearest' });
      return;
    }
    const at = list.findIndex((other) => other.name === was);
    if (at >= 0) list[at] = next; else list.push(next);
    form.remove();
    dropOwnForm();
    ownSaid = { index, text: `Saved your step "${next.name}" for SWMS ${index + 1}. It goes into the SWMS when it is prepared.` };
    setOwn(index, list);
    drawItem(index);
  }
  let ownSaid = null;

  function coverSumHtml() {
    if (!project) return '';
    const rows = project.items.map((item, index) => ({ item, index, left: coverLeftOf(index) })).filter((row) => row.left.length);
    if (!rows.length) return '';
    return `<div class="note go-cover-sum"><p><strong>Work SiteWrite has no job steps for, in ${rows.length === 1 ? 'one SWMS' : `${rows.length} SWMS`}.</strong> Write a step for each in its SWMS's section below, or when you check that SWMS, where you can also say which SWMS covers it:</p>
      <ul>${rows.map((row) => `<li>SWMS ${row.index + 1} (${esc(row.item.title)}): ${esc(row.left.join('; '))}. <button type="button" class="link" data-go-cover="${row.index}">Go to it</button></li>`).join('')}</ul></div>`;
  }
  function drawCoverSum() {
    const box = $('go-cover-sum');
    if (box && project && project.stage === 'questions') { const html = coverSumHtml(); if (box.innerHTML !== html) box.innerHTML = html; }
  }

  // ---- The reason at each shared box (messy round 3: a refused answer showed no reason at its field) ----

  const scaffoldNeeded = () => project.items.some((item) => (item.needs || []).includes(SCAFFOLD[1]));
  function setNote(el, id, text) {
    let note = $(id);
    if (!note && text) {
      note = document.createElement('p');
      note.id = id;
      note.className = 'gate-need go-need';
      note.setAttribute('role', 'status');
      const holder = (el.closest && el.closest('.field')) || el.parentElement;
      if (!holder) return;
      holder.appendChild(note);
    }
    if (note) { if (note.textContent !== text) note.textContent = text; note.hidden = !text; }
    if (el.classList) el.classList.toggle('answer-thin', Boolean(text));
  }
  // Each person's box above, and each site question for every SWMS: why its answer is refused, as the
  // download check says it, once something is typed or Prepare all has been pressed.
  function sharedNotes() {
    const rules = gate();
    if (!rules || !rules.answerNeed || !project || project.stage === 'check') return;
    const tried = Boolean(project.tried);
    const people = [...PEOPLE, ...(scaffoldNeeded() ? [SCAFFOLD] : [])];
    for (const [field] of people) {
      const el = $(field);
      const rule = peopleRule(field);
      if (!el || !rule) continue;
      const value = String(el.value || '').trim();
      const need = value || tried ? rules.answerNeed(rule, value) : '';
      setNote(el, `go-need-${field}`, need ? `Needed before download: ${need}` : '');
      // The note the SWMS open before left under the same box says it once more: on this page, this one
      // says it (messy round 9, run 4: the scaffold supervisor's note showed twice).
      const left = $(`need-${field}`);
      if (left) left.hidden = true;
    }
    if (project.stage !== 'questions' || !rules.SITE_NEED) return;
    const site = sharedSite();
    for (const [id, label] of SITE) {
      const el = $(`go-site-${id}`);
      if (!el) continue;
      const value = String(site[id] || '').trim();
      const need = value || tried ? rules.answerNeed({ ask: rules.SITE_NEED[id], name: label, none: rules.SITE_NONE.includes(id), ...(rules.SITE_KIND && rules.SITE_KIND[id] ? { kind: rules.SITE_KIND[id] } : {}) }, value) : '';
      setNote(el, `go-need-go-site-${id}`, need ? `Needed before download: ${need}` : '');
    }
  }
  function clearNotes() {
    document.querySelectorAll('.go-need').forEach((note) => { note.hidden = true; });
  }

  // ---- Prepared SWMS kept when an answer changes (messy round 3: the list vanished with no word) ----

  // A SWMS prepared before a shared answer it uses changed needs preparing again: it stays on the list,
  // marked, and does not download until it is prepared again.
  function markStale(indexes, why) {
    let changed = false;
    for (const index of indexes) {
      const item = project.items[index];
      if (!item || !item.kind || item.stale) continue;
      item.stale = why || 'An answer it uses has changed.';
      // A SWMS that needs preparing again is not checked either (D286): its ticks were for the SWMS
      // as it printed before.
      uncheck(item);
      changed = true;
    }
    if (changed) { save(); drawKept(); }
  }
  const CHECK_CLEARED = 'An answer it uses changed since it was checked.';
  function uncheck(item) {
    if (!item.check) return;
    // Kept aside, so an answer typed back as it was gives the check back (messy round 6, run 4).
    item.checkKept = item.check;
    delete item.check;
    item.checkNote = CHECK_CLEARED;
  }
  // A SWMS marked for a shared site answer whose answers are all back as it was prepared with is no longer
  // marked, and its check comes back: nothing it prints has changed.
  const SHARED_CHANGED = 'A site answer every SWMS shares changed.';
  function unmarkSame(indexes, same) {
    let changed = false;
    for (const index of indexes) {
      const item = project.items[index];
      if (!item || item.stale !== SHARED_CHANGED || !same(index)) continue;
      delete item.stale;
      if (item.checkKept) { item.check = item.checkKept; delete item.checkNote; }
      delete item.checkKept;
      changed = true;
    }
    if (changed) { save(); drawKept(); }
  }
  const staleItems = () => project.items.map((item, index) => ({ item, index })).filter((entry) => entry.item.stale);
  // Only a SWMS prepared as a draft counts as prepared (messy round 4: "Your 3 prepared SWMS are kept"
  // with one prepared and two stood down).
  const prepared = () => project.items.filter((item) => item.kind === 'draft');
  function keptHtml() {
    if (!project || project.stage !== 'questions') return '';
    const kept = prepared();
    if (!kept.length) return '';
    const stale = staleItems();
    return `<div class="note go-kept" id="go-kept" role="status"><p><strong>Your ${kept.length === 1 ? 'prepared SWMS is' : `${kept.length} prepared SWMS are`} kept.</strong> ${stale.length
      ? `You changed an answer ${stale.length === 1 ? 'one of them uses, so it needs' : `${stale.length} of them use, so they need`} preparing again: ${esc(stale.map((entry) => `SWMS ${entry.index + 1} (${entry.item.title})`).join('; '))}.`
      : 'Change what you need here, then go back to the list.'}${stale.some((entry) => entry.item.checkNote === CHECK_CLEARED) ? ' Once prepared, the list names any ticked part that changed, to tick again.' : ''}</p>
      <div class="actions"><button type="button" class="small" id="go-to-review">Back to the list of prepared SWMS</button>${stale.length ? `<button type="button" class="small secondary" id="go-prepare-stale">Prepare ${stale.length === 1 ? 'it' : 'them'} again</button>` : ''}</div></div>`;
  }
  // What "Prepare it again" did, said where the user is (messy round 4: it changed nothing visible).
  let preparedNote = '';
  const said = () => (preparedNote ? `<p class="note go-prepared-note" role="status">${esc(preparedNote)}</p>` : '');
  function drawKept() {
    const box = $('go-kept-box');
    if (box) { const html = keptHtml(); if (box.innerHTML !== html) box.innerHTML = html; }
    if (project.stage === 'review') hooks.render();
  }
  async function prepareStale(button) {
    const list = staleItems();
    if (!list.length) return;
    if (button) button.disabled = true;
    const status = $('go-status') || $('project-error');
    try {
      for (const { index } of list) {
        if (status) status.textContent = `Preparing SWMS ${index + 1} again...`;
        await askItem(index);
        await prepareOne(index, { ...(project.items[index].body || {}), ...changesFor(index) });
      }
      if (status) status.textContent = '';
      // Each one's outcome is said: prepared again, or what it still needs. The box above says it too.
      preparedNote = list.map(({ index }) => {
        const item = project.items[index];
        return item.kind === 'draft' ? `SWMS ${index + 1} (${item.title}) is prepared again${checkOf(item) ? '' : ': check it before it downloads'}.` : `SWMS ${index + 1} (${item.title}) still cannot be prepared: ${needsLine(item)}.`;
      }).join(' ');
      drawKept();
      afterPrepare();
    } catch (error) {
      if (status) status.textContent = error.message;
    } finally {
      if (button) button.disabled = false;
    }
  }
  // Whether a standard answer is in an answer already, its blanks filled or not (app.js pickPattern).
  const escapeRe = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flat = (text) => String(text || '').replace(/\s+/g, ' ').trim();
  const hasPick = (text, value) => (S.pickPattern ? S.pickPattern(text).test(value) : new RegExp(flat(text).split(/_{3,}/).map(escapeRe).join('[^]*?')).test(flat(value)));
  // The answer is the other's own sentence with its blanks filled in, and nothing else changed: the words
  // typed in a blank go into the same blank there (messy round 15, SiteLink blocker 2).
  const fillsBlanksOf = (theirs, value) => {
    if (!/_{3,}/.test(theirs) || flat(theirs) === flat(value)) return false;
    const found = S.blankValues ? S.blankValues(flat(theirs), value) : new RegExp(`^${flat(theirs).split(/_{3,}/).map(escapeRe).join('([^]*?)')}$`).exec(flat(value));
    return Boolean(found);
  };
  // The words that say what a SWMS of the project is: its title, its task as given and as changed, and its plant.
  const workWordsOf = (item) => [item.title, item.task, item.goTask, item.body && item.body.task, ...(item.plantNames || []), ...(Array.isArray(item.plant) ? item.plant : [])].filter((part) => typeof part === 'string' && part).join('\n');
  // The SWMS that use an answer given in one SWMS and filled across.
  const usingFact = (index, questionId) => project.items.map((_item, at) => at).filter((at) => at === index || ((project.items[at].filledFrom || {})[questionId] === index));
  const usingShared = () => project.items.map((item, at) => (item.siteOwn ? -1 : at)).filter((at) => at >= 0);

  // ---- What the user does on the page ----

  // An answer goes to its SWMS, and to the same question in the others that are blank or were filled
  // from it (D239: "answers that suit all filled across and changeable").
  function setFact(index, questionId, value) {
    const item = project.items[index];
    item.facts = { ...(item.facts || {}), [questionId]: value };
    if (item.filledFrom) delete item.filledFrom[questionId];
    project.items.forEach((other, at) => {
      if (at === index) return;
      // The company's own SWMS is other work: answers on a builder's list do not fill into it, nor its
      // answers into the list's SWMS (messy round 9: a fall control for Hydraulic services, "Risers and
      // shafts are screened", filled into the foreman's own "Unload pipe deliveries").
      if (isOwn(other) !== isOwn(item)) return;
      const got = asked.get(at);
      if (!got || !(got.required || []).some((question) => question.id === questionId)) return;
      const theirs = (other.facts || {})[questionId] || '';
      const fromHere = (other.filledFrom || {})[questionId] === index;
      if (theirs && !fromHere && !fillsBlanksOf(theirs, value)) return;
      // A fall control, harness or trench answer goes only where the SWMS's own work fits it (messy round 12):
      // one that no longer fits, as it is typed, is taken back out of the SWMS it was filled into.
      const rules = gate();
      if (value && rules && rules.workFits && (rules.ACROSS_WORK_IDS || []).includes(questionId) && !rules.workFits(value, workWordsOf(other), questionId)) {
        if (!fromHere) return;
        other.facts = { ...(other.facts || {}), [questionId]: '' };
        delete other.filledFrom[questionId];
        const was = $(`go-${at}-${questionId}`);
        if (was && was.tagName === 'TEXTAREA') was.value = '';
        else document.querySelectorAll(`[name="go-${at}-${questionId}"]`).forEach((radio) => { radio.checked = false; });
        notesFor(at);
        askSoon(at);
        return;
      }
      other.facts = { ...(other.facts || {}), [questionId]: value };
      other.filledFrom = { ...(other.filledFrom || {}), [questionId]: index };
      if (!value) delete other.filledFrom[questionId];
      const box = $(`go-${at}-${questionId}`);
      if (box && box.tagName === 'TEXTAREA') box.value = value;
      else document.querySelectorAll(`[name="go-${at}-${questionId}"]`).forEach((radio) => { radio.checked = radio.value === value; });
      notesFor(at);
      askSoon(at);
    });
    markStale(usingFact(index, questionId), 'An answer it uses changed.');
  }

  // A design's status, number or revision fills the design blanks in the answers that refer to it.
  function fillDesigns(designId) {
    const rules = fill();
    if (!rules) return;
    const row = shared().designs[designId];
    project.items.forEach((item, index) => {
      for (const [questionId, design] of Object.entries(rules.QUESTION_DESIGNS)) {
        if (design.id !== designId) continue;
        const box = $(`go-${index}-${questionId}`);
        const now = (item.facts || {})[questionId] || '';
        if (!now) continue;
        item.goFilled = item.goFilled || {};
        const result = rules.fillDesign(now, row, item.goFilled[questionId] || []);
        item.goFilled[questionId] = result.applied;
        if (result.text !== now) {
          item.facts = { ...item.facts, [questionId]: result.text };
          if (box) box.value = result.text;
        }
      }
      notesFor(index);
    });
    document.querySelectorAll(`.go-design[data-design-id="${designId}"]`).forEach((card) => {
      card.dataset.status = row.status || '';
      card.querySelectorAll('[data-go-design]').forEach((input) => {
        if (input.type === 'radio') input.checked = input.value === row.status;
        else if (input !== document.activeElement) input.value = row[input.dataset.field] || '';
      });
    });
  }

  function onInput(event) {
    if (!project || project.stage !== 'questions') return;
    const target = event.target;
    const ownBox = /^go-own-(?:name|hazards|controls|who)-(\d+)$/.exec(target.id || '');
    if (ownBox) { keepOwnForm(Number(ownBox[1])); return; }
    if (target.dataset.goTask !== undefined) {
      const index = Number(target.dataset.goTask);
      project.items[index].goTask = target.value;
      markStale([index], 'Its task changed.');
      save();
      askSoon(index);
      return;
    }
    if (target.dataset.goFact !== undefined && target.tagName === 'TEXTAREA') {
      const index = Number(target.dataset.goFact);
      setFact(index, target.dataset.q, target.value);
      const item = project.items[index];
      if (item.draftHelp) item.draftHelp = item.draftHelp.filter((entry) => entry.id !== target.dataset.q);
      notesFor(index);
      save();
      askSoon(index);
      return;
    }
    if (target.dataset.goSharedSite !== undefined) {
      const id = target.dataset.siteId;
      const was = String(sharedSite()[id] || '').trim();
      sharedSite()[id] = target.value;
      // A SWMS with its own site answers keeps following the ones it has not changed (messy round 11,
      // SiteLink: Roof works changed only its Access answer, and the shared Other trades changed later
      // never reached it). Its answer still as the project gave it takes the new one, and it is prepared again.
      project.items.forEach((item, index) => {
        if (!item.siteOwn || String(item.siteOwn[id] || '').trim() !== was || was === String(target.value || '').trim()) return;
        item.siteOwn = { ...item.siteOwn, [id]: target.value };
        const box = $(`go-site-${index}-${id}`);
        if (box && box !== document.activeElement) box.value = target.value;
        markStale([index], SHARED_CHANGED);
      });
      // Only a SWMS prepared with another answer needs preparing again: typing the same words back, or
      // a box the browser fills, changes nothing it prints.
      const same = (index) => String(((project.items[index].body || {}).site || {})[target.dataset.siteId] || '').trim() === String(target.value || '').trim();
      const allSame = (index) => Object.entries(sharedSite()).every(([id, value]) => String(((project.items[index].body || {}).site || {})[id] || '').trim() === String(value || '').trim());
      markStale(usingShared().filter((index) => !same(index)), SHARED_CHANGED);
      unmarkSame(usingShared(), allSame);
      markSuggest(target.dataset.siteId);
      sharedNotes();
      save();
      return;
    }
    if (target.dataset.goOwnSite !== undefined) {
      const index = Number(target.dataset.goOwnSite);
      const item = project.items[index];
      item.siteOwn = { ...(item.siteOwn || {}), [target.dataset.siteId]: target.value };
      markStale([index], 'Its site answers changed.');
      save();
      return;
    }
    if (target.dataset.goWhy !== undefined) {
      const index = Number(target.dataset.goWhy);
      setWhy(index, target.dataset.type, target.value);
      const rules = window.SiteWriteSubstanceRules;
      const note = rules && $(`go-why-need-${index}-${rules.TYPES.indexOf(target.dataset.type)}`);
      const need = notUsedNeed(index, target.dataset.type);
      if (note) { note.textContent = need; note.hidden = !need; }
      return;
    }
    if (target.dataset.goDesign !== undefined && target.type !== 'radio') {
      const row = designRow(target.dataset.goDesign);
      row[target.dataset.field] = target.value;
      if (['number', 'revision'].includes(target.dataset.field)) fillDesigns(row.id);
      markStale(usingDesign(row.id), 'A design it relies on changed.');
      save();
    }
  }
  const usingDesign = (designId) => project.items.map((_item, at) => at).filter((at) => designIds(at).includes(designId));
  // A suggestion from the scope shows as used once its words are in the box.
  function markSuggest(id) {
    const value = String(sharedSite()[id] || '').toLowerCase();
    const list = (shared().siteSuggest || {})[id] || [];
    document.querySelectorAll(`[data-go-suggest="${id}"]`).forEach((button) => {
      const line = String(list[Number(button.dataset.n)] || '').replace(/\.$/, '').toLowerCase();
      button.setAttribute('aria-pressed', String(Boolean(line) && value.includes(line)));
    });
  }

  function onChange(event) {
    if (!project || project.stage !== 'questions') return;
    const target = event.target;
    if (target.name === 'go-crane') {
      shared().crane = target.value;
      // Each SWMS opened on its own page then shows the same answer.
      project.items.forEach((item) => { item.crane = target.value; item.slinging = target.value === 'company' ? slingingNow() : ''; });
      if ($('go-slinging')) $('go-slinging').hidden = target.value !== 'company';
      if ($('go-crane-error')) $('go-crane-error').textContent = '';
      markStale(project.items.map((_item, at) => at), 'The crane answer changed.');
      save();
      project.items.forEach((_item, index) => askSoon(index));
      return;
    }
    if (target.name === 'go-residential') {
      const radio = document.querySelector(`input[name="residential"][value="${target.value}"]`);
      if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); }
      if ($('go-residential-error')) $('go-residential-error').textContent = '';
      markStale(project.items.map((_item, at) => at), 'The residential answer changed.');
      project.items.forEach((_item, index) => askSoon(index));
      save();
      return;
    }
    if (target.name === 'go-slinging') {
      shared().slinging = target.value;
      project.items.forEach((item) => { item.slinging = target.value; });
      if ($('go-slinging-error')) $('go-slinging-error').textContent = '';
      markStale(project.items.map((_item, at) => at), 'Who slings the loads changed.');
      save();
      project.items.forEach((_item, index) => askSoon(index));
      return;
    }
    if (target.dataset.goNotused !== undefined) {
      const index = Number(target.dataset.goNotused);
      setNotUsed(index, target.dataset.type, target.checked);
      // A type this SWMS's own words name asks why, under the tick (D292 item 3).
      const rules = window.SiteWriteSubstanceRules;
      if (rules && rules.namedIn && (rules.namedIn(target.dataset.type, wordsOf(index)) || notUsedNeed(index, target.dataset.type) || $(`go-why-need-${index}-${rules.TYPES.indexOf(target.dataset.type)}`))) {
        drawItem(index);
        const box = $(`go-why-${index}-${rules.TYPES.indexOf(target.dataset.type)}`);
        if (box && box.focus && target.checked) box.focus();
      }
      return;
    }
    if (target.dataset.goFall !== undefined) {
      const index = Number(target.dataset.goFall);
      project.items[index].goFall = target.value;
      delete project.items[index].fallFrom;
      delete project.items[index].fallKept;
      const changed = [index];
      // The same answer fills the fall question of the SWMS not answered yet, or filled from this one,
      // but not one whose own task says otherwise (messy round 3: "Yes" filled into a ground floor SWMS).
      project.items.forEach((other, at) => {
        if (at === index || other.fallRisk || (other.goFall && other.fallFrom !== index)) return;
        // Nor does the fall answer (same reason, above).
        if (isOwn(other) !== isOwn(project.items[index])) return;
        // One whose own work says otherwise keeps the answer it has, now as its own: it was filled from
        // this SWMS and suits its own work (messy round 11, A fault 6: changing Electrical's falls to Yes
        // cleared In-ground's No, and its trench support question went with it).
        if (other.fallHint && other.fallHint !== target.value) {
          if (other.fallFrom === index) { delete other.fallFrom; other.fallKept = true; drawItem(at); }
          return;
        }
        other.goFall = target.value;
        other.fallFrom = index;
        changed.push(at);
        drawItem(at);
        askItem(at);
      });
      markStale(changed, 'Its fall answer changed.');
      save();
      drawItem(index);
      askItem(index);
      return;
    }
    if (target.dataset.goFact !== undefined && target.type === 'radio') {
      const index = Number(target.dataset.goFact);
      setFact(index, target.dataset.q, target.value);
      save();
      askSoon(index);
      return;
    }
    if (target.dataset.goDesign !== undefined && target.type !== 'radio') {
      designRow(target.dataset.goDesign)[target.dataset.field] = target.value;
      save();
      return;
    }
    if (target.dataset.goDesign !== undefined && target.type === 'radio') {
      const row = designRow(target.dataset.goDesign);
      row.status = target.value;
      fillDesigns(row.id);
      markStale(usingDesign(row.id), 'A design it relies on changed.');
      save();
      project.items.forEach((_item, index) => { if (designIds(index).includes(row.id)) askSoon(index); });
    }
  }

  function onClick(event) {
    if (!project) return;
    const submitOne = event.target.closest('[data-go-submit]');
    if (submitOne) { submitItems([Number(submitOne.dataset.goSubmit)], submitOne); return; }
    if (event.target.closest('#go-submit-all')) { submitItems(project.items.map((_item, index) => index), event.target.closest('#go-submit-all')); return; }
    const condDone = event.target.closest('[data-cond-done]');
    if (condDone) { conditionAction('done', condDone.dataset.condDone, condDone); return; }
    const condUndo = event.target.closest('[data-cond-undo]');
    if (condUndo) { conditionAction('undo', condUndo.dataset.condUndo, condUndo); return; }
    const field = event.target.closest('[data-go-field]');
    if (field) {
      const el = $(field.dataset.goField);
      // A box in a closed section (the company profile) is opened first.
      const closed = el && el.closest('details:not([open])');
      if (closed) closed.open = true;
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus({ preventScroll: true }); }
      return;
    }
    const siteGo = event.target.closest('[data-go-site-answer]');
    if (siteGo) {
      project.stage = 'questions';
      save();
      hooks.render();
      const box = $(`go-site-${siteGo.dataset.goSiteAnswer}`);
      if (box) { box.scrollIntoView({ behavior: 'smooth', block: 'center' }); box.focus({ preventScroll: true }); }
      return;
    }
    const pick = event.target.closest('[data-go-pick]');
    if (pick) {
      const index = Number(pick.dataset.goPick);
      const question = ((asked.get(index) || {}).required || []).find((entry) => entry.id === pick.dataset.q);
      const answer = question && (question.suggestions || [])[Number(pick.dataset.n)];
      const box = $(`go-${index}-${pick.dataset.q}`);
      if (!answer || !box) return;
      // A refused or thin answer is replaced, not added to (messy round 3: "as per supplier The ____ system").
      // Another standard answer to the same question already in the box gives way to this one (app.js pickSwap).
      // A standard answer already in the box (filled across from another SWMS, or pressed before) is kept
      // once, with the words in its blanks, and is this SWMS's own answer from now on. It is never added a
      // second time (messy round 15, SiteLink blocker 2: "Lock out and test" pressed where it was filled across
      // printed twice, and the SDS answer pressed again put the whole sentence into its own blank).
      if (box.value.trim() && hasPick(answer.text, box.value)) {
        setFact(index, pick.dataset.q, box.value);
        notesFor(index);
        save();
        const again = S.answerTarget ? S.answerTarget(box) : box;
        again.focus();
        return;
      }
      const fresh = !box.value.trim() || weakAnswer(box);
      const swap = !fresh && S.pickSwap ? S.pickSwap(box, question.suggestions || [], Number(pick.dataset.n)) : null;
      box.value = fresh ? answer.text : swap ? swap.value : `${box.value.trim()} ${answer.text}`;
      if (swap && S.pickSwapNote) S.pickSwapNote(box, swap, () => { setFact(index, pick.dataset.q, box.value); notesFor(index); save(); askSoon(index); });
      if (S.pickedAgain) S.pickedAgain(box.id);
      setFact(index, pick.dataset.q, box.value);
      const design = questionDesign(pick.dataset.q);
      if (design && shared().designs[design.id]) fillDesigns(design.id);
      notesFor(index);
      save();
      askSoon(index);
      const target = S.answerTarget ? S.answerTarget(box) : box;
      target.focus();
      const blank = box.value.indexOf('____');
      if (target === box && blank >= 0 && box.setSelectionRange) box.setSelectionRange(blank, blank + 4);
      return;
    }
    const suggest = event.target.closest('[data-go-suggest]');
    if (suggest) {
      const id = suggest.dataset.goSuggest;
      const line = ((shared().siteSuggest || {})[id] || [])[Number(suggest.dataset.n)];
      const box = $(`go-site-${id}`);
      if (!line || !box) return;
      const now = String(box.value || '').trim();
      const plain = line.replace(/\.$/, '');
      // Pressed again, the line comes out.
      box.value = now.toLowerCase().includes(plain.toLowerCase())
        ? now.replace(new RegExp(`\\s*${plain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.?`, 'i'), '').trim()
        : `${now}${now && !/[.!?]$/.test(now) ? '.' : ''}${now ? ' ' : ''}${line}`;
      box.dispatchEvent(new Event('input', { bubbles: true }));
      box.focus();
      return;
    }
    const across = event.target.closest('[data-go-across-clear]');
    if (across) {
      const index = Number(across.dataset.goAcrossClear);
      const questionId = across.dataset.q;
      const item = project.items[index];
      item.facts = { ...(item.facts || {}), [questionId]: '' };
      if (item.filledFrom) delete item.filledFrom[questionId];
      const box = $(`go-${index}-${questionId}`);
      if (box) { box.value = ''; box.focus(); }
      markStale([index], 'An answer it uses changed.');
      notesFor(index);
      save();
      askSoon(index);
      return;
    }
    const again = event.target.closest('[data-go-ask-again]');
    if (again) { asked.delete(Number(again.dataset.goAskAgain)); drawItem(Number(again.dataset.goAskAgain)); askItem(Number(again.dataset.goAskAgain)); return; }
    const ownWrite = event.target.closest('[data-go-own-write]');
    if (ownWrite) {
      const index = Number(ownWrite.dataset.goOwnWrite);
      const part = ownWrite.dataset.part === '' ? '' : coverLeftOf(index)[Number(ownWrite.dataset.part)] || '';
      openOwnForm(ownWrite, index, part, ownOf(project.items[index]).find((step) => part && step.part === part) || null);
      return;
    }
    const ownChange = event.target.closest('[data-go-own-change]');
    if (ownChange) {
      const index = Number(ownChange.dataset.goOwnChange);
      const step = ownOf(project.items[index]).find((other) => other.name === ownChange.dataset.name);
      if (step) openOwnForm(ownChange, index, step.part, step);
      return;
    }
    const ownRemove = event.target.closest('[data-go-own-remove]');
    if (ownRemove) {
      const index = Number(ownRemove.dataset.goOwnRemove);
      ownSaid = { index, text: `Removed your step "${ownRemove.dataset.name}".` };
      setOwn(index, ownOf(project.items[index]).filter((other) => other.name !== ownRemove.dataset.name));
      drawItem(index);
      return;
    }
    const ownSave = event.target.closest('[data-go-own-save]');
    if (ownSave) { saveOwn(Number(ownSave.dataset.goOwnSave)); return; }
    const ownCancel = event.target.closest('[data-go-own-cancel]');
    if (ownCancel) { const form = $(`go-own-form-${ownCancel.dataset.goOwnCancel}`); if (form) form.remove(); dropOwnForm(); return; }
    const takeOff = event.target.closest('[data-go-take-off]');
    if (takeOff && builder()) {
      const index = Number(takeOff.dataset.goTakeOff);
      const item = project.items[index];
      const name = builderName();
      if (!item || !window.confirm(`${name} asked for "${item.title}". Take it off your list here? ${name} still expects it, and sees that you took it off. You can put it back.`)) return;
      // The note goes where the button was pressed, at the same height on the screen, and always in view
      // (messy round 8: on a phone the view was left a screen above the note, the SWMS's top being the mark).
      const top = takeOff.getBoundingClientRect().top;
      const before = [...project.items];
      project.items.splice(index, 1);
      project.offList = [...(project.offList || []), item];
      goneNote = { requiredId: item.requiredId, at: index };
      listChanged(before);
      const note = $('go-gone');
      if (note) window.scrollBy(0, note.getBoundingClientRect().top - Math.max(16, Math.min(top, window.innerHeight - 160)));
      if (note) { note.setAttribute('tabindex', '-1'); note.focus({ preventScroll: true }); }
      return;
    }
    const putBack = event.target.closest('[data-go-put-back]');
    if (putBack && builder()) {
      const off = project.offList || [];
      const item = off[Number(putBack.dataset.goPutBack)];
      if (!item) return;
      // Back in its place on the builder's list, before the company's own SWMS.
      const order = ((builder().listItems) || []).map((one) => one.requiredId);
      const rank = (one) => (one.requiredId ? order.indexOf(one.requiredId) : Infinity);
      let at = project.items.findIndex((one) => rank(one) > rank(item));
      if (at < 0) at = project.items.length;
      const note = $('go-gone');
      const fromNote = Boolean(note && note.contains(putBack));
      const top = fromNote ? note.getBoundingClientRect().top : null;
      const before = [...project.items];
      project.offList = off.filter((one) => one !== item);
      project.items.splice(at, 0, item);
      goneNote = null;
      listChanged(before);
      const box = $(`go-item-${at}`);
      // Put back from the note: the SWMS comes back where the note was, without the page moving.
      if (box && top !== null) window.scrollBy(0, box.getBoundingClientRect().top - top);
      else if (box && box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const ownSwmsRemove = event.target.closest('[data-go-own-swms-remove]');
    if (ownSwmsRemove && builder()) {
      const index = Number(ownSwmsRemove.dataset.goOwnSwmsRemove);
      const item = project.items[index];
      if (!item || item.requiredId || !window.confirm(`Remove your SWMS "${item.title}" from this page? What you prepared for it here is lost. A copy you downloaded stays in My SWMS.`)) return;
      const before = [...project.items];
      project.items.splice(index, 1);
      listChanged(before);
      return;
    }
    if (event.target.closest('#go-own-add') && builder()) { addOwnSwms(); return; }
    if (event.target.closest('#go-to-review')) { toReview(); return; }
    if (event.target.closest('#go-prepare-stale')) { prepareStale(event.target.closest('#go-prepare-stale')); return; }
    const cover = event.target.closest('[data-go-cover]');
    if (cover) {
      const box = $(`go-cover-${cover.dataset.goCover}`) || $(`go-item-${cover.dataset.goCover}`);
      if (box) { box.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (box.focus) { box.setAttribute('tabindex', '-1'); box.focus({ preventScroll: true }); } }
      return;
    }
    const jump = event.target.closest('[data-go-missing]');
    if (jump) { goToMissing(Number(jump.dataset.goMissing)); return; }
    const own = event.target.closest('[data-go-site-own]');
    if (own) {
      const index = Number(own.dataset.goSiteOwn);
      project.items[index].siteOwn = { ...sharedSite() };
      save();
      drawItem(index);
      const first = $(`go-site-${index}-liveServices`);
      if (first) first.focus();
      return;
    }
    const sameSite = event.target.closest('[data-go-site-same]');
    if (sameSite) {
      const index = Number(sameSite.dataset.goSiteSame);
      delete project.items[index].siteOwn;
      save();
      drawItem(index);
      return;
    }
    const goTo = event.target.closest('[data-go-to-item]');
    if (goTo && noSteps(project.items[Number(goTo.dataset.goToItem)])) {
      const write = document.querySelector(`#go-cover-${goTo.dataset.goToItem} [data-go-own-write]`) || $(`go-item-${goTo.dataset.goToItem}`);
      if (write) { write.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (write.focus) write.focus({ preventScroll: true }); }
      return;
    }
    if (goTo) {
      const index = Number(goTo.dataset.goToItem);
      const box = document.querySelector(`#go-item-${index} .answer-note:not([hidden])`);
      const holder = box ? box.previousElementSibling && box.closest('.field') : $(`go-item-${index}`);
      const target = box ? (box.closest('.field') || box) : $(`go-item-${index}`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const input = holder && holder.querySelector('textarea[data-go-fact]');
      const where = input && S.answerTarget ? S.answerTarget(input) : input;
      if (where) where.focus({ preventScroll: true });
      return;
    }
    if (event.target.closest('#go-check-prepared')) { toReview(); return; }
    if (event.target.closest('#go-prepare')) { prepareAll(event.target.closest('#go-prepare')); return; }
    if (event.target.closest('[data-go-prepare-stale]')) { prepareStale(null); return; }
    if (event.target.closest('#go-prepare-again')) { const again = $('go-prepare'); if (again) prepareAll(again); return; }
    if (event.target.closest('#go-back-questions')) {
      project.stage = 'questions';
      save();
      hooks.render();
      return;
    }
  }

  // A SWMS of the company's own, for other work its crew does on the builder's job: prepared like the
  // others, saved under the company, and marked "Your own, not sent".
  function addOwnSwms() {
    // Typed case is tidied (messy round 7: "unloading ute").
    const title = String($('go-own-title').value || '').replace(/\s+/g, ' ').trim().slice(0, 160).replace(/^./, (letter) => letter.toUpperCase());
    // Each sentence with its capital, the last with its full stop (messy round 8, wording 13: "unload cable drums").
    const task = String($('go-own-task').value || '').trim().slice(0, 5000).replace(/^[a-z]/, (letter) => letter.toUpperCase()).replace(/([.!?]\s+)([a-z])/g, (whole, gap, letter) => `${gap}${letter.toUpperCase()}`).replace(/([A-Za-z0-9)])$/, '$1.');
    const said = $('go-own-error');
    // The refusal is brought into view with its box (messy round 7: on a phone it was out of view).
    const refuse = (text, box) => {
      said.textContent = text;
      const el = $(box);
      if (el) { el.focus({ preventScroll: true }); el.setAttribute('aria-describedby', 'go-own-error'); }
      const block = $('go-own-swms');
      if (block && block.scrollIntoView) (el || block).scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    if (!title) return refuse('Give your SWMS a title, for example Core holes for services.', 'go-own-title');
    if (task.split(/\s+/).filter(Boolean).length < 3) return refuse('Say what work it covers, in a few words, for example Core drill holes through the level 2 slab.', 'go-own-task');
    if ([...project.items, ...(project.offList || [])].some((item) => String(item.title || '').trim().toLowerCase() === title.toLowerCase())) return refuse('A SWMS on this page already has that title. Give yours another one.', 'go-own-title');
    if (project.items.length >= 100) return refuse('This page holds up to 100 SWMS.', 'go-own-title');
    project.items.push({ title, task, ownId: `own-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, trade: '', kinds: null, leaveOut: null, unmatched: null, fallRisk: '', fallHint: '', crane: shared().crane || '', slinging: '', site: {}, plant: [], body: null, status: 'todo' });
    save();
    hooks.render();
    // The boxes are empty again for the next one (a redraw keeps what was being typed).
    ['go-own-title', 'go-own-task'].forEach((id) => { const box = $(id); if (box) { box.value = ''; box.blur(); } });
    const index = project.items.length - 1;
    const box = $(`go-item-${index}`);
    if (box && box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---- Prepare all ----

  // What Prepare all waits for, each said at its question and in one list by the button (messy round 3:
  // pressing it early moved the page to the first Yes with no word).
  const NAMES_CRANE = /\b(?:cranes?|cranage|craneage|franna|hiabs?|crane trucks?)\b/i;
  let missing = [];
  function prepareMissing() {
    const out = [];
    if (!document.querySelector('input[name="state"]:checked')) out.push({ text: 'Which state or territory is this job in? Pick the job address from the list under its box, or tick the state.', at: 'input[name="state"]', note: 'go-state-error', say: '' });
    project.items.forEach((item, index) => {
      if (!item.fallRisk && !item.goFall) out.push({ text: `SWMS ${index + 1} (${item.title}): could a person fall more than 2 metres? Answer Yes or No.`, at: `[data-go-fall="${index}"]`, note: `go-fall-error-${index}`, say: 'Answer Yes or No before Prepare all.' });
    });
    if (residentialAsked() && !residentialNow()) out.push({ text: 'Say whether this is residential construction work.', at: 'input[name="go-residential"]', note: 'go-residential-error', say: 'Answer Yes or No: it sets the fall height for every SWMS.' });
    if (!shared().crane) {
      const named = project.items.some((item) => NAMES_CRANE.test(`${item.goTask !== undefined ? item.goTask : item.task} ${(item.scopeTask && item.scopeTask.full) || ''}`));
      if (named) out.push({ text: 'A task names a crane: say whether a crane is used, and who operates it.', at: 'input[name="go-crane"]', note: 'go-crane-error', say: 'A task names a crane. Say whether a crane is used, and who operates it.' });
    }
    if (shared().crane === 'company' && !slingingNow()) out.push({ text: SLINGING_ASK, at: 'input[name="go-slinging"]', note: 'go-slinging-error', say: SLINGING_ASK });
    return out;
  }
  // The details that are still to give before download, but do not stop Prepare all.
  function laterMissing() {
    const rules = gate();
    const out = PEOPLE.filter(([id]) => { const el = $(id); const rule = peopleRule(id); return el && (!String(el.value || '').trim() || (rules && rule && rules.answerNeed(rule, el.value))); }).map(([, label]) => label);
    const site = sharedSite();
    for (const [id, label] of SITE) if (!String(site[id] || '').trim() && project.items.some((item) => !item.siteOwn)) out.push(`Site question: ${label}`);
    return out;
  }
  function goToMissing(at) {
    const entry = missing[at];
    const el = entry && document.querySelector(entry.at);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus({ preventScroll: true }); }
  }
  // Set once the list by Prepare all is shown, so it follows the answers from then on.
  let missingShown = false;
  function showMissing(list) {
    missingShown = true;
    const status = $('go-status');
    document.querySelectorAll('.go-fall-error').forEach((note) => { note.textContent = ''; });
    for (const entry of list) {
      let note = $(entry.note);
      if (!note && /^go-fall-error-/.test(entry.note)) {
        const radio = document.querySelector(entry.at);
        const holder = radio && radio.closest && radio.closest('fieldset');
        if (holder) { note = document.createElement('p'); note.id = entry.note; note.className = 'error go-fall-error'; note.setAttribute('role', 'alert'); holder.appendChild(note); }
      }
      if (note) note.textContent = entry.say;
    }
    const later = laterMissing();
    if (status) status.innerHTML = `<div class="warning go-missing" role="alert"><p><strong>Before Prepare all, answer ${list.length === 1 ? 'this' : `these ${list.length}`}:</strong></p><ul>${list.map((entry, i) => `<li>${esc(entry.text)} <button type="button" class="link" data-go-missing="${i}">Go to it</button></li>`).join('')}</ul>${later.length ? `<p class="meta">Also still to give before download (you can prepare without them): ${esc(later.join('; '))}.</p>` : ''}</div>`;
  }

  // The list by Prepare all follows the answers as they are given (messy round 5, run 6: it still asked
  // for fall and site answers already given). It is drawn again once shown, and goes when nothing is left.
  function refreshMissing() {
    const status = $('go-status');
    if (!project || project.stage !== 'questions' || !status || !missingShown) return;
    missing = prepareMissing();
    if (missing.length) { showMissing(missing); return; }
    document.querySelectorAll('.go-fall-error').forEach((note) => { note.textContent = ''; });
    const later = laterMissing();
    status.innerHTML = `<p class="note go-missing-done" role="status">Everything Prepare all needs is answered. Press Prepare all ${project.items.length} SWMS.${later.length ? ` Still to give before download (you can prepare without them): ${esc(later.join('; '))}.` : ''}</p>`;
  }

  async function prepareAll(button) {
    const status = $('go-status');
    project.tried = true;
    sharedNotes();
    // No crane named in any task, and no answer: "No crane" (D279).
    if (!shared().crane && !project.items.some((item) => NAMES_CRANE.test(`${item.goTask !== undefined ? item.goTask : item.task} ${(item.scopeTask && item.scopeTask.full) || ''}`))) {
      shared().crane = 'none';
      project.items.forEach((item) => { item.crane = 'none'; item.slinging = ''; });
      document.querySelectorAll('input[name="go-crane"]').forEach((radio) => { radio.checked = radio.value === 'none'; });
    }
    missing = prepareMissing();
    if (missing.length) {
      showMissing(missing);
      if (status && status.scrollIntoView) status.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if ($('go-slinging-error')) $('go-slinging-error').textContent = '';
    missingShown = false;
    button.disabled = true;
    try {
      for (let index = 0; index < project.items.length; index += 1) {
        status.textContent = `Preparing SWMS ${index + 1} of ${project.items.length}...`;
        if (!asked.get(index) || asked.get(index).error) await askItem(index);
        // What the user changed when checking it before (steps, controls, plant, emergency answers) stays:
        // only the answers changed on this page since go over it.
        const item = project.items[index];
        const changes = changesFor(index);
        // A prepared SWMS nothing has changed for is left as it is, with its ticks.
        if (item.kind === 'draft' && item.body && item.goSent && !item.stale && !Object.keys(changes).length) continue;
        await prepareOne(index, { ...(item.body || {}), ...changes });
      }
      afterPrepare();
    } catch (error) {
      status.innerHTML = `${esc(error.message)}${error.serverDown ? ' <button type="button" class="link" id="go-prepare-again">Try again</button>' : ''}`;
    } finally {
      button.disabled = false;
    }
  }

  async function prepareOne(index, body) {
    // A host's error page (a 502) or no signal says so plainly (messy round 3).
    const { response, data: draft } = S.postJson ? await S.postJson('/api/draft', body) : await fetch(api('/api/draft'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (got) => ({ response: got, data: await got.json() }));
    if (!response.ok) throw new Error(draft.message || `SWMS ${index + 1} could not be prepared.`);
    const item = project.items[index];
    const kept = item.checkKept;
    delete item.stale;
    delete item.checkKept;
    // Only the emergency answers this SWMS's draft asks are kept with it (scope.js keptEmergency).
    item.emergencyAsked = (S.askedEmergency && S.askedEmergency(draft)) || item.emergencyAsked;
    item.body = S.keptEmergency ? S.keptEmergency(body, item.emergencyAsked) : body;
    item.kind = draft.kind;
    // The plant it uses, so an emergency answer naming other plant is not filled into it (messy round 11).
    if (draft.kind === 'draft') item.plantNames = (draft.plant || []).map((row) => row && row.item).filter(Boolean);
    const rules = window.SiteWriteSubstanceRules;
    item.silicaStep = draft.kind === 'draft' && rules && rules.silicaStep ? rules.silicaStep(draft) : '';
    item.substanceUses = draft.kind === 'draft' && rules && rules.stepUses ? rules.stepUses(draft) : {};
    item.stepWords = draft.kind === 'draft' && rules && rules.stepWords ? rules.stepWords(draft) : '';
    item.notCovered = draft.notCovered || [];
    item.notCoveredWritten = draft.notCoveredWritten || [];
    item.notCoveredMain = draft.notCoveredMain || [];
    // Steps still rated High after controls, named before the download (D292 item 4).
    item.highAfter = (draft.jobSteps || []).map((step, at) => (step.risk && step.risk.after && step.risk.after.level === 'High' ? `step ${at + 1} (${step.step})` : '')).filter(Boolean);
    item.draftHelp = draft.kind === 'stand-down' ? (draft.missingHelp || []) : [];
    item.needs = draft.kind === 'stand-down'
      ? ((draft.missingHelp || []).length ? draft.missingHelp.map((gap) => gap.label) : (draft.missing || []))
      : [...new Set([...(draft.gate || []).filter((gap) => gap.kind !== 'cover').map((gap) => gap.label)])];
    if (draft.kind === 'draft') await askedOnceOpened(index, body, draft);
    item.status = hooks.statusOf(item);
    markSent(index);
    // A part ticked as checked that now prints differently (a detail every SWMS shares, changed on this
    // page) is ticked again before this SWMS downloads (D286).
    const parts = window.SiteWriteCheckParts;
    if (item.check && parts && draft.checkParts) {
      const cleared = parts.staleParts(item.check.partHashes, draft.checkParts);
      if (cleared.length) { delete item.check; item.checkNote = parts.staleMessage(cleared); }
    } else if (kept && parts && draft.checkParts) {
      // Ticks put aside when an answer it uses changed: once prepared, only the parts that now print
      // differently are named, and with none changed the check comes back (messy round 7, run 6: "Its
      // ticks were cleared" when only the parts that changed were).
      const cleared = parts.staleParts(kept.partHashes, draft.checkParts);
      if (!cleared.length) { item.check = kept; delete item.checkNote; } else item.checkNote = parts.staleMessage(cleared);
    }
  }

  // The PPE a prepared draft ticks (a harness for its EWP step) brings questions the SWMS asks once it is
  // opened. They are asked here too, in its section, and the SWMS is not counted as prepared until they are
  // answered (messy round 15, SiteLink stuck point 2: Prepare all said "13 SWMS prepared", and three opened
  // "This SWMS is not finished. Harness and anchors: Not answered yet", a question this page never asked; there
  // the opened SWMS was asked its questions with no answers, app.js payload).
  const PPE_QUESTIONS = { harness: 'harnessSystem', lifeJacket: 'lifeJacketDetails' };
  // The PPE the SWMS prints, as the opened SWMS sends it: each item ticked for all work, and each item for
  // particular steps (app.js ppeTicked).
  const tickedOf = (groups) => [...new Set((Array.isArray(groups) ? groups : []).flatMap((group) => ((group && group.items) || []).filter((entry) => entry && (entry.ticked || (Array.isArray(entry.steps) && entry.steps.length))).map((entry) => entry.id)))];
  async function askedOnceOpened(index, body, draft) {
    const item = project.items[index];
    if (Array.isArray(body.ppe)) return;
    const ppe = tickedOf(draft.ppe);
    const askedNow = new Set(((asked.get(index) || {}).required || []).map((question) => question.id));
    const brought = Object.entries(PPE_QUESTIONS).filter(([id, question]) => ppe.includes(id) && !askedNow.has(question));
    item.draftPpe = brought.length || (item.draftPpe || []).length ? ppe : undefined;
    if (!brought.length) return;
    const post = (route, sent) => (S.postJson ? S.postJson(route, sent)
      : fetch(api(route), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sent) }).then(async (got) => ({ response: got, data: await got.json() })));
    try {
      const { response, data } = await post('/api/draft/questions', { ...payloadFor(index), ppe });
      if (!response.ok || !data || !Array.isArray(data.required)) return;
      // Prepared as the opened SWMS prepares it, with its PPE: does it still prepare with the answers given?
      const { response: done, data: again } = await post('/api/draft', { ...body, ppe });
      asked.set(index, data);
      drawItem(index);
      if (!done.ok || !again || again.kind !== 'stand-down') return;
      item.kind = 'stand-down';
      item.draftHelp = again.missingHelp || [];
      item.needs = item.draftHelp.length ? item.draftHelp.map((gap) => gap.label) : (again.missing || []);
      notesFor(index);
    } catch {
      // No signal: the SWMS says what it needs once it is opened.
    }
  }
  function afterPrepare() {
    const status = $('go-status');
    const unfinished = project.items.map((item, index) => (item.kind !== 'draft' ? index : -1)).filter((index) => index >= 0);
    if (unfinished.length && !status) { project.stage = 'questions'; save(); hooks.render(); }
    if (unfinished.length && $('go-status')) {
      const status = $('go-status');
      // A SWMS whose answers are too thin stays on this page, with each answer's note under its box.
      const all = unfinished.length === project.items.length;
      status.innerHTML = `${said()}<div class="warning go-unfinished"><p><strong>${all ? 'None of the SWMS can be prepared yet.' : `${unfinished.length === 1 ? 'One SWMS is' : `${unfinished.length} SWMS are`} not finished. The others are prepared.`}</strong> ${unfinished.some((index) => noSteps(project.items[index])) ? 'Each one says what it needs.' : 'These answers need more. Each one says under its box what would do.'}</p><ul>${unfinished.map((index) => `<li>SWMS ${index + 1}, ${esc(project.items[index].title)}: ${esc(needsLine(project.items[index]))}. <button type="button" class="link" data-go-to-item="${index}">${noSteps(project.items[index]) ? 'Write a step for it' : 'Go to it'}</button></li>`).join('')}</ul>${all ? '' : `<p>Or check the ${project.items.length - unfinished.length} prepared now and download them, and finish ${unfinished.length === 1 ? 'this one' : 'these'} later. <button type="button" class="secondary small" id="go-check-prepared">Check the ${project.items.length - unfinished.length} prepared SWMS</button></p>`}</div>`;
      save();
      unfinished.forEach((index) => notesFor(index));
      drawKept();
      status.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    toReview();
  }
  // What a SWMS not prepared still needs, in one line with no doubled full stop (messy round 4:
  // "or write this SWMS yourself..").
  // This page has no Job steps list, so the way on is the user's own step in the SWMS's section.
  const needsLine = (item) => (item.needs || []).map((need) => String(need).replace(/Pick the job steps that cover the work under Job steps, or write your own step for the work with "Write a step for this"/g, 'Write your own step for the work with "Write a step for this" in its section below').replace(/[.\s]+$/, '')).join('; ');
  // Stood down for want of job steps: its own steps are written in its section.
  const noSteps = (item) => (item.needs || []).some((need) => /^Job steps for this work:/.test(String(need)));
  const weakAnswer = (box) => {
    const rules = gate();
    const text = String(box.value || '').trim();
    return Boolean((rules && rules.notAnswer && rules.notAnswer(text)) || text.split(/\s+/).length < 3 || (box.classList && box.classList.contains('answer-thin')));
  };
  function toReview() {
    project.stage = 'review';
    save();
    hooks.render();
    requestAnimationFrame(() => $('project-panel').scrollIntoView({ block: 'start' }));
    if (S.markStage) S.markStage('review');
  }

  // On the review list, a change to the details every SWMS shares (the job address, the people, the
  // company) is put into each SWMS, and the list says again what each still needs.
  let refreshTimer = null;
  let refreshing = false;
  // A change made while the list is being brought up to date is put in once that is done, so the list does not
  // keep a need already given (messy round 15, SiteLink: "For every SWMS, still to give: Scaffold supervisor"
  // stayed after it was filled in, until a reload).
  let refreshAgain = false;
  // given: only the details given on the page are put in (as the page loads); otherwise all of them, as
  // the person typed them.
  async function refreshAll({ given = false } = {}) {
    if (refreshing) { refreshAgain = true; return; }
    if (!project || project.stage !== 'review') return;
    const base = given ? pageGiven() : pageBase();
    if (!base.state) return;
    refreshing = true;
    try {
      for (let index = 0; index < project.items.length; index += 1) {
        const item = project.items[index];
        // One marked as needing preparing again takes this page's answers too.
        const own = item.stale ? changesFor(index) : {};
        if (given) for (const key of PAGE_KEYS) if (!(key in base)) delete own[key];
        // A detail the builder set that was changed for this SWMS alone stays its own (messy round 8).
        // An own detail left empty does not empty the one given for every SWMS.
        const pageOwn = builder() && item.pageOwn ? Object.fromEntries(Object.entries(item.pageOwn).filter(([, value]) => String(value || '').trim())) : {};
        if (item.body) await prepareOne(index, { ...item.body, ...own, ...base, ...pageOwn, emergency: { ...(S.emergencyAcross ? S.emergencyAcross(item) : shared().emergency), ...Object.fromEntries(Object.entries(item.body.emergency || {}).filter(([, value]) => String(value || '').trim())) } });
      }
      save();
      if (project.stage === 'review') hooks.render();
    } catch {
      // With no signal the list stays as it was; each SWMS is checked again when it is opened.
    } finally {
      refreshing = false;
    }
    if (refreshAgain) { refreshAgain = false; refreshAll(); }
  }

  // ---- The review list (D240) ----

  // What every SWMS shares is said once, above the list; each SWMS lists only its own.
  const SHARED_LABELS = new Set([...PEOPLE.map(([, label]) => label), SCAFFOLD[1]]);
  const SITE_LABEL = /^Site: /;
  // A site answer every SWMS shares (none has its own) is asked for once, on the questions page.
  const sharedSiteNeeds = () => {
    const using = project.items.filter((item) => !item.siteOwn && item.body);
    if (!using.length) return [];
    return SITE.filter(([, label]) => using.some((item) => (item.needs || []).includes(`Site: ${label}`))).map(([id, label]) => ({ id, label }));
  };
  function companyMissing() {
    if (!S.signedIn || !S.signedIn()) return '';
    const profile = (S.getProfile && S.getProfile()) || {};
    const name = String(profile.name || '').trim();
    const abn = String(profile.abn || '').replace(/\D/g, '');
    return name && abn ? '' : !name && !abn ? 'Company name and ABN' : !name ? 'Company name' : 'ABN';
  }
  // The types of hazardous substance a SWMS waits for (substances.js, D277), said once with what to do,
  // not as one "Hazardous substance: ..." item each.
  const TYPE_LABEL = 'Hazardous substance: ';
  const TYPE_DO = 'for each hazardous substance, add the product you use or tick "Not required"';
  const TYPE_WHY = 'give the short reason each one ticked "Not required" is not required, under its tick on this page';
  // The types ticked "Not required" for a SWMS, by the name the needs list gives them.
  const tickedTypes = (item) => { const rules = window.SiteWriteSubstanceRules; return new Set(rules ? notUsedOf(item).map(rules.promptName) : []); };
  function splitTypes(labels) {
    const rules = window.SiteWriteSubstanceRules;
    const names = new Set(rules ? rules.TYPES.map(rules.promptName) : []);
    const isType = (label) => label.startsWith(TYPE_LABEL) && names.has(label.slice(TYPE_LABEL.length));
    return { give: labels.filter((label) => !isType(label)), types: labels.filter(isType).map((label) => label.slice(TYPE_LABEL.length)) };
  }
  // Each SWMS is checked on its own before it downloads (D240, D286): SiteWrite's check, each part
  // ticked, a name and role. The list says whose check it has, or that it needs one.
  const checkOf = (item) => (S.projectCheckOf ? S.projectCheckOf(item) : null);
  const CHECK_IT = 'open it, tick each part as checked, and give your name and role';
  function itemState(item) {
    const own = (item.needs || []).filter((label) => !SHARED_LABELS.has(label) && !(SITE_LABEL.test(label) && !item.siteOwn));
    // Prepared before an answer it uses changed: kept, but prepared again before download. Its check
    // is cleared with it (D286): it is checked again once prepared.
    if (item.stale) return { ready: false, stale: true, text: `Needs preparing again: ${String(item.stale).replace(/\.$/, '').replace(/^[A-Z]/, (letter) => letter.toLowerCase())}.${item.checkNote === CHECK_CLEARED ? ' Any ticked part that changes is named once it is prepared.' : ''}` };
    if (item.status === 'ready') {
      const check = checkOf(item);
      if (check) return { ready: true, text: `Ready to download. Checked by ${check.name}, ${check.role}.` };
      if (item.mustFix) return { ready: false, check: true, text: `SiteWrite's check found ${item.mustFix === 1 ? 'a must-fix item' : `${item.mustFix} must-fix items`}. Open it and fix ${item.mustFix === 1 ? 'it' : 'each one'} with its Go to button, then tick the parts.` };
      return { ready: false, check: true, text: `${item.checkNote ? `${item.checkNote} ` : ''}Ready for your check: ${CHECK_IT}.` };
    }
    if (item.kind && item.kind !== 'draft' && noSteps(item)) return { ready: false, text: 'Not finished: SiteWrite has no job steps for its work. Write your own step for it under its questions (Back to the questions), or when you check it.' };
    if (item.kind && item.kind !== 'draft') return { ready: false, text: `Not finished: ${own.map((need) => String(need).replace(/[.\s]+$/, '')).join('; ')} ${own.length === 1 ? 'needs' : 'need'} more.` };
    if (item.status === 'write' || item.status === 'tick') {
      const index = project.items.indexOf(item);
      const left = index >= 0 ? coverLeftOf(index) : [];
      return { ready: false, cover: true, text: `No job steps yet for: ${left.join('; ') || 'part of its work'}. Write your own step for each${item.status === 'write' ? '' : ', or say which SWMS covers it'}.` };
    }
    const { give, types: all } = splitTypes(own);
    // A type ticked "Not required" that still needs its reason is not said as if the tick were lost (messy round 14, A
    // runs 1 and 2): it asks for the reason, beside the tick on this page.
    const ticked = tickedTypes(item);
    const types = all.filter((name) => !ticked.has(name));
    const why = all.filter((name) => ticked.has(name));
    const typesText = [types.length ? `${TYPE_DO}: ${types.join('; ')}` : '', why.length ? `${TYPE_WHY}: ${why.join('; ')}` : ''].filter(Boolean).join('; and ');
    const text = give.length ? `Before download, open it to give: ${give.join('; ')}.${typesText ? ` Then, ${typesText}.` : ''}`
      : why.length && !types.length ? `Before download, ${typesText}.` : typesText ? `Before download, open it and, ${typesText}.` : 'Waiting only for the details above.';
    return { ready: false, text, give, types, why };
  }
  function sharedNeeds() {
    // A person's box left empty, or given an answer a SWMS does not accept ("TBA").
    // The scaffold supervisor too, where a SWMS involves a scaffold: it is given once above, and "Go to"
    // goes to its box, not into a SWMS (messy round 3, run 3).
    const people = [...PEOPLE, ...(scaffoldNeeded() ? [SCAFFOLD] : [])].filter(([id, label]) => { const el = $(id); return (el && !el.value.trim() && label !== SCAFFOLD[1]) || project.items.some((item) => (item.needs || []).includes(label)); }).map(([id, label]) => ({ id, label }));
    const company = companyMissing();
    return company ? [{ id: !String(((S.getProfile && S.getProfile()) || {}).name || '').trim() ? 'profile-company' : 'profile-abn', label: company }, ...people] : people;
  }
  // Owner, 14 October 2026 (D278): when only some SWMS are ready, the ready ones download, and the page
  // names each one not ready yet with what it still needs and a button to it. Each later download gives
  // every SWMS ready by then in one zip; one unchanged since it was last downloaded keeps its revision.
  const lowerFirst = (text) => String(text).replace(/^[A-Z](?=[a-z])/, (letter) => letter.toLowerCase());
  const needsText = (state) => {
    if (state.check) return CHECK_IT;
    if ((state.types && state.types.length) || (state.why && state.why.length)) return [state.give.length ? `give ${state.give.map(lowerFirst).join('; ')}` : '', state.types.length ? `${TYPE_DO}: ${state.types.join('; ')}` : '', state.why.length ? `${TYPE_WHY}: ${state.why.join('; ')}` : ''].filter(Boolean).join('; then, ');
    const text = state.text.replace(/\.$/, '');
    const give = /^Before download, open it to give: (.*)$/.exec(text);
    return give ? `give ${give[1].split('; ').map(lowerFirst).join('; ')}` : lowerFirst(text);
  };
  const notReadyLine = (item, index, state) => `<li>SWMS ${index + 1} (${esc(item.title)}): ${esc(needsText(state))}. ${state.stale ? '<button type="button" class="link" data-go-prepare-stale>Prepare it again</button>' : `<button type="button" class="link" data-project-open="${index}" data-project-need${state.cover ? ' data-project-cover' : ''}>Go to it</button>`}</li>`;
  function downloadHtml(states, ready, n) {
    const waiting = project.items.map((item, index) => ({ item, index, state: states[index] })).filter((entry) => !entry.state.ready);
    const last = project.lastDownload;
    const label = ready === n ? `Download all ${n} SWMS (Word and PDF, one zip)` : ready ? `Download the ${ready} checked SWMS (Word and PDF, one zip)` : `Download all ${n} SWMS (Word and PDF, one zip)`;
    const said = last
      ? `<div class="note" id="go-downloaded" role="status"><p><strong>${last.count === last.total ? `Downloaded all ${last.total} SWMS` : `Downloaded ${last.count} of ${last.total} SWMS`}</strong>, each saved under My SWMS as its own SWMS and revision.${waiting.length ? ' Not ready yet:' : last.count < last.total ? ' Every SWMS is now ready: download again to get them all.' : ''}</p>${waiting.length ? `<ul>${waiting.map((entry) => notReadyLine(entry.item, entry.index, entry.state)).join('')}</ul><p class="meta">Download again once ${waiting.length === 1 ? 'it is' : 'they are'} ready: the zip then has every ready SWMS. One you have not changed keeps its revision.</p>` : ''}</div>`
      : '';
    const before = !last && ready < n
      ? (ready
        ? `<div class="note" id="go-not-ready"><p>${ready} of ${n} SWMS ${ready === 1 ? 'is' : 'are'} ready and checked. You can download ${ready === 1 ? 'it' : 'them'} now, and the rest once they are ready and checked. Not ready yet:</p><ul>${waiting.map((entry) => notReadyLine(entry.item, entry.index, entry.state)).join('')}</ul></div>`
        : '<p class="note">None of the SWMS is ready to download yet. Each one in the list above says what it still needs.</p>')
      : !last ? '<p class="meta">Every SWMS has cleared SiteWrite\'s checks and has been checked part by part.</p>' : '';
    // The state whose law every SWMS uses (D292 item 1), and the steps still rated High (D292 item 4).
    const radio = document.querySelector('input[name="state"]:checked');
    const label2 = radio && radio.closest && radio.closest('label');
    const stateText = label2 && label2.querySelector ? String((label2.querySelector('span') || {}).textContent || '').trim() : '';
    const stateHtml = stateText ? `<p class="meta" id="go-state-line"><strong>State: ${esc(stateText)}.</strong> Every SWMS of this project uses its law. If the job is in another state, change the job address above.</p>` : '';
    const high = project.items.map((item, index) => ({ item, index })).filter(({ item }) => item.kind === 'draft' && (item.highAfter || []).length);
    const highHtml = high.length ? `<div class="warning high-after" id="go-high-after" role="status"><p><strong>Still rated High after controls:</strong></p><ul>${high.map(({ item, index }) => `<li>SWMS ${index + 1} (${esc(item.title)}): ${esc(item.highAfter.join('; '))}.</li>`).join('')}</ul><p>Each prints "This step does not start until" the supervisor adds controls that lower the rating, or accepts the risk in writing. Add controls when you check the SWMS, or make sure the risk is accepted in writing before the work starts. They still download.</p></div>` : '';
    return `${said}${before}${stateHtml}${highHtml}
      <div class="actions"><button type="button" id="project-zip"${ready ? '' : ' disabled'}>${label}</button></div><p class="error" id="project-zip-error" role="alert"></p>
      ${S.signedIn && S.signedIn() ? '<p class="meta">Downloading saves each SWMS under My SWMS as its own SWMS and revision, so every copy printed has a record.</p>' : ''}`;
  }

  function reviewHtml() {
    const n = project.items.length;
    const states = project.items.map(itemState);
    const ready = states.filter((state) => state.ready).length;
    const prepared = project.items.filter((item) => item.kind === 'draft').length;
    const firstToCheck = project.items.findIndex((item, index) => !states[index].ready);
    const can = S.canDownload && S.canDownload();
    const top = (lede) => (builder() ? builderTop(`<p class="lede">${lede}</p>`) : `<div class="project-head"><h2>Project SWMS</h2><button type="button" class="small secondary" id="project-fresh">Start fresh</button></div>
      <p class="lede">${lede}</p>`);
    return `${top(`${prepared === n ? `${n} SWMS prepared` : `${prepared} of ${n} SWMS prepared`}. Check each one: open it, read its steps as they will print, and change any step's wording with <strong>Change</strong> beside the line (on a phone, <strong>Change this step</strong> first). Under its draft, SiteWrite checks it, then you tick each part as checked and give your name and role. Only SWMS checked this way download.`)}
      <p class="error" id="project-error"></p>${said()}
      ${sharedNeeds().length || sharedSiteNeeds().length ? `<div class="note" id="go-shared-needs"><p><strong>For every SWMS, still to give:</strong></p><ul class="go-people">${sharedNeeds().map((need) => `<li><button type="button" class="link" data-go-field="${need.id}">${esc(need.label)}</button></li>`).join('')}${sharedSiteNeeds().map((need) => `<li><button type="button" class="link" data-go-site-answer="${need.id}">Site question: ${esc(need.label)}</button></li>`).join('')}</ul><p class="meta">Give each once. The list below follows.</p></div>` : ''}
      ${staleItems().length ? `<div class="warning go-stale" role="status"><p><strong>${staleItems().length === 1 ? 'One SWMS needs' : `${staleItems().length} SWMS need`} preparing again</strong>, because an answer ${staleItems().length === 1 ? 'it uses' : 'they use'} changed. ${staleItems().length === 1 ? 'It stays on the list and downloads' : 'They stay on the list and download'} once prepared again and checked.</p><div class="actions"><button type="button" class="small" id="go-prepare-stale">Prepare ${staleItems().length === 1 ? 'it' : 'them'} again</button></div></div>` : ''}
      <ol class="go-review">${project.items.map((item, index) => `<li class="${states[index].ready ? 'ready' : 'needs'}" id="go-row-${index}"><div><strong>${esc(item.title)}</strong>${isOwn(item) ? ` ${OWN_TAG}` : ''}<span class="meta">${esc(states[index].text)}${checkOf(item) || states[index].check || item.checkNote === CHECK_CLEARED ? '' : ' Not checked yet.'}</span>${ownDetailsLine(item)}${!states[index].cover && coverLeftOf(index).length ? `<span class="meta go-review-cover">No job steps yet for: ${esc(coverLeftOf(index).join('; '))}. <button type="button" class="link" data-project-open="${index}" data-project-need data-project-cover>Go to it</button></span>` : ''}${sentHtml(item)}</div>${rowButtons(item, index, firstToCheck)}</li>`).join('')}</ol>
      ${can ? submitHtml() : ''}
      <div id="project-download">${can ? downloadHtml(states, ready, n) : '<p class="note">Sign in, or start the free trial, to download the project\'s SWMS together.</p>'}</div>
      <div class="actions"><button type="button" class="small secondary" id="go-back-questions">Back to the questions</button><button type="button" class="small secondary" id="project-close">${builder() ? 'Close the list' : 'Close project'}</button></div>`;
  }

  // The people's boxes above are filled in once; the list on the page follows them as they are typed.
  document.addEventListener('input', (event) => {
    if (!project) return;
    if (project.stage === 'questions' && PEOPLE.some(([id]) => event.target.id === id)) { const box = $('go-people'); if (box) box.outerHTML = peopleBlock(); }
    if (project.stage === 'review' && event.target.closest && event.target.closest('#job-details, #profile')) {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refreshAll, 900);
    }
  });
  // A saved company profile counts at once.
  document.addEventListener('click', (event) => {
    if (project && project.stage === 'review' && event.target.closest && event.target.closest('#profile-save')) setTimeout(() => hooks.render(), 600);
  });
  document.addEventListener('input', (event) => {
    // A condition's note, kept as it is typed (stuck point 2 above).
    if (event.target && event.target.dataset && event.target.dataset.condNote) keepCondNote(event.target.dataset.condNote, event.target.value);
    if (event.target.closest && event.target.closest('#project-panel')) onInput(event);
  });
  document.addEventListener('change', (event) => { if (event.target.closest && event.target.closest('#project-panel')) onChange(event); });
  // Any answer on the page, the state and the people above included, redraws the list by Prepare all.
  ['input', 'change'].forEach((type) => document.addEventListener(type, () => { if (project) refreshMissing(); }));
  document.addEventListener('click', (event) => { if (event.target.closest && event.target.closest('#project-panel')) onClick(event); });

  // The shared boxes say why an answer is refused as the user types (messy round 3).
  document.addEventListener('input', (event) => {
    if (project && event.target && PEOPLE.concat([SCAFFOLD]).some(([id]) => event.target.id === id)) sharedNotes();
  });

  // The project and its hooks from scope.js, for a SWMS open to check after a reload, before this page
  // has been drawn.
  function use(current, given) {
    if (current) project = current;
    if (given) hooks = given;
  }
  window.SiteWriteProjectGo = { render, payloadFor: (index) => payloadFor(index), changesFor: (index, current, given) => { use(current, given); return project ? changesFor(index) : {}; }, markSent: (index, current, given) => { use(current, given); if (project) markSent(index); }, clearNotes, markStale: (indexes, why) => { if (project) markStale(indexes, why); }, uncheck };
  // A project kept from before opens on its page (scope.js drew it before this script was loaded),
  // and again once the account is known, which the download and the company details depend on.
  if (S.renderProject) S.renderProject();
  if (S.accountReady) S.accountReady.then(() => { if (S.renderProject) S.renderProject(); });
})();
