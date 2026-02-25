// Regression test: nextNotBeforeSample should return the earliest future notBefore among a sample.
// Run: node src/jobs.nextNotBeforeSample.test.js

'use strict';

const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assert'); };
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const jobs = require('./jobs');

function tmpRoot(){
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cc-jobs-test-'));
}

function writeJob(p, j){
  fs.writeFileSync(p, JSON.stringify(j, null, 2), 'utf8');
}

(function main(){
  const root = tmpRoot();
  const dirs = jobs.init(root);

  const now = Date.now();
  const a = new Date(now + 60_000).toISOString();
  const b = new Date(now + 10_000).toISOString();
  const c = new Date(now + 120_000).toISOString();

  const pa = path.join(dirs.pendingDir, 'a.json');
  const pb = path.join(dirs.pendingDir, 'b.json');
  const pc = path.join(dirs.pendingDir, 'c.json');
  writeJob(pa, { id: 'a', status: 'PENDING', createdAt: new Date(now - 3000).toISOString(), notBefore: a });
  writeJob(pb, { id: 'b', status: 'PENDING', createdAt: new Date(now - 2000).toISOString(), notBefore: b });
  writeJob(pc, { id: 'c', status: 'PENDING', createdAt: new Date(now - 1000).toISOString(), notBefore: c });

  // Make these files appear "stable" even if the test runs very quickly.
  const old = new Date(now - 10_000);
  fs.utimesSync(pa, old, old);
  fs.utimesSync(pb, old, old);
  fs.utimesSync(pc, old, old);

  process.env.CONTROL_CENTER_JOB_CLAIM_STABILITY_MS = '0';

  const nb = jobs.nextNotBeforeSample(dirs, { sampleLimit: 25 });
  assert(typeof nb === 'number' && nb > now, 'expected nextNotBeforeSample to return a future ms timestamp');
  assert(Math.abs(nb - Date.parse(b)) < 5000, 'expected earliest notBefore (b)');

  // Regression: nextNotBeforeSample should respect claim stability window (skip too-fresh files).
  // This prevents the worker from scheduling wake-ups based on a job file that is still in the
  // Windows atomic-write/AV contention window.
  const pFresh = path.join(dirs.pendingDir, 'fresh.json');
  writeJob(pFresh, { id: 'fresh', status: 'PENDING', createdAt: new Date(now).toISOString(), notBefore: new Date(now + 5000).toISOString() });

  process.env.CONTROL_CENTER_JOB_CLAIM_STABILITY_MS = '5000';
  // Ensure the file looks "fresh".
  fs.utimesSync(pFresh, new Date(), new Date());
  const nbFresh = jobs.nextNotBeforeSample(dirs, { sampleLimit: 50 });
  // Since all sampled entries might include the fresh file, we just assert we did NOT pick it.
  // (We still have b as earliest from the older files.)
  assert(nbFresh && Math.abs(nbFresh - Date.parse(b)) < 5000, 'expected earliest notBefore (b), not the fresh file');

  console.log('PASS jobs.nextNotBeforeSample');
})();
