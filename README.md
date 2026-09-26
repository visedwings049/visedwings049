# Tunnel

A tiny multiplayer relay you host once and reuse across all your small
browser games. Each game includes one script tag; on load it auto-joins a
shared room (via the page URL) with no per-game backend, matchmaking
service, or account system to build.

- **One server, many games** — rooms are namespaced per game, so any number
  of unrelated games can share the same deployed relay without colliding.
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

`GET /healthz` returns `{ ok, games, rooms, peers }` for monitoring.

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
<script src="tunnel-client.js" data-server="wss://your-host:8787" data-game="my-game"></script>
<script>
  const net = Tunnel.auto(); // auto-creates or auto-joins the room in the URL

  net.on('room', (code) => console.log('room', code, 'you are peer', net.peerId));
  net.on('peer-join', (id) => console.log(id, 'joined'));
  net.on('peer-leave', (id) => console.log(id, 'left'));
  net.on('data', (fromId, bytes) => { /* handle an incoming update */ });

  net.send({ x: 1, y: 2 });        // broadcast to everyone else in the room
  net.send(myBytes, { to: peerId }); // or address one peer directly
</script>
```

No manual room-code UI is required: the first player to open the page
gets a fresh room and the URL is rewritten with `?room=CODE`; anyone who
opens that same link joins the same room. Reconnects (dropped wifi, tab
backgrounded) retry with backoff and rejoin the same code automatically.

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

## Scope

This is a relay, not a full game backend: it moves small binary messages
between peers in a room and gets out of the way. There's no persistence,
matchmaking beyond room codes, or server-authoritative simulation — add
whatever model (host-authoritative, lockstep, client-side prediction) fits
each individual game on top of `send`/`on('data', ...)`.
