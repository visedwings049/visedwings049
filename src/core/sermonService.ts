import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import { generatePromptWithOfflineModel } from "./offlineModel.js";
import { contextSnippetFor, parseNotes, slugify } from "./parser.js";
import { DEFAULT_ASPECT_RATIO, DEFAULT_DURATION, DEFAULT_MODEL, buildDefaultPrompt } from "./promptBuilder.js";
import { loadDb, mediaPathFor, saveDb } from "./store.js";
import type { Keyword, Manifest, ManifestResult, Sermon } from "./types.js";

export function listSermons(): Sermon[] {
  return loadDb().sermons;
}

export function getSermon(id: string): Sermon | undefined {
  return loadDb().sermons.find((s) => s.id === id);
}

export function getKeywordsForSermon(sermonId: string): Keyword[] {
  return loadDb()
    .keywords.filter((k) => k.sermonId === sermonId)
    .sort((a, b) => a.order - b.order);
}

export function createSermon(title: string, style = ""): Sermon {
  const db = loadDb();
  const now = new Date().toISOString();
  const sermon: Sermon = {
    id: randomUUID(),
    title,
    rawNotes: "",
    style,
    segments: [],
    createdAt: now,
    updatedAt: now,
  };
  db.sermons.push(sermon);
  saveDb(db);
  return sermon;
}

/**
 * Re-parses rawNotes for [[phrase]] markers, reconciling against existing
 * keyword records so manual prompt edits and generated videos survive edits
 * to the surrounding notes text (matched by phrase, case-insensitive).
 */
export function setSermonNotes(sermonId: string, rawNotes: string): { sermon: Sermon; keywords: Keyword[] } {
  const db = loadDb();
  const sermon = db.sermons.find((s) => s.id === sermonId);
  if (!sermon) throw new Error(`Sermon not found: ${sermonId}`);

  const { segments, phrases } = parseNotes(rawNotes);
  const existing = db.keywords.filter((k) => k.sermonId === sermonId);
  const existingByPhrase = new Map(existing.map((k) => [k.phrase.toLowerCase(), k]));
  const keptIds = new Set<string>();
  const nextKeywords: Keyword[] = [];

  phrases.forEach(({ phrase, promptOverride, order }) => {
    const prior = existingByPhrase.get(phrase.toLowerCase());
    const context = contextSnippetFor(rawNotes, phrase);
    if (prior) {
      keptIds.add(prior.id);
      prior.order = order;
      prior.contextSnippet = context;
      if (promptOverride) prior.animationPrompt = promptOverride;
      nextKeywords.push(prior);
    } else {
      const keyword: Keyword = {
        id: randomUUID(),
        sermonId,
        phrase,
        aliases: [],
        contextSnippet: context,
        animationPrompt: promptOverride ?? buildDefaultPrompt(phrase, context, sermon.style),
        model: DEFAULT_MODEL,
        duration: DEFAULT_DURATION,
        aspectRatio: DEFAULT_ASPECT_RATIO,
        videoStatus: "pending",
        order,
      };
      nextKeywords.push(keyword);
    }
  });

  // Resolve segment keyword text back to keyword ids for the transcript view.
  const byPhrase = new Map(nextKeywords.map((k) => [k.phrase, k]));
  for (const seg of segments) {
    if (seg.type === "keyword") {
      const kw = byPhrase.get(seg.text);
      if (kw) seg.keywordId = kw.id;
    }
  }

  db.keywords = [...db.keywords.filter((k) => k.sermonId !== sermonId), ...nextKeywords];
  sermon.rawNotes = rawNotes;
  sermon.segments = segments;
  sermon.updatedAt = new Date().toISOString();
  saveDb(db);
  return { sermon, keywords: nextKeywords };
}

export function setSermonStyle(sermonId: string, style: string): Sermon {
  const db = loadDb();
  const sermon = db.sermons.find((s) => s.id === sermonId);
  if (!sermon) throw new Error(`Sermon not found: ${sermonId}`);
  sermon.style = style;
  sermon.updatedAt = new Date().toISOString();
  saveDb(db);
  return sermon;
}

export function updateKeyword(
  keywordId: string,
  patch: Partial<Pick<Keyword, "animationPrompt" | "model" | "duration" | "aspectRatio" | "aliases">>
): Keyword {
  const db = loadDb();
  const keyword = db.keywords.find((k) => k.id === keywordId);
  if (!keyword) throw new Error(`Keyword not found: ${keywordId}`);
  Object.assign(keyword, patch);
  saveDb(db);
  return keyword;
}

/**
 * Redrafts one keyword's animation prompt: "template" (default, deterministic,
 * offline, no dependencies) or "offline-model" (a local Ollama LLM — offline,
 * but requires Ollama running; see core/offlineModel.ts).
 */
export async function regenerateKeywordPrompt(
  keywordId: string,
  mode: "template" | "offline-model" = "template"
): Promise<Keyword> {
  const db = loadDb();
  const keyword = db.keywords.find((k) => k.id === keywordId);
  if (!keyword) throw new Error(`Keyword not found: ${keywordId}`);
  const style = db.sermons.find((s) => s.id === keyword.sermonId)?.style ?? "";

  keyword.animationPrompt =
    mode === "offline-model"
      ? await generatePromptWithOfflineModel(keyword.phrase, keyword.contextSnippet, style)
      : buildDefaultPrompt(keyword.phrase, keyword.contextSnippet, style);

  saveDb(db);
  return keyword;
}

export function buildManifest(sermonId: string): Manifest {
  const sermon = getSermon(sermonId);
  if (!sermon) throw new Error(`Sermon not found: ${sermonId}`);
  const keywords = getKeywordsForSermon(sermonId);
  const pending = keywords.filter((k) => k.videoStatus !== "ready");
  return {
    sermonId,
    sermonTitle: sermon.title,
    generatedAt: new Date().toISOString(),
    style: sermon.style,
    entries: pending.map((k) => ({
      keywordId: k.id,
      phrase: k.phrase,
      order: k.order,
      prompt: k.animationPrompt,
      model: k.model,
      duration: k.duration,
      aspectRatio: k.aspectRatio,
      outputFile: `${slugify(k.phrase)}.mp4`,
    })),
    instructions:
      "For each entry, generate a short looping video with Higgsfield AI (e.g. via a Claude Code session with the " +
      "Higgsfield MCP tools: call generate_video with { model, prompt, duration, aspect_ratio }), save the result, " +
      "then run `prophet-sniper manifest import --sermon <sermonId> --file results.json` with an array of " +
      "{ keywordId, videoPath | videoUrl } to load the videos back into this sermon.",
  };
}

export function importManifestResults(sermonId: string, results: ManifestResult[]): Keyword[] {
  const db = loadDb();
  const updated: Keyword[] = [];
  for (const result of results) {
    const keyword = db.keywords.find(
      (k) =>
        k.sermonId === sermonId &&
        ((result.keywordId && k.id === result.keywordId) ||
          (result.phrase && k.phrase.toLowerCase() === result.phrase.toLowerCase()))
    );
    if (!keyword) continue;
    if (result.videoPath) {
      if (!existsSync(result.videoPath)) {
        throw new Error(`Video file not found: ${result.videoPath}`);
      }
      const filename = isAbsolute(result.videoPath) ? basename(result.videoPath) : basename(result.videoPath);
      const dest = mediaPathFor(sermonId, `${slugify(keyword.phrase)}${extOf(filename)}`);
      copyFileSync(result.videoPath, dest);
      keyword.videoPath = dest;
      keyword.videoStatus = "ready";
    } else if (result.videoUrl) {
      keyword.videoPath = result.videoUrl;
      keyword.videoStatus = "ready";
    }
    updated.push(keyword);
  }
  saveDb(db);
  return updated;
}

function extOf(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? ".mp4" : filename.slice(idx);
}

export function mediaUrlFor(sermonId: string, videoPath: string | undefined): string | undefined {
  if (!videoPath) return undefined;
  if (/^https?:\/\//.test(videoPath)) return videoPath;
  return `/media/${sermonId}/${basename(videoPath)}`;
}

export function joinDataMedia(sermonId: string, filename: string): string {
  return join(sermonId, filename);
}
