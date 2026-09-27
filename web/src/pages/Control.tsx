import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { matchNext } from "../lib/matcher";
import { isSpeechRecognitionSupported, startListening, type SpeechHandle } from "../lib/speech";
import type { Keyword, LiveSession, Sermon } from "../lib/types";
import { connectSession, type ServerMessage } from "../lib/ws";

const TRIGGER_COOLDOWN_MS = 1500;

export function Control() {
  const { sermonId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const [sermon, setSermon] = useState<Sermon | null>(null);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [pointer, setPointer] = useState(0);
  const [micStatus, setMicStatus] = useState<"idle" | "listening" | "stopped" | "error">("idle");
  const [micDetail, setMicDetail] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [log, setLog] = useState<LiveSession["log"]>([]);

  const wsRef = useRef<ReturnType<typeof connectSession> | null>(null);
  const speechRef = useRef<SpeechHandle | null>(null);
  const lastTriggerRef = useRef<{ index: number; at: number }>({ index: -1, at: 0 });

  useEffect(() => {
    api.getSermon(sermonId).then((s) => {
      setSermon(s);
      setKeywords(s.keywords ?? []);
    });
  }, [sermonId]);

  useEffect(() => {
    const existing = searchParams.get("session");
    (existing ? api.getSession(existing) : api.startSession(sermonId)).then((s) => {
      setSession(s);
      setPointer(s.pointer);
      setLog(s.log);
    });
  }, [sermonId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!session) return;
    const handle = connectSession(session.id, "control", (msg: ServerMessage) => {
      if (msg.type === "play") {
        setPointer(msg.pointer);
        setLog((prev) => [
          ...prev,
          { ts: new Date().toISOString(), keywordId: msg.keywordId, phrase: msg.phrase, source: msg.source, index: msg.index },
        ]);
      } else if (msg.type === "session_ended") {
        setSession((prev) => (prev ? { ...prev, status: "ended" } : prev));
      }
    });
    wsRef.current = handle;
    return () => handle.close();
  }, [session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const orderedKeywords = useMemo(
    () => keywords.map((k) => ({ id: k.id, phrase: k.phrase, aliases: k.aliases })),
    [keywords]
  );

  function fireTrigger(index: number, source: "auto" | "manual", matchedText?: string) {
    const now = Date.now();
    if (source === "auto" && lastTriggerRef.current.index === index && now - lastTriggerRef.current.at < TRIGGER_COOLDOWN_MS) {
      return;
    }
    lastTriggerRef.current = { index, at: now };
    wsRef.current?.sendTrigger(index, source, matchedText);
  }

  function handleChunk(text: string) {
    setLiveTranscript(text);
    const match = matchNext(text, orderedKeywords, pointer, 2);
    if (match) fireTrigger(match.index, "auto", match.matchedText);
  }

  function toggleMic() {
    if (speechRef.current) {
      speechRef.current.stop();
      speechRef.current = null;
      setMicStatus("stopped");
      return;
    }
    speechRef.current = startListening(
      (text) => handleChunk(text),
      (status, detail) => {
        setMicStatus(status);
        setMicDetail(detail ?? "");
      }
    );
  }

  async function handleEndSession() {
    if (!session) return;
    speechRef.current?.stop();
    speechRef.current = null;
    const ended = await api.endSession(session.id);
    setSession(ended);
  }

  if (!sermon || !session) return <div className="app">Loading…</div>;

  const displayUrl = `${window.location.origin}/display/${session.id}`;

  return (
    <div className="app">
      <h1>Live control — {sermon.title}</h1>
      <div className="panel row">
        <span>
          Session: <b>{session.status}</b>
        </span>
        <span>
          Display window:{" "}
          <a href={displayUrl} target="_blank" rel="noreferrer">
            {displayUrl}
          </a>
        </span>
        <button className="secondary" onClick={handleEndSession} disabled={session.status === "ended"}>
          End session
        </button>
      </div>

      <div className="panel">
        <h3>Live listener</h3>
        {!isSpeechRecognitionSupported() && (
          <p className="muted">Speech recognition isn't supported in this browser — use manual triggers below (Chrome recommended).</p>
        )}
        <div className="row">
          <button onClick={toggleMic} disabled={session.status !== "live"}>
            {speechRef.current ? "Stop listening" : "Start listening"}
          </button>
          <span className="muted">
            mic: {micStatus} {micDetail}
          </span>
        </div>
        <p className="log-line">{liveTranscript}</p>
      </div>

      <div className="panel">
        <h3>Keywords ({pointer}/{keywords.length} triggered)</h3>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Phrase</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {keywords.map((k, i) => (
              <tr key={k.id}>
                <td>{i}</td>
                <td>{k.phrase}</td>
                <td>
                  {i < pointer ? <span className="badge ready">played</span> : i === pointer ? <span className="badge pending">next up</span> : <span className="muted">—</span>}
                </td>
                <td>
                  <button className="secondary" onClick={() => fireTrigger(i, "manual")} disabled={session.status !== "live" || k.videoStatus !== "ready"}>
                    Play now
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3>Trigger log</h3>
        {log.length === 0 && <p className="muted">Nothing triggered yet.</p>}
        {log
          .slice()
          .reverse()
          .map((entry, i) => (
            <div className="log-line" key={i}>
              {new Date(entry.ts).toLocaleTimeString()} — [{entry.index}] "{entry.phrase}" ({entry.source})
            </div>
          ))}
      </div>
    </div>
  );
}
