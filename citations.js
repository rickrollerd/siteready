// Each control taken from the law carries its Queensland source. For the other
// states that have been checked, the Queensland regulation sections are
// swapped for the matching sections of that state's own regulation. The match
// was made by section heading and checked against the state's text
// (scenarios/state-citations.json). Sources that do not apply in a state, such
// as Queensland-only sections, Queensland Acts and model codes of practice not
// checked for that state, are left out rather than guessed.
const STATE_CITATIONS = require('./scenarios/state-citations.json');

const QLD_REG = 'Work Health and Safety Regulation 2011 (Qld) ';
// National sources apply in every state.
const NATIONAL = [/^Ozone Protection/, /^Telecommunications \(Cabling Provider\)/, /^Australian Refrigeration Council/, /^Piling industry standard/];

function mapReference(reference, state) {
  const match = /^(s|schedule) (\d+[A-Z]{0,3})(\(.+\))?(?: to s (\d+[A-Z]{0,3}))?$/.exec(reference.trim());
  if (!match) return null;
  const [, kind, number, sub = '', to] = match;
  const key = kind === 'schedule' ? `schedule ${number}` : number;
  const mapped = state.sections[key];
  if (!mapped) return null;
  if (kind === 'schedule') return `Schedule ${mapped}`;
  const end = to ? state.sections[to] : null;
  if (to && !end) return null;
  // A subsection is kept only where the state's section is set out the same way.
  const keepSub = sub && (state.sameSubsections || []).includes(number);
  return `${state.unit} ${mapped}${keepSub ? sub : ''}${end ? ` to ${state.unit} ${end}` : ''}`;
}

function localSource(source, stateId) {
  if (!source) return '';
  if (stateId === 'qld') return source;
  const state = STATE_CITATIONS[stateId];
  if (!state) return '';
  const parts = [];
  for (const part of source.split('; ')) {
    if (NATIONAL.some((pattern) => pattern.test(part))) {
      parts.push(part);
      continue;
    }
    if (!part.startsWith(QLD_REG)) continue;
    const references = [...new Set(part.slice(QLD_REG.length).split(', ').map((ref) => mapReference(ref, state)).filter(Boolean))];
    if (references.length) parts.push(`${state.regulation} ${references.join(', ')}`);
  }
  return parts.join('; ');
}

const citedStates = () => ['qld', ...Object.keys(STATE_CITATIONS)];

module.exports = { localSource, citedStates };
