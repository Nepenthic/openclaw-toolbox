// Regression test: claimNext should skip delayed (notBefore) jobs and claim the next ready one.
// Run: node src/jobs.claimNext.skipDelayed.test.js

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
  const far = new Date(now + 60_000).toISOString();

  // Oldest file is delayed.
  writeJob(path.join(dirs.pendingDir, 'a.json'), {
    id: 'a',
    type: 'noop',
    status: 'PENDING',
    createdAt: new Date(now - 10_000).toISOString(),
    notBefore: far,
    attempts: 0,
  });

  // Next file is runnable.
  writeJob(path.join(dirs.pendingDir, 'b.json'), {
    id: 'b',
    type: 'noop',
    status: 'PENDING',
    createdAt: new Date(now - 9_000).toISOString(),
    attempts: 0,
  });

  process.env.CONTROL_CENTER_JOB_CLAIM_STABILITY_MS = '0';
  const res = jobs.claimNext(dirs);
  assert(res && res.job && res.job.id === 'b', 'expected claimNext to skip delayed a.json and claim b.json');

  console.log('OK');
})();
