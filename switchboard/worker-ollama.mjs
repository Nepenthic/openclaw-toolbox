import http from 'node:http';
import { spawn } from 'node:child_process';

const TOKEN = process.env.SWITCHBOARD_TOKEN;
const BASE_URL = process.env.SWITCHBOARD_URL || 'http://127.0.0.1:3883';
const WORKER_ID = process.env.SWITCHBOARD_WORKER_ID || process.env.COMPUTERNAME || 'worker-ollama';
const TAGS = (process.env.SWITCHBOARD_TAGS || 'ollama').split(',').map(s => s.trim()).filter(Boolean);
const DEFAULT_MODEL = process.env.SWITCHBOARD_OLLAMA_MODEL || '';

if (!TOKEN) {
  console.error('SWITCHBOARD_TOKEN is required');
  process.exit(2);
}

function reqJson(method, path, body) {
  const u = new URL(path, BASE_URL);
  const data = body ? Buffer.from(JSON.stringify(body)) : null;
  return new Promise((resolve, reject) => {
    const req = http.request({
      method,
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}),
      }
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', c => raw += c);
      res.on('end', () => {
        if (res.statusCode === 204) return resolve({ status: 204 });
        try {
          resolve({ status: res.statusCode, json: raw ? JSON.parse(raw) : null });
        } catch (e) {
          resolve({ status: res.statusCode, json: null, raw });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function runOllama(model, prompt, timeoutMs = 10 * 60_000) {
  return new Promise((resolve) => {
    const args = ['run', model, prompt];
    const p = spawn('ollama', args, { windowsHide: true });
    let out = '';
    let err = '';

    const killTimer = setTimeout(() => {
      err += `\nTIMEOUT after ${timeoutMs}ms`;
      try { p.kill(); } catch {}
    }, timeoutMs);

    p.stdout.on('data', (d) => out += d.toString('utf8'));
    p.stderr.on('data', (d) => err += d.toString('utf8'));
    p.on('close', (code) => {
      clearTimeout(killTimer);
      resolve({ code, out: out.trim(), err: err.trim() });
    });
  });
}

async function main() {
  await reqJson('POST', '/v1/workers/register', {
    workerId: WORKER_ID,
    tags: TAGS,
    meta: { kind: 'ollama', defaultModel: DEFAULT_MODEL }
  });
  console.log('registered', WORKER_ID, TAGS, 'defaultModel=', DEFAULT_MODEL);

  for (;;) {
    const next = await reqJson('GET', `/v1/jobs/next?workerId=${encodeURIComponent(WORKER_ID)}`);
    if (next.status === 204) {
      await new Promise(r => setTimeout(r, 1500));
      continue;
    }
    const job = next.json?.job;
    if (!job) {
      await new Promise(r => setTimeout(r, 1500));
      continue;
    }

    let ok = true;
    let output = null;
    let error = null;

    try {
      if (job.kind !== 'ollama') {
        ok = false;
        error = `worker only handles kind=ollama (got ${job.kind})`;
      } else {
        const model = job.input?.model || DEFAULT_MODEL;
        const prompt = job.input?.prompt || '';
        if (!model) throw new Error('missing model (set SWITCHBOARD_OLLAMA_MODEL or pass input.model)');

        const r = await runOllama(model, prompt, job.input?.timeoutMs || undefined);
        if (r.code !== 0) {
          ok = false;
          error = r.err || `ollama exited with code ${r.code}`;
        }
        output = { text: r.out, stderr: r.err, exitCode: r.code, model };
      }
    } catch (e) {
      ok = false;
      error = e?.message || String(e);
    }

    await reqJson('POST', `/v1/jobs/${job.id}/result`, { workerId: WORKER_ID, ok, output, error });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
