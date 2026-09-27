import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";

type FfmpegProcess = ChildProcessByStdio<null, Readable, null>;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Reads whatever is currently buffered on the stream, or null once it ends/errors. */
function readChunk(stream: NodeJS.ReadableStream): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const onReadable = () => {
      cleanup();
      resolve(stream.read() as Buffer | null);
    };
    const onEnd = () => {
      cleanup();
      resolve(null);
    };
    const onError = () => {
      cleanup();
      resolve(null);
    };
    function cleanup() {
      stream.off("readable", onReadable);
      stream.off("end", onEnd);
      stream.off("error", onError);
    }
    stream.once("readable", onReadable);
    stream.once("end", onEnd);
    stream.once("error", onError);
  });
}

/**
 * Decodes a looping video (or an ffmpeg `lavfi` generator, e.g. an idle solid
 * color) into a continuous stream of fixed-size raw BGRA frames, via a
 * spawned ffmpeg process. `setSource` can be called at any time — mid-read —
 * to hard-cut to a new source; the previous ffmpeg process is killed and the
 * pull loop in `nextFrame` picks up the new one on its next iteration.
 */
export class VideoLoopSource {
  private readonly frameSize: number;
  private proc: FfmpegProcess | null = null;
  private buffered = Buffer.alloc(0);

  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly fps: number
  ) {
    this.frameSize = width * height * 4; // BGRA
  }

  /**
   * @param input A local file path/URL for `isLavfi: false` (looped via
   *   `-stream_loop -1 -re`), or an ffmpeg `lavfi` source string (e.g.
   *   `color=c=black:s=1280x720:r=30`) for `isLavfi: true`.
   */
  setSource(input: string, isLavfi: boolean): void {
    const previous = this.proc;
    this.proc = null;
    if (previous) {
      previous.stdout.removeAllListeners();
      previous.kill("SIGKILL");
    }

    const inputArgs = isLavfi ? ["-f", "lavfi", "-i", input] : ["-stream_loop", "-1", "-re", "-i", input];
    const proc = spawn(
      "ffmpeg",
      [
        ...inputArgs,
        "-vf",
        `scale=${this.width}:${this.height},fps=${this.fps}`,
        "-pix_fmt",
        "bgra",
        "-f",
        "rawvideo",
        "-loglevel",
        "error",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "inherit"] }
    );
    proc.on("error", (err) => {
      console.error(`ffmpeg failed to start (is it installed?): ${err.message}`);
    });
    this.proc = proc;
    this.buffered = Buffer.alloc(0);
  }

  stop(): void {
    const proc = this.proc;
    this.proc = null;
    if (proc) {
      proc.stdout.removeAllListeners();
      proc.kill("SIGKILL");
    }
  }

  /** Pulls the next complete frame from whichever source is currently active. */
  async nextFrame(): Promise<Buffer> {
    for (;;) {
      const proc = this.proc;
      if (!proc) {
        await delay(20);
        continue;
      }
      if (this.buffered.length >= this.frameSize) {
        const frame = Buffer.from(this.buffered.subarray(0, this.frameSize));
        this.buffered = this.buffered.subarray(this.frameSize);
        return frame;
      }
      const chunk = await readChunk(proc.stdout);
      if (chunk === null) {
        // Either this process was just superseded by setSource(), or ffmpeg
        // exited unexpectedly. Either way, loop around and re-check this.proc.
        await delay(20);
        continue;
      }
      this.buffered = Buffer.concat([this.buffered, chunk]);
    }
  }
}
