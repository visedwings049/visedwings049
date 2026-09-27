# Wire protocol

Every message, in both directions, is a single WebSocket **binary** frame —
never JSON. That's what keeps this cheap enough to run many small games
through one small server: no per-message text parsing, no key names on the
wire, just a handful of bytes.

Multi-byte integers are big-endian. Strings are length-prefixed with a
single `u8` (max 255 bytes) followed by UTF-8 bytes. Peer IDs are a single
byte (1-255), assigned by the server per room.

## Client → Server

| Byte 0 | Name | Layout | Notes |
|---|---|---|---|
| `0x01` | `CREATE_ROOM` | `[type][gameIdLen u8][gameId]` | server picks a fresh room code |
| `0x02` | `JOIN_ROOM` | `[type][gameIdLen u8][gameId][codeLen u8][code]` | joins an existing room |
| `0x06` | `DATA` | `[type][mode u8][...]` | see below |
| `0x07` | `PING` | `[type][nonce u32]` | answered with `PONG` echoing the nonce |
| `0x0B` | `LEAVE` | `[type]` | explicit leave (closing the socket has the same effect) |
| `0x0C` | `AUTH` | `[type][tokenLen u8][token]` | binds this connection to a player account; see below |

`DATA` mode byte:
- `0x00` broadcast: `[0x06][0x00][payload...]` — relayed to every other peer in the room
- `0x01` direct: `[0x06][0x01][targetPeerId u8][payload...]` — relayed to one peer

`payload` is opaque to the server — pack it however your game likes.
Raw binary (e.g. two `float32`s for a position) is cheapest; JSON works too
but costs more bytes per frame.

## Server → Client

| Byte 0 | Name | Layout | Notes |
|---|---|---|---|
| `0x03` | `ROOM_OK` | `[type][yourPeerId u8][codeLen u8][code][peerCount u8][(peerId u8, usernameLen u8, username)...]` | reply to `CREATE_ROOM`/`JOIN_ROOM`; the roster includes yourself |
| `0x04` | `PEER_JOINED` | `[type][peerId u8][usernameLen u8][username]` | |
| `0x05` | `PEER_LEFT` | `[type][peerId u8]` | sent on disconnect or explicit `LEAVE` |
| `0x06` | `DATA` | `[type][fromPeerId u8][payload...]` | relayed broadcast/direct message — unchanged by auth, no username overhead on the hot path |
| `0x08` | `PONG` | `[type][nonce u32]` | echoes the `PING` nonce so the client can measure RTT |
| `0x09` | `ERROR` | `[type][code u8]` | see error codes below |
| `0x0D` | `AUTH_OK` | `[type][usernameLen u8][username]` | reply to `AUTH`; `username` is the account's canonical (registered) casing |

## Error codes

| Code | Meaning |
|---|---|
| 1 | bad game id (must match `[A-Za-z0-9_-]{1,64}`) |
| 2 | bad room code |
| 3 | room not found |
| 4 | room full |
| 5 | unknown peer (direct-message target not in the room) |
| 6 | rate limited (too many messages/sec from this connection) |
| 7 | malformed message |
| 8 | authentication required (server has `REQUIRE_AUTH` on and `CREATE_ROOM`/`JOIN_ROOM` was sent before a successful `AUTH`) |
| 9 | invalid or expired token |

## Player accounts

Accounts are a registry the relay server owns — not something each game
implements. Since one server hosts many games, one account works for all of
them. A client gets a token two ways, both plain HTTP JSON on the same port
as the WebSocket:

- `POST /register` `{ "username": "...", "password": "..." }` → `201 { "token": "...", "username": "..." }`.
  Username: 3-20 chars, `[A-Za-z0-9_-]`. Password: 8-256 chars. `409` if the
  username is taken, `400` for an invalid username/password.
- `POST /login` `{ "username": "...", "password": "..." }` → `200 { "token": "...", "username": "..." }`,
  or `401` on a wrong username/password.

Both endpoints are rate-limited per IP (10 attempts/minute) and passwords
are stored only as a salted `scrypt` hash (see `server/players.js`) — never
in plaintext, and never sent back.

The returned `token` is a stateless, HMAC-signed credential (30-day TTL by
default) — send it once as `AUTH` right after the WebSocket opens. If the
server was started with `REQUIRE_AUTH=false`, `AUTH` is optional and
un-authenticated connections get an auto-generated `guest-xxxx` display
name instead of a registered one.

## Rooms and namespacing

Rooms are scoped per `gameId`, so two unrelated games can never end up in
the same room even if their room codes happen to collide. A room lives as
long as at least one peer is connected to it; when the last peer leaves,
the room (and its code) is freed immediately — there is no persistence or
replay, this is a pure relay.

## Design notes / why this shape

- **Overhead per relayed message is 2-3 bytes** (`type` + `fromPeerId`, or
  `+targetPeerId` for direct sends) — the rest of the frame is exactly what
  the sending game put in.
- **1-byte peer IDs** instead of UUIDs, since a small casual game rarely
  needs more than a couple dozen concurrent players per room (capped at 64
  server-side).
- **No host migration / authority model** is imposed — this is a star
  topology relay (every client talks to the server, the server fans
  broadcasts out to everyone else). Games decide their own authority model
  (e.g., first peer to join acts as host) on top of `send`/`data`.
