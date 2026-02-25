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

  // cleanup
  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}

  process.stdout.write('ok\n');
})();
