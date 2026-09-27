# Tunnel

A tiny multiplayer relay you host once and reuse across all your small
browser games. Each game includes one script tag; on load it auto-joins a
shared room (via the page URL) with no per-game backend or matchmaking
service to build.

- **One server, many games** — rooms are namespaced per game, so any number
  of unrelated games can share the same deployed relay without colliding.
- **One player registry, many games** — accounts live on the server, not
  per-game, so a player signs in once and the same account works across
  every game hosted through this relay.
- **Binary wire protocol** — no JSON envelopes; relay overhead is 2-3 bytes
  per message (see [`docs/PROTOCOL.md`](docs/PROTOCOL.md)). Built for
  small, frequent updates (positions, inputs) over cheap hosting.
- **Auto-connect client** — drop in `client/tunnel-client.js`, and a game
  creates or joins a room automatically based on the page's `?room=` query
  param, so sharing the URL is the entire invite flow.

## Layout

```
server/               Node.js WebSocket relay (host this)
client/tunnel-client.js   Zero-build browser SDK (ship this with each game)
examples/demo/         Two-tab shared-cursor demo proving the loop works
docs/PROTOCOL.md        Wire format reference
```

## Run the server

```sh
cd server
npm install
PORT=8787 npm start
```

`GET /healthz` returns `{ ok, games, rooms, peers, requireAuth }` for monitoring.

Player accounts are **on by default** (`REQUIRE_AUTH=true`) — a client must
register/log in and send a token before it can create or join a room. Set
`REQUIRE_AUTH=false` to allow anonymous "guest-xxxx" players instead (useful
for local testing, or a game that doesn't want accounts at all). Account
data is stored under `server/data/` (`players.json`, hashed passwords only,
plus a `secret.key` used to sign session tokens) — back that directory up
if you want accounts to survive re-deploys; it's gitignored by default.

Docker:

```sh
cd server
docker build -t tunnel-server .
docker run -p 8787:8787 tunnel-server
```

Put it behind TLS (e.g. a reverse proxy terminating `wss://`) before using
it from a page served over `https://` — browsers block a plain `ws://`
connection from a secure page.

## Add it to a game

```html
<script src="tunnel-client.js"></script>
<script type="module">
  const serverUrl = 'wss://your-host:8787';

  // Player accounts live on the server, so any game pointed at the same
  // relay shares the same account. Register the first time, log in after.
  const { token } = await Tunnel.login(serverUrl, username, password);
  // const { token } = await Tunnel.register(serverUrl, username, password);

  const net = new Tunnel({ serverUrl, gameId: 'my-game', token });

  net.on('authenticated', (username) => console.log('signed in as', username));
  net.on('room', (code) => console.log('room', code, 'you are peer', net.peerId));
  net.on('peer-join', (id, username) => console.log(username, 'joined'));
  net.on('peer-leave', (id) => console.log(id, 'left'));
  net.on('data', (fromId, bytes) => { /* handle an incoming update */ });

  net.send({ x: 1, y: 2 });        // broadcast to everyone else in the room
  net.send(myBytes, { to: peerId }); // or address one peer directly
</script>
```

Not every game needs accounts — pass no `token` and the server assigns a
`guest-xxxx` display name instead (as long as it's running with
`REQUIRE_AUTH=false`), or use `Tunnel.auto()` for the no-login version:
it reads `data-server`/`data-game` off its own `<script>` tag and
auto-creates or auto-joins the room named in the page's `?room=` URL param.

No manual room-code UI is required: the first player to open the page
gets a fresh room and the URL is rewritten with `?room=CODE`; anyone who
opens that same link joins the same room. Reconnects (dropped wifi, tab
backgrounded) retry with backoff, re-authenticate, and rejoin the same
code automatically.

See [`examples/demo/index.html`](examples/demo/index.html) for a complete,
runnable example — open it in two tabs (same URL) against a running server
to watch each tab's cursor show up in the other.

## Try the demo end to end

```sh
cd server && npm install && npm start
# in another terminal, serve the repo root with any static file server, e.g.:
npx serve .
# open http://localhost:3000/examples/demo/?server=ws://localhost:8787 in two tabs
```

Each tab shows a sign-in screen first — register an account (or reuse one
across tabs to watch reconnect-and-rejoin), then the shared-cursor view
opens with players labeled by their real username instead of a bare peer id.

## Scope

This is a relay plus a lightweight player registry, not a full game
backend: it moves small binary messages between peers in a room, and it
authenticates who's connecting, then gets out of the way. There's no
matchmaking beyond room codes, no server-authoritative simulation, and no
per-player game state (stats, inventory, etc.) — add whatever model
(host-authoritative, lockstep, client-side prediction) fits each individual
game on top of `send`/`on('data', ...)`, keyed by the now-authenticated
`net.username` if you want it tied to an account.
