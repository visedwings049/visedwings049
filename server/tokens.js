'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.TUNNEL_DATA_DIR || path.join(__dirname, 'data');
const SECRET_FILE = path.join(DATA_DIR, 'secret.key');
const TOKEN_TTL_MS = process.env.TOKEN_TTL_MS ? Number(process.env.TOKEN_TTL_MS) : 30 * 24 * 60 * 60 * 1000; // 30 days

function loadOrCreateSecret() {
  if (process.env.TOKEN_SECRET) return process.env.TOKEN_SECRET;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try {
    return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    const secret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
    return secret;
  }
}

const SECRET = loadOrCreateSecret();

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(username) {
  const payload = JSON.stringify({ u: username, exp: Date.now() + TOKEN_TTL_MS });
  const payloadB64 = base64url(Buffer.from(payload, 'utf8'));
  const mac = crypto.createHmac('sha256', SECRET).update(payloadB64).digest();
  return `${payloadB64}.${base64url(mac)}`;
}

function verify(token) {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, macB64] = parts;
  const expectedMac = base64url(crypto.createHmac('sha256', SECRET).update(payloadB64).digest());
  const a = Buffer.from(macB64);
  const b = Buffer.from(expectedMac);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8'));
    if (typeof payload.u !== 'string' || typeof payload.exp !== 'number') return null;
    if (Date.now() > payload.exp) return null;
    return payload.u;
  } catch {
    return null;
  }
}

module.exports = { sign, verify };
