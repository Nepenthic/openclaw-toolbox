'use strict';

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
    reply.code(403).send({ ok: false, error: 'HOST_DENIED' });
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
  if (!originOk(req)) return reply.code(403).send({ ok: false, error: 'ORIGIN_DENIED' });
  const body = req.body || {};
  if (!timingSafeEqualStr(body.password || '', secrets.adminPassword)) {
    return reply.code(401).send({ ok: false, error: 'BAD_CREDENTIALS' });
  }
  const sessionId = randomHex(24);
  sessions.set(sessionId, { createdAt: Date.now() });
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
  if (!originOk(req)) return reply.code(403).send({ ok: false, error: 'ORIGIN_DENIED' });
  const sid = req.cookies.cc_session;
  if (sid) sessions.delete(sid);
  reply.clearCookie('cc_session', { path: '/' }).send({ ok: true });
});

function requireAuth(req, reply) {
  const s = getSession(req);
  if (!s) {
    reply.code(401).send({ ok: false, error: 'AUTH_REQUIRED' });
    return false;
  }
  // CSRF-lite: require Origin on all state-changing routes.
  if (!originOk(req)) {
    reply.code(403).send({ ok: false, error: 'ORIGIN_DENIED' });
    return false;
  }
  return true;
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
  reply.send(r);
});

app.post('/api/devices/:requestId/reject', async (req, reply) => {
  if (!requireAuth(req, reply)) return;
  const requestId = req.params.requestId;
  const r = await runOpenclawJson(['devices', 'reject', requestId, '--json'], { timeoutMs: 8000 });
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

// --- Unreal jobs (queued for worker) ---
app.get('/api/jobs', async (req, reply) => {
  reply.send({ ok: true, jobs: jobs.list(jobDirs, { limit: 50 }) });
});

app.post('/api/unreal/create', async (req, reply) => {
  if (!requireAuth(req, reply)) return;
  const body = req.body || {};
  const name = String(body.name || '').trim();
  const kind = String(body.kind || '').toLowerCase(); // 'bp' or 'cpp'
  if (!name || !/^[A-Za-z0-9_\-]{2,64}$/.test(name)) {
    return reply.code(400).send({ ok: false, error: 'BAD_NAME' });
  }
  if (!['bp','cpp'].includes(kind)) {
    return reply.code(400).send({ ok: false, error: 'BAD_KIND' });
  }

  const job = jobs.enqueue(jobDirs, {
    type: 'unreal.create',
    kind,
    name,
    // defaults; UI can override later
    root: 'D:\\UnrealProjects',
    ueRoot: 'D:\\UE_5.7',
    templateBp: 'TP_ThirdPersonBP',
    templateCpp: 'TP_ThirdPerson',
    launch: true
  });

  reply.send({ ok: true, job });
});

async function main() {
  await app.listen({ host: bindHost, port });
  app.log.info({ bindHost, port, allowedHosts: [...allowedHosts] }, 'Control Center listening');
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
