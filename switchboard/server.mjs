import http from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const BIND = process.env.SWITCHBOARD_BIND || '127.0.0.1';
const PORT = Number(process.env.SWITCHBOARD_PORT || '3883');
const TOKEN = process.env.SWITCHBOARD_TOKEN;

if (!TOKEN || TOKEN.length < 16) {
  console.error('SWITCHBOARD_TOKEN is required (>=16 chars).');
  process.exit(2);
}

const dataDir = join(process.cwd(), 'switchboard', 'data');
mkdirSync(dataDir, { recursive: true });
const statePath = join(dataDir, 'state.json');

/** @type {{jobs: any[], workers: Record<string, any>}} */
let state = { jobs: [], workers: {} };

function loadState() {
  if (!existsSync(statePath)) return;
  try {
    state = JSON.parse(readFileSync(statePath, 'utf8'));
  } catch (e) {
    console.error('Failed to load state.json:', e?.message || e);
  }
}

function saveState() {
  try {
    writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save state.json:', e?.message || e);
  }
}

loadState();

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
  });
}

function unauthorized(res) {
  res.writeHead(401, { 'Content-Type': 'text/plain' });
  res.end('Unauthorized');
}

function authOk(req) {
  const h = req.headers['authorization'] || '';
  return h === `Bearer ${TOKEN}`;
}

function now() { return new Date().toISOString(); }

function matchRoute(url, prefix) {
  return url === prefix || url.startsWith(prefix + '?') || url.startsWith(prefix + '/');
}

function selectNextJobFor(workerId) {
  // FIFO runnable job selection.
  // requirements: { tagsAny?: string[], tagsAll?: string[] }
  const worker = state.workers[workerId];
  if (!worker) return null;
  const wtags = new Set(worker.tags || []);

  for (const job of state.jobs) {
    if (job.status !== 'queued') continue;
    const req = job.requirements || {};
    const any = req.tagsAny || [];
    const all = req.tagsAll || [];
    if (all.some(t => !wtags.has(t))) continue;
    if (any.length > 0 && !any.some(t => wtags.has(t))) continue;
    return job;
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  try {
    if (!authOk(req)) return unauthorized(res);

    const url = req.url || '/';

    if (req.method === 'GET' && url === '/health') {
      return json(res, 200, { ok: true, time: now(), jobs: state.jobs.length, workers: Object.keys(state.workers).length });
    }

    if (req.method === 'POST' && url === '/v1/workers/register') {
      const body = await readJson(req);
      const workerId = String(body.workerId || '').trim();
      if (!workerId) return json(res, 400, { error: 'workerId required' });

      state.workers[workerId] = {
        workerId,
        tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
        meta: body.meta || {},
        lastSeenAt: now(),
      };
      saveState();
      return json(res, 200, { ok: true, worker: state.workers[workerId] });
    }

    if (req.method === 'POST' && url === '/v1/jobs') {
      const body = await readJson(req);
      const kind = String(body.kind || '').trim();
      if (!kind) return json(res, 400, { error: 'kind required' });

      const job = {
        id: randomUUID(),
        kind,
        input: body.input || {},
        requirements: body.requirements || {},
        status: 'queued',
        createdAt: now(),
        updatedAt: now(),
      };
      state.jobs.push(job);
      saveState();
      return json(res, 200, { ok: true, job });
    }

    if (req.method === 'GET' && matchRoute(url, '/v1/jobs/next')) {
      const u = new URL(url, `http://${req.headers.host}`);
      const workerId = String(u.searchParams.get('workerId') || '').trim();
      if (!workerId) { res.writeHead(400); return res.end('workerId required'); }

      // Touch worker
      if (state.workers[workerId]) {
        state.workers[workerId].lastSeenAt = now();
      }

      const job = selectNextJobFor(workerId);
      if (!job) {
        res.writeHead(204);
        return res.end();
      }

      job.status = 'running';
      job.workerId = workerId;
      job.startedAt = now();
      job.updatedAt = now();
      saveState();
      return json(res, 200, { ok: true, job });
    }

    if (req.method === 'POST' && url.startsWith('/v1/jobs/') && url.endsWith('/result')) {
      const parts = url.split('/');
      const id = parts[3];
      const job = state.jobs.find(j => j.id === id);
      if (!job) return json(res, 404, { error: 'job not found' });

      const body = await readJson(req);
      job.updatedAt = now();
      job.finishedAt = now();
      job.status = body.ok ? 'succeeded' : 'failed';
      job.result = {
        workerId: body.workerId,
        ok: !!body.ok,
        output: body.output,
        error: body.error,
      };
      saveState();
      return json(res, 200, { ok: true });
    }

    if (req.method === 'GET' && url.startsWith('/v1/jobs/')) {
      const parts = url.split('/');
      const id = parts[3];
      const job = state.jobs.find(j => j.id === id);
      if (!job) return json(res, 404, { error: 'job not found' });
      return json(res, 200, { ok: true, job });
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: e?.message || String(e) }));
  }
});

server.listen(PORT, BIND, () => {
  console.log(`Switchboard listening on http://${BIND}:${PORT}`);
  console.log(`Data: ${statePath}`);
});
