// The real server in cluster mode with four workers, for test/rate-limit-shared.test.js. Each
// worker has its own in-memory database for accounts; the rate limit counts are in the primary.
// Started with RATE_CLUSTER_PORT set; does nothing when the test runner loads it.
if (!process.env.RATE_CLUSTER_PORT) return;
process.env.PORT = process.env.RATE_CLUSTER_PORT;
process.env.WEB_CONCURRENCY = '4';
const cluster = require('cluster');
const { start } = require('../server');
const { setupAccounts } = require('./helpers');

(async () => {
  if (cluster.isWorker) await setupAccounts();
  start();
})();
