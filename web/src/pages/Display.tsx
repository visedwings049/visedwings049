import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { connectSession, type ServerMessage } from "../lib/ws";

export function Display() {
  const { sessionId = "" } = useParams();
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
  const [sources, setSources] = useState<[string | null, string | null]>([null, null]);
  const [idleLabel, setIdleLabel] = useState("Waiting for the live session…");
  const videoRefs = [useRef<HTMLVideoElement>(null), useRef<HTMLVideoElement>(null)];

  useEffect(() => {
    const handle = connectSession(sessionId, "display", (msg: ServerMessage) => {
      if (msg.type === "play") {
        if (!msg.videoUrl) {
          setIdleLabel(msg.phrase);
          return;
        }
        const nextSlot: 0 | 1 = activeSlot === 0 ? 1 : 0;
        setSources((prev) => {
          const copy: [string | null, string | null] = [...prev] as [string | null, string | null];
          copy[nextSlot] = msg.videoUrl!;
          return copy;
        });
        setActiveSlot(nextSlot);
      } else if (msg.type === "session_ended") {
        setIdleLabel("Session ended.");
      }
    });
    return () => handle.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    const ref = videoRefs[activeSlot].current;
    if (ref && sources[activeSlot]) {
      ref.currentTime = 0;
      ref.play().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlot, sources[activeSlot]]);

  const showIdle = !sources[0] && !sources[1];

  return (
    <div className="display-root">
      {[0, 1].map((slot) => (
        <video
          key={slot}
          ref={videoRefs[slot as 0 | 1]}
          className={`display-video ${activeSlot === slot && sources[slot] ? "visible" : ""}`}
          src={sources[slot as 0 | 1] ?? undefined}
          muted
          loop
          playsInline
          autoPlay
        />
      ))}
      {showIdle && <div className="display-idle">{idleLabel}</div>}
    </div>
  );
}
