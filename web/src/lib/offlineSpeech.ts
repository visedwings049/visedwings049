import { createModel, type Model } from "vosk-browser";

export interface OfflineSpeechHandle {
  stop: () => void;
}

export type OfflineStatus = "loading" | "listening" | "stopped" | "error";

export interface OfflineSpeechOptions {
  modelUrl: string;
  /** Restricts recognition to this vocabulary (see buildVoskGrammar). Falls back to open decoding if omitted. */
  grammar?: string[];
  sampleRate?: number;
}

// A Vosk model spawns a Web Worker and can be tens of MB; keep one alive
// across start/stop toggles within a session instead of reloading it.
let cached: { url: string; model: Model } | null = null;

async function loadModel(modelUrl: string): Promise<Model> {
  if (cached?.url === modelUrl) return cached.model;
  if (cached) cached.model.terminate();
  const model = await createModel(modelUrl);
  cached = { url: modelUrl, model };
  return model;
}

export async function startOfflineListening(
  options: OfflineSpeechOptions,
  onChunk: (text: string, isFinal: boolean) => void,
  onStatus: (status: OfflineStatus, detail?: string) => void
): Promise<OfflineSpeechHandle> {
  const noop: OfflineSpeechHandle = { stop: () => {} };
  onStatus("loading", `Loading offline model from ${options.modelUrl}…`);

  let model: Model;
  try {
    model = await loadModel(options.modelUrl);
  } catch (err) {
    onStatus(
      "error",
      `Couldn't load offline model at ${options.modelUrl}. Download a Vosk model and set its URL in Settings. (${
        (err as Error).message
      })`
    );
    return noop;
  }

  const sampleRate = options.sampleRate ?? 16000;
  const grammar = options.grammar && options.grammar.length > 0 ? JSON.stringify(options.grammar) : undefined;
  const recognizer = new model.KaldiRecognizer(sampleRate, grammar);
  recognizer.setWords(false);

  recognizer.on("result", (message) => {
    if (message.event === "result") onChunk(message.result.text, true);
  });
  recognizer.on("partialresult", (message) => {
    if (message.event === "partialresult") onChunk(message.result.partial, false);
  });
  recognizer.on("error", (message) => {
    if (message.event === "error") onStatus("error", message.error);
  });

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1, sampleRate },
    });
  } catch (err) {
    recognizer.remove();
    onStatus("error", `Microphone access denied: ${(err as Error).message}`);
    return noop;
  }

  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  // ScriptProcessorNode must reach the destination for onaudioprocess to
  // fire reliably; route through a silent gain node to avoid mic feedback.
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const silence = audioContext.createGain();
  silence.gain.value = 0;

  processor.onaudioprocess = (event) => {
    try {
      const channelData = event.inputBuffer.getChannelData(0);
      recognizer.acceptWaveformFloat(new Float32Array(channelData), audioContext.sampleRate);
    } catch {
      // drop a bad frame rather than killing the whole session
    }
  };

  source.connect(processor);
  processor.connect(silence);
  silence.connect(audioContext.destination);

  onStatus("listening");

  let stopped = false;
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      processor.disconnect();
      source.disconnect();
      silence.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      audioContext.close();
      recognizer.remove();
      onStatus("stopped");
    },
  };
}
