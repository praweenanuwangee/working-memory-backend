import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import express from 'express';
import multer from 'multer';
import { createApp } from '../src/app.js';

process.env.NODE_ENV = 'test';
const listen = async (app) => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, url: `http://127.0.0.1:${server.address().port}` };
};
const close = (server) => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });

test('serverless export, CORS, uploads and ML failure handling', async (t) => {
  const { default: entrypoint } = await import('../app.js');
  assert.equal(typeof entrypoint, 'function');
  let calls = 0;
  let mode = 'success';
  const mock = express();
  mock.post('/predict-shape', multer().single('image'), async (req, res) => {
    calls++;
    assert.equal(req.file.fieldname, 'image');
    assert.equal(req.file.mimetype, 'image/jpeg');
    assert.deepEqual(req.file.buffer, await readFile('ml/test-circle.jpeg'));
    if (mode === 'timeout') await new Promise((resolve) => setTimeout(resolve, 100));
    if (mode === 'error') return res.status(500).send('private service details');
    if (mode === 'json') return res.send('not json');
    if (mode === 'invalid') return res.json([{ shape: 'circle', confidence: 2 }]);
    if (mode === 'empty') return res.json([]);
    res.json([{ shape: 'square', confidence: 0.5 }, { shape: 'circle', confidence: 0.9, private: 'secret' }]);
  });
  const ml = await listen(mock);
  const api = await listen(entrypoint);
  t.after(async () => { await close(api.server); await close(ml.server); });
  process.env.ML_API_URL = ml.url;
  const endpoint = `${api.url}/api/working-memory/predict-shape`;
  for (const origin of ['http://localhost:5173', 'https://localhost:5173']) {
    const response = await fetch(endpoint, { method: 'OPTIONS', headers: {
      Origin: origin, 'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type,Authorization,x-user-id',
    } });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.match(response.headers.get('access-control-allow-headers'), /x-user-id/i);
  }
  const blocked = await fetch(endpoint, { method: 'OPTIONS', headers: { Origin: 'https://untrusted.example' } });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.headers.get('access-control-allow-origin'), null);
  const production = await listen(createApp({ clientUrls: ['https://frontend.example/'] }));
  t.after(() => close(production.server));
  assert.equal((await fetch(production.url, { headers: { Origin: 'https://frontend.example' } })).headers.get('access-control-allow-origin'), 'https://frontend.example');
  assert.equal((await fetch(`${api.url}/api/working-memory/games`)).status, 200);
  assert.equal((await fetch(endpoint, { method: 'POST' })).status, 400);
  const image = await readFile('ml/test-circle.jpeg');
  const upload = async (type = 'image/jpeg', bytes = image, field = 'image') => {
    const body = new FormData();
    body.append(field, new Blob([bytes], { type }), 'shape.jpeg');
    return fetch(endpoint, { method: 'POST', body, headers: { Origin: 'https://localhost:5173' } });
  };
  const before = (await readdir(os.tmpdir())).filter((name) => name.startsWith('working-memory-')).sort();
  const success = await upload();
  assert.equal(success.status, 200);
  assert.deepEqual(await success.json(), { success: true, data: { shape: 'circle', confidence: 0.9, confidenceLevel: 'Very Good' } });
  assert.equal(success.headers.get('access-control-allow-origin'), 'https://localhost:5173');
  for (const [scenario, status] of [['error', 502], ['json', 502], ['invalid', 502], ['empty', 200], ['timeout', 504]]) {
    mode = scenario;
    process.env.PREDICTION_TIMEOUT_MS = scenario === 'timeout' ? '20' : '30000';
    const response = await upload();
    assert.equal(response.status, status, scenario);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://localhost:5173');
    assert.doesNotMatch(await response.text(), /private service details|secret|stack/);
  }
  delete process.env.ML_API_URL;
  assert.equal((await upload()).status, 503);
  process.env.ML_API_URL = 'invalid-url';
  assert.equal((await upload()).status, 503);
  await close(ml.server);
  process.env.ML_API_URL = ml.url;
  assert.equal((await upload()).status, 503);
  assert.equal((await upload('text/plain')).status, 400);
  assert.equal((await upload('image/jpeg', image, 'wrong')).status, 400);
  assert.equal((await upload('image/jpeg', Buffer.alloc(4 * 1024 * 1024 + 1))).status, 413);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual((await readdir(os.tmpdir())).filter((name) => name.startsWith('working-memory-')).sort(), before);
  assert.ok(calls >= 6);
});
