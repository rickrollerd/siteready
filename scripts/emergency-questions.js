// The emergency questions SiteReady asks for each high risk category (goal 2, emergency.js), as a
// list for the owner to approve: when each is asked, what the page says, how the answer prints and
// the code section it is drawn from.
// Usage: node scripts/emergency-questions.js > emergency-questions.md
const { QUESTIONS, INVOLVES } = require('../emergency');

const WHEN = {
  ewp: 'An elevating work platform (scissor lift or boom) is in the plant the user confirmed.',
  fall: 'The SWMS lists the fall category (a fall of more than 2 m, or 3 m on housing) and no EWP is used. With an EWP, the EWP questions are asked instead.',
  electrical: 'The SWMS lists work on or near energised electrical installations or services.',
  trench: 'The SWMS lists a trench or shaft deeper than 1.5 m, or a tunnel.',
  confined: 'The SWMS lists work in or near a confined space.',
  plant: 'The SWMS lists work where powered mobile plant moves.',
};
const ROW = { ewp: 'Work at height', fall: 'Work at height', electrical: 'Electric shock or arc flash', trench: 'Trench', confined: 'Confined space', plant: 'Mobile plant (a new row)' };

const out = [
  '# Emergency questions for each high risk category',
  '',
  'Asked in the draft under Emergency arrangements, and needed before download. "None" or "Not applicable" is refused, as a question is asked only where its category applies. Each answer prints in the "Location, contact or detail" column of the row named, as "Printed as: answer".',
  '',
];
for (const category of [...new Set(QUESTIONS.map((item) => item.category))]) {
  out.push(`## ${INVOLVES[category][0].toUpperCase()}${INVOLVES[category].slice(1)}`, '', `Asked when: ${WHEN[category]}`, '', `Prints in the row: ${ROW[category]}`, '');
  out.push('| Question | Hint shown | Printed as | Drawn from |', '|---|---|---|---|');
  for (const item of QUESTIONS.filter((question) => question.category === category)) out.push(`| ${item.ask} | ${item.hint} | ${item.short} | ${item.source} |`);
  out.push('');
}
out.push('## Not asked yet', '', 'Categories with no question: demolition, asbestos, temporary support, explosives, pressurised gas mains, chemical, fuel or refrigerant lines, contaminated or flammable atmosphere, tilt-up or precast, road or rail traffic, extremes of temperature, water (drowning), diving and telecommunication towers. Where SiteReady prints an emergency row for one of them (a person in the water, a gas leak), it prints as before, with no question asked.', '');
process.stdout.write(out.join('\n'));
