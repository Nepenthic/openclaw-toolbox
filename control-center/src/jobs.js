'use strict';

const path = require('node:path');
const fs = require('node:fs');

function ensureDir(p){ fs.mkdirSync(p,{recursive:true}); }

function readJson(p, fallback=null){
  try { return JSON.parse(fs.readFileSync(p,'utf8')); } catch { return fallback; }
}

function writeJson(p, obj){ fs.writeFileSync(p, JSON.stringify(obj,null,2), 'utf8'); }

function writeJsonAtomic(p, obj){
  // Atomic-ish on the same volume: write temp then replace.
  // On Windows, rename over an existing file can fail, so we unlink first.
  const tmp = p + '.tmp';
  writeJson(tmp, obj);
  try { fs.unlinkSync(p); } catch {}
  fs.renameSync(tmp, p);
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
  fs.renameSync(tmpPath, finalPath);

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
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const p = path.join(dir, f);
      const j = readJson(p);
      if (j) all.push(j);
    }
  }

  // Default order: newest first.
  all.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return all.slice(0, limit);
}

function listPending(jobDirs){
  const items = [];
  for(const f of fs.readdirSync(jobDirs.pendingDir)){
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
 */
function claimNext(jobDirs){
  const pending = listPending(jobDirs);
  for(const j of pending){
    const from = jobPathFor(jobDirs, 'PENDING', j.id);
    const to = jobPathFor(jobDirs, 'RUNNING', j.id);
    try {
      fs.renameSync(from, to);
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
    } catch {
      // Someone else claimed it; try next.
    }
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

  for(const f of fs.readdirSync(jobDirs.processingDir)){
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
      // best-effort
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

module.exports = { init, enqueue, list, get, claimNext, finish, requeueStale, cleanupTmp };
