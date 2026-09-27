'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const USERNAME_RE = /^[A-Za-z0-9_-]{3,20}$/;
const MIN_PASSWORD_LENGTH = 8;
const SCRYPT_KEYLEN = 64;

const DATA_DIR = process.env.TUNNEL_DATA_DIR || path.join(__dirname, 'data');
const PLAYERS_FILE = path.join(DATA_DIR, 'players.json');

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadPlayers() {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(PLAYERS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

function savePlayers(players) {
  ensureDataDir();
  // write-then-rename keeps a crash mid-write from corrupting the registry
  const tmpFile = `${PLAYERS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(players, null, 2));
  fs.renameSync(tmpFile, PLAYERS_FILE);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

class PlayerRegistry {
  constructor() {
    this.players = loadPlayers();
  }

  static validateUsername(username) {
    return typeof username === 'string' && USERNAME_RE.test(username);
  }

  static validatePassword(password) {
    return typeof password === 'string' && password.length >= MIN_PASSWORD_LENGTH && password.length <= 256;
  }

  exists(username) {
    return Object.prototype.hasOwnProperty.call(this.players, username.toLowerCase());
  }

  register(username, password) {
    const key = username.toLowerCase();
    if (this.exists(key)) {
      const err = new Error('username taken');
      err.code = 'USERNAME_TAKEN';
      throw err;
    }
    this.players[key] = {
      username, // preserves the caller's original casing for display
      passwordHash: hashPassword(password),
      createdAt: Date.now(),
    };
    savePlayers(this.players);
    return { username };
  }

  verify(username, password) {
    const record = this.players[username.toLowerCase()];
    if (!record) return null;
    if (!verifyPassword(password, record.passwordHash)) return null;
    return { username: record.username };
  }
}

module.exports = { PlayerRegistry, USERNAME_RE, MIN_PASSWORD_LENGTH };
