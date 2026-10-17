// The activity-specific emergency response (goal 2, owner, 7 October 2026): "every SWMS names ...
// the activity-specific emergency response". For each high risk category the SWMS involves,
// SiteWrite asks the one or two facts a reviewer looks for, and prints the answers in the emergency
// arrangements beside the category's row, not only its heading. The answers are needed before
// download (download-gate.js); "Not applicable" is not an answer, as a question is asked only where
// its category applies.
//
// Each question is drawn from what the codes we hold say a rescue for that work needs:
// - EWP: SafeWork NSW Elevating work platforms Code of Practice (July 2026) s 2.6: ground workers
//   are trained on the emergency controls so they can lower the platform, rescue drills for the
//   base or emergency lowering controls of each model on site, rescue equipment easily reached,
//   and s 5.3, the ground level controls. Managing the risk of falls Code of Practice 2021 s 5.1:
//   workers trained in the EWP's emergency rescue procedures.
// - Falls: Managing the risk of falls Code of Practice 2021 s 7.3 and s 10, Table 1: a rescue after
//   an arrested fall provided immediately, without relying on emergency services, by a trained
//   person on site; rescue equipment kept close to the work; s 10.1, suspension intolerance
//   (WHS Regulation s 80).
// - Electrical: Electrical Safety Code of Practice 2021 (managing electrical risks) s 6.3: a safety
//   observer competent to rescue and resuscitate, and an emergency plan that isolates the supply
//   before a rescue; s 5, isolation points readily available and accessible.
// - Trench, shaft or tunnel: Excavation work Code of Practice 2021 s 3.8: the emergency plan covers
//   rescuing workers from an excavation; s 4.4, other ways in and out for emergency use.
// - Confined space: Confined spaces Code of Practice 2021 (Qld) s 4.6: a stand-by person outside,
//   with the rescue equipment immediately available, who never enters to rescue; s 5: rescue
//   started from outside the space, with the rescue equipment kept close to it (WHS Regulation s 74).
// - Mobile plant: Managing risks of plant in the workplace Code of Practice 2021 (Qld) s 1.4:
//   emergency instructions shown on or near the plant; s 4.3: an emergency stop prominent, clearly
//   marked and immediately accessible to the operator (WHS Regulation s 211).
// The owner's copy of this list is written by scripts/emergency-questions.js.

const FALL = /\bfalling more than\b/i;
const EWP = /elevating work platform|^Scissor lift/i;

// Each question: its id, the category it belongs to, what is asked, a hint, the short label the
// answer prints under, and the emergency row it prints in.
const QUESTIONS = [
  { id: 'ewpLower', category: 'ewp', ask: 'Who on the ground lowers the platform in an emergency?', hint: 'Name the role, not the person: on a big site the person changes. They must be trained on this EWP\'s ground or emergency lowering controls.', short: 'Lowered in an emergency by', source: 'SafeWork NSW Elevating work platforms Code s 2.6' },
  { id: 'ewpControls', category: 'ewp', ask: 'Where are the ground or emergency lowering controls, and the key for them?', hint: 'For example: ground control panel at the rear of the base, key kept on the machine; emergency lowering valve under the platform at the front. Check it on this machine.', short: 'Ground controls and key', source: 'SafeWork NSW Elevating work platforms Code s 2.6, s 5.3' },
  { id: 'fallRescue', rescue: true, category: 'fall', ask: 'How is a person who falls, or is left hanging in a harness, rescued straight away, and by whom?', hint: 'The rescue cannot wait for emergency services. Say which role does it and how, for example with the rescue kit kept at the work.', short: 'Rescue', source: 'Managing the risk of falls Code s 7.3, s 10, s 10.1; WHS Reg s 80' },
  { id: 'fallKit', kit: true, category: 'fall', ask: 'What rescue equipment is on site, and where is it kept?', hint: 'Kept close to the work so it can be used at once.', short: 'Rescue equipment', source: 'Managing the risk of falls Code s 10, Table 1' },
  { id: 'elecIsolate', rescue: true, category: 'electrical', ask: 'Who isolates the supply if someone gets a shock, and who does the rescue?', hint: 'Name the roles. The safety observer must have been assessed in rescue and resuscitation in the last 12 months.', short: 'Isolated and rescued by', source: 'Managing electrical risks in the workplace Code s 6.3' },
  { id: 'elecIsolator', category: 'electrical', ask: 'Where is the isolator or switchboard that cuts the supply to this work?', hint: 'For example: main switchboard in the level 3 riser cupboard, circuits labelled.', short: 'Isolation point', source: 'Managing electrical risks in the workplace Code s 5, s 6.3' },
  { id: 'trenchRescue', rescue: true, category: 'trench', ask: 'How is a person got out of the excavation without anyone going in unprotected, and by whom?', hint: 'For example: lifted out with the harness and line from the top, or reached from inside the shield. Name the roles, not the people.', short: 'Rescue', source: 'Excavation work Code s 3.8, s 4.4' },
  { id: 'trenchKit', kit: true, category: 'trench', ask: 'What rescue equipment is on site, and where is it kept?', hint: 'For example: ladder, harness and line at the trench box; first aid kit in the site ute.', short: 'Rescue equipment', source: 'Excavation work Code s 3.8' },
  { id: 'confinedRescue', rescue: true, category: 'confined', ask: 'Who is the stand-by person, and how is a person rescued from outside the space?', hint: 'The stand-by person stays outside and never goes in to rescue. Name the role, not the person.', short: 'Stand-by person and rescue', source: 'Confined spaces Code s 4.6, s 5; WHS Reg s 74' },
  { id: 'confinedKit', kit: true, category: 'confined', ask: 'What rescue equipment is kept at the entry?', hint: 'For example: tripod and winch, harness and lifeline, gas detector.', short: 'Rescue equipment at the entry', source: 'Confined spaces Code s 4.6, s 5' },
  { id: 'plantStop', stop: true, category: 'plant', ask: 'How is the plant stopped in an emergency, and by whom?', hint: 'Say where its emergency stop or key is, and which role stops it.', short: 'Stopped by', source: 'Managing risks of plant Code s 1.4, s 4.3; WHS Reg s 211' },
];

// Standard answers for each question (D259, owner, 13 October 2026): roles, not people, as "it could be
// 1 of 100 people on a big site and that person could change all the time", and "prior to use operator
// and spotter agree on clear roles". Each says only what the question's code asks (the sources above).
// An answer that names a place is an example to check against the machine or the site and change.
const ROLES = 'Before use, the operator and spotter agree clear roles: who lowers the platform, who stops the plant and who calls for help.';
const ANSWERS = {
  ewpLower: [
    ['The spotter', `The spotter on the ground. ${ROLES}`],
    ['A trained ground person', `A person on the ground trained on this EWP's ground controls, who stays at the base while anyone is raised. ${ROLES.replace('the operator and spotter', 'the operator and the ground person')}`],
  ],
  ewpControls: [
    ['Example: at the base', 'Ground control panel at the base of the EWP, with the key kept in the machine while anyone is raised; emergency lowering control where this model\'s operator manual shows it. Checked on the machine at the pre-start.'],
  ],
  fallRescue: [
    ['Rescue team on site', 'Two workers on site trained in the rescue procedure bring the person down straight away with the rescue kit kept at the work, without waiting for emergency services. Before work starts, the crew agrees clear roles: who does the rescue, who calls 000 and who meets the ambulance.'],
    ['By EWP', 'The trained EWP operator on site reaches the person with the EWP kept at the work and brings them down straight away, without waiting for emergency services. Before work starts, the crew agrees clear roles: who does the rescue, who calls 000 and who meets the ambulance.'],
  ],
  fallKit: [
    ['Example: at the work', 'The rescue kit named in the rescue plan, kept at the work area within reach of the rescuers; first aid kit in the site office.'],
  ],
  elecIsolate: [
    ['The safety observer', 'The safety observer isolates the supply, then does the rescue with the low voltage rescue kit; they are assessed in rescue and resuscitation in the last 12 months. Before work starts, the electrician and safety observer agree clear roles: who isolates, who rescues and who calls 000.'],
  ],
  elecIsolator: [
    ['Example: the switchboard', 'The switchboard supplying this work, its circuits labelled; the isolation point is shown to the safety observer before work starts.'],
  ],
  trenchRescue: [
    ['From the top', 'Lifted out from the top with a harness and line by the crew at the trench; no one enters an unsupported trench to rescue. Before work starts, the crew agrees clear roles: who does the rescue, who stops the plant and who calls 000.'],
    ['From inside the shield', 'Reached from inside the trench shield by the crew, never from an unsupported part of the trench. Before work starts, the crew agrees clear roles: who does the rescue, who stops the plant and who calls 000.'],
  ],
  trenchKit: [
    ['Example: at the trench', 'Ladder in the trench, harness and line at the trench; first aid kit in the site vehicle.'],
  ],
  confinedRescue: [
    ['The stand-by person', 'The stand-by person at the entry, who stays outside and never goes in to rescue; the rescue is started from outside with the rescue equipment at the entry. Before entry, the entrant and the stand-by person agree how they keep in contact and who calls for help.'],
  ],
  confinedKit: [
    ['Example: at the entry', 'Tripod and winch, harness and lifeline, and the gas detector at the entry.'],
  ],
  plantStop: [
    ['Operator and spotter', 'The operator stops the plant at its emergency stop or turns the key off; the spotter signals the stop and calls for help. Before use, the operator and spotter agree clear roles and the stop signal.'],
  ],
};
for (const item of QUESTIONS) item.suggestions = (ANSWERS[item.id] || []).map(([label, text]) => ({ label, text }));

// Each category's short name, for the list of what is still needed.
const SHORT = { ewp: 'EWP', fall: 'work at height', electrical: 'electrical', trench: 'trench', confined: 'confined space', plant: 'mobile plant' };

// What each category is, as the page says it.
const INVOLVES = { ewp: 'an elevating work platform', fall: 'a risk of a fall from height', electrical: 'work on or near energised electrical parts', trench: 'a trench, shaft or tunnel', confined: 'a confined space', plant: 'moving powered mobile plant' };

// The categories this SWMS involves that have questions: an EWP in the plant listed, a fall
// (without an EWP, whose own rescue covers the platform), energised electrical work, a trench,
// shaft or tunnel, a confined space, and moving powered mobile plant.
// Messy round 4 (B fault 6): a question is asked only where it applies.
// - Mobile plant: only where the plant this SWMS uses has mobile plant ("Stopped by" was asked of a
//   scaffolder with no mobile plant). The category can come from others' plant on site.
// - Electrical: the rescue and isolation questions are for electrical work (the switchboard, the riser),
//   not for overhead lines near other work (draft.electricalWork, set by draft.js). A draft without the
//   mark asks as before.
// - Plant SiteWrite is not sure is used (plantInferred maybe) counts only once the user confirms it.
const MOBILE_PLANT = /^(Mobile crane|Crawler crane|Non-slewing mobile crane|Vehicle loading crane|Tower crane|Forklift|Telehandler|Excavator|Skid steer|Concrete placing boom|Roller|Tipper|Piling rig|Turf laying machine|Trencher|Vacuum truck|Elevating work platform|Scissor lift|Boom-type elevating|Dozer|Grader|Loader|Scraper|Articulated dump truck|Water cart|Road profiler|Stabiliser|Asphalt paver|Bitumen sprayer|Aggregate spreader|Truck mounted attenuator|Self-propelled modular transporter|Pile driving hammer|Ground improvement rig|Rolling impact compactor|Shotcrete rig|Roadheader|Low loader|Mulcher|Fuel truck|Road rail vehicle|Track laying machine|Track maintenance machine|Hydro demolition robot|Directional drilling rig|Drill rig|Post driver|Vacuum excavation unit|Truck and dog)/;
function plantInUse(draft = {}) {
  const maybe = new Set((draft.plantInferred || []).filter((item) => item && item.maybe).map((item) => item.item));
  return (draft.plant || []).filter((item) => item && (draft.plantChosen || !maybe.has(item.item)));
}
function categoriesFor(draft = {}) {
  const highRisk = Array.isArray(draft.highRisk) ? draft.highRisk : [];
  const plant = plantInUse(draft);
  // The user's own EWP in place of an unticked one keeps the EWP questions (messy round 9, run 7).
  const ewp = plant.some((item) => EWP.test(String(item && item.item)) || EWP.test(String((item && item.known) || '')));
  // The user's own plant counts as the plant SiteWrite knows it as (messy round 8, run 7: an added "All
  // terrain mobile crane" in place of an unticked crawler crane lost the plant stop question and row).
  const mobile = plant.some((item) => MOBILE_PLANT.test(String(item && item.item)) || MOBILE_PLANT.test(String((item && item.known) || '')));
  const has = (pattern) => highRisk.some((item) => pattern.test(String(item)));
  return [
    ewp ? 'ewp' : '',
    !ewp && has(FALL) ? 'fall' : '',
    // Not where the only energised services are power lines (draft.js electricalLinesOnly): the power line row covers them.
    has(/energised electrical/i) && draft.electricalWork !== false && !draft.electricalLinesOnly ? 'electrical' : '',
    has(/\b(?:trench|shaft|tunnel)\b/i) ? 'trench' : '',
    has(/confined space/i) ? 'confined' : '',
    has(/powered mobile plant/i) && mobile ? 'plant' : '',
  ].filter(Boolean);
}

// The questions this SWMS asks, each with the answer given, for the page.
function emergencyQuestions(draft = {}, answers = {}) {
  if (!draft || draft.kind !== 'draft') return [];
  const on = new Set(categoriesFor(draft));
  return QUESTIONS.filter((item) => on.has(item.category)).map(({ source: _source, ...item }) => ({ ...item, answer: typeof (answers || {})[item.id] === 'string' ? answers[item.id] : '' }));
}

// The emergency row each category's answers print in.
const ROW = { ewp: /^Work at height$/, fall: /^Work at height$/, electrical: /^Electric shock/, trench: /^Trench$/, confined: /^Confined space$/, plant: /^Mobile plant$/ };
// A row for a category the emergency arrangements do not already have. Mobile plant: the emergency
// stop and the plant's emergency instructions (Plant Code s 1.4, s 4.3).
const NEW_ROW = {
  ewp: { type: 'Work at height', equipment: 'Rescue plan for a person stuck or suspended at height, including the EWP\'s ground controls and rescue equipment', detail: '' },
  fall: { type: 'Work at height', equipment: 'Rescue plan for a person who falls or is injured at height, including from an edge, opening or scaffold, and for a person suspended in a harness where harnesses are used', detail: '' },
  electrical: { type: 'Electric shock or arc flash', equipment: 'Isolate the supply before touching the person. Low voltage rescue kit, CPR and defibrillator (AED), burns first aid', detail: '' },
  trench: { type: 'Trench', equipment: 'Rescue plan for a trench collapse (Excavation work Code of Practice s 3.8). No one enters an unsupported trench to rescue', detail: '' },
  confined: { type: 'Confined space', equipment: 'Rescue plan and equipment, started from outside the space', detail: '' },
  plant: { type: 'Mobile plant', equipment: 'Emergency stops on the plant are clearly marked and within the operator\'s reach, and the plant\'s emergency instructions are shown on or near it (Managing risks of plant in the workplace Code of Practice s 1.4, s 4.3)', detail: '' },
};

const clean = (value) => String(typeof value === 'string' ? value : '').replace(/\s+/g, ' ').trim();

// The draft with the emergency questions for the page, and each answer given printed in its row
// as "Short label: answer". A row that already has a detail keeps it, with the answers after.
function withEmergencyAnswers(draft, answers = {}) {
  if (!draft || draft.kind !== 'draft') return draft;
  const asked = emergencyQuestions(draft, answers);
  if (!asked.length) return { ...draft, emergencyQuestions: [] };
  const rows = [...(draft.emergency || [])];
  // Codes of practice are cited only in Queensland (register.js).
  const local = (row) => (/Queensland/.test(draft.state || '') ? row : { ...row, equipment: row.equipment.replace(/\s?\([^()]*Code of Practice[^()]*\)/g, '') });
  for (const category of [...new Set(asked.map((item) => item.category))]) {
    let index = rows.findIndex((row) => ROW[category].test(String(row.type)));
    if (index < 0) { rows.push(local(NEW_ROW[category])); index = rows.length - 1; }
    const said = asked.filter((item) => item.category === category && clean(item.answer)).map((item) => `${item.short}: ${clean(item.answer)}`);
    if (said.length) rows[index] = { ...rows[index], detail: [rows[index].detail, ...said].filter(Boolean).join('\n') };
  }
  return { ...draft, emergency: rows, emergencyQuestions: asked };
}

module.exports = { QUESTIONS, INVOLVES, SHORT, MOBILE_PLANT, plantInUse, categoriesFor, emergencyQuestions, withEmergencyAnswers };
