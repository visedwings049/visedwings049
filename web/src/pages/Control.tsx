import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { buildVoskGrammar, matchNext } from "../lib/matcher";
import { startOfflineListening, type OfflineStatus } from "../lib/offlineSpeech";
import { isSpeechRecognitionSupported, startListening } from "../lib/speech";
import type { Keyword, LiveSession, Sermon } from "../lib/types";
import { connectSession, type ServerMessage } from "../lib/ws";

const TRIGGER_COOLDOWN_MS = 1500;
const MODEL_URL_STORAGE_KEY = "prophetSniper.voskModelUrl";
const DEFAULT_MODEL_URL = "/models/vosk-model-small-en-us-0.15.tar.gz";

type MicMode = "offline" | "browser";
type MicStatus = OfflineStatus | "idle";

interface ListenHandle {
  stop: () => void;
}

export function Control() {
  const { sermonId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const [sermon, setSermon] = useState<Sermon | null>(null);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [pointer, setPointer] = useState(0);
  const [micMode, setMicMode] = useState<MicMode>("offline");
  const [modelUrl, setModelUrl] = useState(() => localStorage.getItem(MODEL_URL_STORAGE_KEY) ?? DEFAULT_MODEL_URL);
  const [micStatus, setMicStatus] = useState<MicStatus>("idle");
  const [micDetail, setMicDetail] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [log, setLog] = useState<LiveSession["log"]>([]);
  const [transcript, setTranscript] = useState<LiveSession["transcript"]>([]);
  const [streamUrlDraft, setStreamUrlDraft] = useState("");
  const [streamUrlStatus, setStreamUrlStatus] = useState("");

  const wsRef = useRef<ReturnType<typeof connectSession> | null>(null);
  const speechRef = useRef<ListenHandle | null>(null);
  const cancelStartRef = useRef(false);
  const pointerRef = useRef(0);
  const lastTriggerRef = useRef<{ index: number; at: number }>({ index: -1, at: 0 });

  useEffect(() => {
    pointerRef.current = pointer;
  }, [pointer]);

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
      setTranscript(s.transcript);
      setStreamUrlDraft(s.streamUrl ?? "");
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
      } else if (msg.type === "transcript") {
        setTranscript((prev) => [...prev, { ts: new Date().toISOString(), text: msg.text }]);
      } else if (msg.type === "session_live") {
        setSession((prev) => (prev ? { ...prev, status: "live" } : prev));
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
  const grammar = useMemo(() => buildVoskGrammar(orderedKeywords), [orderedKeywords]);

  function fireTrigger(index: number, source: "auto" | "manual", matchedText?: string) {
    const now = Date.now();
    if (source === "auto" && lastTriggerRef.current.index === index && now - lastTriggerRef.current.at < TRIGGER_COOLDOWN_MS) {
      return;
    }
    lastTriggerRef.current = { index, at: now };
    wsRef.current?.sendTrigger(index, source, matchedText);
  }

  function handleChunk(text: string, isFinal: boolean) {
    setLiveTranscript(text);
    const match = matchNext(text, orderedKeywords, pointerRef.current, 2);
    if (match) fireTrigger(match.index, "auto", match.matchedText);
    if (isFinal) wsRef.current?.sendTranscript(text);
  }

  function persistModelUrl(url: string) {
    setModelUrl(url);
    localStorage.setItem(MODEL_URL_STORAGE_KEY, url);
  }

  async function toggleMic() {
    if (micStatus === "loading") {
      // Cancel a still-loading offline model; the handle is stopped once it resolves.
      cancelStartRef.current = true;
      setMicStatus("idle");
      return;
    }
    if (speechRef.current) {
      speechRef.current.stop();
      speechRef.current = null;
      setMicStatus("idle");
      return;
    }
    if (micMode === "offline") {
      cancelStartRef.current = false;
      setMicStatus("loading");
      const handle = await startOfflineListening(
        { modelUrl, grammar },
        (text, isFinal) => handleChunk(text, isFinal),
        (status, detail) => {
          setMicStatus(status);
          setMicDetail(detail ?? "");
        }
      );
      if (cancelStartRef.current) handle.stop();
      else speechRef.current = handle;
    } else {
      speechRef.current = startListening(
        (text, isFinal) => handleChunk(text, isFinal),
        (status, detail) => {
          setMicStatus(status);
          setMicDetail(detail ?? "");
        }
      );
    }
  }

  async function handleEndSession() {
    if (!session) return;
    speechRef.current?.stop();
    speechRef.current = null;
    const ended = await api.endSession(session.id);
    setSession(ended);
  }

  async function handleSaveStreamUrl() {
    if (!session) return;
    setStreamUrlStatus("Saving…");
    const updated = await api.setStreamUrl(session.id, streamUrlDraft);
    setSession(updated);
    setStreamUrlStatus("Saved.");
  }

  async function handleGoLive() {
    if (!session) return;
    const live = await api.goLive(session.id);
    setSession(live);
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
        <h3>Pre-show setup{session.status !== "idle" && <span className="muted"> (locked in — session is {session.status})</span>}</h3>
        <div className="row">
          <span className="muted">Live stream URL:</span>
          <input
            style={{ flex: 1, minWidth: 260 }}
            placeholder="https://youtube.com/watch?v=... or an RTMP URL"
            value={streamUrlDraft}
            onChange={(e) => setStreamUrlDraft(e.target.value)}
          />
          <button className="secondary" onClick={handleSaveStreamUrl}>
            Save
          </button>
          {streamUrlStatus && <span className="muted">{streamUrlStatus}</span>}
        </div>
        <p className="muted" style={{ marginTop: 6 }}>
          Stored alongside the session for later bridging into a live audio/video source — not used by this app yet.
        </p>
        {session.status === "idle" && (
          <div className="row" style={{ marginTop: 10 }}>
            <button onClick={handleGoLive}>Go Live</button>
          </div>
        )}
      </div>

      <div className="panel">
        <h3>Live listener</h3>
        <div className="row" style={{ marginBottom: 10 }}>
          <label>
            <input
              type="radio"
              name="micMode"
              checked={micMode === "offline"}
              disabled={!!speechRef.current}
              onChange={() => setMicMode("offline")}
            />{" "}
            Offline (Vosk, runs on-device, no internet needed)
          </label>
          <label>
            <input
              type="radio"
              name="micMode"
              checked={micMode === "browser"}
              disabled={!!speechRef.current}
              onChange={() => setMicMode("browser")}
            />{" "}
            Browser speech recognition (sends audio to the cloud, needs internet)
          </label>
        </div>
        {micMode === "offline" && (
          <div className="row" style={{ marginBottom: 10 }}>
            <span className="muted">Model URL:</span>
            <input
              style={{ flex: 1, minWidth: 260 }}
              value={modelUrl}
              disabled={!!speechRef.current}
              onChange={(e) => persistModelUrl(e.target.value)}
            />
          </div>
        )}
        {micMode === "browser" && !isSpeechRecognitionSupported() && (
          <p className="muted">Browser speech recognition isn't supported here — switch to Offline, or use manual triggers below.</p>
        )}
        <div className="row">
          <button onClick={toggleMic} disabled={session.status !== "live"}>
            {speechRef.current ? "Stop listening" : micStatus === "loading" ? "Cancel (loading model…)" : "Start listening"}
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

      <div className="panel">
        <h3>Transcript ({transcript.length} entries)</h3>
        {transcript.length === 0 && <p className="muted">Nothing transcribed yet.</p>}
        {transcript
          .slice()
          .reverse()
          .map((entry, i) => (
            <div className="log-line" key={i}>
              {new Date(entry.ts).toLocaleTimeString()} — {entry.text}
            </div>
          ))}
      </div>
    </div>
  );
}
