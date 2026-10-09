// Rate limit counts shared by every server process (goals 7 and 9).
// The server runs one worker process per processor core (server.js). A count kept in each
// worker let a client have the limit once per worker: with 24 workers, 10 sign-in emails
// became 240. The count is now kept in the memory of the primary process, which every worker
// asks over the cluster's own channel, so all workers count the same requests. Nothing is
// written to storage, as the privacy policy says (privacy.html, "Limits on use").
// One copy of the server only: a second copy (a second Railway replica) would keep its own
// count, and would need a shared store and a change to the privacy policy first.
// A single process (WEB_CONCURRENCY=1, tests) counts in its own memory.
const cluster = require('cluster');
const { MemoryStore } = require('express-rate-limit');

const TAG = 'siteready-rate-limit';
const COMMANDS = new Set(['increment', 'decrement', 'resetKey']);
// A count the primary has not given back in this time is left to the worker's own count.
const TIMEOUT_MS = 2000;
const TICK_MS = 100;
const WARN_MS = 60 * 1000;
const SWEEP_MS = 60 * 1000;

// ---- The primary process: every count, in memory ----

// Each count is read in the same step it is added to, so questions that arrive together each
// get their own number.
const counts = new Map();
let sweeping = null;

// The primary's answer to one worker's question.
function answer({ id, name, windowMs, command, key }) {
  if (!sweeping) {
    // Ended windows are dropped once a minute, so no address is held after its window.
    sweeping = setInterval(() => {
      const now = Date.now();
      for (const [entry, count] of counts) if (count.resetAt <= now) counts.delete(entry);
    }, SWEEP_MS);
    sweeping.unref();
  }
  const entry = `${name}\n${key}`;
  const now = Date.now();
  let count = counts.get(entry);
  let result = null;
  if (command === 'increment') {
    if (!count || count.resetAt <= now) {
      count = { hits: 0, resetAt: now + windowMs };
      counts.set(entry, count);
    }
    count.hits += 1;
    result = { totalHits: count.hits, resetTime: count.resetAt };
  } else if (command === 'decrement') {
    if (count && count.hits > 0) count.hits -= 1;
  } else if (command === 'resetKey') {
    counts.delete(entry);
  }
  return { tag: TAG, id, result };
}

// Called once in the primary, before the workers start.
function servePrimary() {
  cluster.on('message', (worker, message) => {
    if (!message || message.tag !== TAG || !COMMANDS.has(message.command)) return;
    // A worker that has just stopped cannot be answered; the primary carries on.
    try {
      if (worker.isConnected()) worker.send(answer(message));
    } catch {
      // Nothing to do.
    }
  });
}

// ---- A worker process ----

const waiting = new Map();
let nextId = 0;
let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  process.on('message', (message) => {
    if (!message || message.tag !== TAG || !waiting.has(message.id)) return;
    const resolve = waiting.get(message.id);
    waiting.delete(message.id);
    resolve(message.result);
  });
}

// The time counts only while the worker is free to read the answer, in steps of TICK_MS:
// a worker busy preparing a draft is not a primary that does not answer.
function ask(name, windowMs, command, key) {
  return new Promise((resolve, reject) => {
    if (typeof process.send !== 'function' || process.connected === false) {
      reject(new Error('the primary process cannot be reached'));
      return;
    }
    listen();
    const id = nextId;
    nextId += 1;
    let timer;
    let waited = 0;
    const done = (fn, value) => {
      clearTimeout(timer);
      waiting.delete(id);
      fn(value);
    };
    const tick = () => {
      waited += TICK_MS;
      if (waited >= TIMEOUT_MS) done(reject, new Error(`no answer in ${TIMEOUT_MS / 1000} seconds`));
      else timer = setTimeout(tick, TICK_MS);
    };
    waiting.set(id, (result) => done(resolve, result));
    timer = setTimeout(tick, TICK_MS);
    try {
      process.send({ tag: TAG, id, name, windowMs, command, key }, undefined, undefined, (error) => {
        if (error) done(reject, error);
      });
    } catch (error) {
      done(reject, error);
    }
  });
}

// One line a minute at most, so a fault does not fill the log.
let warnedAt = 0;
function warn(text) {
  if (Date.now() - warnedAt < WARN_MS) return;
  warnedAt = Date.now();
  console.warn(text);
}

// failClosed: when the primary cannot be asked, refuse the request rather than count it in
// this worker alone. Used only for sign-in emails: an email costs money and can be aimed at
// someone else's inbox. Every other limit fails open: it counts in this worker, with a
// warning in the log.
class SharedStore {
  constructor(name, { failClosed = false } = {}) {
    this.name = name;
    this.prefix = `${name}:`;
    this.failClosed = failClosed;
    this.localKeys = false;
    this.memory = new MemoryStore();
  }

  init(options) {
    this.windowMs = options.windowMs;
    this.memory.init(options);
  }

  async increment(key) {
    if (!cluster.isWorker) return this.memory.increment(key);
    try {
      const result = await ask(this.name, this.windowMs, 'increment', key);
      return { totalHits: result.totalHits, resetTime: new Date(result.resetTime) };
    } catch (error) {
      if (this.failClosed) {
        warn(`Rate limits: the shared count could not be read (${error.message}). Sign-in emails are refused until it can.`);
        throw Object.assign(new Error('Sign-in emails cannot be sent just now. Try again in a few minutes.'), { status: 503, publicMessage: true });
      }
      warn(`Rate limits: the shared count could not be read (${error.message}). Each worker counts on its own until it can.`);
      return this.memory.increment(key);
    }
  }

  async decrement(key) {
    await this.memory.decrement(key);
    if (cluster.isWorker) await ask(this.name, this.windowMs, 'decrement', key).catch(() => {});
  }

  async resetKey(key) {
    await this.memory.resetKey(key);
    if (cluster.isWorker) await ask(this.name, this.windowMs, 'resetKey', key).catch(() => {});
  }
}

module.exports = { SharedStore, servePrimary, answer, TAG, TIMEOUT_MS };
