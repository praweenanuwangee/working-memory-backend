import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { once, EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import { createApp } from '../src/app.js';

process.env.NODE_ENV = 'test';

test('CORS, real Python image prediction, uploads and subprocess failures', async (t) => {
  const app = createApp({ clientUrls: ['https://frontend.example'] });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}`;
  const endpoint = `${url}/api/working-memory/predict-shape`;
  for (const origin of ['http://localhost:5173', 'https://localhost:5173', 'https://frontend.example']) {
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
  assert.equal((await fetch(`${url}/api/working-memory/games`)).status, 200);
  assert.equal((await fetch(endpoint, { method: 'POST' })).status, 400);
  const image = await readFile('ml/test-circle.jpeg');
  const upload = async (type = 'image/jpeg', bytes = image, field = 'image') => {
    const body = new FormData();
    body.append(field, new Blob([bytes], { type }), 'shape.jpeg');
    return fetch(endpoint, { method: 'POST', body, headers: { Origin: 'https://localhost:5173' } });
  };
  const before = (await readdir(os.tmpdir())).filter((name) => name.startsWith('working-memory-')).sort();
  const originalVercel = process.env.VERCEL;
  process.env.VERCEL = '1';
  assert.equal((await upload()).status, 503);
  if (originalVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = originalVercel;
  if (process.env.RUN_ML_TESTS === '1') {
    const response = await upload();
    assert.equal(response.status, 200, await response.clone().text());
    const { success, data } = await response.json();
    assert.equal(success, true);
    assert.equal(data.shape, 'circle');
    assert.ok(data.confidence >= 0.4 && data.confidence <= 1);
    assert.equal(data.confidenceLevel, 'Very Good');
    assert.equal((await upload('image/jpeg', Buffer.from('invalid image'))).status, 400);
  } else {
    t.diagnostic('Real YOLO inference omitted; set RUN_ML_TESTS=1 with Python dependencies installed.');
  }
  let mode = 'success';
  const spawnMock = mock.method(childProcess, 'spawn', (executable, args, options) => {
    assert.equal(options.shell, false);
    assert.ok(args[1].endsWith('predict.py'));
    assert.ok(args[2].startsWith(os.tmpdir()));
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => { process.nextTick(() => child.emit('close', null)); return true; };
    if (mode === 'timeout') return child;
    process.nextTick(() => {
      if (mode === 'error') child.emit('error', new Error('private runtime details'));
      if (mode === 'exit') child.stderr.write('private model error');
      const outputs = {
        success: '[{"shape":"circle","confidence":0.9}]',
        json: 'invalid json', invalid: '[{"shape":"circle","confidence":2}]', empty: '[]',
        low: '[{"shape":"square","confidence":0.5}]', medium: '[{"shape":"triangle","confidence":0.6}]',
        good: '[{"shape":"circle","confidence":0.75}]', undetected: '[{"shape":"circle","confidence":0.3}]',
        overflow: 'x'.repeat(65537),
      };
      child.stdout.write(outputs[mode] || '');
      child.emit('close', mode === 'exit' ? 1 : 0);
    });
    return child;
  });
  syncBuiltinESMExports();
  t.after(() => { spawnMock.mock.restore(); syncBuiltinESMExports(); });
  for (const [scenario, status, level] of [
    ['success', 200, 'Very Good'], ['low', 200, 'Low'], ['medium', 200, 'Medium'],
    ['good', 200, 'Good'], ['undetected', 200, 'Not Detected'], ['empty', 200, 'Not Detected'],
    ['json', 502], ['invalid', 502], ['exit', 500], ['error', 503], ['overflow', 502], ['timeout', 504],
  ]) {
    mode = scenario;
    process.env.PREDICTION_TIMEOUT_MS = scenario === 'timeout' ? '20' : '60000';
    const response = await upload();
    assert.equal(response.status, status, scenario);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://localhost:5173');
    const body = await response.json();
    if (level) assert.equal(body.data.confidenceLevel, level);
    assert.doesNotMatch(JSON.stringify(body), /private|stack/);
  }
  process.env.PREDICTION_TIMEOUT_MS = '-1';
  assert.equal((await upload()).status, 503);
  delete process.env.PREDICTION_TIMEOUT_MS;
  assert.equal((await upload('text/plain')).status, 400);
  assert.equal((await upload('image/jpeg', image, 'wrong')).status, 400);
  assert.equal((await upload('image/jpeg', Buffer.alloc(4 * 1024 * 1024 + 1))).status, 413);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual((await readdir(os.tmpdir())).filter((name) => name.startsWith('working-memory-')).sort(), before);
});

test('mixed-runtime rewrites prioritize Python and Node entrypoint exports the app', async () => {
  const config = JSON.parse(await readFile('vercel.json', 'utf8'));
  assert.equal(config.framework, null);
  assert.equal(config.rewrites[0].source, '/api/working-memory/predict-shape');
  assert.equal(config.rewrites[0].destination, '/api/predict_shape');
  const { default: app } = await import('../api/index.js');
  assert.equal(typeof app, 'function');
});
