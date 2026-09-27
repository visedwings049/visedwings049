export interface SpeechHandle {
  stop: () => void;
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getRecognitionCtor() !== null;
}

/**
 * Continuous mic listening with auto-restart, since Chrome's recognizer
 * silently ends after periods of silence or ~60s even in "continuous" mode.
 */
export function startListening(
  onChunk: (text: string, isFinal: boolean) => void,
  onStatus: (status: "listening" | "stopped" | "error", detail?: string) => void
): SpeechHandle {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    onStatus("error", "Speech recognition is not supported in this browser. Use Chrome, or trigger keywords manually.");
    return { stop: () => {} };
  }

  let stopped = false;
  let recognition: SpeechRecognitionLike | null = null;

  const attach = () => {
    recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        onChunk(result[0].transcript, result.isFinal);
      }
    };
    recognition.onerror = (event: any) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      onStatus("error", event.error);
    };
    recognition.onend = () => {
      if (!stopped) {
        recognition?.start();
      } else {
        onStatus("stopped");
      }
    };
    recognition.start();
    onStatus("listening");
  };

  attach();

  return {
    stop: () => {
      stopped = true;
      recognition?.stop();
    },
  };
}
