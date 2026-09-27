import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { Keyword, Sermon } from "../lib/types";

const MODELS = ["seedance_2_5", "kling3_0", "minimax_h3"];
const ASPECTS = ["16:9", "9:16", "1:1"];

function statusBadge(status: Keyword["videoStatus"]) {
  return <span className={`badge ${status}`}>{status}</span>;
}

export function Editor() {
  const [sermons, setSermons] = useState<Sermon[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sermon, setSermon] = useState<Sermon | null>(null);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [notesDraft, setNotesDraft] = useState("");
  const [styleDraft, setStyleDraft] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    api.listSermons().then(setSermons).catch((e) => setStatus(String(e)));
  }, []);

  useEffect(() => {
    if (!activeId) return;
    api.getSermon(activeId).then((s) => {
      setSermon(s);
      setKeywords(s.keywords ?? []);
      setNotesDraft(s.rawNotes);
      setStyleDraft(s.style);
    });
  }, [activeId]);

  async function handleCreate() {
    if (!newTitle.trim()) return;
    const s = await api.createSermon(newTitle.trim(), "");
    setSermons((prev) => [...prev, s]);
    setActiveId(s.id);
    setNewTitle("");
  }

  async function handleSaveNotes() {
    if (!activeId) return;
    setStatus("Saving...");
    const { sermon: s, keywords: kws } = await api.setNotes(activeId, notesDraft);
    setSermon(s);
    setKeywords(kws);
    setStatus("Saved.");
  }

  async function handleSaveStyle() {
    if (!activeId) return;
    await api.setStyle(activeId, styleDraft);
    setStatus("Style saved. Re-save notes to regenerate default prompts for pending keywords.");
  }

  async function handleKeywordChange(id: string, patch: Partial<Keyword>) {
    const updated = await api.updateKeyword(id, patch);
    setKeywords((prev) => prev.map((k) => (k.id === id ? updated : k)));
  }

  async function handleExportManifest() {
    if (!activeId) return;
    const manifest = await api.getManifest(activeId);
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeId}-manifest.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportResults(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeId) return;
    const text = await file.text();
    const results = JSON.parse(text);
    const updated = await api.importResults(activeId, results.entries ?? results);
    setKeywords((prev) => {
      const byId = new Map(updated.map((k) => [k.id, k]));
      return prev.map((k) => byId.get(k.id) ?? k);
    });
    setStatus(`Imported ${updated.length} video(s).`);
    e.target.value = "";
  }

  return (
    <div className="app">
      <h1>Prophet Sniper — Sermon Graphics</h1>
      <p className="muted">
        Write sermon notes, mark trigger phrases like <code>[[peace]]</code> (or{" "}
        <code>[[peace|a dove gliding over a still lake]]</code> for a custom animation prompt), generate a Higgsfield
        manifest, then run the live session while preaching.
      </p>

      <div className="panel row">
        <select value={activeId ?? ""} onChange={(e) => setActiveId(e.target.value || null)}>
          <option value="">Select a sermon…</option>
          {sermons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <input placeholder="New sermon title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
        <button onClick={handleCreate}>Create sermon</button>
        {status && <span className="muted">{status}</span>}
      </div>

      {sermon && (
        <>
          <div className="panel">
            <h3>Visual style</h3>
            <div className="row">
              <input
                style={{ flex: 1 }}
                placeholder="e.g. warm cinematic worship visuals, golden hour, soft particles"
                value={styleDraft}
                onChange={(e) => setStyleDraft(e.target.value)}
              />
              <button className="secondary" onClick={handleSaveStyle}>
                Save style
              </button>
            </div>
          </div>

          <div className="panel">
            <h3>Sermon notes</h3>
            <textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} />
            <div className="row" style={{ marginTop: 10 }}>
              <button onClick={handleSaveNotes}>Save notes</button>
              <button className="secondary" onClick={handleExportManifest} disabled={keywords.length === 0}>
                Export Higgsfield manifest
              </button>
              <label className="secondary" style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "8px 14px", cursor: "pointer" }}>
                Import results…
                <input type="file" accept="application/json" onChange={handleImportResults} style={{ display: "none" }} />
              </label>
            </div>
          </div>

          <div className="panel">
            <h3>Transcript preview</h3>
            <div className="transcript">
              {sermon.segments.map((seg, i) =>
                seg.type === "keyword" ? (
                  <span className="keyword" key={i}>
                    {seg.text}
                  </span>
                ) : (
                  <span className="text" key={i}>
                    {seg.text}
                  </span>
                )
              )}
            </div>
          </div>

          <div className="panel">
            <h3>Trigger keywords ({keywords.length})</h3>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Phrase</th>
                  <th>Animation prompt</th>
                  <th>Model</th>
                  <th>Dur.</th>
                  <th>Aspect</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {keywords.map((k) => (
                  <tr key={k.id}>
                    <td>{k.order}</td>
                    <td>{k.phrase}</td>
                    <td style={{ minWidth: 320 }}>
                      <textarea
                        style={{ minHeight: 60, width: "100%" }}
                        defaultValue={k.animationPrompt}
                        onBlur={(e) => handleKeywordChange(k.id, { animationPrompt: e.target.value })}
                      />
                    </td>
                    <td>
                      <select defaultValue={k.model} onChange={(e) => handleKeywordChange(k.id, { model: e.target.value })}>
                        {MODELS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        style={{ width: 60 }}
                        defaultValue={k.duration}
                        onBlur={(e) => handleKeywordChange(k.id, { duration: Number(e.target.value) })}
                      />
                    </td>
                    <td>
                      <select
                        defaultValue={k.aspectRatio}
                        onChange={(e) => handleKeywordChange(k.id, { aspectRatio: e.target.value })}
                      >
                        {ASPECTS.map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {statusBadge(k.videoStatus)}
                      {k.videoUrl && (
                        <div>
                          <a href={k.videoUrl} target="_blank" rel="noreferrer">
                            preview
                          </a>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <Link to={`/control/${sermon.id}`}>
              <button>Open live control panel →</button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
