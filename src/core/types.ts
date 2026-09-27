export type VideoStatus = "pending" | "generating" | "ready" | "error";

export interface Keyword {
  id: string;
  sermonId: string;
  phrase: string;
  aliases: string[];
  contextSnippet: string;
  animationPrompt: string;
  model: string;
  duration: number;
  aspectRatio: string;
  videoStatus: VideoStatus;
  videoPath?: string;
  order: number;
}

export interface SermonSegment {
  type: "text" | "keyword";
  text: string;
  keywordId?: string;
}

export interface Sermon {
  id: string;
  title: string;
  rawNotes: string;
  style: string;
  segments: SermonSegment[];
  createdAt: string;
  updatedAt: string;
}

export interface SessionLogEntry {
  ts: string;
  keywordId: string;
  phrase: string;
  source: "auto" | "manual";
  matchedText?: string;
  index: number;
}

export interface LiveSession {
  id: string;
  sermonId: string;
  status: "idle" | "live" | "ended";
  pointer: number;
  startedAt?: string;
  endedAt?: string;
  log: SessionLogEntry[];
}

export interface DB {
  sermons: Sermon[];
  keywords: Keyword[];
  sessions: LiveSession[];
}

export interface ManifestEntry {
  keywordId: string;
  phrase: string;
  order: number;
  prompt: string;
  model: string;
  duration: number;
  aspectRatio: string;
  outputFile: string;
}

export interface Manifest {
  sermonId: string;
  sermonTitle: string;
  generatedAt: string;
  style: string;
  entries: ManifestEntry[];
  instructions: string;
}

export interface ManifestResult {
  keywordId?: string;
  phrase?: string;
  videoPath?: string;
  videoUrl?: string;
}
