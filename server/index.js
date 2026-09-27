'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');
const { RoomManager } = require('./rooms');
const { PlayerRegistry } = require('./players');
const tokens = require('./tokens');
const {
  MSG,
  DATA_MODE,
  ERROR_CODE,
  encodeRoomOk,
  encodePeerJoined,
  encodePeerLeft,
  encodeAuthOk,
  encodeError,
  encodeData,
  encodePong,
  readString,
} = require('./protocol');

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
const MAX_PAYLOAD_BYTES = process.env.MAX_MESSAGE_BYTES ? Number(process.env.MAX_MESSAGE_BYTES) : 2048;
const MAX_MESSAGES_PER_SEC = process.env.MAX_MESSAGES_PER_SEC ? Number(process.env.MAX_MESSAGES_PER_SEC) : 60;
const REQUIRE_AUTH = process.env.REQUIRE_AUTH !== 'false'; // player accounts are on by default
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const GAME_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ROOM_CODE_RE = /^[A-Za-z0-9]{3,12}$/;
const MAX_HTTP_BODY_BYTES = 4096;
const AUTH_ATTEMPTS_PER_MIN = 10;

const rooms = new RoomManager();
const registry = new PlayerRegistry();
const authAttempts = new Map(); // ip -> { windowStart, count }

function clientIp(req) {
  return req.socket.remoteAddress || 'unknown';
}

function withinAuthRateLimit(ip) {
  const now = Date.now();
  const state = authAttempts.get(ip) || { windowStart: now, count: 0 };
  if (now - state.windowStart >= 60_000) {
    state.windowStart = now;
    state.count = 0;
  }
  state.count++;
  authAttempts.set(ip, state);
  return state.count <= AUTH_ATTEMPTS_PER_MIN;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_HTTP_BODY_BYTES) {
        reject(Object.assign(new Error('body too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(Object.assign(new Error('invalid json'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    'content-type': 'application/json',
    'access-control-allow-origin': CORS_ORIGIN,
  });
  res.end(JSON.stringify(body));
}

async function handleRegister(req, res) {
  const ip = clientIp(req);
  if (!withinAuthRateLimit(ip)) return sendJson(res, 429, { error: 'too many attempts, try again shortly' });

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, err.statusCode || 400, { error: err.message });
  }

  const { username, password } = body;
  if (!PlayerRegistry.validateUsername(username)) {
    return sendJson(res, 400, { error: 'username must be 3-20 chars: letters, numbers, _ or -' });
  }
  if (!PlayerRegistry.validatePassword(password)) {
    return sendJson(res, 400, { error: 'password must be at least 8 characters' });
  }
  try {
    const player = registry.register(username, password);
    return sendJson(res, 201, { token: tokens.sign(player.username), username: player.username });
  } catch (err) {
    if (err.code === 'USERNAME_TAKEN') return sendJson(res, 409, { error: 'username already taken' });
    return sendJson(res, 500, { error: 'registration failed' });
  }
}

async function handleLogin(req, res) {
  const ip = clientIp(req);
  if (!withinAuthRateLimit(ip)) return sendJson(res, 429, { error: 'too many attempts, try again shortly' });

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, err.statusCode || 400, { error: err.message });
  }

  const { username, password } = body;
  if (typeof username !== 'string' || typeof password !== 'string') {
    return sendJson(res, 400, { error: 'username and password are required' });
  }
  const player = registry.verify(username, password);
  if (!player) return sendJson(res, 401, { error: 'invalid username or password' });
  return sendJson(res, 200, { token: tokens.sign(player.username), username: player.username });
}

const httpServer = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': CORS_ORIGIN,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/healthz') {
    const stats = rooms.stats();
    return sendJson(res, 200, { ok: true, ...stats, requireAuth: REQUIRE_AUTH });
  }
  if (req.method === 'POST' && req.url === '/register') return handleRegister(req, res);
  if (req.method === 'POST' && req.url === '/login') return handleLogin(req, res);

  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer, maxPayload: MAX_PAYLOAD_BYTES });

function send(ws, buf) {
  if (ws.readyState === ws.OPEN) ws.send(buf);
}

function leaveRoom(ws) {
  const { room, peerId } = ws.tunnel;
  if (!room) return;
  room.removePeer(peerId);
  const notice = encodePeerLeft(peerId);
  for (const peerWs of room.peers.values()) send(peerWs, notice);
  rooms.deleteRoomIfEmpty(room);
  ws.tunnel.room = null;
  ws.tunnel.peerId = null;
}

function withinRateLimit(state) {
  const now = Date.now();
  if (now - state.windowStart >= 1000) {
    state.windowStart = now;
    state.count = 0;
  }
  state.count++;
  return state.count <= MAX_MESSAGES_PER_SEC;
}

wss.on('connection', (ws) => {
  ws.tunnel = { room: null, peerId: null, username: null, windowStart: Date.now(), count: 0 };

  ws.on('message', (raw, isBinary) => {
    if (!isBinary || raw.length === 0) return;
    if (!withinRateLimit(ws.tunnel)) {
      send(ws, encodeError(ERROR_CODE.RATE_LIMITED));
      return;
    }

    const type = raw[0];

    try {
      switch (type) {
        case MSG.AUTH: {
          const { value: token } = readString(raw, 1);
          const username = tokens.verify(token);
          if (!username) {
            send(ws, encodeError(ERROR_CODE.BAD_TOKEN));
            return;
          }
          ws.tunnel.username = username;
          send(ws, encodeAuthOk(username));
          break;
        }

        case MSG.CREATE_ROOM: {
          if (REQUIRE_AUTH && !ws.tunnel.username) {
            send(ws, encodeError(ERROR_CODE.AUTH_REQUIRED));
            return;
          }
          const { value: gameId } = readString(raw, 1);
          if (!GAME_ID_RE.test(gameId)) {
            send(ws, encodeError(ERROR_CODE.BAD_GAME_ID));
            return;
          }
          if (ws.tunnel.room) leaveRoom(ws);
          const room = rooms.createRoom(gameId);
          const username = ws.tunnel.username || `guest-${Math.random().toString(36).slice(2, 6)}`;
          const peerId = room.addPeer(ws, username);
          ws.tunnel.room = room;
          ws.tunnel.peerId = peerId;
          send(ws, encodeRoomOk(peerId, room.code, [{ id: peerId, username }]));
          break;
        }

        case MSG.JOIN_ROOM: {
          if (REQUIRE_AUTH && !ws.tunnel.username) {
            send(ws, encodeError(ERROR_CODE.AUTH_REQUIRED));
            return;
          }
          const gameIdRead = readString(raw, 1);
          const gameId = gameIdRead.value;
          const { value: code } = readString(raw, gameIdRead.next);
          if (!GAME_ID_RE.test(gameId)) {
            send(ws, encodeError(ERROR_CODE.BAD_GAME_ID));
            return;
          }
          if (!ROOM_CODE_RE.test(code)) {
            send(ws, encodeError(ERROR_CODE.BAD_ROOM_CODE));
            return;
          }
          const room = rooms.getRoom(gameId, code);
          if (!room) {
            send(ws, encodeError(ERROR_CODE.ROOM_NOT_FOUND));
            return;
          }
          if (room.isFull()) {
            send(ws, encodeError(ERROR_CODE.ROOM_FULL));
            return;
          }
          if (ws.tunnel.room) leaveRoom(ws);
          const existingPeers = room.peerEntries();
          const username = ws.tunnel.username || `guest-${Math.random().toString(36).slice(2, 6)}`;
          const peerId = room.addPeer(ws, username);
          ws.tunnel.room = room;
          ws.tunnel.peerId = peerId;
          send(ws, encodeRoomOk(peerId, room.code, [...existingPeers, { id: peerId, username }]));
          const notice = encodePeerJoined(peerId, username);
          for (const [id, peerWs] of room.peers) {
            if (id !== peerId) send(peerWs, notice);
          }
          break;
        }

        case MSG.DATA: {
          const { room, peerId } = ws.tunnel;
          if (!room) return;
          const mode = raw[1];
          if (mode === DATA_MODE.BROADCAST) {
            const payload = raw.subarray(2);
            const out = encodeData(peerId, payload);
            for (const [id, peerWs] of room.peers) {
              if (id !== peerId) send(peerWs, out);
            }
          } else if (mode === DATA_MODE.DIRECT) {
            const targetId = raw[2];
            const payload = raw.subarray(3);
            const targetWs = room.peers.get(targetId);
            if (!targetWs) {
              send(ws, encodeError(ERROR_CODE.UNKNOWN_PEER));
              return;
            }
            send(targetWs, encodeData(peerId, payload));
          }
          break;
        }

        case MSG.PING: {
          const nonce = raw.readUInt32BE(1);
          send(ws, encodePong(nonce));
          break;
        }

        case MSG.LEAVE: {
          leaveRoom(ws);
          break;
        }

        default:
          send(ws, encodeError(ERROR_CODE.MALFORMED));
      }
    } catch (err) {
      send(ws, encodeError(ERROR_CODE.MALFORMED));
    }
  });

  ws.on('close', () => leaveRoom(ws));
  ws.on('error', () => leaveRoom(ws));
});

httpServer.listen(PORT, () => {
  console.log(`tunnel relay listening on :${PORT} (auth ${REQUIRE_AUTH ? 'required' : 'optional'})`);
});
