import assert from 'node:assert/strict';
import test,{before,after} from 'node:test';
import fs from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {hash} from '@node-rs/argon2';
for(const line of (await fs.readFile('.env','utf8')).split(/\r?\n/)){const m=line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,'');}
const connection=new URL(process.env.DATABASE_URL);
assert(['localhost','127.0.0.1','[::1]',process.env.QUIZ_TEST_LOCAL_DB_HOST].includes(connection.hostname),'Quiz tests require an explicitly allowed local PostgreSQL host');
const name='tusova_quiz_test_'+Date.now(),database=new PrismaClient(),url=new URL(connection);url.pathname='/'+name;
const prisma=new PrismaClient({datasources:{db:{url:url.toString()}}}),base='http://127.0.0.1:3127/api';
let created=false,api,second,admin,alice,bob,guest,theme;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(condition,timeout=12000){const until=Date.now()+timeout;while(Date.now()<until){const value=await condition();if(value)return value;await sleep(100);}throw new Error('Quiz state did not synchronize');}
async function request(path,user,body,method){const response=await fetch(base+path,{method:method||(body===undefined?'GET':'POST'),headers:{'Content-Type':'application/json',...(user?{Cookie:user.cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});return{status:response.status,body:await response.json().catch(()=>null),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
async function account(username,role='USER',isGuest=false){const user=await prisma.user.create({data:{username,displayName:username,role,isGuest,passwordHash:await hash('QuizTest123!'),credits:50,status:'ONLINE'}});await prisma.roomMembership.create({data:{userId:user.id,roomId:'main'}});const r=await request('/auth/login',null,{username,password:'QuizTest123!'});assert.equal(r.status,200);return{...user,cookie:r.cookie};}
const document={version:1,id:'night-nature',theme:'Ночной мир',questions:[{id:'tree',question:'Какое дерево украшают зимой?',answer:'ёлочка',acceptedAnswers:['новогодняя ёлка']},{id:'moon',question:'Как называется естественный спутник Земли?',answer:'луна',acceptedAnswers:[]}]};
function launch(port=3127){return spawn(process.execPath,['dist/main.js'],{env:{...process.env,NODE_ENV:'test',DATABASE_URL:url.toString(),API_PORT:String(port),TUSOVA_BOTS_ENABLED:'false',TUSOVA_RADIO_ENABLED:'false',TUSOVA_QUIZ_ENABLED:'true'},stdio:'ignore'});}
async function stop(child){if(!child||child.exitCode!==null)return;child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),sleep(2000).then(()=>{if(child.exitCode===null)child.kill('SIGKILL')})]);}
async function settings(patch){const r=await request('/admin/quiz/settings',admin,{settings:patch},'PATCH');assert.equal(r.status,200,JSON.stringify(r.body));}
async function control(action,confirmed=false){const r=await request('/admin/quiz/control',admin,{action,confirmed});assert.equal(r.status,201,JSON.stringify(r.body));return r.body;}
async function round(){return prisma.quizRound.findFirst({where:{status:'ACTIVE'},orderBy:{startedAt:'desc'}});}
async function start(){await prisma.quizConfig.update({where:{id:'main'},data:{paused:false,enabled:true,nextAt:new Date(Date.now()+60000)}});await control('start');return round();}
async function send(user,body,room='main',requestId=randomUUID()){const r=await request('/rooms/'+room+'/messages',user,{body,requestId});assert.equal(r.status,201,JSON.stringify(r.body));return r.body.message;}
before(async()=>{
 assert(/^tusova_quiz_test_\d+$/.test(name));await database.$executeRawUnsafe('CREATE DATABASE "'+name+'"');created=true;
 execFileSync('node_modules/.bin/prisma',['migrate','deploy'],{env:{...process.env,DATABASE_URL:url.toString()},stdio:'ignore'});
 await prisma.room.createMany({data:[{id:'main',name:'Главная'},{id:'other',name:'Другая'}]});
 api=launch();await waitFor(async()=>{try{return(await fetch(base+'/health')).ok}catch{return false}});
 admin=await account('quiz_admin','ADMIN');alice=await account('quiz_alice');bob=await account('quiz_bob');guest=await account('quiz_guest','USER',true);
});
after(async()=>{await stop(api);await stop(second);await prisma.$disconnect();if(created)await database.$executeRawUnsafe('DROP DATABASE "'+name+'" WITH (FORCE)');await database.$disconnect();});
test('Admin-only JSON preview/import, explicit versions, no public answers',async()=>{
 assert.equal((await request('/admin/quiz',alice)).status,403);
 assert.equal((await request('/admin/quiz/preview',alice,{document})).status,403);
 const preview=await request('/admin/quiz/preview',admin,{document});assert.equal(preview.status,201);assert.equal(await prisma.quizTheme.count(),0);
 const imported=await request('/admin/quiz/import',admin,{document,mode:'create'});assert.equal(imported.status,201);theme=imported.body;assert.equal(theme.enabled,false);
 assert.equal((await request('/admin/quiz/import',admin,{document,mode:'create'})).status,409);
 assert.equal((await request('/admin/quiz/settings',alice,{settings:{enabled:true}},'PATCH')).status,403);
 assert.equal((await request('/admin/quiz/settings',admin,{settings:{hint1Seconds:70,hint2Seconds:60}},'PATCH')).status,400);
 await settings({enabled:true,minOnline:1,intervalSeconds:60,durationSeconds:10,hint1Seconds:2,hint2Seconds:4,reward:5,noRepeatHours:0});
 assert.equal((await request('/admin/quiz/themes/'+theme.id,admin,{enabled:true},'PATCH')).status,200);
});
test('Two progressive hints, immutable active snapshot and timeout',async()=>{
 const active=await waitFor(()=>round());assert.equal(active.answer,'ёлочка');
 const state=(await request('/quiz/status',alice)).body;assert(!('answer' in state.active));assert(!('acceptedAnswers' in state.active));
 const updated={...document,questions:[{...document.questions[0],answer:'берёза'},document.questions[1]]};
 assert.equal((await request('/admin/quiz/import',admin,{document:updated,mode:'update'})).status,201);
 assert.equal((await prisma.quizRound.findUnique({where:{id:active.id}})).answer,'ёлочка');
 await waitFor(async()=>await prisma.message.count({where:{quizRoundId:active.id,quizKind:{in:['HINT1','HINT2']}}})===2);
 const hints=await prisma.message.findMany({where:{quizRoundId:active.id,quizKind:{in:['HINT1','HINT2']}},orderBy:{createdAt:'asc'}});assert(hints[0].body.includes('▢'));assert(hints[1].body.includes('▢'));assert.notEqual(hints[0].body,hints[1].body);
 await prisma.quizRound.update({where:{id:active.id},data:{endsAt:new Date(Date.now()-1000)}});
 await waitFor(async()=>await prisma.message.count({where:{quizRoundId:active.id,quizKind:'TIMEOUT'}})===1);assert.equal(await prisma.economyEntry.count({where:{type:'QUIZ_REWARD'}}),0);
 await request('/admin/quiz/import',admin,{document,mode:'update'});
});
test('Wrong room, guests, substring answers, edited/old messages do not win',async()=>{
 const active=await start();await send(alice,active.answer,'other');await send(guest,active.answer);await send(bob,'Я думаю это '+active.answer);
 const old=await prisma.message.create({data:{authorId:alice.id,authorName:alice.displayName,roomId:'main',body:active.answer,createdAt:new Date(active.startedAt.getTime()-1000),quizAcceptedAt:new Date()}});
 await prisma.message.create({data:{authorId:alice.id,authorName:alice.displayName,roomId:'main',body:active.answer,editedAt:new Date(),quizAcceptedAt:new Date()}});
 await sleep(1300);assert.equal((await prisma.quizRound.findUnique({where:{id:active.id}})).status,'ACTIVE');await control('skip');assert.equal(await prisma.economyEntry.count({where:{type:'QUIZ_REWARD'}}),0);assert(old.id);
});
test('Mute and Chaos cannot bypass public-chat restrictions through the quiz',async()=>{
 const active=await start();
 const expiresAt=new Date(Date.now()+60000);
 await prisma.mute.create({data:{userId:alice.id,moderatorId:admin.id,expiresAt}});
 await prisma.chaos.create({data:{userId:bob.id,moderatorId:admin.id,expiresAt}});
 assert.equal((await request('/rooms/main/messages',alice,{body:active.answer,requestId:randomUUID()})).status,403);
 assert.equal((await request('/rooms/main/messages',bob,{body:active.answer,requestId:randomUUID()})).status,403);
 // Even a previously queued accepted answer cannot win after moderation blocks the author.
 await prisma.message.createMany({data:[alice,bob].map(user=>({authorId:user.id,authorName:user.displayName,roomId:'main',body:active.answer,quizAcceptedAt:new Date()}))});
 await sleep(1300);assert.equal((await prisma.quizRound.findUnique({where:{id:active.id}})).status,'ACTIVE');
 await prisma.mute.deleteMany({where:{userId:alice.id}});await prisma.chaos.deleteMany({where:{userId:bob.id}});await control('skip');
});
test('Concurrent correct answers / duplicate delivery award exactly once',async()=>{
 const active=await start(),input=active.answer==='ёлочка'?'@tusova_quiz: НОВОГОДНЯЯ   ЕЛКА!':active.answer.toUpperCase()+'!';
 const id=randomUUID();await Promise.all([send(alice,input,'main',id),send(alice,input,'main',id),send(bob,input)]);
 await waitFor(async()=>await prisma.quizRound.findFirst({where:{id:active.id,status:'WON'}}));
 assert.equal(await prisma.economyEntry.count({where:{referenceKey:'quiz:'+active.id}}),1);
 const award=await prisma.economyEntry.findFirst({where:{referenceKey:'quiz:'+active.id}});assert.equal(award.creditsDelta,5);
 assert.equal(await prisma.message.count({where:{quizRoundId:active.id,quizKind:'WON'}}),1);
 assert.equal(await prisma.message.count({where:{quizRoundId:active.id,quizKind:'QUESTION'}}),1);
});
test('Player quotas, exclusions and daily budget are enforced',async()=>{
 const won=await prisma.quizRound.findFirst({where:{status:'WON'}}),winner=won.winnerId===alice.id?alice:bob,other=won.winnerId===alice.id?bob:alice;
 await settings({playerDailyWins:1,excludedUserIds:[other.id]});const active=await start();await Promise.all([send(winner,active.answer),send(other,active.answer)]);await sleep(1300);assert.equal((await prisma.quizRound.findUnique({where:{id:active.id}})).status,'ACTIVE');await control('finish');
 await settings({dailyBudget:5,excludedUserIds:[]});assert.equal((await request('/admin/quiz/control',admin,{action:'start'})).status,400);await settings({dailyBudget:1000,playerDailyWins:10});
});
test('Pause, disabled theme, simultaneous starts and multi-process restart',async()=>{
 await control('pause');await settings({reward:5});assert.equal((await prisma.quizConfig.findUnique({where:{id:'main'}})).paused,true);
 await prisma.quizConfig.update({where:{id:'main'},data:{paused:false,nextAt:new Date(Date.now()+60000)}});
 const starts=await Promise.all([request('/admin/quiz/control',admin,{action:'start'}),request('/admin/quiz/control',admin,{action:'start'})]);assert.equal(starts.filter(r=>r.status===201).length,1);assert.equal(starts.filter(r=>r.status===409).length,1);
 const active=await round();await request('/admin/quiz/themes/'+theme.id,admin,{enabled:false},'PATCH');assert.equal((await prisma.quizRound.findUnique({where:{id:active.id}})).status,'ACTIVE');
 second=launch(3128);await waitFor(async()=>{try{return(await fetch('http://127.0.0.1:3128/api/health')).ok}catch{return false}});
 await send(alice,active.answer);await waitFor(async()=>await prisma.quizRound.findFirst({where:{id:active.id,status:'WON'}}));assert.equal(await prisma.economyEntry.count({where:{referenceKey:'quiz:'+active.id}}),1);await stop(second);
 await request('/admin/quiz/themes/'+theme.id,admin,{enabled:true},'PATCH');const next=await start();await stop(api);await prisma.quizRound.update({where:{id:next.id},data:{endsAt:new Date(Date.now()-1000)}});api=launch();await waitFor(async()=>await prisma.quizRound.findFirst({where:{id:next.id,status:'TIMEOUT'}}));assert.equal(await prisma.message.count({where:{quizRoundId:next.id,quizKind:{in:['HINT1','HINT2']}}}),0);assert.equal(await prisma.message.count({where:{quizRoundId:next.id,quizKind:'TIMEOUT'}}),1);
});
