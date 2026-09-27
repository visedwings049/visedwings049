import type { Keyword, LiveSession, Sermon } from "./types";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listSermons: () => req<Sermon[]>("/sermons"),
  createSermon: (title: string, style: string) =>
    req<Sermon>("/sermons", { method: "POST", body: JSON.stringify({ title, style }) }),
  getSermon: (id: string) => req<Sermon>(`/sermons/${id}`),
  setNotes: (id: string, rawNotes: string) =>
    req<{ sermon: Sermon; keywords: Keyword[] }>(`/sermons/${id}/notes`, {
      method: "PUT",
      body: JSON.stringify({ rawNotes }),
    }),
  setStyle: (id: string, style: string) =>
    req<Sermon>(`/sermons/${id}/style`, { method: "PUT", body: JSON.stringify({ style }) }),
  updateKeyword: (id: string, patch: Partial<Keyword>) =>
    req<Keyword>(`/keywords/${id}`, { method: "PUT", body: JSON.stringify(patch) }),
  regeneratePrompt: (id: string, mode: "template" | "offline-model") =>
    req<Keyword>(`/keywords/${id}/regenerate-prompt`, { method: "POST", body: JSON.stringify({ mode }) }),
  getManifest: (sermonId: string) => req<unknown>(`/sermons/${sermonId}/manifest`),
  importResults: (sermonId: string, results: unknown[]) =>
    req<Keyword[]>(`/sermons/${sermonId}/import-results`, {
      method: "POST",
      body: JSON.stringify({ results }),
    }),
  startSession: (sermonId: string, streamUrl?: string) =>
    req<LiveSession>("/sessions", { method: "POST", body: JSON.stringify({ sermonId, streamUrl }) }),
  getSession: (id: string) => req<LiveSession>(`/sessions/${id}`),
  setStreamUrl: (id: string, streamUrl: string) =>
    req<LiveSession>(`/sessions/${id}/stream-url`, { method: "PUT", body: JSON.stringify({ streamUrl }) }),
  goLive: (id: string) => req<LiveSession>(`/sessions/${id}/go-live`, { method: "POST" }),
  endSession: (id: string) => req<LiveSession>(`/sessions/${id}/end`, { method: "POST" }),
};
