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

  // Keep tests deterministic: disable stability window unless explicitly testing it.
  const prevStabilityGlobal = process.env.CONTROL_CENTER_JOB_CLAIM_STABILITY_MS;
  process.env.CONTROL_CENTER_JOB_CLAIM_STABILITY_MS = '0';

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

  // Regression: respect claim stability window (avoid treating brand-new enqueued files as ready).
  // This prevents the worker from thrashing when it gets kicked immediately after enqueue.
  fs.rmSync(dirs.pendingDir, { recursive: true, force: true });
  fs.mkdirSync(dirs.pendingDir, { recursive: true });

  const prevStability = process.env.CONTROL_CENTER_JOB_CLAIM_STABILITY_MS;
  process.env.CONTROL_CENTER_JOB_CLAIM_STABILITY_MS = '5000';

  const pFresh = path.join(dirs.pendingDir, 'fresh.json');
  writeJob(pFresh, { id: 'fresh', status: 'PENDING', createdAt: new Date(now).toISOString() });
  // Ensure mtime is "now" (fresh).
  try { fs.utimesSync(pFresh, new Date(), new Date()); } catch {}

  const readyFresh = jobs.hasReadyPending(dirs, { sampleLimit: 25 });
  assert(readyFresh === false, 'expected not-ready when only pending job is within stability window');

  // Make it look old enough.
  const old = new Date(Date.now() - 10_000);
  try { fs.utimesSync(pFresh, old, old); } catch {}
  const readyOld = jobs.hasReadyPending(dirs, { sampleLimit: 25 });
  assert(readyOld === true, 'expected ready after pending job ages past stability window');

  if (prevStability === undefined) delete process.env.CONTROL_CENTER_JOB_CLAIM_STABILITY_MS;
  else process.env.CONTROL_CENTER_JOB_CLAIM_STABILITY_MS = prevStability;

  // Regression: if a pending job is temporarily unreadable (eg Windows/AV lock or partial write),
  // hasReadyPending should return true so the worker will retry soon instead of idling.
  // On Windows (esp. under cmd.exe), fs.rmSync can fail to fully clear a dir due to transient
  // file locks. Use a fresh temp queue root for this case so the test is deterministic.
  process.env.CONTROL_CENTER_JOB_CLAIM_STABILITY_MS = '0';
  const root2 = mkTmpDir();
  const dirs2 = jobs.init(root2);
  const pBad = path.join(dirs2.pendingDir, 'bad.json');
  fs.writeFileSync(pBad, '{ this is not json', 'utf8');
  // Make it look old enough to avoid any stability-window skips if the env var
  // isn't honored for some reason under npm on Windows.
  const oldBad = new Date(Date.now() - 10_000);
  try { fs.utimesSync(pBad, oldBad, oldBad); } catch {}
  const ready3 = jobs.hasReadyPending(dirs2, { sampleLimit: 25 });
  assert(ready3 === true, 'expected ready when a pending job is unreadable');

  // cleanup
  if (prevStabilityGlobal === undefined) delete process.env.CONTROL_CENTER_JOB_CLAIM_STABILITY_MS;
  else process.env.CONTROL_CENTER_JOB_CLAIM_STABILITY_MS = prevStabilityGlobal;

  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(root2, { recursive: true, force: true }); } catch {}

  process.stdout.write('ok\n');
})();
