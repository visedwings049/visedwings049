'use strict';

const { randomRoomCode } = require('./protocol');

const MAX_PEERS_PER_ROOM = 64;
const MAX_ROOM_CREATE_ATTEMPTS = 10;

class Room {
  constructor(gameId, code) {
    this.gameId = gameId;
    this.code = code;
    this.peers = new Map(); // peerId (number) -> ws connection
    this.usernames = new Map(); // peerId (number) -> username
    this.nextPeerId = 1;
    this.createdAt = Date.now();
  }

  get size() {
    return this.peers.size;
  }

  isFull() {
    return this.peers.size >= MAX_PEERS_PER_ROOM;
  }

  addPeer(ws, username) {
    const peerId = this.nextPeerId++;
    if (peerId > 255) return null; // exhausted 1-byte id space
    this.peers.set(peerId, ws);
    this.usernames.set(peerId, username);
    return peerId;
  }

  removePeer(peerId) {
    this.peers.delete(peerId);
    this.usernames.delete(peerId);
  }

  peerEntries() {
    return Array.from(this.peers.keys()).map((id) => ({ id, username: this.usernames.get(id) }));
  }
}

class RoomManager {
  constructor() {
    // namespaced by gameId so unrelated games never see each other's rooms
    // even if two games happen to pick the same room code.
    this.namespaces = new Map(); // gameId -> Map(code -> Room)
  }

  _spaceFor(gameId) {
    let space = this.namespaces.get(gameId);
    if (!space) {
      space = new Map();
      this.namespaces.set(gameId, space);
    }
    return space;
  }

  createRoom(gameId) {
    const space = this._spaceFor(gameId);
    for (let i = 0; i < MAX_ROOM_CREATE_ATTEMPTS; i++) {
      const code = randomRoomCode(4);
      if (!space.has(code)) {
        const room = new Room(gameId, code);
        space.set(code, room);
        return room;
      }
    }
    // astronomically unlikely with a 33^4 keyspace, but stay correct
    const code = randomRoomCode(6);
    const room = new Room(gameId, code);
    space.set(code, room);
    return room;
  }

  getRoom(gameId, code) {
    const space = this.namespaces.get(gameId);
    if (!space) return null;
    return space.get(code.toUpperCase()) || null;
  }

  deleteRoomIfEmpty(room) {
    if (room.size > 0) return;
    const space = this.namespaces.get(room.gameId);
    if (!space) return;
    space.delete(room.code);
    if (space.size === 0) this.namespaces.delete(room.gameId);
  }

  stats() {
    let rooms = 0;
    let peers = 0;
    for (const space of this.namespaces.values()) {
      rooms += space.size;
      for (const room of space.values()) peers += room.size;
    }
    return { games: this.namespaces.size, rooms, peers };
  }
}

module.exports = { RoomManager, MAX_PEERS_PER_ROOM };
