export interface PlayMessage {
  type: "play";
  index: number;
  keywordId: string;
  phrase: string;
  videoUrl?: string;
  pointer: number;
  source: "auto" | "manual";
}

export interface TranscriptMessage {
  type: "transcript";
  text: string;
}

export type ServerMessage =
  | PlayMessage
  | TranscriptMessage
  | { type: "session_ended" }
  | { type: "session_live" }
  | { type: "hello" }
  | { type: "error"; message: string };

export function connectSession(sessionId: string, role: "control" | "display", onMessage: (msg: ServerMessage) => void) {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const url = `${protocol}://${window.location.host}/ws?sessionId=${encodeURIComponent(sessionId)}&role=${role}`;
  let socket = new WebSocket(url);
  let closed = false;

  const bind = (ws: WebSocket) => {
    ws.onmessage = (event) => {
      try {
        onMessage(JSON.parse(event.data));
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = () => {
      if (!closed) {
        setTimeout(() => {
          if (!closed) {
            socket = new WebSocket(url);
            bind(socket);
          }
        }, 1500);
      }
    };
  };
  bind(socket);

  return {
    sendTrigger(index: number, source: "auto" | "manual", matchedText?: string) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "trigger", index, source, matchedText }));
      }
    },
    sendTranscript(text: string) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "transcript", text }));
      }
    },
    close() {
      closed = true;
      socket.close();
    },
  };
}
