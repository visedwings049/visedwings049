import { createServer } from "node:http";
import { join } from "node:path";
import express from "express";
import { WebSocketServer } from "ws";
import { MEDIA_DIR } from "../core/store.js";
import { sermonsRouter } from "./routes/sermons.js";
import { sessionsRouter } from "./routes/sessions.js";
import { attachHub } from "./ws/hub.js";

const PORT = Number(process.env.PORT ?? 4000);

const app = express();
app.use(express.json());
app.use("/media", express.static(MEDIA_DIR));
app.use("/api", sermonsRouter);
app.use("/api", sessionsRouter);

const webDist = join(process.cwd(), "web", "dist");
app.use(express.static(webDist));
app.get(/^\/(?!api|media).*/, (_req, res, next) => {
  res.sendFile(join(webDist, "index.html"), (err) => {
    if (err) next();
  });
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: "internal_error" });
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
attachHub(wss);

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Prophet Sniper sermon graphics server listening on http://localhost:${PORT}`);
});
