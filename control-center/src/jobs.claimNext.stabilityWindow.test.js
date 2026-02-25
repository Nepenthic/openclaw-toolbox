// Regression test: claimNext should skip *too-fresh* pending jobs (stability window)
// and claim the next stable job instead.
// Run: node src/jobs.claimNext.stabilityWindow.test.js

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const jobs = require('./jobs');

function tmpdir(){
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cc-jobs-test-'));
}

function writeJob(p, j){
  fs.writeFileSync(p, JSON.stringify(j, null, 2), 'utf8');
}

(async function main(){
  const root = tmpdir();
  const dirs = jobs.init(root);

  const now = Date.now();

  // a.json is oldest by name, but we make it *too fresh*.
  writeJob(path.join(dirs.pendingDir, 'a.json'), {
    id: 'a',
    type: 'noop',
    status: 'PENDING',
    createdAt: new Date(now - 10_000).toISOString(),
    attempts: 0,
  });

  // b.json is stable.
  writeJob(path.join(dirs.pendingDir, 'b.json'), {
    id: 'b',
    type: 'noop',
    status: 'PENDING',
    createdAt: new Date(now - 9_000).toISOString(),
    attempts: 0,
  });

  // Adjust mtimes.
  const aPath = path.join(dirs.pendingDir, 'a.json');
  const bPath = path.join(dirs.pendingDir, 'b.json');
  fs.utimesSync(aPath, now / 1000, now / 1000);
  fs.utimesSync(bPath, (now - 10_000) / 1000, (now - 10_000) / 1000);

  process.env.CONTROL_CENTER_JOB_CLAIM_STABILITY_MS = '500';
  const res = jobs.claimNext(dirs);
  assert(res && res.job && res.job.id === 'b', 'expected claimNext to skip too-fresh a.json and claim b.json');

  // a should still be pending.
  assert(fs.existsSync(aPath), 'expected a.json to remain in pending');

  console.log('OK');
})();
