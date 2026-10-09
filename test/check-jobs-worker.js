// A server worker for check-jobs-cluster.test.js: starts and reads builder checks when the test
// (the main process) tells it to. Run on its own, as the test runner does, it does nothing.
const cluster = require('cluster');

if (cluster.isWorker) {
  const { startJob, takeJob } = require('../check-jobs');
  process.on('message', async (message) => {
    if (!message || !message.cmd) return;
    if (message.cmd === 'start') {
      const started = startJob(message.owner, () => new Promise((resolve) => { setTimeout(() => resolve({ score: 97, band: 'Accepted' }), message.delay); }));
      process.send({ reply: message.n, value: started });
    }
    if (message.cmd === 'take') process.send({ reply: message.n, value: await takeJob(message.owner, message.id) });
  });
  process.send({ ready: true });
}
