import http from 'node:http';
import { createWorkerState, processRailRequest, responseBody } from './worker.mjs';

const state = createWorkerState();
const port = Number.parseInt(process.env.RAIL_WORKER_PORT ?? '4020', 10);

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'zolana-dark-rail-worker' }));
    return;
  }

  if (req.method !== 'POST' || req.url !== '/rail/authorize') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
    return;
  }

  try {
    const body = await readJson(req);
    const result = processRailRequest(body, state);
    res.writeHead(result.status, {
      'content-type': 'application/json',
      ...(result.headers ?? {}),
    });
    res.end(responseBody(result));
  } catch (error) {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: error.message }));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`ZOLana dark rail worker listening on http://127.0.0.1:${port}`);
});

