// The server runs one process per core, and a builder check is held in memory in the process that
// started it. Asked for from another process, it is fetched through the main process, so the page
// gets its result whichever process its request reaches. Two real worker processes are started here.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const cluster = require('cluster');
const { relayChecks } = require('../check-jobs');

let n = 0;
function ask(worker, message) {
  n += 1;
  const id = n;
  return new Promise((resolve) => {
    const listen = (reply) => {
      if (reply && reply.reply === id) {
        worker.off('message', listen);
        resolve(reply.value);
      }
    };
    worker.on('message', listen);
    worker.send({ ...message, n: id });
  });
}
const fork = () => new Promise((resolve) => {
  const worker = cluster.fork();
  worker.once('message', () => resolve(worker));
});
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

test('a check started in one server process is read from another, once, by its own account only', async (t) => {
  cluster.setupPrimary({ exec: path.join(__dirname, 'check-jobs-worker.js'), execArgv: [], silent: true });
  relayChecks(cluster);
  const one = await fork();
  const two = await fork();
  t.after(() => { for (const worker of Object.values(cluster.workers)) worker.kill(); });

  const started = await ask(one, { cmd: 'start', owner: 'user-1', delay: 300 });
  assert.equal(started.status, 'checking');
  assert.match(started.id, new RegExp(`^${one.id}-`));
  assert.equal((await ask(two, { cmd: 'take', owner: 'user-1', id: started.id })).status, 'checking');
  assert.equal(await ask(two, { cmd: 'take', owner: 'user-2', id: started.id }), null, 'another account');
  await wait(400);
  const done = await ask(two, { cmd: 'take', owner: 'user-1', id: started.id });
  assert.equal(done.status, 'done');
  assert.equal(done.score, 97);
  // Read once, then gone from the process that held it.
  assert.equal(await ask(one, { cmd: 'take', owner: 'user-1', id: started.id }), null);

  // A process that has stopped took its checks with it: the answer is "not found", at once.
  const lost = await ask(one, { cmd: 'start', owner: 'user-1', delay: 5000 });
  await new Promise((resolve) => { one.once('exit', resolve); one.kill(); });
  const before = Date.now();
  assert.equal(await ask(two, { cmd: 'take', owner: 'user-1', id: lost.id }), null);
  assert.ok(Date.now() - before < 1000);
});
