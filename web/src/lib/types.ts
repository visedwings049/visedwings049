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
  videoUrl?: string;
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
  keywords?: Keyword[];
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
  keywords?: Keyword[];
}
