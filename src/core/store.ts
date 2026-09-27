import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DB } from "./types.js";

const DATA_DIR = process.env.PROPHET_SNIPER_DATA_DIR ?? join(process.cwd(), "data");
const DB_PATH = join(DATA_DIR, "db.json");
export const MEDIA_DIR = join(DATA_DIR, "media");

function emptyDb(): DB {
  return { sermons: [], keywords: [], sessions: [] };
}

function ensureDirs(): void {
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(MEDIA_DIR, { recursive: true });
}

let cache: DB | null = null;

export function loadDb(): DB {
  if (cache) return cache;
  ensureDirs();
  if (!existsSync(DB_PATH)) {
    cache = emptyDb();
    saveDb(cache);
    return cache;
  }
  const raw = readFileSync(DB_PATH, "utf-8");
  cache = raw.trim() ? (JSON.parse(raw) as DB) : emptyDb();
  return cache;
}

export function saveDb(db: DB = loadDb()): void {
  ensureDirs();
  const tmp = `${DB_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(db, null, 2), "utf-8");
  renameSync(tmp, DB_PATH);
  cache = db;
}

export function mediaPathFor(sermonId: string, filename: string): string {
  const dir = join(MEDIA_DIR, sermonId);
  mkdirSync(dir, { recursive: true });
  return join(dir, filename);
}

export function dirnameOf(path: string): string {
  return dirname(path);
}
