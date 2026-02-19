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
// v0: return “what we can read safely without hanging the CLI”.
// We will add a proper gateway WS adapter next.
const openclawStateDir = process.env.OPENCLAW_STATE_DIR
  ? path.resolve(process.env.OPENCLAW_STATE_DIR)
  : path.join(os.homedir(), '.openclaw');

app.get('/api/openclaw/state', async (req, reply) => {
  const paired = readJson(path.join(openclawStateDir, 'devices', 'paired.json'), {});
  const pending = readJson(path.join(openclawStateDir, 'devices', 'pending.json'), {});
  reply.send({ ok: true, stateDir: openclawStateDir, devices: { pendingCount: Object.keys(pending).length, pairedCount: Object.keys(paired).length } });
});

app.get('/api/nodes', async (req, reply) => {
  // Placeholder until gateway adapter: provide last-known from paired devices.
  const paired = readJson(path.join(openclawStateDir, 'devices', 'paired.json'), {});
  const nodes = Object.values(paired)
    .filter(d => Array.isArray(d.roles) && d.roles.includes('node'))
    .map(d => ({ deviceId: d.deviceId, displayName: d.displayName || d.deviceId.slice(0, 8), platform: d.platform, roles: d.roles }));
  reply.send({ ok: true, nodes, note: 'v0: nodes list is derived from devices/paired.json (last-known). Live status via gateway WS adapter is next.' });
});

// --- Static UI (very minimal) ---
app.register(fastifyStatic, {
  root: path.join(__dirname, '..', 'ui'),
  prefix: '/',
});

app.get('/api/ping', async () => ({ ok: true, ts: Date.now() }));

async function main() {
  await app.listen({ host: bindHost, port });
  app.log.info({ bindHost, port, allowedHosts: [...allowedHosts] }, 'Control Center listening');
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
