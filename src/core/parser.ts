import type { SermonSegment } from "./types.js";

export interface ParsedPhrase {
  phrase: string;
  promptOverride?: string;
  order: number;
}

export interface ParsedNotes {
  segments: SermonSegment[];
  phrases: ParsedPhrase[];
}

// Trigger phrases are wrapped like [[peace]] or, with a custom animation
// prompt, [[peace|a dove gliding over a still lake, golden hour]].
const MARKER_RE = /\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g;

export function parseNotes(rawNotes: string): ParsedNotes {
  const segments: SermonSegment[] = [];
  const phrases: ParsedPhrase[] = [];
  let lastIndex = 0;
  let order = 0;
  let match: RegExpExecArray | null;

  MARKER_RE.lastIndex = 0;
  while ((match = MARKER_RE.exec(rawNotes)) !== null) {
    const [full, rawPhrase, rawPromptOverride] = match;
    const start = match.index;
    if (start > lastIndex) {
      const text = rawNotes.slice(lastIndex, start);
      if (text.trim().length > 0) segments.push({ type: "text", text });
    }
    const phrase = rawPhrase.trim();
    const promptOverride = rawPromptOverride?.trim() || undefined;
    segments.push({ type: "keyword", text: phrase });
    phrases.push({ phrase, promptOverride, order: order++ });
    lastIndex = start + full.length;
  }
  if (lastIndex < rawNotes.length) {
    const text = rawNotes.slice(lastIndex);
    if (text.trim().length > 0) segments.push({ type: "text", text });
  }
  return { segments, phrases };
}

export function contextSnippetFor(rawNotes: string, phrase: string, radius = 60): string {
  // Strip markers down to their bare phrase text first, so slicing never
  // cuts a marker in half and leaves stray "[[" / "|prompt]]" fragments.
  const cleaned = rawNotes.replace(MARKER_RE, "$1");
  const idx = cleaned.indexOf(phrase);
  if (idx === -1) return "";
  const start = Math.max(0, idx - radius);
  const end = Math.min(cleaned.length, idx + radius);
  return cleaned.slice(start, end).replace(/\s+/g, " ").trim();
}

export function slugify(phrase: string): string {
  return (
    phrase
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "keyword"
  );
}
