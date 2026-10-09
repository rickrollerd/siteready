// Builder check jobs (goal 3). The AI reading of a long SWMS takes longer than a proxy or gateway
// waits for one answer (an independent tester's 32 KB NSW precast SWMS failed with "upstream
// request failed" at about 30 seconds, twice), so the check is started here, the request returns
// at once with the check's id, and the page asks for the result, as the AI scope reading does.
//
// Nothing is kept (check-read.js): a check lives in this server process's memory only, never in the
// database or a file. The document is let go as soon as the check finishes; the result waits to be
// read, and is dropped as soon as it is read, or 10 minutes after the check finished if it never is.
//
// The server runs one process per core and a request can reach any of them, so a check's id names
// the process it runs in, and another process asks that one for it through the main process.
const crypto = require('crypto');
const cluster = require('cluster');

// A finished check waits this long to be read.
const KEEP_MINUTES = 10;
// A check still unfinished after this long is given up (the AI client's own wait is 10 minutes).
const LIMIT_MINUTES = 15;
// Tests shorten both.
let keepMs = KEEP_MINUTES * 60 * 1000;
let limitMs = LIMIT_MINUTES * 60 * 1000;
function useTimes(times = {}) {
  keepMs = times.keepMs || KEEP_MINUTES * 60 * 1000;
  limitMs = times.limitMs || LIMIT_MINUTES * 60 * 1000;
}
// How long one process waits for another to answer.
const ASK_MS = 5000;
const MESSAGE = 'siteready-check-job';

const jobs = new Map();
const here = () => (cluster.isWorker ? cluster.worker.id : 0);
const timer = (fn, ms) => {
  const handle = setTimeout(fn, ms);
  if (handle.unref) handle.unref();
  return handle;
};

function finish(id, outcome) {
  const job = jobs.get(id);
  // Given up already: a late answer is not kept.
  if (!job || job.status !== 'checking') return;
  clearTimeout(job.timer);
  Object.assign(job, outcome, { finishedAt: Date.now() });
  job.timer = timer(() => jobs.delete(id), keepMs);
}

// Starts work() for this account and returns its id at once. onError hears an unexpected failure
// (not one with a message for the user), so it can be logged.
function startJob(owner, work, onError) {
  const id = `${here()}-${crypto.randomUUID()}`;
  const job = { owner: String(owner), status: 'checking', startedAt: Date.now() };
  job.timer = timer(() => finish(id, { status: 'failed', code: 504, error: 'The check took too long. Try again later.' }), limitMs);
  jobs.set(id, job);
  Promise.resolve().then(work).then(
    (result) => finish(id, { status: 'done', result }),
    (error) => {
      if (!error.publicMessage && onError) onError(error);
      finish(id, error.publicMessage
        ? { status: 'failed', code: error.status || 500, error: error.message }
        : { status: 'failed', code: 500, error: 'The SWMS could not be checked. Try again.' });
    },
  );
  return { id, status: 'checking' };
}

// The check as the page sees it, from this process. A finished check is dropped as it is read.
function takeHere(owner, id) {
  const job = jobs.get(id);
  if (!job || job.owner !== String(owner)) return null;
  const seconds = Math.round(((job.finishedAt || Date.now()) - job.startedAt) / 1000);
  if (job.status === 'checking') return { id, status: 'checking', seconds };
  clearTimeout(job.timer);
  jobs.delete(id);
  return job.status === 'done' ? { ...job.result, id, status: 'done', seconds } : { id, status: 'failed', seconds, code: job.code, error: job.error };
}

// ---- Asking the process a check runs in ----

const waiting = new Map();
function askProcess(to, owner, id) {
  return new Promise((resolve) => {
    const ask = crypto.randomUUID();
    const wait = timer(() => { waiting.delete(ask); resolve(null); }, ASK_MS);
    waiting.set(ask, (state) => { clearTimeout(wait); waiting.delete(ask); resolve(state); });
    process.send({ type: MESSAGE, ask, to, from: here(), owner: String(owner), id });
  });
}

// A process asked for one of its checks answers; an answer to this process's question is passed on.
function onMessage(message) {
  if (!message || message.type !== MESSAGE) return;
  if (message.answer) {
    const done = waiting.get(message.ask);
    if (done) done(message.state);
    return;
  }
  process.send({ type: MESSAGE, answer: true, ask: message.ask, to: message.from, state: takeHere(message.owner, message.id) });
}
if (cluster.isWorker) process.on('message', onMessage);

// The main process passes each question and answer on. A question for a process that has stopped
// (and its checks with it) is answered "not found" at once.
function relayChecks(main = cluster) {
  main.on('message', (worker, message) => {
    if (!message || message.type !== MESSAGE) return;
    const target = main.workers[message.to];
    if (target) target.send(message);
    else if (!message.answer) worker.send({ type: MESSAGE, answer: true, ask: message.ask, to: message.from, state: null });
  });
}

// The check by its id, for the account that started it; null when there is none (never started,
// another account's, already read, or dropped).
async function takeJob(owner, id) {
  const match = /^(\d+)-[0-9a-f-]{36}$/.exec(String(id || ''));
  if (!match) return null;
  const to = Number(match[1]);
  if (to === here()) return takeHere(owner, match[0]);
  return cluster.isWorker ? askProcess(to, owner, match[0]) : null;
}

const jobCount = () => jobs.size;

module.exports = { startJob, takeJob, relayChecks, jobCount, useTimes, KEEP_MINUTES, LIMIT_MINUTES };
