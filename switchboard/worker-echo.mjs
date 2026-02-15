import http from 'node:http';

const TOKEN = process.env.SWITCHBOARD_TOKEN;
const BASE_URL = process.env.SWITCHBOARD_URL || 'http://127.0.0.1:3883';
const WORKER_ID = process.env.SWITCHBOARD_WORKER_ID || 'worker-echo';
const TAGS = (process.env.SWITCHBOARD_TAGS || 'echo').split(',').map(s => s.trim()).filter(Boolean);

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

async function main() {
  await reqJson('POST', '/v1/workers/register', { workerId: WORKER_ID, tags: TAGS, meta: { kind: 'echo' } });
  console.log('registered', WORKER_ID, TAGS);

  // Poll loop
  for (;;) {
    const next = await reqJson('GET', `/v1/jobs/next?workerId=${encodeURIComponent(WORKER_ID)}`);
    if (next.status === 204) {
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }
    const job = next.json?.job;
    if (!job) {
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }

    let ok = true;
    let output = null;
    let error = null;
    try {
      if (job.kind === 'echo') {
        output = { text: job.input?.text ?? '' };
      } else {
        ok = false;
        error = `unknown kind: ${job.kind}`;
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
