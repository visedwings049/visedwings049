import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { getSession, triggerKeywordAtIndex } from "../../core/sessionService.js";

export type Role = "control" | "display";

interface Client {
  ws: WebSocket;
  sessionId: string;
  role: Role;
}

const clients = new Set<Client>();

export function attachHub(wss: WebSocketServer): void {
  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const sessionId = url.searchParams.get("sessionId") ?? "";
    const role = (url.searchParams.get("role") as Role) ?? "display";
    if (!sessionId) {
      ws.close(1008, "sessionId is required");
      return;
    }
    const client: Client = { ws, sessionId, role };
    clients.add(client);
    ws.send(JSON.stringify({ type: "hello", sessionId, role }));

    ws.on("message", (raw) => {
      let msg: { type?: string; index?: number; matchedText?: string; source?: "auto" | "manual" };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.type === "trigger" && typeof msg.index === "number") {
        try {
          const session = getSession(sessionId);
          if (!session || session.status !== "live") return;
          const source = msg.source === "manual" ? "manual" : "auto";
          const result = triggerKeywordAtIndex(sessionId, msg.index, source, msg.matchedText);
          broadcast(sessionId, {
            type: "play",
            index: msg.index,
            keywordId: result.keywordId,
            phrase: result.phrase,
            videoUrl: result.videoUrl,
            pointer: result.session.pointer,
            source,
          });
        } catch (err) {
          ws.send(JSON.stringify({ type: "error", message: (err as Error).message }));
        }
      }
    });

    ws.on("close", () => clients.delete(client));
    ws.on("error", () => clients.delete(client));
  });
}

export function broadcast(sessionId: string, message: unknown, roles?: Role[]): void {
  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client.sessionId !== sessionId) continue;
    if (roles && !roles.includes(client.role)) continue;
    if (client.ws.readyState === client.ws.OPEN) client.ws.send(payload);
  }
}
