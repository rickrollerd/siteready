// Secret keys for the keyed fingerprints in the industry data (INDUSTRY_KEY) and the control
// learning store (CONTROL_LEARNING_KEY). The repository is public, so a built-in key is known to
// anyone and would let the records be linked back. In production a missing or short key switches
// its feature off, and the log names the variable, never its value. Staging and local copies keep
// the built-in key, so they work without setup.
const MIN_LENGTH = 32;

// Production is the Railway environment named production (as for the test hooks), or
// NODE_ENV=production on a server outside Railway. Staging runs in its own Railway environment.
function isProduction() {
  const railway = String(process.env.RAILWAY_ENVIRONMENT_NAME || '').trim().toLowerCase();
  if (railway) return railway === 'production';
  return String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
}

// The first of the named variables that is set. In production it must be at least 32 characters,
// and there is no built-in key: '' means the feature stays off.
function secretKey(names, builtIn) {
  const production = isProduction();
  for (const name of names) {
    const value = String(process.env[name] || '');
    if (value && (!production || value.length >= MIN_LENGTH)) return value;
  }
  return production ? '' : builtIn;
}

const INDUSTRY = { names: ['INDUSTRY_KEY', 'SESSION_SECRET'], builtIn: 'siteready-industry' };
const CONTROL_LEARNING = { names: ['CONTROL_LEARNING_KEY'], builtIn: 'siteready-control-learning' };
const industryKey = () => secretKey(INDUSTRY.names, INDUSTRY.builtIn);
const controlLearningKey = () => secretKey(CONTROL_LEARNING.names, CONTROL_LEARNING.builtIn);

// The lines the server logs at start for each feature switched off for want of its key.
function keyProblems() {
  if (!isProduction()) return [];
  const lines = [];
  if (!industryKey()) lines.push(`INDUSTRY_KEY is not set, or is shorter than ${MIN_LENGTH} characters: industry records are off in production until it is set.`);
  const learningOn = String(process.env.CONTROL_LEARNING || '').trim().toLowerCase() === 'on';
  if (learningOn && !controlLearningKey()) lines.push(`CONTROL_LEARNING_KEY is not set, or is shorter than ${MIN_LENGTH} characters: control learning is off in production until it is set.`);
  return lines;
}

module.exports = { isProduction, secretKey, industryKey, controlLearningKey, keyProblems, MIN_LENGTH };
