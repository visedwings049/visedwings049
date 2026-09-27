import { Router } from "express";
import {
  buildManifest,
  createSermon,
  getKeywordsForSermon,
  getSermon,
  importManifestResults,
  listSermons,
  mediaUrlFor,
  regenerateKeywordPrompt,
  setSermonNotes,
  setSermonStyle,
  updateKeyword,
} from "../../core/sermonService.js";

export const sermonsRouter = Router();

function keywordsWithUrls(sermonId: string) {
  return getKeywordsForSermon(sermonId).map((k) => ({ ...k, videoUrl: mediaUrlFor(sermonId, k.videoPath) }));
}

sermonsRouter.get("/sermons", (_req, res) => {
  res.json(listSermons());
});

sermonsRouter.post("/sermons", (req, res) => {
  const { title, style } = req.body ?? {};
  if (!title || typeof title !== "string") {
    res.status(400).json({ error: "title is required" });
    return;
  }
  res.status(201).json(createSermon(title, typeof style === "string" ? style : ""));
});

sermonsRouter.get("/sermons/:id", (req, res) => {
  const sermon = getSermon(req.params.id);
  if (!sermon) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({ ...sermon, keywords: keywordsWithUrls(sermon.id) });
});

sermonsRouter.put("/sermons/:id/notes", (req, res) => {
  const { rawNotes } = req.body ?? {};
  if (typeof rawNotes !== "string") {
    res.status(400).json({ error: "rawNotes is required" });
    return;
  }
  try {
    const { sermon, keywords } = setSermonNotes(req.params.id, rawNotes);
    res.json({ sermon, keywords: keywords.map((k) => ({ ...k, videoUrl: mediaUrlFor(sermon.id, k.videoPath) })) });
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

sermonsRouter.put("/sermons/:id/style", (req, res) => {
  const { style } = req.body ?? {};
  if (typeof style !== "string") {
    res.status(400).json({ error: "style is required" });
    return;
  }
  try {
    res.json(setSermonStyle(req.params.id, style));
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

sermonsRouter.get("/sermons/:id/keywords", (req, res) => {
  res.json(keywordsWithUrls(req.params.id));
});

sermonsRouter.put("/keywords/:id", (req, res) => {
  const { animationPrompt, model, duration, aspectRatio, aliases } = req.body ?? {};
  try {
    const keyword = updateKeyword(req.params.id, { animationPrompt, model, duration, aspectRatio, aliases });
    res.json({ ...keyword, videoUrl: mediaUrlFor(keyword.sermonId, keyword.videoPath) });
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

sermonsRouter.post("/keywords/:id/regenerate-prompt", async (req, res) => {
  const mode = req.body?.mode === "offline-model" ? "offline-model" : "template";
  try {
    const keyword = await regenerateKeywordPrompt(req.params.id, mode);
    res.json({ ...keyword, videoUrl: mediaUrlFor(keyword.sermonId, keyword.videoPath) });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

sermonsRouter.get("/sermons/:id/manifest", (req, res) => {
  try {
    res.json(buildManifest(req.params.id));
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

sermonsRouter.post("/sermons/:id/import-results", (req, res) => {
  const { results } = req.body ?? {};
  if (!Array.isArray(results)) {
    res.status(400).json({ error: "results must be an array" });
    return;
  }
  try {
    const updated = importManifestResults(req.params.id, results);
    res.json(updated.map((k) => ({ ...k, videoUrl: mediaUrlFor(k.sermonId, k.videoPath) })));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
