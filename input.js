// Cleans what the browser sends before it is drafted or saved.
const { currentPpeIds } = require('./activities');
// Control characters, often pasted in from Word or email, are not allowed in a
// Word file and would make it fail to open.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

function textField(value, max) {
  if (typeof value !== 'string') return '';
  return value.toWellFormed().replace(CONTROL, ' ').trim().substring(0, max);
}

function longDate(date = new Date()) {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

// The reasons a user can pick for removing or weakening a control, or marking a hazard as not
// applying (owner decision, 6 October 2026). Picking one is optional.
const EDIT_REASONS = ['notNeeded', 'anotherWay', 'othersCover', 'wording', 'other'];

// The user's own changes to the controls, by job step name: lines removed, lines reworded
// and lines added. Kept small: a few dozen lines per step, for at most 60 steps.
function controlEdits(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const texts = (list, limit, max) => (Array.isArray(list) ? list.filter((item) => typeof item === 'string').slice(0, limit).map((item) => textField(item, max)).filter(Boolean) : []);
  const entries = Object.entries(value).slice(0, 60).map(([step, edit]) => {
    if (!edit || typeof edit !== 'object') return null;
    const changed = Array.isArray(edit.changed) ? edit.changed.filter((item) => item && typeof item.from === 'string' && typeof item.to === 'string').slice(0, 40)
      .map((item) => ({ from: textField(item.from, 1500), to: textField(item.to, 600) })).filter((item) => item.from) : [];
    const out = { removed: texts(edit.removed, 40, 1500), changed, added: texts(edit.added, 20, 600) };
    // Why a line was removed or weakened: one of a short list, and an optional note. The user can
    // leave it blank.
    const reasons = Array.isArray(edit.reasons) ? edit.reasons.filter((item) => item && typeof item.line === 'string').slice(0, 40)
      .map((item) => ({ line: textField(item.line, 1500), reason: EDIT_REASONS.includes(item.reason) ? item.reason : '', note: textField(item.note, 300) }))
      .filter((item) => item.line && (item.reason || item.note)) : [];
    if (reasons.length) out.reasons = reasons;
    return out.removed.length || out.changed.length || out.added.length ? [textField(step, 300), out] : null;
  }).filter(Boolean);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

// The user's own hazards by job step name: hazards reworded, added, and SiteReady's hazards marked
// as not applying (they cannot be deleted), with an optional reason; and who is responsible for
// each step's controls (the Who column).
function hazardEdits(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const texts = (list, limit, max) => (Array.isArray(list) ? list.filter((item) => typeof item === 'string').slice(0, limit).map((item) => textField(item, max)).filter(Boolean) : []);
  const entries = Object.entries(value).slice(0, 60).map(([step, edit]) => {
    if (!edit || typeof edit !== 'object') return null;
    const changed = Array.isArray(edit.changed) ? edit.changed.filter((item) => item && typeof item.from === 'string' && typeof item.to === 'string').slice(0, 40)
      .map((item) => ({ from: textField(item.from, 1000), to: textField(item.to, 400) })).filter((item) => item.from && item.to) : [];
    const out = { changed, added: texts(edit.added, 20, 400), notApplicable: texts(edit.notApplicable, 40, 1000) };
    const reasons = Array.isArray(edit.reasons) ? edit.reasons.filter((item) => item && typeof item.line === 'string').slice(0, 40)
      .map((item) => ({ line: textField(item.line, 1000), reason: EDIT_REASONS.includes(item.reason) ? item.reason : '', note: textField(item.note, 300) }))
      .filter((item) => item.line && (item.reason || item.note)) : [];
    if (reasons.length) out.reasons = reasons;
    // Each added hazard's controls and rating (D254, D255): library lines ticked (by their words),
    // controls written, and likelihood and consequence before and after, each 1 to 5.
    const own = edit.own && typeof edit.own === 'object' && !Array.isArray(edit.own)
      ? Object.entries(edit.own).filter(([hazard, item]) => out.added.includes(textField(hazard, 400)) && item && typeof item === 'object').slice(0, 20).map(([hazard, item]) => {
        const rating = (value) => {
          const likelihood = Number(value && value.likelihood);
          const consequence = Number(value && value.consequence);
          return [likelihood, consequence].every((n) => Number.isInteger(n) && n >= 1 && n <= 5) ? { likelihood, consequence } : undefined;
        };
        const detail = { controls: texts(item.controls, 10, 1500), written: texts(item.written, 10, 600) };
        if (rating(item.before)) detail.before = rating(item.before);
        if (rating(item.after)) detail.after = rating(item.after);
        return [textField(hazard, 400), detail];
      }) : [];
    if (own.length) out.own = Object.fromEntries(own);
    return out.changed.length || out.added.length || out.notApplicable.length ? [textField(step, 300), out] : null;
  }).filter(Boolean);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function whoEdits(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value).slice(0, 60).filter(([, who]) => typeof who === 'string' && who.trim()).map(([step, who]) => [textField(step, 300), textField(who, 120)]);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

// Job steps the user writes for work SiteReady has no job steps for (owner, 11 October 2026): the
// part of the task each is written for, as the warning above the draft named it, the step's name,
// its hazards and controls (one a line) and who is responsible. A step's name is used once.
function ownSteps(value) {
  if (!Array.isArray(value)) return undefined;
  const lines = (list, limit, max) => (Array.isArray(list) ? list.filter((item) => typeof item === 'string').map((item) => textField(item.replace(/\s+/g, ' '), max)).filter(Boolean).slice(0, limit) : []);
  const names = new Set();
  const out = value.filter((item) => item && typeof item === 'object' && !Array.isArray(item)).slice(0, 20).map((item) => ({
    part: textField(item.part, 1000),
    name: textField(String(item.name || '').replace(/\s+/g, ' '), 300),
    hazards: lines(item.hazards, 20, 400),
    controls: lines(item.controls, 30, 600),
    who: textField(item.who, 120),
  })).filter((item) => {
    const key = item.name.toLowerCase();
    if (!item.name || names.has(key)) return false;
    names.add(key);
    return true;
  });
  return out.length ? out : undefined;
}

// The designs the SWMS relies on (designs.js), as the user answered them: which design (by id: one
// SiteReady found in the steps, or "added-1" and so on for one the user added), what it is, who
// prepared it, its document or drawing number, revision and date, whether it is issued, not issued
// yet or not needed, and the file attached, by the id it was stored under (design-files.js). A
// written method or sequence of works the work follows is kept the same way, as "method-1" and so on.
const DESIGN_ID = /^(?:[a-zA-Z]{2,30}|added-\d{1,2}|method-\d{1,2})$/;
const FILE_ID = /^df_[A-Za-z0-9_-]{16,64}$/;
const READ_FIELDS = ['what', 'by', 'number', 'revision', 'date'];
function read(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.fields)) return null;
  const fields = READ_FIELDS.filter((key) => value.fields.includes(key));
  return fields.length ? { fields, checked: value.checked === true } : null;
}
function designs(value) {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set();
  const out = value.filter((item) => item && typeof item === 'object' && !Array.isArray(item) && typeof item.id === 'string' && DESIGN_ID.test(item.id)).slice(0, 30).map((item) => {
    const file = item.file && typeof item.file === 'object' && typeof item.file.id === 'string' && FILE_ID.test(item.file.id)
      ? { id: item.file.id, name: textField(item.file.name, 200), type: textField(item.file.type, 40), size: Math.max(0, Math.min(Number(item.file.size) || 0, 1e9)) } : undefined;
    return {
      id: item.id,
      what: textField(String(item.what || '').replace(/\s+/g, ' '), 200),
      status: ['given', 'notIssued', 'notNeeded'].includes(item.status) ? item.status : '',
      by: textField(item.by, 200),
      number: textField(item.number, 120),
      revision: textField(item.revision, 40),
      date: textField(item.date, 60),
      ...(file ? { file } : {}),
      // Details read from the drawing's typed words (D249), and whether the user ticked that they match
      // its title block (D250).
      ...(read(item.read) ? { read: read(item.read) } : {}),
    };
  }).filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  return out.length ? out : undefined;
}

// The user's answers for the blanks (____) in control lines, by line (goal 2): a few answers a line.
// Where the user put each PPE item (D247): an item id to 'all' (moved to all work) or to the names
// of the steps it is worn in. Items not listed follow SiteReady's suggestion.
// The SWMS named for each part with no job steps that another SWMS covers ({ part: SWMS name }).
function elsewhere(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out = Object.entries(value).filter(([part, name]) => part && typeof name === 'string' && name.trim()).slice(0, 60).map(([part, name]) => [textField(part, 5000), textField(name, 200)]);
  return out.length ? Object.fromEntries(out) : undefined;
}

function ppeSteps(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out = {};
  for (const [id, where] of Object.entries(value).slice(0, 40)) {
    if (!/^[A-Za-z0-9]{1,40}$/.test(id)) continue;
    if (where === 'all') out[id] = 'all';
    else if (Array.isArray(where)) out[id] = [...new Set(where.filter((name) => typeof name === 'string').slice(0, 60).map((name) => textField(name, 300)).filter(Boolean))];
  }
  return Object.keys(out).length ? out : undefined;
}

function fills(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value).slice(0, 60)
    .filter(([, answers]) => Array.isArray(answers))
    .map(([line, answers]) => [textField(line, 1500), answers.slice(0, 12).map((item) => textField(item, 300))])
    .filter(([line, answers]) => line && answers.some(Boolean));
  return entries.length ? Object.fromEntries(entries) : undefined;
}

// The plant the user confirmed (goal 2): the names of the plant SiteReady listed that the crew
// uses and does not use, and the user's own items with the licence or ticket to operate each.
function plantChoice(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const names = (list) => (Array.isArray(list) ? [...new Set(list.filter((item) => typeof item === 'string').slice(0, 80).map((item) => textField(item, 200)).filter(Boolean))] : []);
  const added = Array.isArray(value.added) ? value.added.filter((item) => item && typeof item === 'object' && typeof item.item === 'string').slice(0, 30)
    .map((item) => ({ item: textField(item.item, 200), licence: textField(item.licence, 300) })).filter((item) => item.item) : [];
  return { used: names(value.used), notUsed: names(value.notUsed), added };
}

// The answers to the emergency questions for the work (goal 2, emergency.js), by question.
function emergencyAnswers(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value).slice(0, 30).filter(([id, answer]) => /^[A-Za-z]{1,40}$/.test(id) && typeof answer === 'string').map(([id, answer]) => [id, textField(answer, 600)]).filter(([, answer]) => answer);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function draftBody(body) {
  const facts = body.facts && typeof body.facts === 'object' ? body.facts : {};
  const site = body.site && typeof body.site === 'object' ? body.site : {};
  const field = (value, max) => textField(value, max);
  return {
    state: field(body.state, 80),
    task: field(body.task || body.jobDescription, 5000),
    fallRisk: field(body.fallRisk, 10),
    residential: field(body.residential, 10),
    crane: field(body.crane, 20),
    // D258: with a crane company, who slings the loads and directs the crane ('crane' or 'ours').
    slinging: ['crane', 'ours'].includes(body.slinging) ? body.slinging : '',
    trade: field(body.trade, 100),
    company: field(body.company || body.companyName, 200),
    companyAbn: field(body.companyAbn, 40),
    companyAddress: field(body.companyAddress, 300),
    companyPhone: field(body.companyPhone, 60),
    companyEmail: field(body.companyEmail, 200),
    workplace: field(body.workplace || body.siteAddress, 500),
    principalContractor: field(body.principalContractor, 300),
    siteManager: field(body.siteManager, 300),
    scaffoldSupervisor: field(body.scaffoldSupervisor, 400),
    hospital: field(body.hospital, 500),
    firstAider: field(body.firstAider, 300),
    musterPoint: field(body.musterPoint, 300),
    worksManager: field(body.worksManager, 300),
    worksManagerPhone: field(body.worksManagerPhone, 60),
    complianceResponsible: field(body.complianceResponsible, 300),
    reviewer: field(body.reviewer, 300),
    reviewDate: field(body.reviewDate, 80),
    preparedBy: field(body.preparedBy, 300),
    swmsRef: field(body.swmsRef, 80),
    // The job steps picked in the form, by kind of work. Unknown ones are dropped when drafted.
    kinds: Array.isArray(body.kinds) ? body.kinds.filter((id) => typeof id === 'string').slice(0, 80).map((id) => id.slice(0, 40)) : undefined,
    // The job steps in the order the user put them, by name.
    leaveOut: Array.isArray(body.leaveOut) ? body.leaveOut.filter((name) => typeof name === 'string').slice(0, 50).map((name) => textField(name, 300)) : undefined,
    // The rows of a scope reading that the reader matched to no job steps (owner decision D184).
    unmatched: Array.isArray(body.unmatched) ? body.unmatched.filter((row) => typeof row === 'string').slice(0, 60).map((row) => textField(row, 400)).filter(Boolean) : undefined,
    // The parts of a task picked from the pick list that SiteReady has no job steps for (goal 1).
    pickGaps: Array.isArray(body.pickGaps) ? body.pickGaps.filter((part) => typeof part === 'string').slice(0, 10).map((part) => textField(part, 300)).filter(Boolean) : undefined,
    // The parts with no job steps the user ticked as dealt with, above the draft (D184).
    notCoveredConfirmed: Array.isArray(body.notCoveredConfirmed) ? body.notCoveredConfirmed.filter((part) => typeof part === 'string').slice(0, 60).map((part) => textField(part, 5000)) : undefined,
    // A task from a scope: the plain task first given, the scope's full words and its notes (D251, D252).
    scopeTask: body.scopeTask && typeof body.scopeTask === 'object' && !Array.isArray(body.scopeTask)
      ? { plain: textField(body.scopeTask.plain, 5000), full: textField(body.scopeTask.full, 12000), notes: textField(body.scopeTask.notes, 6000) }
      : undefined,
    // The SWMS the user named for each part another SWMS covers ({ part: SWMS name }), kept with the record.
    notCoveredElsewhere: elsewhere(body.notCoveredElsewhere),
    stepOrder: Array.isArray(body.stepOrder) ? body.stepOrder.filter((name) => typeof name === 'string').slice(0, 150).map((name) => textField(name, 300)) : undefined,
    controlEdits: controlEdits(body.controlEdits),
    hazardEdits: hazardEdits(body.hazardEdits),
    whoEdits: whoEdits(body.whoEdits),
    ownSteps: ownSteps(body.ownSteps),
    fills: fills(body.fills),
    plantChoice: plantChoice(body.plantChoice),
    emergency: emergencyAnswers(body.emergency),
    designs: designs(body.designs),
    // Clothing ids saved before one garment went to each tick box (D248) are read as the new ones.
    ppe: Array.isArray(body.ppe) ? currentPpeIds(body.ppe.filter((id) => typeof id === 'string').slice(0, 40).map((id) => id.slice(0, 40))) : undefined,
    ppeSteps: ppeSteps(body.ppeSteps),
    date: field(body.date, 80) || longDate(),
    facts: {
      craneChart: field(facts.craneChart, 2000),
      erectionDesign: field(facts.erectionDesign, 2000),
      centreOfGravity: field(facts.centreOfGravity, 2000),
      braceArrangement: field(facts.braceArrangement, 2000),
      safetyDataSheet: field(facts.safetyDataSheet, 4000),
      fallControl: field(facts.fallControl, 2000),
      fallAccess: field(facts.fallAccess, 100),
      asbestosArrangement: field(facts.asbestosArrangement, 2000),
      trenchSupport: field(facts.trenchSupport, 2000),
      controlsConsidered: field(facts.controlsConsidered, 2000),
      regulatorNotified: field(facts.regulatorNotified, 1000),
      systemInstructions: field(facts.systemInstructions, 2000),
      deckMethod: field(facts.deckMethod, 100),
      loadLimits: field(facts.loadLimits, 2000),
      isolationProcedure: field(facts.isolationProcedure, 2000),
      energisedWork: field(facts.energisedWork, 100),
      liveElectrical: field(facts.liveElectrical, 100),
      constructionTesting: field(facts.constructionTesting, 2000),
      spaceAssessment: field(facts.spaceAssessment, 100),
      silicaControls: field(facts.silicaControls, 2000),
      hotWorkPermit: field(facts.hotWorkPermit, 2000),
      pressureTesting: field(facts.pressureTesting, 2000),
      refrigerantClass: field(facts.refrigerantClass, 200),
      plantIsolation: field(facts.plantIsolation, 2000),
      pilingPlatform: field(facts.pilingPlatform, 2000),
      rigExclusionZone: field(facts.rigExclusionZone, 2000),
      excavationPlan: field(facts.excavationPlan, 2000),
      erectionSequence: field(facts.erectionSequence, 2000),
      tierErection: field(facts.tierErection, 2000),
      serviceShutdown: field(facts.serviceShutdown, 2000),
      confinedSpace: field(facts.confinedSpace, 2000),
      temporarySupport: field(facts.temporarySupport, 2000),
      electricalSafety: field(facts.electricalSafety, 2000),
      drowningControls: field(facts.drowningControls, 2000),
      formworkDesign: field(facts.formworkDesign, 2000),
      jumpformProcedure: field(facts.jumpformProcedure, 2000),
      stressingProcedure: field(facts.stressingProcedure, 2000),
      harnessSystem: field(facts.harnessSystem, 2000),
      spoilPlan: field(facts.spoilPlan, 2000),
      lifeJacketDetails: field(facts.lifeJacketDetails, 2000),
      scaffoldType: field(facts.scaffoldType, 40),
      gantryLoad: field(facts.gantryLoad, 100),
      clearingSpoil: field(facts.clearingSpoil, 100),
      blindingMethod: field(facts.blindingMethod, 100),
      asbestosAirMonitoring: field(facts.asbestosAirMonitoring, 100),
      asbestosQuantity: field(facts.asbestosQuantity, 100),
      manholeMethod: field(facts.manholeMethod, 100),
      poleTransformer: field(facts.poleTransformer, 20),
      transformerOil: field(facts.transformerOil, 100),
      groundBearing: field(facts.groundBearing, 2000),
    },
    site: {
      liveServices: field(site.liveServices, 1000),
      publicInterface: field(site.publicInterface, 1000),
      otherTrades: field(site.otherTrades, 1000),
      ground: field(site.ground, 1000),
      access: field(site.access, 1000),
    },
  };
}

module.exports = { draftBody, textField, longDate, EDIT_REASONS };
