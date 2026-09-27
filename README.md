# Prophet Sniper — Sermon Graphics

An add-on module for **Prophet Sniper** that turns a pastor's sermon notes into
keyword-triggered, AI-generated looping background videos, displayed live
while the sermon is preached.

**Cost model: the only recurring cost is Higgsfield credits**, spent when you
generate videos. Everything else runs free and offline:

- the live listener defaults to **Vosk**, running entirely on-device (no API
  key, no billing, no per-use cost);
- animation-prompt drafting defaults to a **local template** (no model at
  all), with an optional **local Ollama** model as an alternative — also
  free, no API key, no billing.

Neither of those has a metered/paid mode in this codebase. If a future
change would add one, treat that as a decision to flag, not a default to
reach for.

## How it works

1. **Write sermon notes** in the Editor, marking trigger phrases inline:
   `[[peace]]` or, with a custom animation prompt,
   `[[peace|a dove gliding over a still lake, golden hour]]`.
2. The app parses the notes into a **transcript** of text + trigger-phrase
   segments, and creates a **keyword** record for each phrase (with an
   auto-drafted animation prompt you can edit).
3. Before the sermon, **export a generation manifest** and use it to generate
   short, seamlessly-looping videos with **Higgsfield AI** — the intended path
   is a Claude Code session with the Higgsfield MCP tools enabled (that's the
   "CLI" driving Higgsfield), calling `generate_video` for each manifest
   entry. **Import the results** back in and each keyword is marked `ready`.
4. **Start a live session.** Open the *Control* panel (mic + manual buttons)
   on the pastor's/operator's device and the *Display* window full-screen on
   the sermon screen.
5. While preaching, the live listener matches spoken words against the
   **next expected keyword** in sequence, running **fully offline** by
   default (Vosk, on-device — no audio ever leaves the machine, no internet
   needed). A match — or a manual "Play now" button press — advances the
   session and pushes the matching looping video to the Display window in
   real time over WebSocket.

Sequential matching (rather than matching any keyword anywhere) means the
live listener only listens for whichever phrase comes next in the prepared
outline, which avoids false triggers on unrelated speech. Manual override
buttons are always available as a fallback if speech recognition mishears.

## Project layout

```
src/core/     shared logic: notes parser, prompt builder, keyword matcher,
              JSON-file data store, sermon/session services
src/server/   Express + WebSocket server (REST API, live trigger relay,
              static video hosting)
src/cli/      `prophet-sniper` CLI: manage sermons, export/import Higgsfield
              manifests, run live sessions from the terminal
web/          React + Vite app: Editor, Control, Display pages
```

Data (sermons, keywords, session logs, generated videos) is stored as JSON
plus media files under `data/` (configurable via `PROPHET_SNIPER_DATA_DIR`) —
no database to run.

## Setup

```bash
npm install       # server + CLI deps
cd web && npm install && cd ..
```

## Running it

**Development** (hot reload, Vite dev server proxies `/api` and `/ws` to the
server on port 4000):

```bash
npm run dev:server      # terminal 1 — API + WebSocket server on :4000
cd web && npm run dev   # terminal 2 — Editor/Control/Display on :5173
```

**Production-style** (single server serves the built web app):

```bash
cd web && npm run build && cd ..
npm run build
npm start               # serves everything on :4000
```

## CLI

```bash
npx tsx src/cli/index.ts sermon create -t "Faith Over Fear" -s "warm cinematic worship visuals"
npx tsx src/cli/index.ts sermon notes --sermon <id> --file notes.txt
npx tsx src/cli/index.ts sermon show --sermon <id>

# Pre-sermon: generate graphics via Higgsfield
npx tsx src/cli/index.ts manifest export --sermon <id> -o manifest.json
#  -> hand manifest.json to a Higgsfield-generation workflow (e.g. a Claude
#     Code session with the Higgsfield MCP tools), one generate_video call
#     per entry, saving each result as a local file or URL
npx tsx src/cli/index.ts manifest import --sermon <id> -f results.json
#  results.json: [{ "keywordId": "...", "videoPath": "./alpha.mp4" }, ...]
#  (videoUrl also accepted instead of videoPath)

# Live sermon
npx tsx src/cli/index.ts session start --sermon <id> --base-url http://localhost:4000
npx tsx src/cli/index.ts session status --session <id>
npx tsx src/cli/index.ts session end --session <id>
```

(After `npm run build`, the same commands work via `node dist/cli/index.js`.)

## Notes marker syntax

| Marker | Effect |
| --- | --- |
| `[[phrase]]` | Registers `phrase` as a trigger keyword with an auto-drafted animation prompt (using the sermon's style + surrounding context). |
| `[[phrase\|custom prompt]]` | Same, but with your own Higgsfield prompt instead of the auto-drafted one. |

Editing notes later re-parses them; existing keywords are matched back up by
phrase (case-insensitive) so manual prompt edits, model/duration/aspect-ratio
settings, and already-generated videos are preserved.

## Live listener details

The Control page offers two listening modes:

- **Offline (Vosk, default/recommended)** — speech recognition runs entirely
  on-device via [Vosk](https://alphacephei.com/vosk/) compiled to WebAssembly
  ([`vosk-browser`](https://github.com/ccoreilly/vosk-browser)). No audio
  leaves the machine and no internet connection is needed once the model is
  downloaded — important for venues with unreliable Wi-Fi and for not sending
  a live sermon's audio to a third party.
  - **Setup**: download a Vosk model from
    [alphacephei.com/vosk/models](https://alphacephei.com/vosk/models) (the
    small English model, `vosk-model-small-en-us-0.15`, ~40 MB, is enough for
    keyword spotting) and serve it as a static file — either drop the
    extracted folder under `web/public/models/` (Vite/Express will serve it
    at `/models/...`) or host the `.tar.gz` anywhere reachable and paste that
    URL into the "Model URL" field in Control's Live Listener panel (saved in
    the browser's local storage). Larger models are more accurate but slower
    to load; the small model is intended for exactly this kind of
    limited-vocabulary spotting.
  - Recognition is **grammar-constrained** to this sermon's keyword phrases
    (built from the phrase list + any aliases you set) plus a catch-all
    `[unk]` token — this dramatically improves accuracy for a small offline
    model versus open-vocabulary decoding, since it only ever has to choose
    among the words that actually matter for this sermon.
- **Browser (online)** — the original Web Speech API path (sends audio to
  the browser vendor's cloud STT service). Useful as a fallback or for quick
  testing without downloading a model; requires Chrome (or another
  `SpeechRecognition`-capable browser) and internet.

Either mode only matches against the next 1–2 upcoming keywords (not the
whole keyword list), so the sermon's visuals advance in order rather than
firing on any phrase anywhere in the script. Every trigger (auto or manual)
is relayed over the server's `/ws` endpoint to all Control and Display
clients in that session, and logged. Manual "Play now" buttons are always
available as a fallback if speech recognition mishears.

## Offline animation-prompt drafting

Each keyword's animation prompt is auto-drafted with a deterministic,
zero-dependency **template** (`src/core/promptBuilder.ts`) by default — no
model required. As an alternative, you can redraft any keyword's prompt with
a **local LLM via [Ollama](https://ollama.com)** (also fully offline, no API
key, runs on your own machine):

```bash
ollama serve                       # in one terminal
ollama pull llama3.2                # or another local instruct model
npx tsx src/cli/index.ts keyword regen-prompt --keyword <id> --offline
```

or click **"Regenerate (offline model)"** next to any keyword in the Editor.
Configure the endpoint/model with `OLLAMA_BASE_URL` (default
`http://localhost:11434`) and `OLLAMA_MODEL` (default `llama3.2`). If Ollama
isn't reachable, you get a clear error and the template prompt is untouched
— there's no hard dependency on it.

**Training a custom model:** both the listener's grammar and the prompt
drafter can be improved further with a purpose-trained model (e.g. a
fine-tuned/LoRA'd small LLM for prompt drafting, tuned specifically on
"sermon phrase → good Higgsfield prompt" pairs, or a domain-adapted Vosk
acoustic model for pulpit audio/preaching cadence). That needs a labeled
dataset first — a set of real sermon phrases paired with animation prompts
you consider good, and/or recorded pulpit audio with transcripts. If you
want to go that route, start collecting examples as you use the app (the
Editor already keeps every phrase + its prompt) and we can build a
fine-tuning pipeline once there's enough data to train on.

## Testing

```bash
npm test          # core parser/matcher unit tests (node --test)
npm run typecheck # server + CLI
cd web && npm run typecheck && npm run build
```
