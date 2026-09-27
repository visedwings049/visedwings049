# Prophet Sniper — Sermon Graphics

An add-on module for **Prophet Sniper** that turns a pastor's sermon notes into
keyword-triggered, AI-generated looping background videos, displayed live
while the sermon is preached.

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
5. While preaching, the live listener (browser speech recognition) matches
   spoken words against the **next expected keyword** in sequence. A match —
   or a manual "Play now" button press — advances the session and pushes the
   matching looping video to the Display window in real time over WebSocket.

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

- Runs entirely in the Control page via the browser's Web Speech API — no
  audio is sent to the server. Requires Chrome (or another
  `SpeechRecognition`-capable browser); manual trigger buttons work anywhere.
- Matches only against the next 1–2 upcoming keywords (not the whole
  keyword list), so it advances the sermon's visuals in order.
- Every trigger (auto or manual) is relayed over the server's `/ws` endpoint
  to all Control and Display clients in that session, and logged.

## Testing

```bash
npm test          # core parser/matcher unit tests (node --test)
npm run typecheck # server + CLI
cd web && npm run typecheck && npm run build
```
