import { Router } from "express";
import { getKeywordsForSermon, mediaUrlFor } from "../../core/sermonService.js";
import { endSession, getSession, startSession } from "../../core/sessionService.js";
import { broadcast } from "../ws/hub.js";

export const sessionsRouter = Router();

sessionsRouter.post("/sessions", (req, res) => {
  const { sermonId } = req.body ?? {};
  if (!sermonId || typeof sermonId !== "string") {
    res.status(400).json({ error: "sermonId is required" });
    return;
  }
  res.status(201).json(startSession(sermonId));
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

sessionsRouter.post("/sessions/:id/end", (req, res) => {
  try {
    const session = endSession(req.params.id);
    broadcast(session.id, { type: "session_ended" });
    res.json(session);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});
