'use strict';

// Regression: retryFailed() should clear any existing notBefore when delayMs=0.
// Run: node src/jobs.retryFailed.clearsNotBefore.test.js

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const jobs = require('./jobs');

function assert(cond, msg){
  if(!cond) throw new Error('ASSERT: ' + msg);
}

function mkTmpDir(){
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cc-jobs-test-'));
}

(function main(){
  const root = mkTmpDir();
  const dirs = jobs.init(root);

  const id = 'fail1';
  const future = new Date(Date.now() + 60_000).toISOString();
  const failedJob = {
    id,
    type: 't',
    status: 'FAILED',
    attempts: 1,
    finishedAt: new Date().toISOString(),
    notBefore: future,
    result: { ok: false, error: 'TIMEOUT', output: null },
  };

  fs.writeFileSync(path.join(dirs.failedDir, id + '.json'), JSON.stringify(failedJob, null, 2), 'utf8');

  const next = jobs.retryFailed(dirs, id, { delayMs: 0 });
  assert(!!next, 'expected retryFailed to return a job');
  assert(next.status === 'PENDING', 'expected status PENDING');
  assert(next.notBefore === undefined, 'expected in-memory next.notBefore cleared');

  const p = path.join(dirs.pendingDir, id + '.json');
  assert(fs.existsSync(p), 'expected pending job file created');

  const onDisk = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert(!('notBefore' in onDisk), 'expected notBefore omitted on disk');

  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
  process.stdout.write('ok\n');
})();
