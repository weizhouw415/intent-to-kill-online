import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { act, createGame, joinGame, roleForToken, viewFor } from './game.js';
import { advanceAI, rememberHumanAnswer } from './ai.js';

const root = dirname(fileURLToPath(import.meta.url));
const publicDir = join(root, 'public');
const dataFile = process.env.DATA_FILE || join(root, 'data', 'rooms.json');
const port = Number(process.env.PORT || 3187);
const host = process.env.HOST || '0.0.0.0';
const rooms = new Map();
const subscribers = new Map();
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

try {
  const saved = JSON.parse(await readFile(dataFile, 'utf8'));
  for (const game of saved) rooms.set(game.code, game);
} catch (error) {
  if (error.code !== 'ENOENT') console.warn('无法读取已有对局：', error.message);
}

let saveQueue = Promise.resolve();
function save() {
  const snapshot = JSON.stringify([...rooms.values()]);
  saveQueue = saveQueue.then(async () => {
    await mkdir(dirname(dataFile), { recursive: true });
    const temporary = `${dataFile}.tmp`;
    await writeFile(temporary, snapshot, { mode: 0o600 });
    const { rename } = await import('node:fs/promises');
    await rename(temporary, dataFile);
  }).catch(error => console.error('保存对局失败：', error));
}
function notify(code) {
  for (const stream of subscribers.get(code) || []) {
    try { stream.write(`event: update\ndata: ${Date.now()}\n\n`); } catch { /* closed connection */ }
  }
}
function json(res, status, value) { res.writeHead(status, JSON_HEADERS); res.end(JSON.stringify(value)); }
function error(res, status, message) { json(res, status, { error: message }); }
function token() { return randomBytes(24).toString('hex'); }
function code() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out;
  do { out = Array.from(randomBytes(6), byte => alphabet[byte % alphabet.length]).join(''); }
  while (rooms.has(out));
  return out;
}
async function body(req) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 8192) throw Object.assign(new Error('请求过大'), { status: 413 });
  }
  try { return JSON.parse(text || '{}'); } catch { throw Object.assign(new Error('请求格式错误'), { status: 400 }); }
}
function auth(req, url) {
  const value = req.headers.authorization?.replace(/^Bearer /, '') || url.searchParams.get('token');
  if (!value) return null;
  for (const room of rooms.values()) {
    const role = roleForToken(room, value);
    if (role) return { room, role, token: value };
  }
  return null;
}
function publicOrigin(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  const hostHeader = req.headers.host || `localhost:${port}`;
  const [hostname] = hostHeader.split(':');
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    const candidates = Object.values(networkInterfaces()).flat().filter(x => x?.family === 'IPv4' && !x.internal).map(x => x.address);
    const ip = candidates.find(x => x.startsWith('192.168.')) || candidates.find(x => /^172\.(1[6-9]|2\d|3[01])\./.test(x)) || candidates.find(x => x.startsWith('10.'));
    if (ip) return `http://${ip}:${port}`;
  }
  return `${req.socket.encrypted ? 'https' : 'http'}://${hostHeader}`;
}
async function serveFile(req, res, pathname) {
  const name = pathname === '/' ? 'index.html' : pathname.slice(1);
  const full = resolve(publicDir, name);
  if (!full.startsWith(`${publicDir}/`) && full !== join(publicDir, 'index.html')) return error(res, 403, '禁止访问');
  try {
    const content = await readFile(full);
    const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' }[extname(full)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(content);
  } catch { error(res, 404, '文件不存在'); }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/api/config' && req.method === 'GET') return json(res, 200, { publicUrl: publicOrigin(req) });
    if (url.pathname === '/api/single' && req.method === 'POST') {
      const input = await body(req);
      if (!['killer', 'detective'].includes(input.role)) return error(res, 400, '请选择角色');
      const humanToken = token(), computerToken = token();
      const computerRole = input.role === 'killer' ? 'detective' : 'killer';
      const game = createGame(code(), input.role, humanToken);
      game.mode = 'single';
      game.ai = { role: computerRole, humanRole: input.role, answers: [] };
      joinGame(game, computerRole, computerToken);
      advanceAI(game);
      rooms.set(game.code, game); save();
      return json(res, 201, { code: game.code, mode: 'single', token: humanToken, role: input.role, computerRole });
    }
    if (url.pathname === '/api/local' && req.method === 'POST') {
      const killer = token(), detective = token();
      const game = createGame(code(), 'killer', killer);
      game.mode = 'local';
      joinGame(game, 'detective', detective);
      rooms.set(game.code, game); save();
      return json(res, 201, { code: game.code, mode: 'local', tokens: { killer, detective }, activeRole: 'killer' });
    }
    if (url.pathname === '/api/create' && req.method === 'POST') {
      const input = await body(req);
      if (!['killer', 'detective'].includes(input.role)) return error(res, 400, '请选择角色');
      const session = token();
      const game = createGame(code(), input.role, session);
      game.mode = 'online';
      rooms.set(game.code, game); save();
      return json(res, 201, { code: game.code, mode: 'online', token: session, role: input.role });
    }
    if (url.pathname === '/api/join' && req.method === 'POST') {
      const input = await body(req);
      const room = rooms.get(String(input.code || '').trim().toUpperCase());
      if (!room) return error(res, 404, '房间码不存在');
      if (room.mode && room.mode !== 'online') return error(res, 400, '这个房间不能通过联机模式加入');
      const role = room.players.killer ? 'detective' : 'killer';
      const session = token();
      joinGame(room, role, session);
      save(); notify(room.code);
      return json(res, 200, { code: room.code, mode: 'online', token: session, role });
    }
    if (url.pathname === '/api/state' && req.method === 'GET') {
      const identity = auth(req, url);
      if (!identity) return error(res, 401, '身份已失效，请重新创建或加入房间');
      return json(res, 200, viewFor(identity.room, identity.role));
    }
    if (url.pathname === '/api/action' && req.method === 'POST') {
      const identity = auth(req, url);
      if (!identity) return error(res, 401, '身份已失效');
      const input = await body(req);
      const draft = structuredClone(identity.room);
      if (draft.mode === 'single' && identity.role !== draft.ai?.humanRole) return error(res, 403, '不能代替电脑执行行动');
      const pending = input.type === 'answer' ? structuredClone(draft.pending) : null;
      act(draft, identity.role, input.type, input.payload || {});
      rememberHumanAnswer(draft, pending, input.payload?.answer);
      advanceAI(draft);
      rooms.set(draft.code, draft);
      save(); notify(draft.code);
      return json(res, 200, viewFor(draft, identity.role));
    }
    if (url.pathname === '/api/events' && req.method === 'GET') {
      const identity = auth(req, url);
      if (!identity) return error(res, 401, '身份已失效');
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('event: connected\ndata: ready\n\n');
      if (!subscribers.has(identity.room.code)) subscribers.set(identity.room.code, new Set());
      subscribers.get(identity.room.code).add(res);
      const heartbeat = setInterval(() => { try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); } }, 25000);
      req.on('close', () => { clearInterval(heartbeat); subscribers.get(identity.room.code)?.delete(res); });
      return;
    }
    if (req.method === 'GET' && !url.pathname.startsWith('/api/')) return await serveFile(req, res, url.pathname);
    return error(res, 404, '接口不存在');
  } catch (e) {
    return error(res, e.status || 500, e.status ? e.message : '服务器内部错误');
  }
});

server.listen(port, host, () => console.log(`暗藏杀机服务器已启动：http://localhost:${port}`));
