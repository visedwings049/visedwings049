/*!
 * tunnel-client.js — zero-build browser SDK for the multiplayer tunnel relay.
 *
 * Drop this in a <script> tag (or import as a module) and a game gets a
 * shared room with other players with almost no integration code:
 *
 *   <script src="tunnel-client.js" data-server="wss://your-host:8787" data-game="my-game"></script>
 *   <script>
 *     const net = Tunnel.auto(); // reads data-server/data-game off this script tag
 *     net.on('room', code => console.log('share this link, room is', code));
 *     net.on('peer-join', (id, username) => console.log(username, 'joined'));
 *     net.on('data', (from, bytes) => console.log('got', bytes, 'from', from));
 *     net.send({ x: 1, y: 2 }); // broadcast to everyone else in the room
 *   </script>
 *
 * The relay also runs an optional player registry: accounts live on the
 * server, not per-game, so one login works across every game hosted through
 * it. Sign in before constructing a Tunnel and pass the token along:
 *
 *   const { token } = await Tunnel.login(serverUrl, 'wade', 'hunter22');
 *   // or Tunnel.register(serverUrl, 'wade', 'hunter22') the first time
 *   const net = new Tunnel({ serverUrl, gameId: 'my-game', token });
 *   net.on('authenticated', username => console.log('signed in as', username));
 *
 * Wire format matches server/protocol.js — see PROTOCOL.md. Every frame is
 * a single WebSocket binary message; there is no JSON envelope, so relay
 * overhead is 2-3 bytes per message.
 */
(function (global, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    global.Tunnel = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MSG = {
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
  };

  const DATA_MODE = { BROADCAST: 0x00, DIRECT: 0x01 };

  const ERROR_MESSAGES = {
    1: 'bad game id',
    2: 'bad room code',
    3: 'room not found',
    4: 'room full',
    5: 'unknown peer',
    6: 'rate limited',
    7: 'malformed message',
    8: 'authentication required',
    9: 'invalid or expired token',
  };

  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();

  function writeString(str) {
    const bytes = textEncoder.encode(str);
    if (bytes.length > 255) throw new Error('string too long (max 255 bytes)');
    const out = new Uint8Array(1 + bytes.length);
    out[0] = bytes.length;
    out.set(bytes, 1);
    return out;
  }

  function readString(view, offset) {
    const len = view.getUint8(offset);
    const bytes = new Uint8Array(view.buffer, view.byteOffset + offset + 1, len);
    return { value: textDecoder.decode(bytes), next: offset + 1 + len };
  }

  function concatBytes(parts) {
    let total = 0;
    for (const p of parts) total += p.length;
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
      out.set(p, off);
      off += p.length;
    }
    return out;
  }

  function toBytes(data) {
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (typeof data === 'string') return textEncoder.encode(data);
    // plain object / number / boolean -> JSON. Convenient, but costs bytes;
    // pack your own binary for high-frequency updates (positions, inputs).
    return textEncoder.encode(JSON.stringify(data));
  }

  class EventBus {
    constructor() {
      this._listeners = new Map();
    }
    on(event, fn) {
      if (!this._listeners.has(event)) this._listeners.set(event, new Set());
      this._listeners.get(event).add(fn);
      return () => this.off(event, fn);
    }
    off(event, fn) {
      const set = this._listeners.get(event);
      if (set) set.delete(fn);
    }
    emit(event, ...args) {
      const set = this._listeners.get(event);
      if (!set) return;
      for (const fn of Array.from(set)) fn(...args);
    }
  }

  const DEFAULT_OPTS = {
    serverUrl: null,
    gameId: 'default',
    autoJoin: true,
    roomParam: 'room',
    token: null, // from Tunnel.register()/Tunnel.login() — omit to play as a guest
    minBackoffMs: 400,
    maxBackoffMs: 8000,
    pingIntervalMs: 5000,
  };

  function toHttpUrl(serverUrl) {
    return serverUrl.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:').replace(/\/$/, '');
  }

  async function authRequest(serverUrl, path, username, password) {
    const res = await fetch(toHttpUrl(serverUrl) + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `request failed (${res.status})`);
    return body; // { token, username }
  }

  class Tunnel extends EventBus {
    constructor(opts = {}) {
      super();
      this.opts = Object.assign({}, DEFAULT_OPTS, opts);
      if (!this.opts.serverUrl) throw new Error('Tunnel: serverUrl is required');

      this.peerId = null;
      this.code = null;
      this.peers = new Set();
      this.peerUsernames = new Map(); // peerId -> username, includes yourself once known
      this.username = null;
      this.rtt = null;
      this.connected = false;

      this._ws = null;
      this._authToken = this.opts.token || null;
      this._authenticated = false;
      this._backoff = this.opts.minBackoffMs;
      this._pendingJoinCode = null; // set when we want a specific room on (re)connect
      this._closedByUser = false;
      this._pingTimer = null;
      this._pingNonce = 0;
      this._pingSentAt = new Map();

      this._open();

      if (this.opts.autoJoin) {
        // give 'this' a tick to be assigned before callers can attach listeners
        Promise.resolve().then(() => this.autoJoin());
      }
    }

    /** Create a player account on the server. Resolves to { token, username }. */
    static register(serverUrl, username, password) {
      return authRequest(serverUrl, '/register', username, password);
    }

    /** Sign in to an existing player account. Resolves to { token, username }. */
    static login(serverUrl, username, password) {
      return authRequest(serverUrl, '/login', username, password);
    }

    /** Build a Tunnel from a <script> tag's data-server / data-game attributes. */
    static auto(scriptEl) {
      const el = scriptEl || (document.currentScript) ||
        document.querySelector('script[data-server]');
      const serverUrl = el && el.dataset ? el.dataset.server : undefined;
      const gameId = el && el.dataset ? el.dataset.game : undefined;
      return new Tunnel({
        serverUrl,
        gameId: gameId || DEFAULT_OPTS.gameId,
      });
    }

    /** Join the room named in the URL's ?room= param, or create a fresh one. */
    autoJoin() {
      const url = new URL(global.location ? global.location.href : 'http://localhost/');
      const code = url.searchParams.get(this.opts.roomParam);
      if (code) {
        this.joinRoom(code);
      } else {
        this.createRoom((newCode) => {
          url.searchParams.set(this.opts.roomParam, newCode);
          if (global.history && global.history.replaceState) {
            global.history.replaceState(null, '', url.toString());
          }
        });
      }
    }

    createRoom(onCode) {
      this._pendingJoinCode = null;
      this._onNextRoomOk = onCode || null;
      this._sendOrQueue(() => concatBytes([Uint8Array.of(MSG.CREATE_ROOM), writeString(this.opts.gameId)]));
    }

    joinRoom(code) {
      this._pendingJoinCode = code.toUpperCase();
      this._sendOrQueue(() =>
        concatBytes([Uint8Array.of(MSG.JOIN_ROOM), writeString(this.opts.gameId), writeString(this._pendingJoinCode)])
      );
    }

    /** Send data to everyone else in the room, or to one peer with {to: peerId}. */
    send(data, { to } = {}) {
      const payload = toBytes(data);
      let frame;
      if (to == null) {
        frame = concatBytes([Uint8Array.of(MSG.DATA, DATA_MODE.BROADCAST), payload]);
      } else {
        frame = concatBytes([Uint8Array.of(MSG.DATA, DATA_MODE.DIRECT, to), payload]);
      }
      if (this._ws && this._ws.readyState === WebSocket.OPEN) this._ws.send(frame);
    }

    leave() {
      this._closedByUser = true;
      if (this._ws && this._ws.readyState === WebSocket.OPEN) {
        this._ws.send(Uint8Array.of(MSG.LEAVE));
      }
      this._teardown();
    }

    _canSendRoomOps() {
      return !this._authToken || this._authenticated;
    }

    _sendOrQueue(buildFrame) {
      if (this._ws && this._ws.readyState === WebSocket.OPEN && this._canSendRoomOps()) {
        this._ws.send(buildFrame());
      } else {
        this._queuedAction = buildFrame;
      }
    }

    _flushQueued() {
      if (this._pendingJoinCode) {
        this.joinRoom(this._pendingJoinCode);
      } else if (this._queuedAction) {
        const frame = this._queuedAction();
        this._queuedAction = null;
        this._ws.send(frame);
      }
    }

    _open() {
      const ws = new WebSocket(this.opts.serverUrl);
      ws.binaryType = 'arraybuffer';
      this._ws = ws;

      ws.onopen = () => {
        this.connected = true;
        this._backoff = this.opts.minBackoffMs;
        this.emit('open');
        if (this._authToken) {
          // room ops stay queued until AUTH_OK comes back (see _handleMessage)
          ws.send(concatBytes([Uint8Array.of(MSG.AUTH), writeString(this._authToken)]));
        } else {
          this._flushQueued();
        }
        this._startPing();
      };

      ws.onmessage = (evt) => this._handleMessage(evt.data);

      ws.onclose = () => {
        this.connected = false;
        this._authenticated = false;
        this._stopPing();
        this.emit('close');
        if (!this._closedByUser) this._scheduleReconnect();
      };

      ws.onerror = () => {
        this.emit('error', new Error('websocket error'));
      };
    }

    _scheduleReconnect() {
      const delay = this._backoff + Math.random() * 200;
      this._backoff = Math.min(this._backoff * 2, this.opts.maxBackoffMs);
      setTimeout(() => {
        if (!this._closedByUser) this._open();
      }, delay);
    }

    _teardown() {
      this._stopPing();
      if (this._ws) {
        this._ws.onclose = null;
        this._ws.close();
      }
    }

    _startPing() {
      this._stopPing();
      this._pingTimer = setInterval(() => {
        if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;
        const nonce = (this._pingNonce = (this._pingNonce + 1) >>> 0);
        this._pingSentAt.set(nonce, performance.now());
        const frame = new Uint8Array(5);
        frame[0] = MSG.PING;
        new DataView(frame.buffer).setUint32(1, nonce, false);
        this._ws.send(frame);
      }, this.opts.pingIntervalMs);
    }

    _stopPing() {
      if (this._pingTimer) clearInterval(this._pingTimer);
      this._pingTimer = null;
    }

    _handleMessage(raw) {
      const buf = new Uint8Array(raw);
      const view = new DataView(raw);
      const type = buf[0];

      switch (type) {
        case MSG.AUTH_OK: {
          const nameRead = readString(view, 1);
          this._authenticated = true;
          this.username = nameRead.value;
          this.emit('authenticated', nameRead.value);
          this._flushQueued();
          break;
        }
        case MSG.ROOM_OK: {
          const peerId = buf[1];
          const codeRead = readString(view, 2);
          const code = codeRead.value;
          let offset = codeRead.next;
          const count = buf[offset++];
          const peers = [];
          const peerUsernames = new Map();
          for (let i = 0; i < count; i++) {
            const id = buf[offset++];
            const nameRead = readString(view, offset);
            offset = nameRead.next;
            peers.push(id);
            peerUsernames.set(id, nameRead.value);
          }

          this.peerId = peerId;
          this.code = code;
          this.peers = new Set(peers.filter((id) => id !== peerId));
          this.peerUsernames = peerUsernames;
          this.username = this.username || peerUsernames.get(peerId);

          this.emit('room', code, peerId);
          if (this._onNextRoomOk) {
            this._onNextRoomOk(code);
            this._onNextRoomOk = null;
          }
          break;
        }
        case MSG.PEER_JOINED: {
          const peerId = buf[1];
          const nameRead = readString(view, 2);
          this.peers.add(peerId);
          this.peerUsernames.set(peerId, nameRead.value);
          this.emit('peer-join', peerId, nameRead.value);
          break;
        }
        case MSG.PEER_LEFT: {
          const peerId = buf[1];
          this.peers.delete(peerId);
          this.peerUsernames.delete(peerId);
          this.emit('peer-leave', peerId);
          break;
        }
        case MSG.DATA: {
          const fromPeerId = buf[1];
          const payload = buf.subarray(2);
          this.emit('data', fromPeerId, payload);
          break;
        }
        case MSG.PONG: {
          const nonce = view.getUint32(1, false);
          const sentAt = this._pingSentAt.get(nonce);
          if (sentAt != null) {
            this.rtt = performance.now() - sentAt;
            this._pingSentAt.delete(nonce);
            this.emit('rtt', this.rtt);
          }
          break;
        }
        case MSG.ERROR: {
          const code = buf[1];
          this.emit('error', new Error(ERROR_MESSAGES[code] || `error ${code}`));
          break;
        }
        default:
          break;
      }
    }
  }

  Tunnel.utils = {
    decodeText: (bytes) => textDecoder.decode(bytes),
    decodeJSON: (bytes) => JSON.parse(textDecoder.decode(bytes)),
  };

  return Tunnel;
});
