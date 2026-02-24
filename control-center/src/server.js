'use strict';

// Crash visibility: keep the worker + API from dying silently.
process.on('unhandledRejection', (reason) => {
  try { console.error('[control-center] unhandledRejection', reason); } catch {}
});
process.on('uncaughtException', (err) => {
  try { console.error('[control-center] uncaughtException', err); } catch {}
});

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');

const Fastify = require('fastify');
const helmet = require('@fastify/helmet');
const cookie = require('@fastify/cookie');
const rateLimit = require('@fastify/rate-limit');
const fastifyStatic = require('@fastify/static');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readJson(p, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
}

function randomHex(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

// Local state for the control center (not OpenClaw state)
const stateDir = process.env.OPENCLAW_CONTROL_CENTER_STATE_DIR
  ? path.resolve(process.env.OPENCLAW_CONTROL_CENTER_STATE_DIR)
  : path.join(os.homedir(), '.openclaw', 'control-center');
ensureDir(stateDir);

const secretsPath = path.join(stateDir, 'secrets.json');
let secrets = readJson(secretsPath);

// Minimal audit log (JSONL). Keep it local + append-only.
// Rotate when it gets too big so a long-running LAN server doesn’t grow without bound.
const auditPath = path.join(stateDir, 'audit.log');
const auditMaxBytes = Number(process.env.CONTROL_CENTER_AUDIT_MAX_BYTES || (10 * 1024 * 1024)); // 10MB
function maybeRotateAudit() {
  try {
    const st = fs.statSync(auditPath);
    if (!st.isFile()) return;
    if (st.size < auditMaxBytes) return;

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const rotated = path.join(stateDir, `audit.${ts}.log`);
    fs.renameSync(auditPath, rotated);
  } catch {
    // ignore: best-effort only
  }
}
function audit(event, req, extra = {}) {
  try {
    maybeRotateAudit();
    const rec = {
      ts: new Date().toISOString(),
      event,
      ip: req?.ip,
      ua: req?.headers?.['user-agent'],
      ...extra,
    };
    fs.appendFileSync(auditPath, JSON.stringify(rec) + '\n', 'utf8');
  } catch {
    // best-effort only
  }
}

// Job queue lives under the same control-center state dir
const jobs = require('./jobs');
const jobDirs = jobs.init(path.join(stateDir, 'jobs'));
if (!secrets) {
  secrets = {
    createdAt: new Date().toISOString(),
    adminPassword: randomHex(16),
    sessionSecret: randomHex(32),
  };
  writeJson(secretsPath, secrets);
  // NOTE: we print the admin password once so Mike can log in.
  // It is not the gateway token.
  console.log('[control-center] First-run admin password (change later):', secrets.adminPassword);
}

const app = Fastify({ logger: true, trustProxy: false });

const bindHost = process.env.CONTROL_CENTER_BIND || '0.0.0.0';
const port = Number(process.env.CONTROL_CENTER_PORT || 3080);

// Optional: default node to execute jobs on (useful for Unreal build/package on a dedicated box like K15)
const defaultNodeId = (process.env.CONTROL_CENTER_DEFAULT_NODE_ID || '').trim();

// In LAN mode, we MUST do host/origin allowlisting.
const allowedHosts = new Set(
  (process.env.CONTROL_CENTER_ALLOWED_HOSTS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
);
// If not set, allow localhost + common LAN host/IP placeholders.
if (allowedHosts.size === 0) {
  allowedHosts.add('localhost');
  allowedHosts.add('127.0.0.1');
  allowedHosts.add('::1');
  // You can add MSI LAN IP here via env without code changes.
}

function hostOk(req) {
  const host = (req.headers.host || '').split(':')[0];
  return allowedHosts.has(host);
}

function originOk(req) {
  // For browsers, Origin is present on most state-changing requests.
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    const u = new URL(origin);
    return allowedHosts.has(u.hostname);
  } catch {
    return false;
  }
}

function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

app.addHook('onRequest', async (req, reply) => {
  if (!hostOk(req)) {
    // IMPORTANT: return to stop route handlers from running after we send.
    return reply.code(403).send({ ok: false, error: 'HOST_DENIED' });
  }
});

app.register(helmet, {
  contentSecurityPolicy: false, // keep simple for MVP; we’ll tighten after UI settles
});

app.register(rateLimit, {
  global: false,
});

app.register(cookie, {
  secret: secrets.sessionSecret,
  hook: 'onRequest',
});

// --- Auth ---
function getSession(req) {
  const s = req.cookies.cc_session;
  if (!s) return null;
  try {
    // cookie plugin signs, but we’ll just use the raw value and keep it simple.
    // v0: store session in-memory as a random id.
    return sessions.get(s) || null;
  } catch {
    return null;
  }
}

const sessions = new Map(); // sessionId -> { createdAt }

app.post('/api/login', {
  config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
}, async (req, reply) => {
  if (!originOk(req)) {
    audit('auth.login', req, { ok: false, error: 'ORIGIN_DENIED' });
    return reply.code(403).send({ ok: false, error: 'ORIGIN_DENIED' });
  }
  const body = req.body || {};
  if (!timingSafeEqualStr(body.password || '', secrets.adminPassword)) {
    audit('auth.login', req, { ok: false, error: 'BAD_CREDENTIALS' });
    return reply.code(401).send({ ok: false, error: 'BAD_CREDENTIALS' });
  }
  const sessionId = randomHex(24);
  sessions.set(sessionId, { createdAt: Date.now() });
  audit('auth.login', req, { ok: true });
  reply
    .setCookie('cc_session', sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // LAN without TLS; if we add TLS, set true.
      path: '/',
      maxAge: 60 * 60 * 8,
    })
    .send({ ok: true });
});

app.post('/api/logout', async (req, reply) => {
  if (!originOk(req)) {
    audit('auth.logout', req, { ok: false, error: 'ORIGIN_DENIED' });
    return reply.code(403).send({ ok: false, error: 'ORIGIN_DENIED' });
  }
  const sid = req.cookies.cc_session;
  if (sid) sessions.delete(sid);
  audit('auth.logout', req, { ok: true });
  reply.clearCookie('cc_session', { path: '/' }).send({ ok: true });
});

function requireAuth(req, reply) {
  const s = getSession(req);
  if (!s) {
    audit('auth.required', req, { ok: false });
    reply.code(401).send({ ok: false, error: 'AUTH_REQUIRED' });
    return false;
  }
  // CSRF-lite: require Origin on all state-changing routes.
  if (!originOk(req)) {
    audit('auth.required', req, { ok: false, error: 'ORIGIN_DENIED' });
    reply.code(403).send({ ok: false, error: 'ORIGIN_DENIED' });
    return false;
  }
  return true;
}

function requireSession(req, reply) {
  const s = getSession(req);
  if (!s) {
    audit('auth.required', req, { ok: false });
    reply.code(401).send({ ok: false, error: 'AUTH_REQUIRED' });
    return false;
  }
  return true;
}

function tailJsonl(filePath, { maxLines = 200, maxBytes = 256 * 1024 } = {}) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const st = fs.statSync(filePath);
    const start = Math.max(0, st.size - maxBytes);
    const buf = Buffer.alloc(st.size - start);
    const fd = fs.openSync(filePath, 'r');
    try {
      fs.readSync(fd, buf, 0, buf.length, start);
    } finally {
      try { fs.closeSync(fd); } catch {}
    }

    const txt = buf.toString('utf8');
    const lines = txt.trim().split(/\r?\n/).filter(Boolean);
    const slice = lines.slice(-maxLines);
    return slice.map((l) => {
      try { return JSON.parse(l); } catch { return { raw: l }; }
    });
  } catch {
    return [];
  }
}

// --- OpenClaw integration (MVP) ---
// Strategy:
// - v0 uses file reads for cheap state.
// - “live” endpoints shell out to `openclaw ... --json` with a hard timeout.
//   If it hangs, we return a clear error instead of blocking the UI.
const openclawStateDir = process.env.OPENCLAW_STATE_DIR
  ? path.resolve(process.env.OPENCLAW_STATE_DIR)
  : path.join(os.homedir(), '.openclaw');

function runOpenclawJson(args, { timeoutMs = 6000 } = {}) {
  return new Promise((resolve) => {
    const { spawn } = require('node:child_process');

    // Windows-friendly: don’t rely on PATH in service-like contexts.
    const exe = process.env.OPENCLAW_CLI_PATH || 'openclaw';

    let out = '';
    let err = '';
    let done = false;

    const p = spawn(exe, args, { windowsHide: true });

    p.on('error', (e) => {
      if (done) return;
      done = true;
      return resolve({ ok: false, error: 'SPAWN_FAILED', message: e.message, code: e.code });
    });

    const t = setTimeout(() => {
      if (done) return;
      done = true;
      try { p.kill('SIGKILL'); } catch {}
      return resolve({ ok: false, error: 'TIMEOUT', timeoutMs });
    }, timeoutMs);

    p.stdout.on('data', (d) => { out += d.toString('utf8'); });
    p.stderr.on('data', (d) => { err += d.toString('utf8'); });

    p.on('exit', (code) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      const txt = (out + '\n' + err).trim();
      try {
        const json = JSON.parse(txt);
        return resolve({ ok: code === 0, code, json });
      } catch {
        return resolve({ ok: false, code, error: 'NON_JSON', text: txt.slice(0, 4000) });
      }
    });
  });
}

app.get('/api/openclaw/state', async (req, reply) => {
  const paired = readJson(path.join(openclawStateDir, 'devices', 'paired.json'), {});
  const pending = readJson(path.join(openclawStateDir, 'devices', 'pending.json'), {});
  reply.send({ ok: true, stateDir: openclawStateDir, devices: { pendingCount: Object.keys(pending).length, pairedCount: Object.keys(paired).length } });
});

app.get('/api/nodes', async (req, reply) => {
  // Cheap last-known from paired devices.
  const paired = readJson(path.join(openclawStateDir, 'devices', 'paired.json'), {});
  const nodes = Object.values(paired)
    .filter(d => Array.isArray(d.roles) && d.roles.includes('node'))
    .map(d => ({ deviceId: d.deviceId, displayName: d.displayName || d.deviceId.slice(0, 8), platform: d.platform, roles: d.roles }));
  reply.send({ ok: true, nodes, mode: 'file', note: 'Derived from devices/paired.json (last-known).' });
});

app.get('/api/nodes/live', async (req, reply) => {
  const r = await runOpenclawJson(['nodes', 'status', '--json'], { timeoutMs: 6000 });
  reply.send(r);
});

// --- Approvals (device pairing) ---
app.get('/api/devices/pending', async (req, reply) => {
  const pending = readJson(path.join(openclawStateDir, 'devices', 'pending.json'), {});
  // Return a stable array for UI.
  const items = Object.values(pending).map(r => ({
    requestId: r.requestId,
    deviceId: r.deviceId,
    displayName: r.displayName,
    platform: r.platform,
    remoteIp: r.remoteIp,
    role: r.role,
    ts: r.ts,
  })).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  reply.send({ ok: true, items });
});

app.post('/api/devices/:requestId/approve', async (req, reply) => {
  if (!requireAuth(req, reply)) return;
  const requestId = req.params.requestId;
  const r = await runOpenclawJson(['devices', 'approve', requestId, '--json'], { timeoutMs: 8000 });
  audit('devices.approve', req, { requestId, ok: !!r.ok, error: r.error });
  reply.send(r);
});

app.post('/api/devices/:requestId/reject', async (req, reply) => {
  if (!requireAuth(req, reply)) return;
  const requestId = req.params.requestId;
  const r = await runOpenclawJson(['devices', 'reject', requestId, '--json'], { timeoutMs: 8000 });
  audit('devices.reject', req, { requestId, ok: !!r.ok, error: r.error });
  reply.send(r);
});

// --- Static UI (very minimal) ---
app.register(fastifyStatic, {
  root: path.join(__dirname, '..', 'ui'),
  prefix: '/',
  index: ['index.html'],
});

// Serve SPA entry
app.get('/', async (req, reply) => {
  return reply.sendFile('index.html');
});

app.get('/api/ping', async () => ({ ok: true, ts: Date.now() }));

app.get('/api/audit/tail', async (req, reply) => {
  if (!requireSession(req, reply)) return;
  const q = req.query || {};
  const limit = Math.max(1, Math.min(500, Number(q.limit || 200)));
  const items = tailJsonl(auditPath, { maxLines: limit });
  reply.send({ ok: true, items });
});

// --- Unreal jobs (queued for worker) ---
app.get('/api/jobs', async (req, reply) => {
  const q = req.query || {};
  const limit = Math.max(1, Math.min(200, Number(q.limit || 50)));
  const status = q.status ? String(q.status) : null; // PENDING|RUNNING|DONE|FAILED
  reply.send({ ok: true, jobs: jobs.list(jobDirs, { limit, status }) });
});

app.get('/api/jobs/summary', async (req, reply) => {
  // Lightweight counts for the UI (avoid listing everything client-side).
  const countJson = (dir) => {
    try {
      return fs.readdirSync(dir).filter(f => f.endsWith('.json')).length;
    } catch {
      return 0;
    }
  };
  reply.send({
    ok: true,
    counts: {
      pending: countJson(jobDirs.pendingDir),
      running: countJson(jobDirs.processingDir),
      done: countJson(jobDirs.doneDir),
      failed: countJson(jobDirs.failedDir),
    },
  });
});

app.get('/api/jobs/:id', async (req, reply) => {
  const id = String(req.params.id || '').trim();
  if (!id) return reply.code(400).send({ ok: false, error: 'BAD_ID' });
  const job = jobs.get(jobDirs, id);
  if (!job) return reply.code(404).send({ ok: false, error: 'NOT_FOUND' });
  reply.send({ ok: true, job });
});

function enqueueJob(req, jobSpec, auditExtra = {}) {
  const spec = {
    ...jobSpec,
    // If a default node is configured, prefer it for job execution unless the caller overrides.
    ...(defaultNodeId && !jobSpec.nodeId ? { nodeId: defaultNodeId } : {}),
  };

  const job = jobs.enqueue(jobDirs, spec);
  audit('jobs.enqueue', req, { ok: true, type: spec.type, jobId: job.id, nodeId: spec.nodeId || null, ...auditExtra });
  // Best-effort: nudge the worker right away so UI doesn't sit on "pending" until next poll.
  // Use a micro-delay so we don't do heavy work on the request's call stack.
  try { if (workerKick) setTimeout(() => workerKick(), 0); } catch {}
  return job;
}

app.post('/api/jobs/kick', async (req, reply) => {
  if (!requireAuth(req, reply)) return;
  try {
    if (workerKick) workerKick();
    audit('jobs.kick', req, { ok: true });
    return reply.send({ ok: true });
  } catch (e) {
    audit('jobs.kick', req, { ok: false, error: e?.message || String(e) });
    return reply.code(500).send({ ok: false, error: 'KICK_FAILED' });
  }
});

// Manual recovery: requeue stale RUNNING jobs (crash recovery without waiting for the next worker tick).
app.post('/api/jobs/requeue-stale', async (req, reply) => {
  if (!requireAuth(req, reply)) return;
  const body = req.body || {};
  const staleMs = Math.max(10_000, Math.min(24 * 60 * 60 * 1000, Number(body.staleMs || 10 * 60 * 1000)));
  const maxAttempts = Math.max(1, Math.min(20, Number(body.maxAttempts || 3)));

  try {
    const moved = jobs.requeueStale(jobDirs, { staleMs, maxAttempts });
    audit('jobs.requeueStale', req, { ok: true, moved, staleMs, maxAttempts });
    // Kick worker so any requeued jobs get picked up immediately.
    try { if (workerKick) workerKick(); } catch {}
    return reply.send({ ok: true, moved, staleMs, maxAttempts });
  } catch (e) {
    audit('jobs.requeueStale', req, { ok: false, error: e?.message || String(e) });
    return reply.code(500).send({ ok: false, error: 'REQUEUE_FAILED' });
  }
});

// Manual cleanup: remove leftover *.tmp files from the job queue dirs.
// This is safe (tmp files are never read as jobs) and helps keep the queue inspectable.
app.post('/api/jobs/cleanup-tmp', async (req, reply) => {
  if (!requireAuth(req, reply)) return;
  try {
    const removed = jobs.cleanupTmp(jobDirs);
    audit('jobs.cleanupTmp', req, { ok: true, removed });
    return reply.send({ ok: true, removed });
  } catch (e) {
    audit('jobs.cleanupTmp', req, { ok: false, error: e?.message || String(e) });
    return reply.code(500).send({ ok: false, error: 'CLEANUP_TMP_FAILED' });
  }
});

// Manual retry: move a FAILED job back to PENDING (keeps same id).
app.post('/api/jobs/:id/retry', async (req, reply) => {
  if (!requireAuth(req, reply)) return;
  const id = String(req.params.id || '').trim();
  if (!id) return reply.code(400).send({ ok: false, error: 'BAD_ID' });

  try {
    const next = jobs.retryFailed(jobDirs, id);
    if (!next) {
      audit('jobs.retryFailed', req, { ok: false, jobId: id, error: 'NOT_FAILED_OR_NOT_FOUND' });
      return reply.code(404).send({ ok: false, error: 'NOT_FAILED_OR_NOT_FOUND' });
    }
    audit('jobs.retryFailed', req, { ok: true, jobId: id, type: next.type || null });
    try { if (workerKick) workerKick(); } catch {}
    return reply.send({ ok: true, job: next });
  } catch (e) {
    audit('jobs.retryFailed', req, { ok: false, jobId: id, error: e?.message || String(e) });
    return reply.code(500).send({ ok: false, error: 'RETRY_FAILED' });
  }
});

app.post('/api/unreal/create', async (req, reply) => {
  if (!requireAuth(req, reply)) return;
  const body = req.body || {};
  const name = String(body.name || '').trim();
  const kind = String(body.kind || '').toLowerCase(); // 'bp' or 'cpp'
  if (!name || !/^[A-Za-z0-9_\-]{2,64}$/.test(name)) {
    audit('jobs.enqueue', req, { ok: false, type: 'unreal.create', error: 'BAD_NAME' });
    return reply.code(400).send({ ok: false, error: 'BAD_NAME' });
  }
  if (!['bp','cpp'].includes(kind)) {
    audit('jobs.enqueue', req, { ok: false, type: 'unreal.create', error: 'BAD_KIND', name });
    return reply.code(400).send({ ok: false, error: 'BAD_KIND' });
  }

  const job = enqueueJob(req, {
    type: 'unreal.create',
    kind,
    name,
    // defaults; UI can override later
    root: 'D:\\UnrealProjects',
    ueRoot: 'D:\\UE_5.7',
    templateBp: 'TP_ThirdPersonBP',
    templateCpp: 'TP_ThirdPerson',
    launch: true,

    // Where to run this job.
    // If OPENCLAW_NODE_ID is set, the worker will prefer nodes.run.
    nodeId: process.env.OPENCLAW_NODE_ID || undefined,
  }, { name, kind });

  reply.send({ ok: true, job });
});

app.post('/api/unreal/projectfiles', async (req, reply) => {
  if (!requireAuth(req, reply)) return;
  const body = req.body || {};
  const uproject = String(body.uproject || '').trim();
  const ueRoot = String(body.ueRoot || 'D:\\UE_5.7').trim();

  if (!uproject || !/\.uproject$/i.test(uproject) || uproject.length > 400) {
    audit('jobs.enqueue', req, { ok: false, type: 'unreal.projectfiles', error: 'BAD_UPROJECT' });
    return reply.code(400).send({ ok: false, error: 'BAD_UPROJECT' });
  }
  if (!ueRoot || ueRoot.length > 200) {
    audit('jobs.enqueue', req, { ok: false, type: 'unreal.projectfiles', error: 'BAD_UEROOT' });
    return reply.code(400).send({ ok: false, error: 'BAD_UEROOT' });
  }

  const job = enqueueJob(req, {
    type: 'unreal.projectfiles',
    uproject,
    ueRoot,
    nodeId: process.env.OPENCLAW_NODE_ID || undefined,
  }, { uproject });

  reply.send({ ok: true, job });
});

// Stubs (queued now; implementation coming): build + package.
app.post('/api/unreal/build', async (req, reply) => {
  if (!requireAuth(req, reply)) return;
  const body = req.body || {};
  const uproject = String(body.uproject || '').trim();
  const ueRoot = String(body.ueRoot || 'D:\\UE_5.7').trim();
  const config = String(body.config || 'Development').trim();

  if (!uproject || !/\.uproject$/i.test(uproject) || uproject.length > 400) {
    audit('jobs.enqueue', req, { ok: false, type: 'unreal.build', error: 'BAD_UPROJECT' });
    return reply.code(400).send({ ok: false, error: 'BAD_UPROJECT' });
  }
  if (!ueRoot || ueRoot.length > 200) {
    audit('jobs.enqueue', req, { ok: false, type: 'unreal.build', error: 'BAD_UEROOT' });
    return reply.code(400).send({ ok: false, error: 'BAD_UEROOT' });
  }

  const job = enqueueJob(req, {
    type: 'unreal.build',
    uproject,
    ueRoot,
    config,
    nodeId: process.env.OPENCLAW_NODE_ID || undefined,
  }, { uproject, config });

  reply.send({ ok: true, job });
});

app.post('/api/unreal/package', async (req, reply) => {
  if (!requireAuth(req, reply)) return;
  const body = req.body || {};
  const uproject = String(body.uproject || '').trim();
  const ueRoot = String(body.ueRoot || 'D:\\UE_5.7').trim();
  const platform = String(body.platform || 'Win64').trim();
  const config = String(body.config || 'Development').trim();

  if (!uproject || !/\.uproject$/i.test(uproject) || uproject.length > 400) {
    audit('jobs.enqueue', req, { ok: false, type: 'unreal.package', error: 'BAD_UPROJECT' });
    return reply.code(400).send({ ok: false, error: 'BAD_UPROJECT' });
  }
  if (!ueRoot || ueRoot.length > 200) {
    audit('jobs.enqueue', req, { ok: false, type: 'unreal.package', error: 'BAD_UEROOT' });
    return reply.code(400).send({ ok: false, error: 'BAD_UEROOT' });
  }

  const job = enqueueJob(req, {
    type: 'unreal.package',
    uproject,
    ueRoot,
    platform,
    config,
    nodeId: process.env.OPENCLAW_NODE_ID || undefined,
  }, { uproject, platform, config });

  reply.send({ ok: true, job });
});

// --- Background worker (processes pending jobs) ---
// This avoids relying on `openclaw ...` CLI, and instead prefers calling the Gateway directly.
const workerEnabled = (process.env.CONTROL_CENTER_WORKER_ENABLED || '1') !== '0';
const workerPollMs = Number(process.env.CONTROL_CENTER_WORKER_POLL_MS || 1500);
const workerDrainPerTick = Math.max(1, Math.min(50, Number(process.env.CONTROL_CENTER_WORKER_DRAIN_PER_TICK || 10)));

const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL || `http://127.0.0.1:${process.env.OPENCLAW_GATEWAY_PORT || 18789}`;
const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN || null;
const nodesRunPath = process.env.OPENCLAW_NODES_RUN_PATH || '/api/nodes/run';

// Allows API handlers to nudge the worker to run immediately after enqueue.
// (Otherwise we wait up to workerPollMs.)
let workerKick = null;

const nodesRunTimeoutMs = Number(process.env.OPENCLAW_NODES_RUN_TIMEOUT_MS || 120000);

async function nodesRun({ node, command, cwd, env }) {
  if (!gatewayToken) {
    return { ok: false, error: 'NO_GATEWAY_TOKEN', message: 'Set OPENCLAW_GATEWAY_TOKEN to enable nodes.run execution.' };
  }

  const url = new URL(nodesRunPath, gatewayUrl);

  // Reliability: avoid hanging the worker forever if the Gateway call stalls.
  const ac = new AbortController();
  const t = setTimeout(() => {
    try { ac.abort(new Error('NODES_RUN_TIMEOUT')); } catch {}
  }, nodesRunTimeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${gatewayToken}`,
      },
      body: JSON.stringify({ node, command, cwd, env }),
      signal: ac.signal,
    });
    const txt = await res.text();
    let json;
    try { json = JSON.parse(txt); } catch { json = { raw: txt }; }
    return { ok: res.ok, status: res.status, json };
  } catch (e) {
    const name = e?.name || 'Error';
    if (name === 'AbortError') return { ok: false, error: 'TIMEOUT', timeoutMs: nodesRunTimeoutMs };
    return { ok: false, error: 'FETCH_FAILED', message: e?.message || String(e) };
  } finally {
    clearTimeout(t);
  }
}

async function runUnrealCreate(job) {
  // Use the existing PowerShell script in the workspace.
  // Prefer nodes.run (remote execution) if nodeId is provided.
  const ps1 = path.join(__dirname, '..', '..', 'new-ue57-project.ps1');
  const args = [
    'powershell',
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', ps1,
    '-Name', job.name,
    '-Kind', job.kind,
    '-Root', job.root,
    '-UERoot', job.ueRoot,
    '-TemplateBP', job.templateBp,
    '-TemplateCPP', job.templateCpp,
    '-Launch', job.launch ? '1' : '0',
  ];

  if (job.nodeId) {
    // NOTE: This assumes the Gateway exposes a POST nodes.run endpoint.
    // If your gateway uses a different path, set OPENCLAW_NODES_RUN_PATH.
    const r = await nodesRun({ node: job.nodeId, command: args });

    // Reliability: if the operator forgot to set the gateway token, don’t burn the job.
    // Requeue so it can run once the token/env is fixed.
    if (!r.ok && r.error === 'NO_GATEWAY_TOKEN') {
      // Backoff: avoid tight re-claim loops when the operator hasn’t set the token yet.
      return { ok: false, requeue: true, delayMs: 60_000, error: 'NO_GATEWAY_TOKEN', output: r };
    }

    // Reliability: transient Gateway issues shouldn’t immediately fail the job.
    // Requeue a few times with a small backoff.
    if (!r.ok && (r.error === 'TIMEOUT' || r.error === 'FETCH_FAILED')) {
      const attempts = Number(job.attempts || 1);
      const backoffs = [60_000, 2 * 60_000, 5 * 60_000];
      if (attempts <= backoffs.length) {
        return { ok: false, requeue: true, delayMs: backoffs[attempts - 1], error: r.error, output: r };
      }
    }

    if (!r.ok) {
      return { ok: false, error: 'NODES_RUN_FAILED', output: r };
    }
    return { ok: true, output: r.json };
  }

  // Fallback: run locally.
  const { spawn } = require('node:child_process');
  return await new Promise((resolve) => {
    const p = spawn(args[0], args.slice(1), { windowsHide: true });
    let out = '';
    let err = '';
    p.stdout.on('data', d => out += d.toString('utf8'));
    p.stderr.on('data', d => err += d.toString('utf8'));
    p.on('exit', (code) => {
      if (code === 0) return resolve({ ok: true, output: { code, out: out.trim() } });
      return resolve({ ok: false, error: `EXIT_${code}`, output: { code, out: out.trim(), err: err.trim() } });
    });
  });
}

async function runUnrealProjectFiles(job) {
  // Generates IDE project files for a specific .uproject.
  // Uses UE's GenerateProjectFiles.bat (Windows).
  const bat = path.join(job.ueRoot || 'D:\\UE_5.7', 'Engine', 'Build', 'BatchFiles', 'GenerateProjectFiles.bat');
  const uproject = String(job.uproject || '').trim();
  const cmdLine = `"${bat}" -project="${uproject}" -game -engine`;
  const args = ['cmd', '/c', cmdLine];

  if (job.nodeId) {
    const r = await nodesRun({ node: job.nodeId, command: args });

    if (!r.ok && r.error === 'NO_GATEWAY_TOKEN') {
      return { ok: false, requeue: true, delayMs: 60_000, error: 'NO_GATEWAY_TOKEN', output: r };
    }

    // Reliability: transient Gateway issues shouldn’t immediately fail the job.
    // Requeue a few times with a small backoff.
    if (!r.ok && (r.error === 'TIMEOUT' || r.error === 'FETCH_FAILED')) {
      const attempts = Number(job.attempts || 1);
      const backoffs = [60_000, 2 * 60_000, 5 * 60_000];
      if (attempts <= backoffs.length) {
        return { ok: false, requeue: true, delayMs: backoffs[attempts - 1], error: r.error, output: r };
      }
    }

    if (!r.ok) return { ok: false, error: 'NODES_RUN_FAILED', output: r };
    return { ok: true, output: r.json };
  }

  // Local fallback.
  const { spawn } = require('node:child_process');
  return await new Promise((resolve) => {
    const p = spawn(args[0], args.slice(1), { windowsHide: true });
    let out = '';
    let err = '';
    p.stdout.on('data', d => out += d.toString('utf8'));
    p.stderr.on('data', d => err += d.toString('utf8'));
    p.on('exit', (code) => {
      if (code === 0) return resolve({ ok: true, output: { code, out: out.trim() } });
      return resolve({ ok: false, error: `EXIT_${code}`, output: { code, out: out.trim(), err: err.trim() } });
    });
  });
}

async function processOneJob() {
  const claimed = jobs.claimNext(jobDirs);
  if (!claimed) return false;
  const job = claimed.job;

  audit('worker.claim', null, { ok: true, jobId: job.id, type: job.type, attempts: job.attempts || 1, nodeId: job.nodeId || null });

  try {
    let r = { ok: false, error: 'UNKNOWN_JOB_TYPE' };
    if (job.type === 'unreal.create') {
      r = await runUnrealCreate(job);
    } else if (job.type === 'unreal.projectfiles') {
      r = await runUnrealProjectFiles(job);
    } else if (job.type === 'unreal.build' || job.type === 'unreal.package') {
      // Stub behavior: requeue a few times (so the job doesn't get burned immediately)
      // then fail with NOT_IMPLEMENTED so the queue doesn't loop forever.
      const attempts = Number(job.attempts || 1);
      if (attempts <= 3) {
        r = { ok: false, requeue: true, delayMs: 5 * 60_000, error: 'NOT_IMPLEMENTED' };
      } else {
        r = { ok: false, error: 'NOT_IMPLEMENTED' };
      }
    }

    if (r && r.requeue) {
      const next = jobs.requeue(jobDirs, job, { error: r.error || 'REQUEUED', delayMs: r.delayMs || 0 });
      audit('worker.requeue', null, { ok: true, jobId: job.id, type: job.type, error: r.error || 'REQUEUED', delayMs: r.delayMs || 0, attempts: next.attempts || job.attempts || 1 });
      return true;
    }

    const fin = { ok: !!r.ok, output: r.output || null, error: r.ok ? null : (r.error || 'FAILED') };
    jobs.finish(jobDirs, job, fin);
    audit('worker.finish', null, { ok: fin.ok, jobId: job.id, type: job.type, error: fin.error });
  } catch (e) {
    const fin = { ok: false, error: e?.message || String(e) };
    jobs.finish(jobDirs, job, fin);
    audit('worker.finish', null, { ok: false, jobId: job.id, type: job.type, error: fin.error });
  }
  return true;
}

function startWorkerLoop() {
  if (!workerEnabled) {
    app.log.warn('Worker disabled (CONTROL_CENTER_WORKER_ENABLED=0)');
    return;
  }

  app.log.info({ workerPollMs, workerDrainPerTick, gatewayUrl, nodesRunPath, hasGatewayToken: !!gatewayToken, defaultNodeId: defaultNodeId || null }, 'Worker loop starting');

  let running = false;
  let rerunRequested = false;
  const tick = async () => {
    // If a tick is already running, remember to run again once it finishes.
    if (running) {
      rerunRequested = true;
      return;
    }

    running = true;
    try {
      // Recover from worker crashes: cleanup temp files + move stale RUNNING jobs back to pending.
      // Keep these best-effort so a single filesystem hiccup doesn't block job draining.
      try {
        const tmpRemoved = jobs.cleanupTmp(jobDirs);
        if (tmpRemoved > 0) audit('worker.cleanupTmp', null, { ok: true, count: tmpRemoved });
      } catch (e) {
        audit('worker.cleanupTmp', null, { ok: false, error: e?.message || String(e) });
      }

      try {
        const requeued = jobs.requeueStale(jobDirs, { staleMs: 10 * 60 * 1000, maxAttempts: 3 });
        if (requeued > 0) audit('worker.requeueStale', null, { ok: true, count: requeued });
      } catch (e) {
        audit('worker.requeueStale', null, { ok: false, error: e?.message || String(e) });
      }

      // Drain a few jobs per tick to reduce latency.
      let drained = 0;
      for (let i = 0; i < workerDrainPerTick; i++) {
        const did = await processOneJob();
        if (!did) break;
        drained++;
      }

      // If we hit the drain limit and there are still pending jobs, schedule another pass
      // immediately (instead of waiting for the next poll interval). This keeps the queue
      // moving under bursts without making a single tick unbounded.
      if (drained >= workerDrainPerTick) {
        try {
          // Only rerun immediately if there are *claimable* pending jobs.
          // Prevents a tight loop when the queue contains only delayed (notBefore) jobs.
          if (jobs.hasReadyPending(jobDirs)) rerunRequested = true;
        } catch {
          // ignore
        }
      }
    } finally {
      running = false;
    }

    // If kicks arrived while we were running, do one extra pass immediately.
    // Avoid recursion here: in bursty scenarios this can grow the call stack.
    if (rerunRequested) {
      rerunRequested = false;
      setImmediate(() => {
        tick().catch((e) => app.log.error(e, 'Worker tick error'));
      });
    }
  };

  // Expose a best-effort "kick" for API handlers.
  workerKick = () => tick().catch((e) => app.log.error(e, 'Worker tick error'));

  // Kick once immediately so newly-started workers don't wait a full poll interval.
  workerKick();

  // Bonus reliability/latency improvement: kick the worker as soon as a new job file lands.
  // Debounce to avoid a storm of kicks on Windows (rename/write patterns can emit multiple events).
  try {
    let watchKickTimer = null;
    fs.watch(jobDirs.pendingDir, { persistent: false }, () => {
      if (watchKickTimer) return;
      watchKickTimer = setTimeout(() => {
        watchKickTimer = null;
        try { workerKick(); } catch {}
      }, 200);
    });
  } catch (e) {
    app.log.warn({ err: e?.message || String(e) }, 'fs.watch pendingDir failed; falling back to polling only');
  }

  setInterval(() => {
    tick().catch((e) => app.log.error(e, 'Worker tick error'));
  }, workerPollMs);
}

async function main() {
  await app.listen({ host: bindHost, port });
  app.log.info({ bindHost, port, allowedHosts: [...allowedHosts] }, 'Control Center listening');
  startWorkerLoop();
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
