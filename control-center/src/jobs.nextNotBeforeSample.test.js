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

  writeJob(path.join(dirs.pendingDir, 'a.json'), { id: 'a', status: 'PENDING', createdAt: new Date(now - 3000).toISOString(), notBefore: a });
  writeJob(path.join(dirs.pendingDir, 'b.json'), { id: 'b', status: 'PENDING', createdAt: new Date(now - 2000).toISOString(), notBefore: b });
  writeJob(path.join(dirs.pendingDir, 'c.json'), { id: 'c', status: 'PENDING', createdAt: new Date(now - 1000).toISOString(), notBefore: c });

  process.env.CONTROL_CENTER_JOB_CLAIM_STABILITY_MS = '0';

  const nb = jobs.nextNotBeforeSample(dirs, { sampleLimit: 25 });
  assert(typeof nb === 'number' && nb > now, 'expected nextNotBeforeSample to return a future ms timestamp');
  assert(Math.abs(nb - Date.parse(b)) < 5000, 'expected earliest notBefore (b)');

  console.log('PASS jobs.nextNotBeforeSample');
})();
