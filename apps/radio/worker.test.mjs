import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { once } from 'node:events';
import test from 'node:test';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const freePort = async () => {
  const server = http.createServer();
  await listen(server);
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
};
const token = 'local-radio-worker-test-token-000000000000000';
const sourcePassword = 'local-radio-worker-source-password-00000000000';
const epoch = randomUUID();
let connected = false;
let disconnected = false;
const icecast = http.createServer((request, response) => {
  if (request.url?.startsWith('/admin/killsource')) { disconnected = true; connected = false; }
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ icestats: { source: connected ? { listenurl: 'http://127.0.0.1/dj.mp3' } : [] } }));
});
await test('BUTT worker reports source connection and respects epoch fencing', async () => {
  await listen(icecast);
  const port = await freePort();
  const worker = spawn(process.execPath, ['apps/radio/worker.mjs'], {
    env: { ...process.env, PORT: String(port), ICECAST_HOST: '127.0.0.1', ICECAST_PORT: String(icecast.address().port), RADIO_WORKER_TOKEN: token, ICECAST_SOURCE_PASSWORD: sourcePassword, ICECAST_DJ_PASSWORD: 'local-dj-source-password-00000000000000000' },
    stdio: 'ignore',
  });
  const call = async (path, body, authorized = true) => {
    const response = await fetch('http://127.0.0.1:' + port + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(authorized ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { code: response.status, data: await response.json() };
  };
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try { if ((await call('/health')).code === 200) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(ready, true);
    assert.equal((await call('/status', undefined, false)).code, 401);
    assert.equal((await call('/start', { epoch, mode: 'wrong' })).code, 400);
    assert.equal((await call('/start', { epoch, mode: 'butt' })).data.active, true);
    assert.equal((await call('/status')).data.streaming, false);
    connected = true;
    assert.equal((await call('/status')).data.streaming, true);
    assert.equal((await call('/skip', { epoch })).code, 400);
    assert.equal((await call('/play', { epoch, key: randomUUID() + '.audio', trackId: randomUUID() })).code, 400);
    assert.equal((await call('/stop', { epoch: randomUUID() })).data.active, true);
    connected = false;
    assert.equal((await call('/heartbeat', { epoch })).data.streaming, false);
    assert.equal((await call('/stop', { epoch })).data.active, false);
    assert.equal(disconnected, true);
  } finally {
    worker.kill('SIGTERM');
    await Promise.race([once(worker, 'exit'), new Promise(resolve => setTimeout(resolve, 2000))]);
    await new Promise(resolve => icecast.close(resolve));
  }
});
