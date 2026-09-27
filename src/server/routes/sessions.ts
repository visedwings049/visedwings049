import { Router } from "express";
import { getKeywordsForSermon, mediaUrlFor } from "../../core/sermonService.js";
import { endSession, getSession, goLive, setStreamUrl, startSession } from "../../core/sessionService.js";
import { broadcast } from "../ws/hub.js";

export const sessionsRouter = Router();

sessionsRouter.post("/sessions", (req, res) => {
  const { sermonId, streamUrl } = req.body ?? {};
  if (!sermonId || typeof sermonId !== "string") {
    res.status(400).json({ error: "sermonId is required" });
    return;
  }
  res.status(201).json(startSession(sermonId, typeof streamUrl === "string" ? streamUrl : undefined));
});

sessionsRouter.get("/sessions/:id", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const keywords = getKeywordsForSermon(session.sermonId).map((k) => ({
    ...k,
    videoUrl: mediaUrlFor(session.sermonId, k.videoPath),
  }));
  res.json({ ...session, keywords });
});

sessionsRouter.put("/sessions/:id/stream-url", (req, res) => {
  const { streamUrl } = req.body ?? {};
  if (typeof streamUrl !== "string") {
    res.status(400).json({ error: "streamUrl is required" });
    return;
  }
  try {
    res.json(setStreamUrl(req.params.id, streamUrl));
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

sessionsRouter.post("/sessions/:id/go-live", (req, res) => {
  try {
    const session = goLive(req.params.id);
    broadcast(session.id, { type: "session_live" });
    res.json(session);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// A focused, stable read for other local processes ("bridge" tooling) to poll -
// just the stream URL and transcript, without the rest of the session/keyword payload.
sessionsRouter.get("/sessions/:id/transcript", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({
    sessionId: session.id,
    sermonId: session.sermonId,
    status: session.status,
    streamUrl: session.streamUrl,
    transcript: session.transcript,
  });
});

sessionsRouter.post("/sessions/:id/end", (req, res) => {
  try {
    const session = endSession(req.params.id);
    broadcast(session.id, { type: "session_ended" });
    res.json(session);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});
