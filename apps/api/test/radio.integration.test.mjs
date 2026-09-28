import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import http from 'node:http';
import fs from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';

for (const line of (await fs.readFile('.env', 'utf8')).split(/\r?\n/)) {
  const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
}
const connection = new URL(process.env.DATABASE_URL);
assert(['localhost', '127.0.0.1', '[::1]', process.env.RADIO_TEST_LOCAL_DB_HOST].includes(connection.hostname), 'Radio tests require a local PostgreSQL server');
const databaseName = 'tusova_radio_test_' + Date.now();
const database = new PrismaClient();
const isolated = new URL(connection); isolated.pathname = '/' + databaseName;
const prisma = new PrismaClient({ datasources: { db: { url: isolated.toString() } } });
const base = 'http://127.0.0.1:3117/api';
const token = 'local-radio-test-token-not-for-production-000';
let api, worker, created = false;
let audio = { active: false, epoch: null, trackId: null, completedId: null, result: null };
let failAudio = false;
let admin, dj, listener, stranger;
const files = [];
async function request(path, user, body, method) {
  const response = await fetch(base + path, { method: method || (body === undefined ? 'GET' : 'POST'), headers: { ...(user ? { Cookie: user.cookie } : {}), ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  return { status: response.status, body: data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function account(username, role = 'USER') {
  const user = await prisma.user.create({ data: { username, displayName: username, passwordHash: await hash('Integration123!'), role, credits: 50 } });
  const session = await request('/auth/login', null, { username, password: 'Integration123!' });
  assert.equal(session.status, 200); return { ...user, cookie: session.cookie };
}
const order = (changes = {}) => ({ artist: 'Исполнитель', title: 'Тестовый трек', note: 'Приватное посвящение', expectedPrice: 5, idempotencyKey: randomUUID(), ...changes });
const balance = async () => (await prisma.user.findUniqueOrThrow({ where: { id: listener.id } })).credits;
async function waitFor(condition) {
  for (let i = 0; i < 70; i++) { if (await condition()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error('Radio state did not synchronize');
}
before(async () => {
  assert(/^tusova_radio_test_[0-9]+$/.test(databaseName));
  await database.$executeRawUnsafe('CREATE DATABASE "' + databaseName + '"'); created = true;
  execFileSync('node_modules/.bin/prisma', ['migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: isolated.toString() }, stdio: 'ignore' });
  worker = http.createServer(async (req, res) => {
    if (req.headers.authorization !== 'Bearer ' + token) { res.writeHead(401); res.end('{}'); return; }
    let raw = ''; for await (const part of req) raw += part;
    const body = raw ? JSON.parse(raw) : {};
    if (failAudio) { res.writeHead(503); res.end('{}'); return; }
    if (req.url === '/probe') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ duration: 10, mimeType: 'audio/mpeg' })); return; }
    if (req.url === '/start') audio = { active: true, epoch: body.epoch, trackId: null, completedId: null, result: null };
    if (body.epoch === audio.epoch) {
      if (req.url === '/stop') audio.active = false;
      if (req.url === '/play') { audio.trackId = body.trackId; audio.completedId = null; audio.result = null; }
      if (req.url === '/skip') { audio.completedId = audio.trackId; audio.trackId = null; audio.result = 'skipped'; }
    }
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(audio));
  });
  await new Promise(resolve => worker.listen(3118, '127.0.0.1', resolve));
  api = spawn(process.execPath, ['dist/main.js'], { env: { ...process.env, DATABASE_URL: isolated.toString(), API_PORT: '3117', TUSOVA_BOTS_ENABLED: 'false', TUSOVA_RADIO_ENABLED: 'true', RADIO_WORKER_URL: 'http://127.0.0.1:3118', RADIO_WORKER_TOKEN: token, RADIO_STORAGE_DIR: 'storage/radio-test' }, stdio: ['ignore', 'ignore', 'ignore'] });
  await waitFor(async () => { try { return (await fetch(base + '/health')).ok; } catch { return false; } });
  admin = await account('radio_admin', 'ADMIN'); dj = await account('radio_dj'); listener = await account('radio_listener'); stranger = await account('radio_stranger');
});
after(async () => {
  if (api) { api.kill('SIGTERM'); await new Promise(resolve => { if (api.exitCode !== null) return resolve(); api.once('exit', resolve); setTimeout(() => { api.kill('SIGKILL'); resolve(); }, 2000).unref(); }); }
  if (worker) await new Promise(resolve => worker.close(resolve));
  for (const file of files) await fs.unlink(file).catch(() => {});
  await prisma.$disconnect();
  if (created) await database.$executeRawUnsafe('DROP DATABASE "' + databaseName + '" WITH (FORCE)');
  await database.$disconnect();
});
test('radio permissions, assignment audit and a single active DJ', async () => {
  assert.equal((await request('/radio/start', listener, {})).status, 403);
  assert.equal((await request('/radio/dj/' + dj.id, listener, { enabled: true }, 'PATCH')).status, 403);
  assert.equal((await request('/radio/dj/' + dj.id, admin, { enabled: true }, 'PATCH')).status, 200);
  assert.equal((await prisma.user.findUnique({ where: { id: dj.id } })).role, 'USER');
  assert.equal((await request('/admin/overview', dj)).status, 403);
  assert.equal((await request('/radio/start', dj, {})).status, 201);
  assert.equal((await request('/radio/start', admin, {})).status, 409);
  assert.equal((await request('/radio/settings', dj, { price: 10 }, 'PATCH')).status, 403);
  assert.equal((await request('/radio/settings', dj, { accepting: true }, 'PATCH')).status, 200);
  assert.equal(await prisma.moderationAudit.count({ where: { action: 'DJ_CHANGE' } }), 1);
});
test('atomic reserve, duplicate submissions, private queue and one refund', async () => {
  const input = order(); const start = await balance();
  const results = await Promise.all([request('/radio/requests', listener, input), request('/radio/requests', listener, input)]);
  assert(results.every(row => row.status === 201)); assert.equal(results[0].body.id, results[1].body.id); assert.equal(await balance(), start - 5);
  const id = results[0].body.id;
  const queue = (await request('/radio/requests/queue', stranger)).body;
  assert(!('note' in queue[0]) && !('upload' in queue[0]) && !('userId' in queue[0]));
  assert.equal((await request('/radio/requests/' + id, stranger, { action: 'cancel' }, 'PATCH')).status, 403);
  const refunds = await Promise.all([request('/radio/requests/' + id, listener, { action: 'cancel' }, 'PATCH'), request('/radio/requests/' + id, listener, { action: 'cancel' }, 'PATCH')]);
  assert(refunds.every(row => row.status === 200)); assert.equal(await balance(), start);
  assert.equal(await prisma.economyEntry.count({ where: { referenceKey: 'radio:' + id + ':reserve' } }), 1);
  assert.equal(await prisma.economyEntry.count({ where: { referenceKey: 'radio:' + id + ':refund' } }), 1);
});
test('price confirmation, quota and insufficient funds do not create negative balances', async () => {
  assert.equal((await request('/radio/requests', listener, order({ expectedPrice: 4 }))).status, 409);
  await prisma.user.update({ where: { id: listener.id }, data: { credits: 5 } });
  const results = await Promise.all([request('/radio/requests', listener, order()), request('/radio/requests', listener, order())]);
  assert.equal(results.filter(row => row.status === 201).length, 1); assert.equal(await balance(), 0);
  const id = results.find(row => row.status === 201).body.id;
  await request('/radio/requests/' + id, dj, { action: 'reject', reason: 'Нет трека' }, 'PATCH'); assert.equal(await balance(), 5);
  const limited = await Promise.all(Array.from({ length: 3 }, () => request('/radio/requests', stranger, order())));
  assert(limited.every(row => row.status === 201));
  assert.equal((await request('/radio/requests', stranger, order())).status, 400);
  await Promise.all(limited.map(row => request('/radio/requests/' + row.body.id, stranger, { action: 'cancel' }, 'PATCH')));
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: stranger.id } })).credits, 50);
});
test('protected uploads, consumption, preview access and verified completion', async () => {
  await prisma.user.update({ where: { id: listener.id }, data: { credits: 50 } });
  const form = new FormData(); form.append('audio', new Blob([Buffer.from('fixture: audio verifier is mocked')], { type: 'audio/mpeg' }), 'track.mp3');
  const upload = (await request('/radio/uploads', listener, form)).body;
  const record = await prisma.radioUpload.findUniqueOrThrow({ where: { id: upload.id } }); files.push('storage/radio-test/' + record.storageKey);
  assert.equal((await fetch(base + '/radio/uploads/' + upload.id, { headers: { Cookie: stranger.cookie } })).status, 403);
  const row = (await request('/radio/requests', listener, order({ uploadId: upload.id }))).body;
  assert.equal((await fetch(base + '/radio/uploads/' + upload.id, { headers: { Cookie: dj.cookie } })).status, 200);
  assert.equal((await request('/radio/requests', listener, order({ uploadId: upload.id }))).status, 400);
  assert.equal((await request('/radio/requests/' + row.id, dj, { action: 'accept' }, 'PATCH')).status, 200);
  await waitFor(async () => (await prisma.radioRequest.findUnique({ where: { id: row.id } })).status === 'PLAYING');
  assert.equal((await request('/radio/requests/' + row.id, listener, { action: 'cancel' }, 'PATCH')).status, 409);
  audio.completedId = row.id; audio.trackId = null; audio.result = 'completed';
  await waitFor(async () => (await prisma.radioRequest.findUnique({ where: { id: row.id } })).status === 'COMPLETED');
  assert.equal(await balance(), 45); assert.equal(await prisma.economyEntry.count({ where: { referenceKey: 'radio:' + row.id + ':charge' } }), 1);
});
test('expiry refunds once and removes private audio', async () => {
  const row = (await request('/radio/requests', listener, order())).body; const paid = await balance();
  await prisma.radioRequest.update({ where: { id: row.id }, data: { expiresAt: new Date(0) } });
  await waitFor(async () => (await prisma.radioRequest.findUnique({ where: { id: row.id } })).status === 'EXPIRED'); assert.equal(await balance(), paid + 5);
  const upload = await prisma.radioUpload.findFirst(); await prisma.radioUpload.update({ where: { id: upload.id }, data: { expiresAt: new Date(0) } });
  await waitFor(async () => (await prisma.radioUpload.findUnique({ where: { id: upload.id } })).storageKey === null);
  assert.equal((await fetch(base + '/radio/uploads/' + upload.id, { headers: { Cookie: listener.cookie } })).status, 404);
});
test('revoking DJ ends source, refunds pending orders and preserves role', async () => {
  const row = (await request('/radio/requests', listener, order())).body; const paid = await balance();
  assert.equal((await request('/radio/dj/' + dj.id, admin, { enabled: false }, 'PATCH')).status, 200);
  assert.equal(audio.active, false); assert.equal(await balance(), paid + 5); assert.equal((await prisma.radioRequest.findUnique({ where: { id: row.id } })).status, 'CANCELLED');
  assert.equal((await request('/radio/start', dj, {})).status, 403); assert.equal((await prisma.user.findUnique({ where: { id: dj.id } })).role, 'USER');
});
test('worker failure closes acceptance and returns reservations', async () => {
  await request('/radio/start', admin, {}); await request('/radio/settings', admin, { accepting: true }, 'PATCH');
  const row = (await request('/radio/requests', listener, order())).body; const paid = await balance();
  failAudio = true;
  await waitFor(async () => (await prisma.radioRequest.findUnique({ where: { id: row.id } })).status === 'CANCELLED');
  assert.equal(await balance(), paid + 5); failAudio = false;
  assert.equal((await request('/radio/status', listener)).body.accepting, false);
});
