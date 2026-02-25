'use strict';

// Regression test: claimNext should quarantine invalid JSON jobs as FAILED.
// Run: node src/jobs.claimNext.badJson.test.js

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

  // Create a broken pending job.
  fs.writeFileSync(path.join(dirs.pendingDir, 'bad.json'), '{ this is not json', 'utf8');

  // Avoid the claim stability window during tests.
  process.env.CONTROL_CENTER_JOB_CLAIM_STABILITY_MS = '0';

  const res = jobs.claimNext(dirs);
  assert(res === null, 'expected claimNext to return null for bad json');

  const pendingExists = fs.existsSync(path.join(dirs.pendingDir, 'bad.json'));
  assert(pendingExists === false, 'expected bad.json to be removed from pending');

  const failedPath = path.join(dirs.failedDir, 'bad.json');
  assert(fs.existsSync(failedPath) === true, 'expected bad.json to be quarantined into failed');

  const failed = JSON.parse(fs.readFileSync(failedPath, 'utf8'));
  assert(failed.status === 'FAILED', 'expected FAILED status');
  assert(failed.result && failed.result.error === 'BAD_JOB_JSON', 'expected BAD_JOB_JSON error');

  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
  process.stdout.write('ok\n');
})();
