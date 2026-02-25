'use strict';

// Minimal regression test for hasReadyPending sampling logic.
// Run: node src/jobs.hasReadyPending.test.js

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const jobs = require('./jobs');

function assert(cond, msg){
  if(!cond) throw new Error('ASSERT: ' + msg);
}

function mkTmpDir(){
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-jobs-test-'));
  return d;
}

function writeJob(p, j){
  fs.writeFileSync(p, JSON.stringify(j, null, 2), 'utf8');
}

(function main(){
  const root = mkTmpDir();
  const dirs = jobs.init(root);

  const now = Date.now();
  const farFuture = new Date(now + 60 * 60 * 1000).toISOString();

  // Oldest job is delayed.
  writeJob(path.join(dirs.pendingDir, 'a.json'), { id: 'a', status: 'PENDING', createdAt: new Date(now - 1000).toISOString(), notBefore: farFuture });
  // Newer job is runnable.
  writeJob(path.join(dirs.pendingDir, 'b.json'), { id: 'b', status: 'PENDING', createdAt: new Date(now).toISOString() });

  const ready = jobs.hasReadyPending(dirs, { sampleLimit: 1 });
  assert(ready === true, 'expected ready pending job even when head is delayed (sampleLimit=1)');

  // Regression: if head+tail are delayed but a middle job is runnable, sampling should still find it.
  // This catches a subtle bug where "evenly spaced" sampling could miss the middle.
  fs.rmSync(dirs.pendingDir, { recursive: true, force: true });
  fs.mkdirSync(dirs.pendingDir, { recursive: true });

  writeJob(path.join(dirs.pendingDir, 'a.json'), { id: 'a', status: 'PENDING', createdAt: new Date(now - 4000).toISOString(), notBefore: farFuture });
  writeJob(path.join(dirs.pendingDir, 'b.json'), { id: 'b', status: 'PENDING', createdAt: new Date(now - 3000).toISOString(), notBefore: farFuture });
  writeJob(path.join(dirs.pendingDir, 'c.json'), { id: 'c', status: 'PENDING', createdAt: new Date(now - 2000).toISOString() });
  writeJob(path.join(dirs.pendingDir, 'd.json'), { id: 'd', status: 'PENDING', createdAt: new Date(now - 1000).toISOString(), notBefore: farFuture });
  writeJob(path.join(dirs.pendingDir, 'e.json'), { id: 'e', status: 'PENDING', createdAt: new Date(now).toISOString(), notBefore: farFuture });

  const ready2 = jobs.hasReadyPending(dirs, { sampleLimit: 3 });
  assert(ready2 === true, 'expected ready pending job when only middle is runnable (sampleLimit=3)');

  // Regression: if a pending job is temporarily unreadable (eg Windows/AV lock or partial write),
  // hasReadyPending should return true so the worker will retry soon instead of idling.
  fs.rmSync(dirs.pendingDir, { recursive: true, force: true });
  fs.mkdirSync(dirs.pendingDir, { recursive: true });
  fs.writeFileSync(path.join(dirs.pendingDir, 'bad.json'), '{ this is not json', 'utf8');
  const ready3 = jobs.hasReadyPending(dirs, { sampleLimit: 25 });
  assert(ready3 === true, 'expected ready when a pending job is unreadable');

  // cleanup
  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}

  process.stdout.write('ok\n');
})();
