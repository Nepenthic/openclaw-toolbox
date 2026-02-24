'use strict';

const path = require('node:path');
const fs = require('node:fs');

function ensureDir(p){ fs.mkdirSync(p,{recursive:true}); }

function sleepMs(ms){
  // Synchronous sleep for small retry backoffs (avoids async churn in the worker).
  // Atomics.wait is available in Node and is safe here.
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch {}
}

function renameSyncRetry(from, to, { attempts = 6, delayMs = 25 } = {}){
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try { fs.renameSync(from, to); return true; } catch (e) {
      lastErr = e;
      const code = e && e.code;
      // Windows/AV can transiently lock files.
      if (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') {
        sleepMs(delayMs);
        continue;
      }
      break;
    }
  }
  if (lastErr) throw lastErr;
  return false;
}

function readJson(p, fallback=null){
  try { return JSON.parse(fs.readFileSync(p,'utf8')); } catch { return fallback; }
}

function readTextRetry(p, { attempts = 4, delayMs = 25 } = {}){
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try { return fs.readFileSync(p, 'utf8'); } catch (e) {
      lastErr = e;
      const code = e && e.code;
      // Windows/AV can transiently lock files.
      if (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') {
        sleepMs(delayMs);
        continue;
      }
      break;
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

function readJsonRetry(p, fallback=null, opts){
  try {
    const txt = readTextRetry(p, opts);
    if (txt == null) return fallback;
    return JSON.parse(txt);
  } catch {
    return fallback;
  }
}

function writeJson(p, obj){ fs.writeFileSync(p, JSON.stringify(obj,null,2), 'utf8'); }

function writeJsonAtomic(p, obj){
  // Atomic-ish on the same volume: write temp then replace.
  // On Windows, rename over an existing file can fail, so we unlink first.
  const tmp = p + '.tmp';
  writeJson(tmp, obj);
  try { fs.unlinkSync(p); } catch {}
  renameSyncRetry(tmp, p);
}

function nowIso(){ return new Date().toISOString(); }

function newId(){
  // good enough for local queue ids
  return (Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,10));
}

/**
 * File-backed job queue.
 *
 * Directories:
 * - pending/: jobs waiting to be claimed
 * - processing/: jobs claimed by a worker (RUNNING)
 * - done/: succeeded
 * - failed/: failed
 */
function init(jobRoot){
  const pendingDir = path.join(jobRoot,'pending');
  const processingDir = path.join(jobRoot,'processing');
  const doneDir = path.join(jobRoot,'done');
  const failedDir = path.join(jobRoot,'failed');
  ensureDir(pendingDir); ensureDir(processingDir); ensureDir(doneDir); ensureDir(failedDir);
  return { pendingDir, processingDir, doneDir, failedDir };
}

function enqueue(jobDirs, job){
  const id = newId();
  const payload = { ...job, id, createdAt: nowIso(), status: 'PENDING', attempts: 0 };

  // Write atomically: write to a temp file then rename.
  // This avoids workers reading partially-written JSON.
  const finalPath = path.join(jobDirs.pendingDir, id + '.json');
  const tmpPath = finalPath + '.tmp';
  writeJson(tmpPath, payload);
  renameSyncRetry(tmpPath, finalPath);

  return payload;
}

function list(jobDirs, { limit = 50, status = null } = {}){
  const all = [];

  const want = status ? String(status).toUpperCase() : null;
  const dirs = want === 'PENDING' ? [jobDirs.pendingDir]
    : want === 'RUNNING' ? [jobDirs.processingDir]
    : want === 'DONE' ? [jobDirs.doneDir]
    : want === 'FAILED' ? [jobDirs.failedDir]
    : [jobDirs.pendingDir, jobDirs.processingDir, jobDirs.doneDir, jobDirs.failedDir];

  for (const dir of dirs) {
    let files = [];
    try { files = fs.readdirSync(dir); } catch { files = []; }
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const p = path.join(dir, f);
      const j = readJson(p);
      if (j) all.push(j);
    }
  }

  // Default order: most recently-touched first (better UX than createdAt-only).
  const key = (j) => String(j.updatedAt || j.finishedAt || j.startedAt || j.createdAt || '');
  all.sort((a, b) => key(b).localeCompare(key(a)));
  return all.slice(0, limit);
}

function listPending(jobDirs){
  const items = [];
  let files = [];
  try { files = fs.readdirSync(jobDirs.pendingDir); } catch { files = []; }
  for(const f of files){
    if(!f.endsWith('.json')) continue;
    const p = path.join(jobDirs.pendingDir,f);
    const j = readJson(p);
    if(j) items.push(j);
  }
  items.sort((a,b)=> String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
  return items;
}

function jobPathFor(jobDirs, status, id){
  const name = id + '.json';
  if(status === 'PENDING') return path.join(jobDirs.pendingDir, name);
  if(status === 'RUNNING') return path.join(jobDirs.processingDir, name);
  if(status === 'DONE') return path.join(jobDirs.doneDir, name);
  if(status === 'FAILED') return path.join(jobDirs.failedDir, name);
  return path.join(jobDirs.pendingDir, name);
}

/**
 * Atomically claim the next pending job by moving it into processing/.
 * Returns { job, path } or null.
 *
 * Reliability note:
 * - We iterate files directly and claim via rename first.
 * - Then we read JSON from the claimed location.
 * This avoids a race where a job becomes unreadable in pending/ (partial writes
 * by external tools, or transient read errors) and would otherwise be skipped.
 */
function claimNext(jobDirs){
  let files = [];
  try { files = fs.readdirSync(jobDirs.pendingDir); } catch { files = []; }
  files = files.filter(f => f.endsWith('.json'));

  // Prefer oldest-ish first: sort by filename (ids are time-based) as a cheap proxy.
  files.sort((a,b)=> a.localeCompare(b));

  for(const f of files){
    const from = path.join(jobDirs.pendingDir, f);
    const to = path.join(jobDirs.processingDir, f);

    try {
      renameSyncRetry(from, to);
    } catch {
      // Someone else claimed it or the file is transiently locked; try next.
      continue;
    }

    // Read with a tiny retry: Windows/AV can transiently lock files right after rename.
    const j = readJsonRetry(to, null, { attempts: 6, delayMs: 25 });

    // If we couldn't read the job at all (transient lock), put it back and move on.
    // This avoids incorrectly quarantining good jobs under brief file contention.
    if (!j) {
      try { renameSyncRetry(to, from); } catch {}
      continue;
    }

    // If a job has a notBefore timestamp (simple backoff), put it back and move on.
    // This prevents rapid re-claim loops (e.g., missing gateway token).
    try {
      const nb = Date.parse(j && j.notBefore ? j.notBefore : '');
      if (nb && Date.now() < nb) {
        try { renameSyncRetry(to, from); } catch {}
        continue;
      }
    } catch {}

    if(!j.id){
      // The file we claimed isn't valid JSON. Quarantine it as FAILED so the
      // queue doesn't jam forever.
      try {
        const badId = path.basename(f, '.json');
        const failedPath = jobPathFor(jobDirs, 'FAILED', badId);
        const rec = {
          id: badId,
          createdAt: nowIso(),
          attempts: 0,
          status: 'FAILED',
          updatedAt: nowIso(),
          finishedAt: nowIso(),
          result: { ok: false, output: null, error: 'BAD_JOB_JSON' },
        };
        try { writeJsonAtomic(failedPath, rec); } catch { try { writeJson(failedPath, rec); } catch {} }
      } catch {}
      try { fs.unlinkSync(to); } catch {}
      continue;
    }

    const claimed = {
      ...j,
      status: 'RUNNING',
      attempts: (j.attempts || 0) + 1,
      startedAt: nowIso(),
      updatedAt: nowIso(),
    };

    // Best-effort: if the atomic rewrite fails (Windows rename edge cases),
    // fall back to a normal write. A partially-updated job in processing/
    // can otherwise look “stuck” (missing startedAt/attempts).
    try {
      writeJsonAtomic(to, claimed);
    } catch {
      try { writeJson(to, claimed); } catch {}
    }

    return { job: claimed, path: to };
  }

  return null;
}

function finish(jobDirs, job, { ok, output=null, error=null } = {}){
  const from = jobPathFor(jobDirs, 'RUNNING', job.id);
  const status = ok ? 'DONE' : 'FAILED';
  const to = jobPathFor(jobDirs, status, job.id);

  const finished = {
    ...job,
    status,
    updatedAt: nowIso(),
    finishedAt: nowIso(),
    result: { ok: !!ok, output, error },
  };

  // Best-effort: never throw from finish() (worker reliability > perfection).
  try {
    writeJsonAtomic(to, finished);
  } catch {
    try { writeJson(to, finished); } catch {}
  }
  try { fs.unlinkSync(from); } catch {}
  return finished;
}

/**
 * Requeue stale RUNNING jobs back to pending/.
 * This recovers from worker crashes.
 */
function requeueStale(jobDirs, { staleMs = 10 * 60 * 1000, maxAttempts = 3 } = {}){
  const now = Date.now();
  let moved = 0;

  let files = [];
  try { files = fs.readdirSync(jobDirs.processingDir); } catch { files = []; }
  for(const f of files){
    if(!f.endsWith('.json')) continue;
    const p = path.join(jobDirs.processingDir, f);
    const j = readJson(p);
    if(!j) continue;

    // Some crash windows can leave jobs in processing/ without startedAt.
    // In that case, fall back to updatedAt/createdAt, then file mtime.
    let startedAt = Date.parse(j.startedAt || '') || 0;
    if(!startedAt) startedAt = Date.parse(j.updatedAt || '') || 0;
    if(!startedAt) startedAt = Date.parse(j.createdAt || '') || 0;
    if(!startedAt) {
      try { startedAt = fs.statSync(p).mtimeMs; } catch { startedAt = 0; }
    }
    if(!startedAt) continue;
    if((now - startedAt) < staleMs) continue;

    // If it's been retried too many times, fail it instead of looping forever.
    const attempts = Number(j.attempts || 0);
    const terminalStatus = attempts >= maxAttempts ? 'FAILED' : 'PENDING';
    const to = jobPathFor(jobDirs, terminalStatus, j.id);

    const next = {
      ...j,
      status: terminalStatus,
      updatedAt: nowIso(),
      requeuedAt: nowIso(),
      result: terminalStatus === 'FAILED'
        ? { ok: false, output: null, error: 'STALE_RUNNING_MAX_ATTEMPTS' }
        : j.result,
    };

    try {
      writeJsonAtomic(to, next);
      fs.unlinkSync(p);
      moved++;
    } catch {
      // Best-effort fallback: if atomic replace fails (common on Windows when the
      // destination path already exists / antivirus races), try a plain write.
      // Crucially: still unlink the stale processing/ file when we succeed, so
      // the queue doesn't jam forever.
      try {
        writeJson(to, next);
        try { fs.unlinkSync(p); } catch {}
        moved++;
      } catch {
        // give up
      }
    }
  }

  return moved;
}

function get(jobDirs, id){
  const dirs = [jobDirs.pendingDir, jobDirs.processingDir, jobDirs.doneDir, jobDirs.failedDir];
  for (const dir of dirs) {
    const p = path.join(dir, id + '.json');
    if (!fs.existsSync(p)) continue;
    const j = readJson(p);
    if (j) return j;
  }
  return null;
}

function cleanupTmp(jobDirs){
  // If the process crashed mid-write, we can be left with *.tmp files.
  // They are never valid jobs (we only ever read *.json), but they can
  // accumulate and confuse manual inspection. Clean them up best-effort.
  const dirs = [jobDirs.pendingDir, jobDirs.processingDir, jobDirs.doneDir, jobDirs.failedDir];
  let removed = 0;
  for (const dir of dirs) {
    let files = [];
    try { files = fs.readdirSync(dir); } catch { files = []; }
    for (const f of files) {
      if (!f.endsWith('.tmp')) continue;
      try { fs.unlinkSync(path.join(dir, f)); removed++; } catch {}
    }
  }
  return removed;
}

function requeue(jobDirs, job, { error = null, delayMs = 0 } = {}){
  const from = jobPathFor(jobDirs, 'RUNNING', job.id);
  const to = jobPathFor(jobDirs, 'PENDING', job.id);

  const next = {
    ...job,
    status: 'PENDING',
    updatedAt: nowIso(),
    requeuedAt: nowIso(),
    ...(delayMs && delayMs > 0 ? { notBefore: new Date(Date.now() + delayMs).toISOString() } : {}),
    // Preserve existing result unless we’re adding a hint.
    result: error ? { ok: false, output: null, error: String(error) } : (job.result || null),
  };

  try {
    writeJsonAtomic(to, next);
  } catch {
    try { writeJson(to, next); } catch {}
  }
  try { fs.unlinkSync(from); } catch {}
  return next;
}

module.exports = { init, enqueue, list, get, claimNext, finish, requeue, requeueStale, cleanupTmp };
