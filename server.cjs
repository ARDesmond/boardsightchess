'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { Rooms } = require('./rooms.cjs');
const root = __dirname;
const dataDir = process.env.ROOM_DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(root, '.room-data');
fs.mkdirSync(dataDir, { recursive: true });
const dataFile = path.join(dataDir, 'rooms.json');
let snapshot;
if (fs.existsSync(dataFile)) {
  snapshot = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  if (snapshot.schema !== 1) throw new Error('Unsupported room storage version');
}
const streams = new Map();
let rooms;
rooms = new Rooms({ snapshot, save: value => {
  fs.writeFileSync(dataFile + '.tmp', JSON.stringify(value), { mode: 0o600 });
  fs.renameSync(dataFile + '.tmp', dataFile);
}, emit: id => {
  if (!rooms) return;
  for (const response of streams.get(id) || []) {
    if (response.writableLength > 1048576) { response.end(); continue; }
    if (!response.destroyed) response.write('data: ' + JSON.stringify(rooms.view(id)) + '\n\n');
  }
} });
rooms.persist();
const workerCsp = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; object-src 'none';";
const pageCsp = "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline' https:; font-src 'self' data: https:; connect-src 'self' https:; media-src 'self' https:; object-src 'none'; frame-src 'self' https:;";
const allowed = new Set(['index.html', 'app.js', 'online.js', 'online.css', 'chess.js', 'engine.js', 'openings.js', 'styles.css', 'favicon.svg', 'site.webmanifest', 'robots.txt']);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.zip': 'application/zip' };
const buckets = new Map();
function rate(key, limit, period = 60000) {
  const now = Date.now(); let entry = buckets.get(key);
  if (!entry || now - entry.start > period) { entry = { start: now, count: 0 }; buckets.set(key, entry); }
  if (++entry.count > limit) { const error = new Error('Too many requests. Please wait a moment.'); error.status = 429; throw error; }
}
function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value));
}
async function body(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) { const error = new Error('Use JSON requests.'); error.status = 415; throw error; }
  let text = ''; for await (const chunk of request) { text += chunk; if (Buffer.byteLength(text) > 4096) { const error = new Error('Request too large.'); error.status = 413; throw error; } }
  try { const value = JSON.parse(text); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
  catch { const error = new Error('Invalid request.'); error.status = 400; throw error; }
}
function sameOrigin(request) {
  let host;
  try { host = new URL(request.headers.origin).host; } catch {}
  const expected = request.headers['x-forwarded-host'] || request.headers.host;
  if (!host || host !== expected || (request.headers['sec-fetch-site'] && request.headers['sec-fetch-site'] !== 'same-origin')) {
    const error = new Error('Use this website to play online.'); error.status = 403; throw error;
  }
}
const server = http.createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('X-Frame-Options', 'SAMEORIGIN');
  response.setHeader('Content-Security-Policy', pageCsp);
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/health' || pathname === '/api/health') { json(response, 200, { ok: true }); return; }
    if (pathname.startsWith('/api/')) {
      const ip = request.headers['x-real-ip'] || request.socket.remoteAddress;
      const stateRead = pathname === '/api/state' && request.method === 'GET';
      rate((stateRead ? 'state-ip:' : 'ip:') + ip, stateRead ? 900 : 240);
      if (request.method === 'POST') sameOrigin(request);
      if (pathname === '/api/session' && request.method === 'POST') {
        await body(request); rate('session:' + ip, 20); json(response, 201, { token: rooms.createSession() }); return;
      }
      const { id } = rooms.session(request.headers.authorization?.replace(/^Bearer /, ''));
      if (stateRead) { rate('state-player:' + id, 240); json(response, 200, rooms.view(id)); return; }
      if (pathname === '/api/events' && request.method === 'GET') {
        let clients = streams.get(id); if (!clients) streams.set(id, clients = new Set());
        if (clients.size >= 3) { json(response, 429, { error: 'This guest is already connected in another window.' }); return; }
        response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
        response.flushHeaders(); clients.add(response); rooms.connect(id);
        response.write('data: ' + JSON.stringify(rooms.view(id)) + '\n\n');
        const heartbeat = setInterval(() => response.write(': keepalive\n\n'), 15000);
        response.on('close', () => { clearInterval(heartbeat); clients.delete(response); if (!clients.size) streams.delete(id); rooms.disconnect(id); }); return;
      }
      if (request.method !== 'POST') { json(response, 404, { error: 'Endpoint not found.' }); return; }
      rate('player:' + id, 90); const input = await body(request);
      const handlers = { '/api/create': 'newRoom', '/api/join': 'join', '/api/quickplay': 'quickplay', '/api/cancel': 'cancel', '/api/move': 'move', '/api/action': 'action', '/api/leave': 'leave' };
      const handler = handlers[pathname]; if (!handler) { json(response, 404, { error: 'Endpoint not found.' }); return; }
      json(response, 200, rooms[handler](id, input)); return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
    const relative = decodeURIComponent(pathname).replace(/^\//, '') || 'index.html';
    const asset = /^(assets\/pieces\/[wb][PRNBQK]\.svg|vendor\/stockfish\/[A-Za-z0-9_.-]+)$/.test(relative);
    if (!allowed.has(relative) && !asset) { response.writeHead(404); response.end('Not found'); return; }
    const filename = path.join(root, relative), stat = await fs.promises.stat(filename);
    if (!stat.isFile()) { response.writeHead(404); response.end('Not found'); return; }
    if (relative === 'vendor/stockfish/stockfish.js') response.setHeader('Content-Security-Policy', workerCsp);
    response.setHeader('Content-Type', mime[path.extname(relative)] || 'application/octet-stream');
    response.setHeader('Cache-Control', relative === 'index.html' ? 'no-cache' : 'public, max-age=3600');
    response.setHeader('Vary', 'Accept-Encoding');
    if (request.method === 'HEAD') { response.end(); return; }
    const stream = fs.createReadStream(filename);
    stream.on('error', () => response.destroy());
    if (request.headers['accept-encoding']?.includes('gzip') && /\.(js|css|html|wasm|svg)$/.test(relative)) {
      response.setHeader('Content-Encoding', 'gzip'); const gzip = zlib.createGzip(); gzip.on('error', () => response.destroy()); stream.pipe(gzip).pipe(response);
    } else stream.pipe(response);
  } catch (error) {
    if (response.headersSent) { response.destroy(); return; }
    if (error.code === 'ENOENT') { response.writeHead(404); response.end('Not found'); return; }
    if (!error.status) console.error('Request failed:', error.message);
    json(response, error.status || 503, { error: error.status ? error.message : 'Online play is temporarily unavailable. Reconnect shortly.' });
  }
});
server.requestTimeout = 15000;
setInterval(() => { rooms.sweep(); rooms.persist(); const now = Date.now(); for (const [key, value] of buckets) if (now - value.start > 120000) buckets.delete(key); }, 60000).unref();
server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => console.log('BoardSight online server ready'));
process.on('SIGTERM', () => { rooms.persist(); for (const clients of streams.values()) for (const response of clients) response.end(); server.close(() => process.exit(0)); });
