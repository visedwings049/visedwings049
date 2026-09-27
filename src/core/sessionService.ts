import { randomUUID } from "node:crypto";
import { getKeywordsForSermon, mediaUrlFor } from "./sermonService.js";
import { loadDb, saveDb } from "./store.js";
import type { LiveSession } from "./types.js";

/** Creates a session in "idle" (pre-show setup) status; call goLive() to start it. */
export function startSession(sermonId: string, streamUrl?: string): LiveSession {
  const db = loadDb();
  const session: LiveSession = {
    id: randomUUID(),
    sermonId,
    status: "idle",
    pointer: 0,
    streamUrl,
    log: [],
    transcript: [],
  };
  db.sessions.push(session);
  saveDb(db);
  return session;
}

export function getSession(sessionId: string): LiveSession | undefined {
  return loadDb().sessions.find((s) => s.id === sessionId);
}

/** Settable any time before the session ends - e.g. filled in during pre-show setup. */
export function setStreamUrl(sessionId: string, streamUrl: string): LiveSession {
  const db = loadDb();
  const session = db.sessions.find((s) => s.id === sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  session.streamUrl = streamUrl;
  saveDb(db);
  return session;
}

/** Transitions an idle session to live, enabling triggers. */
export function goLive(sessionId: string): LiveSession {
  const db = loadDb();
  const session = db.sessions.find((s) => s.id === sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  if (session.status !== "idle") throw new Error(`Session is already ${session.status}`);
  session.status = "live";
  session.startedAt = new Date().toISOString();
  saveDb(db);
  return session;
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

/** Appends one final (non-partial) live-listener transcript chunk. */
export function appendTranscript(sessionId: string, text: string): LiveSession {
  const db = loadDb();
  const session = db.sessions.find((s) => s.id === sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  const trimmed = text.trim();
  if (trimmed) session.transcript.push({ ts: new Date().toISOString(), text: trimmed });
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
