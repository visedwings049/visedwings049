'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');
const { RoomManager } = require('./rooms');
const {
  MSG,
  DATA_MODE,
  ERROR_CODE,
  encodeRoomOk,
  encodePeerEvent,
  encodeError,
  encodeData,
  encodePong,
  readString,
} = require('./protocol');

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
const MAX_PAYLOAD_BYTES = process.env.MAX_MESSAGE_BYTES ? Number(process.env.MAX_MESSAGE_BYTES) : 2048;
const MAX_MESSAGES_PER_SEC = process.env.MAX_MESSAGES_PER_SEC ? Number(process.env.MAX_MESSAGES_PER_SEC) : 60;
const GAME_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ROOM_CODE_RE = /^[A-Za-z0-9]{3,12}$/;

const rooms = new RoomManager();

const httpServer = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    const stats = rooms.stats();
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ...stats }));
    return;
  }
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
  const notice = encodePeerEvent(MSG.PEER_LEFT, peerId);
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
  ws.tunnel = { room: null, peerId: null, windowStart: Date.now(), count: 0 };

  ws.on('message', (raw, isBinary) => {
    if (!isBinary || raw.length === 0) return;
    if (!withinRateLimit(ws.tunnel)) {
      send(ws, encodeError(ERROR_CODE.RATE_LIMITED));
      return;
    }

    const type = raw[0];

    try {
      switch (type) {
        case MSG.CREATE_ROOM: {
          const { value: gameId } = readString(raw, 1);
          if (!GAME_ID_RE.test(gameId)) {
            send(ws, encodeError(ERROR_CODE.BAD_GAME_ID));
            return;
          }
          if (ws.tunnel.room) leaveRoom(ws);
          const room = rooms.createRoom(gameId);
          const peerId = room.addPeer(ws);
          ws.tunnel.room = room;
          ws.tunnel.peerId = peerId;
          send(ws, encodeRoomOk(peerId, room.code, [peerId]));
          break;
        }

        case MSG.JOIN_ROOM: {
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
          const existingPeerIds = room.peerIds();
          const peerId = room.addPeer(ws);
          ws.tunnel.room = room;
          ws.tunnel.peerId = peerId;
          send(ws, encodeRoomOk(peerId, room.code, [...existingPeerIds, peerId]));
          const notice = encodePeerEvent(MSG.PEER_JOINED, peerId);
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
  console.log(`tunnel relay listening on :${PORT}`);
});
