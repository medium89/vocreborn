import http from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';

const run = promisify(execFile);
const storage = resolve(process.env.RADIO_STORAGE_DIR || '/radio-files');
const token = process.env.RADIO_WORKER_TOKEN;
const sourcePassword = process.env.ICECAST_SOURCE_PASSWORD;
const djPassword = process.env.ICECAST_DJ_PASSWORD;
if (!token || token.length < 32 || !sourcePassword || sourcePassword.length < 24 || !djPassword || djPassword.length < 24) throw new Error('Configure strong radio service secrets');
const icecastHost = process.env.ICECAST_HOST || 'icecast';
if (!/^[a-zA-Z0-9.-]+$/.test(icecastHost)) throw new Error('Invalid Icecast host');
const icecastPort = Number(process.env.ICECAST_PORT || 8000);
const destination = `icecast://source:${encodeURIComponent(sourcePassword)}@${icecastHost}:${icecastPort}/live.mp3`;
let encoder = null, decoder = null, heartbeat = 0, epoch = null, mode = null, externalConnected = false, trackId = null, completedId = null, result = null, blocked = false;
let encoderReady = false;
let serial = Promise.resolve();
const status = () => ({ active: Boolean(epoch && (mode === 'butt' || encoder && encoderReady)), streaming: mode === 'butt' ? externalConnected : Boolean(encoder && encoderReady), mode, epoch, trackId, completedId, result });
async function refreshExternal() {
  if (mode !== 'butt' || !epoch) return;
  try {
    const response = await fetch('http://' + icecastHost + ':' + icecastPort + '/status-json.xsl', { signal: AbortSignal.timeout(1500) });
    if (!response.ok) throw new Error('Icecast unavailable');
    const data = await response.json();
    const sources = [].concat(data.icestats?.source || []);
    externalConnected = sources.some(source => {
      try { return new URL(source.listenurl).pathname === '/dj.mp3'; } catch { return false; }
    });
  } catch { externalConnected = false; }
}
async function disconnectExternal() {
  try {
    await fetch('http://' + icecastHost + ':' + icecastPort + '/admin/killsource?mount=%2Fdj.mp3', {
      headers: { Authorization: 'Basic ' + Buffer.from('source:' + djPassword).toString('base64') },
      signal: AbortSignal.timeout(1500),
    });
  } catch {}
}
const kill = process => { if (!process) return; process.kill('SIGTERM'); const timer = setTimeout(() => process.kill('SIGKILL'), 1500); timer.unref(); };
async function stop() {
  const wasExternal = mode === 'butt';
  const oldDecoder = decoder, oldEncoder = encoder;
  decoder = null; encoder = null; trackId = null; epoch = null; mode = null; externalConnected = false; encoderReady = false; blocked = false;
  kill(oldDecoder); kill(oldEncoder);
  if (wasExternal) await disconnectExternal();
}
async function file(key) {
  if (typeof key !== 'string' || !/^[a-f0-9-]{36}\.audio$/.test(key)) throw new Error('Invalid audio file');
  const filename = join(storage, key);
  const info = await stat(filename);
  if (!info.isFile() || info.size > 25 * 1024 * 1024 || !info.size) throw new Error('Invalid audio file');
  return filename;
}
async function probe(key) {
  const filename = await file(key);
  const { stdout } = await run('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_format', '-show_streams', '-of', 'json', filename], { timeout: 5000, maxBuffer: 512 * 1024 });
  const data = JSON.parse(stdout);
  const duration = Number(data.format?.duration);
  const supported = { mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg', matroska: 'audio/webm', webm: 'audio/webm', mov: 'audio/mp4', mp4: 'audio/mp4', m4a: 'audio/mp4' };
  const format = String(data.format?.format_name || '').split(',').find(name => supported[name]);
  if (!format || !Number.isFinite(duration) || duration <= 0 || duration > 900 || !data.streams?.some(s => s.codec_type === 'audio') || data.streams.some(s => s.codec_type !== 'audio' && !s.disposition?.attached_pic)) throw new Error('Use an audio file up to 15 minutes');
  return { duration, mimeType: supported[format] };
}
async function start(nextEpoch, nextMode) {
  if (epoch) {
    if (epoch !== nextEpoch || mode !== nextMode) throw new Error('Broadcast already active');
    heartbeat = Date.now(); return status();
  }
  epoch = nextEpoch; mode = nextMode; heartbeat = Date.now(); completedId = null; result = null; encoderReady = false;
  if (mode === 'butt') { await refreshExternal(); return status(); }
  const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-probesize', '32', '-analyzeduration', '0', '-f', 's16le', '-ar', '44100', '-ac', '2', '-i', 'pipe:0', '-vn', '-c:a', 'libmp3lame', '-b:a', '128k', '-content_type', 'audio/mpeg', '-ice_name', 'TUSOVA', '-flush_packets', '1', '-f', 'mp3', destination], { stdio: ['pipe', 'ignore', 'ignore'] });
  encoder = child;
  child.stdin.on('error', () => { if (encoder === child) stop(); });
  child.stdin.on('drain', () => { if (encoder === child) blocked = false; });
  child.on('error', () => { if (encoder === child) stop(); });
  child.on('close', () => { if (encoder === child) stop(); });
  for (let i = 0; i < 40 && encoder === child; i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    try {
      const response = await fetch(`http://${icecastHost}:${icecastPort}/status-json.xsl`, { signal: AbortSignal.timeout(1000) });
      const data = await response.json();
      const sources = [].concat(data.icestats?.source || []);
      if (sources.some(s => new URL(s.listenurl).pathname === '/live.mp3')) { encoderReady = true; return status(); }
    } catch {}
  }
  await stop(); throw new Error('Could not connect encoder to Icecast');
}
async function play(data) {
  if (mode !== 'playlist' || !encoderReady || !encoder || data.epoch !== epoch) throw new Error('Broadcast unavailable');
  if (decoder) { if (trackId === data.trackId) return status(); throw new Error('Another track is playing'); }
  await probe(data.key);
  const filename = await file(data.key);
  const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-re', '-protocol_whitelist', 'file,pipe', '-i', filename, '-map', '0:a:0', '-vn', '-f', 's16le', '-ac', '2', '-ar', '44100', 'pipe:1'], { stdio: ['ignore', 'pipe', 'ignore'] });
  const sink = encoder;
  trackId = data.trackId; completedId = null; result = null; decoder = child;
  child.stdout.pipe(sink.stdin, { end: false });
  const complete = code => {
    if (decoder !== child) return;
    child.stdout.unpipe(sink.stdin); decoder = null; completedId = trackId; trackId = null; result = code === 0 ? 'completed' : 'failed';
  };
  child.on('close', complete); child.on('error', () => complete(-1));
  return status();
}
function skip() {
  const child = decoder;
  if (child) { child.stdout.unpipe(encoder?.stdin); decoder = null; completedId = trackId; trackId = null; result = 'skipped'; kill(child); }
  return status();
}
const silence = Buffer.alloc(3528);
const silenceTimer = setInterval(() => {
  if (epoch && Date.now() - heartbeat > 30_000) { void stop(); return; }
  if (encoder && !decoder && !blocked && !encoder.stdin.destroyed) blocked = !encoder.stdin.write(silence);
}, 20);
function authorized(request) {
  const supplied = Buffer.from(request.headers.authorization || '');
  const expected = Buffer.from('Bearer ' + token);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
const server = http.createServer(async (request, response) => {
  const reply = (code, body) => { response.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(body)); };
  if (request.url === '/health' && request.method === 'GET') return reply(200, { ok: true });
  if (!authorized(request)) return reply(401, { error: 'Unauthorized' });
  if (request.url === '/status' && request.method === 'GET') { await refreshExternal(); return reply(200, status()); }
  if (request.method !== 'POST') return reply(404, { error: 'Not found' });
  try {
    let raw = ''; for await (const chunk of request) { raw += chunk; if (raw.length > 4096) throw new Error('Request too large'); }
    const data = JSON.parse(raw || '{}');
    if (request.url === '/probe') return reply(200, await probe(data.key));
    if (typeof data.epoch !== 'string' || !/^[a-f0-9-]{36}$/.test(data.epoch)) throw new Error('Invalid broadcast');
    // Commands are serialized; an old epoch can never stop/skip a new one.
    const action = async () => {
      if (request.url === '/start') { if (!['playlist', 'butt'].includes(data.mode ?? 'playlist')) throw new Error('Invalid broadcast mode'); return start(data.epoch, data.mode ?? 'playlist'); }
      if (data.epoch !== epoch) return status();
      if (request.url === '/heartbeat') { heartbeat = Date.now(); await refreshExternal(); return status(); }
      if (request.url === '/stop') { await stop(); return status(); }
      if (request.url === '/skip') { if (mode !== 'playlist') throw new Error('No playlist in BUTT mode'); return skip(); }
      if (request.url === '/play') return play(data);
      throw new Error('Unknown command');
    };
    const pending = serial.then(action); serial = pending.catch(() => undefined);
    return reply(200, await pending);
  } catch { return reply(400, { error: 'Audio operation failed; use MP3, WAV, FLAC, Ogg, M4A or WebM up to 25 MB / 15 minutes' }); }
});
server.requestTimeout = 10_000;
server.listen(Number(process.env.PORT || 8090), '0.0.0.0');
const shutdown = () => { clearInterval(silenceTimer); void stop(); server.close(() => process.exit(0)); };
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
