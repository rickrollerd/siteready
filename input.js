// Cleans what the browser sends before it is drafted or saved.
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
    stepOrder: Array.isArray(body.stepOrder) ? body.stepOrder.filter((name) => typeof name === 'string').slice(0, 150).map((name) => textField(name, 300)) : undefined,
    controlEdits: controlEdits(body.controlEdits),
    ppe: Array.isArray(body.ppe) ? body.ppe.filter((id) => typeof id === 'string').slice(0, 40).map((id) => id.slice(0, 40)) : undefined,
    date: field(body.date, 80) || longDate(),
    facts: {
      craneChart: field(facts.craneChart, 2000),
      erectionDesign: field(facts.erectionDesign, 2000),
      centreOfGravity: field(facts.centreOfGravity, 2000),
      braceArrangement: field(facts.braceArrangement, 2000),
      safetyDataSheet: field(facts.safetyDataSheet, 4000),
      fallControl: field(facts.fallControl, 2000),
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
