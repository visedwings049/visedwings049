import { randomUUID } from "node:crypto";
import { getKeywordsForSermon, mediaUrlFor } from "./sermonService.js";
import { loadDb, saveDb } from "./store.js";
import type { LiveSession } from "./types.js";

export function startSession(sermonId: string): LiveSession {
  const db = loadDb();
  const session: LiveSession = {
    id: randomUUID(),
    sermonId,
    status: "live",
    pointer: 0,
    startedAt: new Date().toISOString(),
    log: [],
  };
  db.sessions.push(session);
  saveDb(db);
  return session;
}

export function getSession(sessionId: string): LiveSession | undefined {
  return loadDb().sessions.find((s) => s.id === sessionId);
}

export function endSession(sessionId: string): LiveSession {
  const db = loadDb();
  const session = db.sessions.find((s) => s.id === sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  session.status = "ended";
  session.endedAt = new Date().toISOString();
  saveDb(db);
  return session;
}

export interface TriggerResult {
  session: LiveSession;
  keywordId: string;
  phrase: string;
  videoUrl?: string;
}

/** Advances the session pointer to `index + 1` and logs the trigger. */
export function triggerKeywordAtIndex(
  sessionId: string,
  index: number,
  source: "auto" | "manual",
  matchedText?: string
): TriggerResult {
  const db = loadDb();
  const session = db.sessions.find((s) => s.id === sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  const keywords = getKeywordsForSermon(session.sermonId);
  const keyword = keywords[index];
  if (!keyword) throw new Error(`No keyword at index ${index}`);

  session.pointer = Math.max(session.pointer, index + 1);
  session.log.push({
    ts: new Date().toISOString(),
    keywordId: keyword.id,
    phrase: keyword.phrase,
    source,
    matchedText,
    index,
  });
  saveDb(db);
  return {
    session,
    keywordId: keyword.id,
    phrase: keyword.phrase,
    videoUrl: mediaUrlFor(session.sermonId, keyword.videoPath),
  };
}
