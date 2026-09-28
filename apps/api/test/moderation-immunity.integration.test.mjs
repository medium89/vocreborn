import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import fs from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';

for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
}
const connection = new URL(process.env.DATABASE_URL);
assert(['localhost', '127.0.0.1', '[::1]', process.env.IMMUNITY_TEST_LOCAL_DB_HOST].includes(connection.hostname), 'Moderation tests require local PostgreSQL');
const databaseName = 'tusova_immunity_test_' + Date.now();
const database = new PrismaClient();
const isolated = new URL(connection); isolated.pathname = '/' + databaseName;
const prisma = new PrismaClient({ datasources: { db: { url: isolated.toString() } } });
const base = 'http://127.0.0.1:3147';
let api, created = false, alice, bob;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(path, cookie, body, method) {
  const response = await fetch(base + path, { method: method || (body === undefined ? 'GET' : 'POST'), headers: { Cookie: cookie || '', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function account(username, role = 'ADMIN') {
  await prisma.user.create({ data: { username, role, displayName: username, passwordHash: await hash('Integration123!') } });
  const result = await request('/api/auth/login', null, { username, password: 'Integration123!' });
  assert.equal(result.status, 200);
  return { id: result.body.user.id, cookie: result.cookie };
}
before(async () => {
  await database.$executeRawUnsafe('CREATE DATABASE "' + databaseName + '"'); created = true;
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: isolated.toString() }, stdio: 'ignore' });
  await prisma.room.create({ data: { id: 'main', name: 'Main', position: 0 } });
  api = spawn(process.execPath, ['dist/main.js'], { env: { ...process.env, DATABASE_URL: isolated.toString(), API_PORT: '3147', NODE_ENV: 'test', TUSOVA_BOTS_ENABLED: 'false', TUSOVA_QUIZ_ENABLED: 'false', TUSOVA_RADIO_ENABLED: 'false' }, stdio: ['ignore', 'ignore', 'ignore'] });
  for (let n = 0; n < 80; n++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch {} await wait(100); if (n === 79) assert.fail('API did not start'); }
  alice = await account('immunity_alice'); bob = await account('immunity_bob');
});
after(async () => {
  if (api) { api.kill('SIGTERM'); await new Promise(resolve => { if (api.exitCode !== null) return resolve(); api.once('exit', resolve); setTimeout(() => { api.kill('SIGKILL'); resolve(); }, 2000).unref(); }); }
  await prisma.$disconnect();
  if (created) await database.$executeRawUnsafe('DROP DATABASE "' + databaseName + '" WITH (FORCE)');
  await database.$disconnect();
});
test('Administrators cannot mute, Chaos, temporarily or permanently ban one another', async () => {
  const moderator = await account('immunity_moderator', 'MODERATOR');
  const before = await prisma.moderationAudit.count();
  for (const [actor,target] of [[alice,bob],[bob,alice],[moderator,alice]]) {
    for (const [path,extra] of [['mutes',{durationMinutes:60}],['chaos',{durationMinutes:60}],['bans',{durationMinutes:60}],['bans',{}]]) {
      const result=await request('/api/moderation/'+path,actor.cookie,{userId:target.id,...extra});
      assert.equal(result.status,403,path);
    }
  }
  assert.equal(await prisma.mute.count(),0);assert.equal(await prisma.chaos.count(),0);assert.equal(await prisma.ban.count(),0);
  assert.equal(await prisma.moderationAudit.count(),before);
  assert.equal((await request('/api/me',bob.cookie)).status,200);
  assert.equal((await request('/api/me',alice.cookie)).status,200);
  const off=await request('/api/admin/users/'+bob.id,alice.cookie,undefined,'DELETE');assert.equal(off.status,403);
  assert.equal((await prisma.user.findUniqueOrThrow({where:{id:bob.id}})).deletedAt,null);
});
test('Report measures reject admin targets including message authors, with no closed report or sanction', async () => {
  const reporter=await account('immunity_reporter','USER');
  const message=await request('/api/rooms/main/messages',bob.cookie,{body:'Reported admin message',requestId:randomUUID()});assert.equal(message.status,201);
  for(const goal of [{userId:bob.id},{messageId:message.body.message.id}]) {
    const report=await request('/api/reports',reporter.cookie,{...goal,reason:'SPAM'});assert.equal(report.status,201);
    const list=await request('/api/moderation/reports',alice.cookie);assert.equal(list.body.find(r=>r.id===report.body.id).canRestrictTarget,false);
    for(const action of ['MUTE_HOUR','MUTE_DAY','CHAOS_DAY','BAN_DAY']) {
      const result=await request('/api/moderation/reports/'+report.body.id+'/actions',alice.cookie,{action});assert.equal(result.status,403,action);
      assert.equal((await prisma.report.findUniqueOrThrow({where:{id:report.body.id}})).status,'OPEN');
      assert.equal(await prisma.moderationAudit.count({where:{reportId:report.body.id}}),0);
    }
  }
});
test('Current database role protects an account promoted after its session was issued',async()=>{
  const target=await account('immunity_promoted','USER');
  await prisma.user.update({where:{id:target.id},data:{role:'ADMIN'}});
  for(const path of ['mutes','chaos','bans'])assert.equal((await request('/api/moderation/'+path,alice.cookie,{userId:target.id,durationMinutes:60})).status,403,path);
});
test('Normal participant restrictions still work and report permission remains available',async()=>{
  const target=await account('immunity_participant','USER'),reporter=await account('immunity_reporter_two','USER');
  const report=await request('/api/reports',reporter.cookie,{userId:target.id,reason:'SPAM'});assert.equal(report.status,201);
  const list=await request('/api/moderation/reports',alice.cookie);assert.equal(list.body.find(r=>r.id===report.body.id).canRestrictTarget,true);
  for(const path of ['mutes','chaos','bans']) {
    assert.equal((await request('/api/moderation/'+path,alice.cookie,{userId:target.id,durationMinutes:60})).status,201,path);
    assert.equal((await request('/api/moderation/'+path+'/'+target.id,alice.cookie,undefined,'DELETE')).status,200,path);
  }
});
test('Administrators can remove legacy restrictions from another administrator',async()=>{
  await prisma.mute.create({data:{userId:bob.id,moderatorId:alice.id,expiresAt:new Date(Date.now()+60000)}});
  await prisma.chaos.create({data:{userId:bob.id,moderatorId:alice.id,expiresAt:new Date(Date.now()+60000)}});
  await prisma.ban.create({data:{userId:bob.id,moderatorId:alice.id}});
  for(const path of ['mutes','chaos','bans'])assert.equal((await request('/api/moderation/'+path+'/'+bob.id,alice.cookie,undefined,'DELETE')).status,200,path);
  assert.equal((await request('/api/me',bob.cookie)).status,200);
});
