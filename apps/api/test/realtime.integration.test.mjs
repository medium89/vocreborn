import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import fs from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { io } from 'socket.io-client';

for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
}
const connection = new URL(process.env.DATABASE_URL);
assert(['localhost', '127.0.0.1', '[::1]', process.env.REALTIME_TEST_LOCAL_DB_HOST].includes(connection.hostname), 'Realtime tests require local PostgreSQL');
const databaseName = 'tusova_realtime_test_' + Date.now();
const database = new PrismaClient();
const isolated = new URL(connection); isolated.pathname = '/' + databaseName;
const prisma = new PrismaClient({ datasources: { db: { url: isolated.toString() } } });
const base = 'http://127.0.0.1:3137';
let api, created = false, alice, bob;
const sockets = [];
const received = new Map();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(path, cookie, body) {
  const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { Cookie: cookie || '', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function account(username) {
  await prisma.user.create({ data: { username, displayName: username, passwordHash: await hash('Integration123!') } });
  const result = await request('/api/auth/login', null, { username, password: 'Integration123!' });
  assert.equal(result.status, 200);
  return { id: result.body.user.id, cookie: result.cookie };
}
async function connect(account) {
  const socket = io(base, { autoConnect: false, transports: ['websocket'], extraHeaders: { Cookie: account.cookie }, reconnection: false });
  sockets.push(socket); received.set(socket, []);
  for (const event of ['message:created', 'direct:created']) socket.on(event, payload => received.get(socket).push({ event, ...payload }));
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); });
  await socket.timeout(2000).emitWithAck('room:join', { roomId: 'main' });
  return socket;
}
async function delivered(socket, event, id) {
  for (let n = 0; n < 40; n++) {
    const result = received.get(socket).filter(p => p.event === event && p.message.id === id);
    if (result.length) return result;
    await wait(50);
  }
  assert.fail('Missing realtime ' + event);
}
before(async () => {
  await database.$executeRawUnsafe('CREATE DATABASE "' + databaseName + '"'); created = true;
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: isolated.toString() }, stdio: 'ignore' });
  await prisma.room.create({ data: { id: 'main', name: 'Main', position: 0 } });
  api = spawn(process.execPath, ['dist/main.js'], { env: { ...process.env, DATABASE_URL: isolated.toString(), API_PORT: '3137', NODE_ENV: 'test', TUSOVA_BOTS_ENABLED: 'false', TUSOVA_QUIZ_ENABLED: 'false', TUSOVA_RADIO_ENABLED: 'false' }, stdio: ['ignore', 'ignore', 'ignore'] });
  for (let n = 0; n < 80; n++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch {} await wait(100); if (n === 79) assert.fail('API did not start'); }
  alice = await account('realtime_alice'); bob = await account('realtime_bob');
});
after(async () => {
  sockets.forEach(socket => socket.disconnect());
  if (api) { api.kill('SIGTERM'); await new Promise(resolve => { if (api.exitCode !== null) return resolve(); api.once('exit', resolve); setTimeout(() => { api.kill('SIGKILL'); resolve(); }, 2000).unref(); }); }
  await prisma.$disconnect();
  if (created) await database.$executeRawUnsafe('DROP DATABASE "' + databaseName + '" WITH (FORCE)');
  await database.$disconnect();
});
test('HTTP room send reaches recipient and both sender tabs exactly once, including concurrent retries', async () => {
  const sender = await connect(alice), recipient = await connect(bob), tab = await connect(alice);
  const body = { body: 'HTTP realtime room', requestId: randomUUID() };
  const results = await Promise.all([request('/api/rooms/main/messages', alice.cookie, body), request('/api/rooms/main/messages', alice.cookie, body)]);
  assert(results.every(result => result.status === 201));
  const id = results[0].body.message.id; assert.equal(results[1].body.message.id, id);
  for (const socket of [sender, recipient, tab]) await delivered(socket, 'message:created', id);
  await request('/api/rooms/main/messages', alice.cookie, body); await wait(150);
  for (const socket of [sender, recipient, tab]) assert.equal((await delivered(socket, 'message:created', id)).length, 1);
  assert.equal(await prisma.message.count({ where: { requestId: body.requestId } }), 1);
});
test('HTTP direct send reaches only participants, uses correct peerId and emits once for retries', async () => {
  const sender = sockets[0], recipient = sockets[1], tab = sockets[2];
  const outsider = await connect(await account('realtime_other'));
  const body = { body: 'HTTP realtime direct', requestId: randomUUID() };
  const path = '/api/direct/' + bob.id + '/messages';
  const results = await Promise.all([request(path, alice.cookie, body), request(path, alice.cookie, body)]);
  assert(results.every(result => result.status === 201)); const id = results[0].body.message.id;
  assert.equal(results[1].body.message.id, id);
  assert.equal((await delivered(recipient, 'direct:created', id))[0].peerId, alice.id);
  for (const socket of [sender, tab]) assert.equal((await delivered(socket, 'direct:created', id))[0].peerId, bob.id);
  await request(path, alice.cookie, body); await wait(150);
  for (const socket of [sender, recipient, tab]) assert.equal((await delivered(socket, 'direct:created', id)).length, 1);
  assert.equal(received.get(outsider).filter(p => p.message.id === id).length, 0);
});
test('Socket send shares publication path, has acknowledgement and no duplicate events', async () => {
  const sender = sockets[0], recipient = sockets[1];
  const payload = { roomId: 'main', body: 'Socket realtime room', requestId: randomUUID() };
  const response = await sender.timeout(2000).emitWithAck('message:send', payload);
  assert(response.message.id);
  await delivered(recipient, 'message:created', response.message.id);
  await sender.timeout(2000).emitWithAck('message:send', payload); await wait(150);
  assert.equal((await delivered(recipient, 'message:created', response.message.id)).length, 1);
});
test('Reconnect and rejoin restore delivery; rejected HTTP send never publishes', async () => {
  sockets[1].disconnect(); const recipient = await connect(bob);
  const result = await request('/api/rooms/main/messages', alice.cookie, { body: 'After reconnect', requestId: randomUUID() });
  assert.equal(result.status, 201); await delivered(recipient, 'message:created', result.body.message.id);
  const requestId = randomUUID();
  const invalid = await request('/api/rooms/main/messages', alice.cookie, { body: '', requestId });
  assert.equal(invalid.status, 400); await wait(100);
  assert.equal(received.get(recipient).filter(p => p.requestId === requestId).length, 0);
});
