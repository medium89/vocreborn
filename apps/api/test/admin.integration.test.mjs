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
assert(['localhost', '127.0.0.1', '[::1]', process.env.ADMIN_TEST_LOCAL_DB_HOST].includes(connection.hostname), 'Admin tests require local PostgreSQL');
const databaseName = 'tusova_admin_test_' + Date.now();
const database = new PrismaClient();
const isolated = new URL(connection); isolated.pathname = '/' + databaseName;
const prisma = new PrismaClient({ datasources: { db: { url: isolated.toString() } } });
const base = 'http://127.0.0.1:3148';
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
  api = spawn(process.execPath, ['dist/main.js'], { env: { ...process.env, DATABASE_URL: isolated.toString(), API_PORT: '3148', NODE_ENV: 'test', TUSOVA_BOTS_ENABLED: 'false', TUSOVA_QUIZ_ENABLED: 'false', TUSOVA_RADIO_ENABLED: 'false' }, stdio: ['ignore', 'ignore', 'ignore'] });
  for (let n = 0; n < 80; n++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch {} await wait(100); if (n === 79) assert.fail('API did not start'); }
  alice = await account('admin_alice'); bob = await account('admin_bob');
});
after(async () => {
  if (api) { api.kill('SIGTERM'); await new Promise(resolve => { if (api.exitCode !== null) return resolve(); api.once('exit', resolve); setTimeout(() => { api.kill('SIGKILL'); resolve(); }, 2000).unref(); }); }
  await prisma.$disconnect();
  if (created) await database.$executeRawUnsafe('DROP DATABASE "' + databaseName + '" WITH (FORCE)');
  await database.$disconnect();
});

async function settings(patch, version) {
  const current = await request('/api/admin/settings', alice.cookie);
  return request('/api/admin/settings', alice.cookie, { settings: patch, version: version ?? current.body.version, reason: 'Integration test' }, 'PATCH');
}
test('Only administrators can access settings, economy, system and content', async () => {
  const user = await account('admin_regular', 'USER');
  const moderator = await account('admin_moderator', 'MODERATOR');
  for (const path of ['settings','economy','system','content','overview','users']) {
    assert.equal((await request('/api/admin/'+path,user.cookie)).status,403);
    assert.equal((await request('/api/admin/'+path,moderator.cookie)).status,403);
    assert.equal((await request('/api/admin/'+path)).status,401);
  }
  const system=await request('/api/admin/system',alice.cookie);
  assert.equal(system.status,200);assert.equal(system.body.modules.testBots,false);
  assert(!JSON.stringify(system.body).includes(process.env.DATABASE_URL));
});
test('Settings are validated, versioned, persisted and audited', async () => {
  const original=await request('/api/admin/settings',alice.cookie);
  assert.equal(original.body.settings.maxMessageLength,1000);
  assert.equal((await settings({maxMessageLength:20})).status,200);
  assert.equal((await settings({allowLinks:false},original.body.version)).status,409);
  for (const patch of [{maxMessageLength:1001},{slowModeSeconds:-1},{imageMaxMb:6},{allowLinks:'false'},{madeUp:true},{firstMessageReward:1.5}])
    assert.equal((await settings(patch)).status,400,JSON.stringify(patch));
  const stored=await prisma.chatSetting.findUnique({where:{id:'main'}});
  assert.equal(stored.settings.maxMessageLength,20);
  assert.equal(await prisma.moderationAudit.count({where:{action:'CHAT_SETTINGS'}}),1);
  await settings({maxMessageLength:1000});
});
test('Message limits and link policy work on room and direct HTTP sends', async () => {
  const user=await account('admin_policy','USER');
  await settings({maxMessageLength:20,allowLinks:false});
  const send=(path,body)=>request(path,user.cookie,{body,requestId:randomUUID()});
  assert.equal((await send('/api/rooms/main/messages','a'.repeat(21))).status,400);
  assert.equal((await send('/api/direct/'+alice.id+'/messages','a'.repeat(21))).status,400);
  assert.equal((await send('/api/rooms/main/messages','https://example.com')).status,403);
  assert.equal((await send('/api/direct/'+alice.id+'/messages','www.example.com')).status,403);
  assert.equal((await send('/api/rooms/main/messages','hello')).status,201);
  await settings({maxMessageLength:1000,allowLinks:true});
});
test('Slow mode serializes simultaneous sends and permits idempotent retries', async () => {
  const user=await account('admin_slow','USER');
  await settings({slowModeSeconds:30});
  const ids=[randomUUID(),randomUUID()];
  const sent=await Promise.all(ids.map(requestId=>request('/api/rooms/main/messages',user.cookie,{body:'hello',requestId})));
  assert.deepEqual(sent.map(x=>x.status).sort(),[201,403]);
  const winner=sent.findIndex(x=>x.status===201);
  const retry=await request('/api/rooms/main/messages',user.cookie,{body:'hello',requestId:ids[winner]});
  assert.equal(retry.status,201);assert.equal(retry.body.id,sent[winner].body.id);
  assert.equal((await request('/api/direct/'+alice.id+'/messages',user.cookie,{body:'hello',requestId:randomUUID()})).status,201);
  await settings({slowModeSeconds:0});
});
test('Maintenance and registration gates apply while administrators can still send', async () => {
  const user=await account('admin_maintenance','USER');
  await settings({maintenance:true});
  assert.equal((await request('/api/rooms/main/messages',user.cookie,{body:'hello',requestId:randomUUID()})).status,403);
  assert.equal((await request('/api/direct/'+alice.id+'/messages',user.cookie,{body:'hello',requestId:randomUUID()})).status,403);
  assert.equal((await request('/api/rooms/main/messages',alice.cookie,{body:'maintenance notice',requestId:randomUUID()})).status,201);
  assert.equal((await request('/api/auth/register',null,{username:'closed_register',email:'closed@example.com',displayName:'Closed',password:'Integration123!'})).status,403);
  await settings({maintenance:false,registrationOpen:false,allowUserRooms:false});
  assert.equal((await request('/api/auth/register',null,{username:'closed_register',email:'closed@example.com',displayName:'Closed',password:'Integration123!'})).status,403);
  assert.equal((await request('/api/rooms',user.cookie,{name:'Closed room'})).status,403);
  assert.equal((await request('/api/rooms',alice.cookie,{name:'Admin room'})).status,201);
  await settings({registrationOpen:true,allowUserRooms:true});
});
test('Credit operations are atomic, audited and idempotent', async () => {
  const user=await account('admin_wallet','USER');
  const input={mode:'add',amount:10,reason:'Manual reward',requestId:randomUUID()};
  const results=await Promise.all([1,2,3].map(()=>request('/api/admin/users/'+user.id+'/credits',alice.cookie,input)));
  assert(results.every(x=>x.status===201),JSON.stringify(results));
  assert.equal((await prisma.user.findUnique({where:{id:user.id}})).credits,30);
  assert.equal(await prisma.economyEntry.count({where:{referenceKey:'admin:'+input.requestId}}),1);
  assert.equal(await prisma.moderationAudit.count({where:{targetUserId:user.id,action:'CREDITS_ADJUST'}}),1);
  assert.equal((await request('/api/admin/users/'+user.id+'/credits',alice.cookie,{...input,amount:11})).status,409);
  assert.equal((await request('/api/admin/users/'+user.id+'/credits',alice.cookie,{mode:'remove',amount:31,reason:'Deduct',requestId:randomUUID()})).status,400);
  assert.equal((await request('/api/admin/users/'+user.id+'/credits',alice.cookie,{mode:'set',amount:5,reason:'',requestId:randomUUID()})).status,400);
  assert.equal((await request('/api/admin/users/'+user.id+'/credits',alice.cookie,{mode:'set',amount:5,reason:'Correct balance',requestId:randomUUID()})).status,201);
  const ledger=await request('/api/admin/economy?userId='+user.id,alice.cookie);
  assert.equal(ledger.body.items.length,2);
  assert.equal(ledger.body.items[0].balanceAfter,5);
});
test('VIP/cosmetics grant and revoke preserve existing user choices', async () => {
  const user=await account('admin_cosmetic','USER');
  const path='/api/admin/users/'+user.id+'/cosmetics';
  assert.equal((await request(path,alice.cookie,{effectKey:'vip',action:'grant',reason:'Community reward'})).status,201);
  await prisma.userCosmetic.update({where:{userId_effectKey:{userId:user.id,effectKey:'vip'}},data:{settings:{enabled:false}}});
  assert.equal((await request(path,alice.cookie,{effectKey:'vip',action:'grant',reason:'Duplicate reward'})).status,201);
  assert.deepEqual((await prisma.userCosmetic.findFirst({where:{userId:user.id}})).settings,{enabled:false});
  assert.equal((await request(path,alice.cookie,{effectKey:'invalid',action:'grant',reason:'Test'})).status,400);
  assert.equal((await request(path,alice.cookie,{effectKey:'vip',action:'revoke',reason:'Reward correction'})).status,201);
  assert.equal(await prisma.userCosmetic.count({where:{userId:user.id}}),0);
});
test('Session revocation invalidates user authentication but cannot target admins', async () => {
  const user=await account('admin_sessions','USER');
  assert.equal((await request('/api/admin/users/'+bob.id+'/sessions/revoke',alice.cookie,{})).status,403);
  assert.equal((await request('/api/admin/users/'+user.id+'/sessions/revoke',alice.cookie,{})).status,201);
  assert.equal((await request('/api/me',user.cookie)).status,401);
});
test('Public content search excludes direct messages and private rooms; announcements are idempotent', async () => {
  await prisma.room.create({data:{id:'private-admin-test',name:'Private',visibility:'PRIVATE'}});
  await prisma.message.createMany({data:[{authorId:alice.id,authorName:'Secret',body:'secret-test',recipientId:bob.id},{authorId:alice.id,authorName:'Secret',body:'secret-test',roomId:'private-admin-test'},{authorId:alice.id,authorName:'Public',body:'public-test',roomId:'main'}]});
  assert.equal((await request('/api/admin/content?q=secret-test',alice.cookie)).body.length,0);
  assert.equal((await request('/api/admin/content?q=public-test',alice.cookie)).body.length,1);
  const input={body:'Announcement test',requestId:randomUUID()};
  const first=await request('/api/admin/announcements',alice.cookie,input);
  const retry=await request('/api/admin/announcements',alice.cookie,input);
  assert.equal(first.status,201);assert.equal(retry.body.id,first.body.id);
  assert.equal(await prisma.message.count({where:{body:input.body}}),1);
});
test('Changed daily reward is granted once and recorded in the ledger', async () => {
  await settings({firstMessageReward:7});
  const user=await account('admin_daily','USER');
  for(let i=0;i<2;i++)assert.equal((await request('/api/rooms/main/messages',user.cookie,{body:'daily reward',requestId:randomUUID()})).status,201);
  assert.equal((await prisma.user.findUnique({where:{id:user.id}})).credits,27);
  assert.equal(await prisma.economyEntry.count({where:{userId:user.id,type:'DAILY_FIRST_MESSAGE'}}),1);
  await settings({firstMessageReward:5});
});
test('Attachment upload obeys the saved size limit before processing', async () => {
  await settings({imageMaxMb:1});
  const user=await account('admin_upload','USER');
  const form=new FormData();const bytes=Buffer.alloc(1100*1024);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
  form.append('file',new Blob([bytes],{type:'image/png'}),'large.png');
  const response=await fetch(base+'/api/attachments',{method:'POST',headers:{Cookie:user.cookie},body:form});
  assert.equal(response.status,400);assert.match((await response.json()).message,/1 МБ/);
  await settings({imageMaxMb:5});
});
test('Settings survive an API restart with the same database', async () => {
  const saved = await settings({slowModeSeconds:17});
  assert.equal(saved.status,200);
  api.kill('SIGTERM'); await new Promise(resolve => api.once('exit',resolve));
  api = spawn(process.execPath, ['dist/main.js'], { env: { ...process.env, DATABASE_URL: isolated.toString(), API_PORT: '3148', NODE_ENV: 'test', TUSOVA_BOTS_ENABLED: 'false', TUSOVA_QUIZ_ENABLED: 'false', TUSOVA_RADIO_ENABLED: 'false' }, stdio: ['ignore','ignore','ignore'] });
  for(let n=0;n<80;n++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await wait(100);if(n===79)assert.fail('API did not restart');}
  const restored=await request('/api/admin/settings',alice.cookie);
  assert.equal(restored.status,200);assert.equal(restored.body.settings.slowModeSeconds,17);assert.equal(restored.body.version,saved.body.version);
});
