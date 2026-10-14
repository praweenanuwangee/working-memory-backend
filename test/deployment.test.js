import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { once, EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import express from 'express';
import multer from 'multer';
import { createApp } from '../src/app.js';

process.env.NODE_ENV = 'test';

test('both Working Memory prefixes share routes and database middleware', async (t) => {
  let databaseCalls = 0;
  const app = createApp({ databaseMiddleware: (req, res) => {
    databaseCalls += 1;
    res.status(503).json({ message: 'Database unavailable for routing test' });
  } });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}`;
  const games = [];
  for (const prefix of ['/api/working-memory', '/api/workingMemory']) {
    const response = await fetch(`${url}${prefix}/games`);
    assert.equal(response.status, 200);
    games.push(await response.json());
    const prediction = await fetch(`${url}${prefix}/predict-shape`, { method: 'POST' });
    assert.equal(prediction.status, 400);
    assert.equal((await prediction.json()).message, 'Image file is required');
    assert.equal(databaseCalls, games.length - 1);
    assert.equal((await fetch(`${url}${prefix}/progress`)).status, 503);
    assert.equal(databaseCalls, games.length);
  }
  assert.deepEqual(games[0], games[1]);
});

test('CORS, real Python image prediction, uploads and subprocess failures', async (t) => {
  const app = createApp({ clientUrls: ['https://frontend.example', 'https://r26-it-114-jflg.vercel.app'] });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}`;
  const endpoint = `${url}/api/working-memory/predict-shape`;
  for (const origin of ['http://localhost:5173', 'https://localhost:5173', 'https://frontend.example', 'https://r26-it-114-jflg.vercel.app']) {
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
  const productionOrigin = 'https://r26-it-114-jflg.vercel.app';
  const productionPreflight = await fetch(endpoint, { method: 'OPTIONS', headers: {
    Origin: productionOrigin,
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'Content-Type,Authorization,x-user-id',
  } });
  assert.equal(productionPreflight.status, 204);
  assert.equal(productionPreflight.headers.get('access-control-allow-origin'), productionOrigin);
  assert.match(productionPreflight.headers.get('access-control-allow-methods'), /POST/);
  assert.match(productionPreflight.headers.get('access-control-allow-headers'), /content-type/i);
  assert.match(productionPreflight.headers.get('access-control-allow-headers'), /authorization/i);
  const productionUpload = await fetch(endpoint, { method: 'POST', headers: { Origin: productionOrigin } });
  assert.equal(productionUpload.status, 400);
  assert.equal(productionUpload.headers.get('access-control-allow-origin'), productionOrigin);
  assert.equal((await fetch(`${url}/api/working-memory/games`)).status, 200);
  const unprefixed = await fetch(`${url}/predict-shape`, { method: 'POST' });
  assert.equal(unprefixed.status, 404);
  assert.equal((await unprefixed.json()).message, 'Route not found: POST /predict-shape');
  assert.equal((await fetch(endpoint, { method: 'POST' })).status, 400);
  const image = await readFile('ml/test-circle.jpeg');
  const upload = async (type = 'image/jpeg', bytes = image, field = 'image', origin = 'https://localhost:5173') => {
    const body = new FormData();
    body.append(field, new Blob([bytes], { type }), 'shape.jpeg');
    return fetch(endpoint, { method: 'POST', body, headers: { Origin: origin } });
  };
  const before = (await readdir(os.tmpdir())).filter((name) => name.startsWith('working-memory-')).sort();
  const originalVercel = process.env.VERCEL;
  process.env.VERCEL = '1';
  assert.equal((await upload()).status, 503);
  if (originalVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = originalVercel;
  if (process.env.RUN_ML_TESTS === '1') {
    const response = await upload('image/jpeg', image, 'image', 'https://r26-it-114-jflg.vercel.app');
    assert.equal(response.status, 200, await response.clone().text());
    const { success, data } = await response.json();
    assert.equal(success, true);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://r26-it-114-jflg.vercel.app');
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

test('service routing exposes Express and grants its internal ML binding', async () => {
  const config = JSON.parse(await readFile('vercel.json', 'utf8'));
  assert.equal(config.framework, undefined);
  assert.equal(config.functions, undefined);
  assert.deepEqual(config.rewrites, [{ source: '/(.*)', destination: { service: 'app' } }]);
  assert.deepEqual(config.services.app.bindings, [{ type: 'service', service: 'ml', format: 'url', env: 'ML_SERVICE_URL' }]);
  assert.equal(config.services.ml.root, 'ml');
  const { default: app } = await import('../api/index.js');
  assert.equal(typeof app, 'function');
});

test('Express forwards multipart images over the injected ML binding', async (t) => {
  const previousUrl = process.env.ML_SERVICE_URL;
  const previousTimeout = process.env.PREDICTION_TIMEOUT_MS;
  t.after(() => {
    if (previousUrl === undefined) delete process.env.ML_SERVICE_URL;
    else process.env.ML_SERVICE_URL = previousUrl;
    if (previousTimeout === undefined) delete process.env.PREDICTION_TIMEOUT_MS;
    else process.env.PREDICTION_TIMEOUT_MS = previousTimeout;
  });
  const image = await readFile('ml/test-circle.jpeg');
  let mode = 'success';
  const ml = express();
  ml.post('/binding-prefix/predict-shape', multer().single('image'), async (req, res) => {
    assert.deepEqual(req.file.buffer, image);
    assert.equal(req.file.mimetype, 'image/jpeg');
    if (mode === 'timeout') await new Promise((resolve) => setTimeout(resolve, 80));
    if (mode === 'error') return res.status(500).send('private error');
    if (mode === 'missing') return res.status(404).send('private route error');
    if (mode === 'bad-image') return res.status(400).send('invalid image');
    if (mode === 'invalid') return res.send('invalid json');
    res.json([{ shape: ['square', 'triangle'].includes(mode) ? mode : 'circle', confidence: 0.9 }]);
  });
  const mlServer = ml.listen(0, '127.0.0.1');
  await once(mlServer, 'listening');
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    for (const instance of [server, mlServer]) { instance.close(); instance.closeAllConnections(); }
  });
  process.env.ML_SERVICE_URL = `http://127.0.0.1:${mlServer.address().port}/binding-prefix`;
  const before = (await readdir(os.tmpdir())).filter((name) => name.startsWith('working-memory-')).sort();
  for (const [scenario, expected] of [['success', 200], ['square', 200], ['triangle', 200], ['missing', 502], ['bad-image', 400], ['error', 502], ['invalid', 502], ['timeout', 504]]) {
    mode = scenario;
    process.env.PREDICTION_TIMEOUT_MS = scenario === 'timeout' ? '20' : '60000';
    const body = new FormData();
    body.append('image', new Blob([image], { type: 'image/jpeg' }), 'shape.jpeg');
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/working-memory/predict-shape`, {
      method: 'POST', body, headers: { Origin: 'https://localhost:5173' },
    });
    assert.equal(response.status, expected);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://localhost:5173');
    const result = await response.json();
    if (expected === 200) assert.deepEqual(result, { success: true, data: { shape: scenario === 'success' ? 'circle' : scenario, confidence: 0.9, confidenceLevel: 'Very Good' } });
    assert.doesNotMatch(JSON.stringify(result), /private error|stack/);
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual((await readdir(os.tmpdir())).filter((name) => name.startsWith('working-memory-')).sort(), before);
});
