'use strict';

const path = require('node:path');
const fs = require('node:fs');

function ensureDir(p){ fs.mkdirSync(p,{recursive:true}); }

function readJson(p, fallback=null){
  try { return JSON.parse(fs.readFileSync(p,'utf8')); } catch { return fallback; }
}

function writeJson(p, obj){ fs.writeFileSync(p, JSON.stringify(obj,null,2), 'utf8'); }

function nowIso(){ return new Date().toISOString(); }

function newId(){
  // good enough for local queue ids
  return (Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,10));
}

function init(jobRoot){
  const pendingDir = path.join(jobRoot,'pending');
  const doneDir = path.join(jobRoot,'done');
  const failedDir = path.join(jobRoot,'failed');
  ensureDir(pendingDir); ensureDir(doneDir); ensureDir(failedDir);
  return { pendingDir, doneDir, failedDir };
}

function enqueue(jobDirs, job){
  const id = newId();
  const payload = { ...job, id, createdAt: nowIso(), status: 'PENDING' };
  const p = path.join(jobDirs.pendingDir, id + '.json');
  writeJson(p, payload);
  return payload;
}

function list(jobDirs, { limit=50 } = {}){
  const all = [];
  for(const dir of [jobDirs.pendingDir, jobDirs.doneDir, jobDirs.failedDir]){
    for(const f of fs.readdirSync(dir)){
      if(!f.endsWith('.json')) continue;
      const p = path.join(dir,f);
      const j = readJson(p);
      if(j) all.push(j);
    }
  }
  all.sort((a,b)=> String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  return all.slice(0, limit);
}

module.exports = { init, enqueue, list };
