#!/usr/bin/env node
import { Command } from "commander";
import { getKeywordsForSermon } from "../../src/core/sermonService.js";
import { getSession } from "../../src/core/sessionService.js";
import type { Keyword } from "../../src/core/types.js";
import { grandiose } from "./grandioseShim.js";
import { VideoLoopSource } from "./videoLoopSource.js";

function idleLavfi(width: number, height: number, fps: number, color: string): string {
  return `color=c=${color}:s=${width}x${height}:r=${fps}`;
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("prophet-sniper-ndi")
    .description(
      "Broadcasts a live Prophet Sniper session as an NDI video source (no OBS, no browser) - " +
        "connect to it from ProPresenter's Capture > NDI input."
    )
    .requiredOption("--session <id>", "Live session id (see `prophet-sniper session start`)")
    .option("--name <name>", "NDI source name", "Prophet Sniper")
    .option("--ws-url <url>", "Base URL of the running server", "ws://localhost:4000")
    .option("--width <n>", "Output width in pixels", (v) => Number(v), 1280)
    .option("--height <n>", "Output height in pixels", (v) => Number(v), 720)
    .option("--fps <n>", "Output frame rate", (v) => Number(v), 30)
    .parse(process.argv);

  const opts = program.opts<{
    session: string;
    name: string;
    wsUrl: string;
    width: number;
    height: number;
    fps: number;
  }>();

  const session = getSession(opts.session);
  if (!session) {
    console.error(`Session not found: ${opts.session}`);
    process.exitCode = 1;
    return;
  }

  const keywordsById = new Map<string, Keyword>();
  for (const keyword of getKeywordsForSermon(session.sermonId)) keywordsById.set(keyword.id, keyword);
  const notReady = [...keywordsById.values()].filter((k) => k.videoStatus !== "ready");
  if (notReady.length > 0) {
    console.warn(
      `${notReady.length} keyword(s) don't have a generated video yet: ${notReady
        .map((k) => `"${k.phrase}"`)
        .join(", ")}. Triggering one before it's ready will be a no-op.`
    );
  }

  const source = new VideoLoopSource(opts.width, opts.height, opts.fps);
  source.setSource(idleLavfi(opts.width, opts.height, opts.fps, "black"), true);

  const sender = await grandiose.send({ name: opts.name, clockVideo: true });
  console.log(`NDI source "${sender.sourcename()}" is live. Add it in ProPresenter as a Capture > NDI source.`);

  let shuttingDown = false;
  // Deliberately not awaited: this loop only ends via process.exit() in
  // shutdown(), since VideoLoopSource.nextFrame() blocks indefinitely once
  // stopped rather than resolving (nothing left to feed it).
  void (async () => {
    for (;;) {
      if (shuttingDown) return;
      const frame = await source.nextFrame();
      await sender.video({
        xres: opts.width,
        yres: opts.height,
        frameRateN: opts.fps * 1000,
        frameRateD: 1000,
        fourCC: grandiose.FOURCC_BGRA,
        pictureAspectRatio: opts.width / opts.height,
        frameFormatType: grandiose.FORMAT_TYPE_PROGRESSIVE,
        lineStrideBytes: opts.width * 4,
        data: frame,
      });
    }
  })().catch((err: unknown) => {
    if (!shuttingDown) console.error("NDI send loop crashed:", err);
  });

  function connect(): void {
    if (shuttingDown) return;
    const url = `${opts.wsUrl.replace(/\/$/, "")}/ws?sessionId=${encodeURIComponent(opts.session)}&role=display`;
    const ws = new WebSocket(url);

    ws.addEventListener("open", () => console.log(`Connected to ${url}`));
    ws.addEventListener("message", (event) => {
      let msg: { type?: string; keywordId?: string; phrase?: string };
      try {
        msg = JSON.parse(event.data.toString());
      } catch {
        return;
      }
      if (msg.type === "play" && msg.keywordId) {
        const keyword = keywordsById.get(msg.keywordId);
        const input = keyword?.videoPath;
        if (!input) {
          console.warn(`Triggered "${msg.phrase ?? msg.keywordId}" but it has no generated video yet - ignoring.`);
          return;
        }
        console.log(`Now showing: "${msg.phrase ?? keyword.phrase}"`);
        source.setSource(input, false);
      } else if (msg.type === "session_ended") {
        console.log("Session ended - showing idle frame. Ctrl+C to stop the broadcaster.");
        source.setSource(idleLavfi(opts.width, opts.height, opts.fps, "black"), true);
      } else if (msg.type === "error") {
        console.error("Server error:", (msg as { message?: string }).message);
      }
    });
    ws.addEventListener("error", () => {
      // 'close' fires right after; reconnect is handled there.
    });
    ws.addEventListener("close", () => {
      if (shuttingDown) return;
      console.warn("Disconnected from server, retrying in 2s...");
      setTimeout(connect, 2000);
    });
  }
  connect();

  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("\nShutting down NDI broadcaster...");
    source.stop();
    await sender.destroy();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
