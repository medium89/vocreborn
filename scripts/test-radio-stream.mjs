import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdtemp, chmod, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tag = 'tusova-radio-test-' + Date.now();
const ice = tag + '-ice', worker = tag + '-worker';
const directory = await mkdtemp(join(tmpdir(), tag + '-'));
const key = randomUUID() + '.audio';
const token = randomBytes(32).toString('hex'), password = randomBytes(32).toString('hex'), adminPassword = randomBytes(32).toString('hex'), djPassword = randomBytes(32).toString('hex');
const epoch = randomUUID(), trackId = randomUUID();
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(condition) { for (let n = 0; n < 50; n++) { if (await condition()) return; await delay(200); } throw new Error('Audio service did not synchronize'); }
function call(path, body) {
  const script = `const r=await fetch('http://127.0.0.1:8090${path}',{method:${JSON.stringify(body === undefined ? 'GET' : 'POST')},headers:{Authorization:${JSON.stringify('Bearer '+token)},'Content-Type':'application/json'},body:${body === undefined ? 'undefined' : JSON.stringify(JSON.stringify(body))}});console.log(JSON.stringify({status:r.status,body:await r.json()}))`;
  return JSON.parse(docker('exec', worker, 'node', '--input-type=module', '-e', script));
}
try {
  await chmod(directory, 0o755);
  const samples = 44100 * 3, data = Buffer.alloc(44 + samples * 2);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8); data.writeUInt32LE(16,16); data.writeUInt16LE(1,20); data.writeUInt16LE(1,22); data.writeUInt32LE(44100,24); data.writeUInt32LE(88200,28); data.writeUInt16LE(2,32); data.writeUInt16LE(16,34); data.write('data',36); data.writeUInt32LE(samples*2,40);
  for(let i=0;i<samples;i++)data.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*440/44100)*12000),44+i*2);
  await writeFile(join(directory,key), data, { mode: 0o644 });
  docker('network','create',tag);
  docker('run','-d','--name',ice,'--network',tag,'--network-alias','icecast','-e','ICECAST_SOURCE_PASSWORD='+password,'-e','ICECAST_ADMIN_PASSWORD='+adminPassword,'-e','ICECAST_DJ_PASSWORD='+djPassword,'tusova-icecast:dev');
  docker('run','-d','--name',worker,'--network',tag,'--mount','type=bind,src='+directory+',dst=/radio-files,readonly','-e','RADIO_WORKER_TOKEN='+token,'-e','ICECAST_SOURCE_PASSWORD='+password,'-e','ICECAST_DJ_PASSWORD='+djPassword,'tusova-radio-worker:dev');
  await wait(async()=>{try{return call('/status').status===200}catch{return false}});
  assert.equal(call('/probe',{key}).status,200);
  assert.equal(call('/probe',{key:'../../etc/passwd'}).status,400);
  assert.equal(call('/start',{epoch}).body.active,true);
  assert.equal(call('/play',{epoch,key,trackId}).body.trackId,trackId);
  const stream = JSON.parse(docker('exec',worker,'node','--input-type=module','-e',"const r=await fetch('http://icecast:8000/live.mp3');const reader=r.body.getReader();let bytes=0;while(bytes<18000){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.length}await reader.cancel();console.log(JSON.stringify({status:r.status,type:r.headers.get('content-type'),bytes}))"));
  assert.equal(stream.status,200); assert.match(stream.type,/audio\/mpeg/); assert(stream.bytes>=18000);
  await wait(()=>call('/status').body.completedId===trackId);
  assert.equal(call('/status').body.result,'completed');
  assert.equal(call('/stop',{epoch:randomUUID()}).body.active,true);
  assert.equal(call('/play',{epoch,key,trackId:randomUUID()}).status,200);
  assert.equal(call('/skip',{epoch}).body.result,'skipped');
  assert.equal(call('/stop',{epoch}).body.active,false);
  console.log('PASS: actual Icecast MP3 stream, verified WAV decoding/completion, skip, fencing and path protection');
} finally {
  for(const name of [worker,ice]){try{docker('rm','-f',name)}catch{}}
  try{docker('network','rm',tag)}catch{}
  if(!directory.startsWith(join(tmpdir(),tag+'-')))throw new Error('Unsafe test cleanup path');
  await rm(directory,{recursive:true,force:true});
}
