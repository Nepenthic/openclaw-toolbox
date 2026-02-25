'use strict';

// Regression tests for requeueStale crash recovery logic.
// Run: node src/jobs.requeueStale.test.js

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

function writeJob(p, j){
  fs.writeFileSync(p, JSON.stringify(j, null, 2), 'utf8');
}

(function main(){
  const root = mkTmpDir();
  const dirs = jobs.init(root);

  const now = Date.now();
  const oldIso = new Date(now - 60_000).toISOString();

  // Case 1: stale RUNNING job below maxAttempts -> should requeue to PENDING.
  const j1 = { id: 'stale1', type: 't', status: 'RUNNING', attempts: 1, startedAt: oldIso, updatedAt: oldIso };
  writeJob(path.join(dirs.processingDir, 'stale1.json'), j1);

  const moved1 = jobs.requeueStale(dirs, { staleMs: 5_000, maxAttempts: 3 });
  assert(moved1 === 1, 'expected 1 stale job moved');
  assert(!fs.existsSync(path.join(dirs.processingDir, 'stale1.json')), 'expected processing job removed');
  assert(fs.existsSync(path.join(dirs.pendingDir, 'stale1.json')), 'expected job requeued to pending');

  const j1p = JSON.parse(fs.readFileSync(path.join(dirs.pendingDir, 'stale1.json'), 'utf8'));
  assert(j1p.status === 'PENDING', 'expected requeued job status PENDING');
  assert(!!j1p.requeuedAt, 'expected requeuedAt set');

  // Case 2: stale RUNNING job at/above maxAttempts -> should move to FAILED terminal.
  const j2 = { id: 'stale2', type: 't', status: 'RUNNING', attempts: 3, startedAt: oldIso, updatedAt: oldIso };
  writeJob(path.join(dirs.processingDir, 'stale2.json'), j2);

  const moved2 = jobs.requeueStale(dirs, { staleMs: 5_000, maxAttempts: 3 });
  assert(moved2 === 1, 'expected 1 stale job moved (terminal)');
  assert(!fs.existsSync(path.join(dirs.processingDir, 'stale2.json')), 'expected processing job removed (terminal)');
  assert(fs.existsSync(path.join(dirs.failedDir, 'stale2.json')), 'expected job moved to failed');

  const j2f = JSON.parse(fs.readFileSync(path.join(dirs.failedDir, 'stale2.json'), 'utf8'));
  assert(j2f.status === 'FAILED', 'expected terminal status FAILED');
  assert(j2f.result && j2f.result.error === 'STALE_RUNNING_MAX_ATTEMPTS', 'expected terminal error STALE_RUNNING_MAX_ATTEMPTS');

  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
  process.stdout.write('ok\n');
})();
