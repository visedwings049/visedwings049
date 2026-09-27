'use strict';

// Binary wire protocol. Every message is a single WebSocket binary frame.
// Kept intentionally tiny — this is a relay for small/casual multiplayer
// games, not a general RPC system, so every byte on the wire is one we
// chose on purpose.
//
// Client -> Server
//   AUTH         [0x0C][tokenLen u8][token utf8]
//   CREATE_ROOM  [0x01][gameIdLen u8][gameId utf8]
//   JOIN_ROOM    [0x02][gameIdLen u8][gameId utf8][codeLen u8][code utf8]
//   DATA         [0x06][mode u8][...][payload]
//                  mode 0x00 = broadcast to room:      [0x06][0x00][payload...]
//                  mode 0x01 = direct to one peer:      [0x06][0x01][targetPeerId u8][payload...]
//   PING         [0x07][nonce u32be]
//   LEAVE        [0x0B]
//
// Server -> Client
//   AUTH_OK      [0x0D][usernameLen u8][username utf8]
//   ROOM_OK      [0x03][yourPeerId u8][codeLen u8][code utf8][peerCount u8][(peerId u8, usernameLen u8, username utf8)...]
//   PEER_JOINED  [0x04][peerId u8][usernameLen u8][username utf8]
//   PEER_LEFT    [0x05][peerId u8]
//   DATA         [0x06][fromPeerId u8][payload...]
//   PONG         [0x08][nonce u32be]
//   ERROR        [0x09][code u8]
//
// Room codes are short human-shareable strings (default 4 chars) drawn from
// a base32-ish alphabet with ambiguous characters removed.
//
// AUTH binds a connection to a player account (see server/players.js and the
// /register, /login HTTP endpoints for how a client obtains a token). When
// the server requires auth, CREATE_ROOM/JOIN_ROOM are rejected with
// AUTH_REQUIRED until AUTH succeeds; the authenticated username then travels
// with room roster events so games can show player names instead of bare
// peer ids, without adding any weight to the DATA hot path.

const MSG = Object.freeze({
  CREATE_ROOM: 0x01,
  JOIN_ROOM: 0x02,
  ROOM_OK: 0x03,
  PEER_JOINED: 0x04,
  PEER_LEFT: 0x05,
  DATA: 0x06,
  PING: 0x07,
  PONG: 0x08,
  ERROR: 0x09,
  LEAVE: 0x0b,
  AUTH: 0x0c,
  AUTH_OK: 0x0d,
});

const DATA_MODE = Object.freeze({
  BROADCAST: 0x00,
  DIRECT: 0x01,
});

const ERROR_CODE = Object.freeze({
  BAD_GAME_ID: 1,
  BAD_ROOM_CODE: 2,
  ROOM_NOT_FOUND: 3,
  ROOM_FULL: 4,
  UNKNOWN_PEER: 5,
  RATE_LIMITED: 6,
  MALFORMED: 7,
  AUTH_REQUIRED: 8,
  BAD_TOKEN: 9,
});

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I,O,0,1

function randomRoomCode(length = 4) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[(Math.random() * CODE_ALPHABET.length) | 0];
  }
  return out;
}

function readString(buf, offset) {
  const len = buf.readUInt8(offset);
  const str = buf.toString('utf8', offset + 1, offset + 1 + len);
  return { value: str, next: offset + 1 + len };
}

function writeString(str) {
  const strBuf = Buffer.from(str, 'utf8');
  if (strBuf.length > 255) throw new Error('string too long for u8-length field');
  return Buffer.concat([Buffer.from([strBuf.length]), strBuf]);
}

// peers: array of { id, username }
function encodeRoomOk(peerId, code, peers) {
  const codeBuf = writeString(code);
  const head = Buffer.from([MSG.ROOM_OK, peerId]);
  const count = Buffer.from([peers.length]);
  const entries = peers.map((p) => Buffer.concat([Buffer.from([p.id]), writeString(p.username)]));
  return Buffer.concat([head, codeBuf, count, ...entries]);
}

function encodePeerJoined(peerId, username) {
  return Buffer.concat([Buffer.from([MSG.PEER_JOINED, peerId]), writeString(username)]);
}

function encodePeerLeft(peerId) {
  return Buffer.from([MSG.PEER_LEFT, peerId]);
}

function encodeAuthOk(username) {
  return Buffer.concat([Buffer.from([MSG.AUTH_OK]), writeString(username)]);
}

function encodeError(code) {
  return Buffer.from([MSG.ERROR, code]);
}

function encodeData(fromPeerId, payload) {
  return Buffer.concat([Buffer.from([MSG.DATA, fromPeerId]), payload]);
}

function encodePong(nonce) {
  const buf = Buffer.alloc(5);
  buf.writeUInt8(MSG.PONG, 0);
  buf.writeUInt32BE(nonce >>> 0, 1);
  return buf;
}

module.exports = {
  MSG,
  DATA_MODE,
  ERROR_CODE,
  randomRoomCode,
  readString,
  writeString,
  encodeRoomOk,
  encodePeerJoined,
  encodePeerLeft,
  encodeAuthOk,
  encodeError,
  encodeData,
  encodePong,
};
