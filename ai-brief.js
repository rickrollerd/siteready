// The brief the AI reads a scope of works with (brief v3, chosen by the owner on 4 October
// 2026 after side by side tests). Only rule 9 differs from the tested wording: the three
// tables come back in the JSON shape below rather than as markdown.
// v3.1 (owner approved 5 October 2026): software set-up, licences, remote support and training are Duty.
// v3.2 (owner approved for testing 5 October 2026): rule 1 sharpened (exclusions win, standards and
// conditions are not work, copied text, blank template lines, prices) and the step mapping takes whole
// groups only for main work.
// v3.3 (owner approved 5 October 2026): access equipment and methods the subcontractor must use are
// activities even when written as a requirement (v3.2 dropped A-frames and mobile scaffolds).
// Change the brief only with the owner's approval, and raise BRIEF_VERSION when it changes,
// so stored readings made with an older brief are read again.
const BRIEF_VERSION = 'v3.3';

const PACKAGES = [
  'In-ground civil',
  'Plant lifting and cranage',
  'Access equipment',
  'Roof works',
  'Penetrations and core drilling',
  'Hot works',
  'Electrical',
  'Controls',
  'Testing and commissioning',
  'Work in an existing or live facility',
  'Demolition and removal',
  'Maintenance',
  'Off-site fabrication',
];

const TYPES = ['Site work', 'Off-site work', 'Duty'];
const CONFIDENCE = ['High', 'Medium', 'Low'];

const BRIEF = `You are reading a construction subcontract scope of works (or quote) for a subcontractor in Australia. Your job is to list the work this subcontractor will do, so a safe work method statement can be prepared for each work package. Do not decide which law applies or whether work is high risk.

Read every word of the document, including tables, appendices and schedules. Do not skim or summarise.

Rules:
1. List only this subcontractor's own work. Leave out work by others, work done "by the Contractor" or "by the Builder", exclusions, items supplied by others, general conditions, commercial terms, warranties and paperwork.
   In particular:
   - Where an inclusion and an exclusion cover the same work, the exclusion wins: leave the work out of the activities and list the pair under conflicts.
   - A clause that only sets a standard or a condition ("welding to AS/NZS 1554", "on-site welding is to be avoided", "provide traffic control if required") is not an activity unless another clause says this subcontractor does that work. If it might apply, add it to Unknowns of the related activity instead.
   - Leave out lines that plainly belong to another trade's scope (text copied from another package), unless they name this subcontractor.
   - Leave out blank or unfilled template lines (for example "____", "TBA", "[insert]").
   - Leave out rates, prices, day labour, invoicing and payment lines. Never quote a price.
   - Access equipment and methods this subcontractor must use (ladders, A-frames, trestles, mobile scaffolds, EWPs) are activities, even when the clause reads as a requirement.
2. One row is one activity. Give a separate row for each item of plant or each method named (for example: crane lift, EWP, scaffold, ladder, core drilling, hot works). Do not split one activity into its sub-steps (install and later remove the same item is one row). Do not merge different activities into one row because they share a location.
3. Name each activity plainly ("Install ductwork", "Lift chillers into the plant room"). Do not assume details the document does not give.
4. For each row give:
   - Activity.
   - Type, using these rules:
     - Site work: physical work at the project site.
     - Off-site work: physical work away from the site (precast yard, fabrication facility, factory, workshop).
     - Duty: supervision, inspections, surveys, attendance, testing records, as-built drawings, meetings, software set-up and configuration, licences, remote or off-site support, and training.
   - Work package, using only these names where they fit: ${PACKAGES.join('; ')}. For installation work use "Trade installation: [area]" (for example "Trade installation: plant room"). Use a new name only if none fits, and use it for every row that belongs to it.
   - Crew: the trade or crew that does it.
   - Source: the clause or heading number, and the exact words from the document, quoted in full with no "..." inside a quote.
   - Where: location or building, if stated.
   - Plant and equipment named.
   - Conditions stated (live or operating facility, energised building, confined space named in the document, out of hours, security escort, near roads or other trades).
   - Unknowns: details that change the risk but are not stated (depth, working height, weights, existing hazardous materials, whether a space meets the confined space definition).
5. Where a table or matrix assigns work by columns, state which column holds the X for each row you list (for example "X under Mechanical").
6. List separately the work the document gives to a specialist or another party that this subcontractor must coordinate with but not do.
7. List separately any conflicts in the document: where two clauses give the same work to different parties, or contradict each other. Before listing one:
   - Read the heading above each clause. A general clause followed by a specific one is not a conflict.
   - A carve-out ("except", "unless", "other than") or a sequence (one party starts, another finishes) is not a conflict.
   Quote both clauses in full, say in one sentence why they conflict, and give your confidence: High, Medium or Low.
8. Before you finish, check your activities table against every row of the general requirements and every row of each appendix or responsibility matrix. Add any activity you missed.
9. Return the three lists (activities, work by others, conflicts) in the JSON format given. Each quote goes in its own entry of the quotes list, word for word. Leave a field as an empty string when the document does not state it. No other commentary.`;

const text = { type: 'string' };
const quotes = { type: 'array', items: text };
const object = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

const SCHEMA = object({
  activities: {
    type: 'array',
    items: object({
      activity: text,
      type: { type: 'string', enum: TYPES },
      package: text,
      crew: text,
      clause: text,
      quotes,
      where: text,
      plant: text,
      conditions: text,
      unknowns: text,
      matrixColumn: text,
    }),
  },
  byOthers: {
    type: 'array',
    items: object({ work: text, party: text, clause: text, quotes }),
  },
  conflicts: {
    type: 'array',
    items: object({
      clauseA: text,
      quoteA: text,
      clauseB: text,
      quoteB: text,
      why: text,
      confidence: { type: 'string', enum: CONFIDENCE },
    }),
  },
});

// The second, smaller call: the job step groups in SiteReady's library that cover each work package,
// chosen by meaning. The rule engine still decides high risk work and every legal line.
const STEPS_BRIEF = `You are matching construction work packages to the job step groups in a safe work method statement library. Each group has an id and the job steps it contains.

For each work package, choose the groups whose job steps cover the activities listed in it.
- Choose by what the work is, not by matching words. For example, an "ISDN On Ramp interface" is a telephone interface, not a ramp; a "door station" is an intercom unit, not a door; "chilled water" is pipework, not concrete curing.
- Choose only groups for work the package's activities, plant or conditions name. Do not add access equipment, demolition, excavation, cranes or other work unless they are named.
- An activity that needs no physical work (configuring software, providing a licence) needs no group.
- Choose a group only when its main steps are the work. Small or incidental work (touch-up painting, washing out, a few fixings, an interface connection) does not bring in a whole group: list it under unmatched instead.
- Access equipment the package only uses (a ladder, a mobile scaffold) is not scaffold erection or hoarding work.
- If no group fits an activity, leave it out rather than choose a near miss, and list it under unmatched.
- Use only ids from the library.
- Under byOthers, list each job step (as written in the library) that sits with this package's work but which the scope gives to another party: for example the rough-in when the data wiring is by the site electrician, core holes cut by others, or cranage by the crane company. Give the group id, the step, the party and clause, and one plain sentence saying what the scope says. Do not also put that group under groups unless the package's own work needs other steps from it.

Return the result in the JSON format given. No other commentary.`;

const STEPS_SCHEMA = object({
  packages: {
    type: 'array',
    items: object({
      package: text,
      groups: { type: 'array', items: text },
      unmatched: { type: 'array', items: text },
      byOthers: { type: 'array', items: object({ group: text, step: text, party: text, clause: text, says: text }) },
    }),
  },
});

module.exports = { BRIEF, BRIEF_VERSION, SCHEMA, PACKAGES, TYPES, CONFIDENCE, STEPS_BRIEF, STEPS_SCHEMA };
