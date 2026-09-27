# prophet-sniper-ndi

Broadcasts a live Prophet Sniper sermon session as an **NDI** video source —
no OBS, no browser, nothing but this process. ProPresenter (or vMix,
Resolume, etc.) picks it up directly via its built-in NDI input, the same
way it would a camera.

This is a separate package from the rest of the repo (like `web/`) because
its one real dependency, [`@stagetimerio/grandiose`](https://github.com/stagetimerio/grandiose)
(a Node.js NDI binding), downloads the NDI SDK from `downloads.ndi.tv` and
compiles a native addon against it during `npm install` — that's unrelated
to running the server, CLI, or web app, so it stays out of the root
install.

## How it works

It connects to a live session over the same WebSocket protocol the browser
Control/Display pages use (as a headless `role=display` client), reads each
keyword's generated video path directly from the shared JSON data store, and
on every `play` event, hard-cuts `ffmpeg` to decode/loop that video into raw
BGRA frames, which get pushed to an NDI sender. Before the first trigger (and
after the session ends), it shows a plain black frame so the source stays
present in ProPresenter's source list.

**Known limitation vs. the Display page**: this does a hard cut between
videos, not the crossfade the browser Display page does — reimplementing a
frame-level crossfade against two simultaneously-decoded videos was out of
scope for this first version.

It also snapshots each keyword's video path once at startup — start it
*after* all of a sermon's videos are generated and imported, not before.

## Setup

1. **ffmpeg** must be on `PATH` (`ffmpeg -version` should work).
2. **Node.js 22+** (uses the runtime's built-in `WebSocket` client).
3. Install dependencies:

   ```bash
   cd ndi
   npm install
   ```

   This step needs outbound network access to `downloads.ndi.tv` (it fetches
   the NDI SDK) and a C++ toolchain (`node-gyp` compiles a native addon) —
   if your machine can't reach that host (locked-down corporate network,
   sandboxed CI, etc.), do this step on a machine that can, or on the same
   machine you'll actually run the broadcaster from.
4. Receiving software needs the free **NDI Runtime** installed to discover
   sources on the network — ProPresenter typically already bundles or
   prompts for this since it supports NDI input natively.

## Usage

```bash
# from the ndi/ directory, with the main server already running and a
# live session started (Control page, or `prophet-sniper session start`)
npm start -- --session <sessionId>
```

Options (all optional except `--session`):

| Flag | Default | Meaning |
| --- | --- | --- |
| `--session <id>` | *(required)* | Live session id |
| `--name <name>` | `Prophet Sniper` | NDI source name, e.g. shows as "YOUR-PC (Prophet Sniper)" |
| `--ws-url <url>` | `ws://localhost:4000` | Base URL of the running server |
| `--width <n>` | `1280` | Output width |
| `--height <n>` | `720` | Output height |
| `--fps <n>` | `30` | Output frame rate |

In ProPresenter, add a Prop/Media layer → **Capture** → select the NDI
source by name.

`Ctrl+C` shuts it down cleanly (stops ffmpeg, destroys the NDI sender).

## Note on testing

This was built and typechecked carefully against the real, verified
`@stagetimerio/grandiose` API and a locally-installed `ffmpeg` (the
ffmpeg-driven video pipeline — looping, source-switching, exact frame
sizing — was tested end-to-end against real ffmpeg output). The actual NDI
handshake and ProPresenter's receiving side were not verified, since doing
so needs the real NDI SDK/runtime and a ProPresenter instance, neither of
which is available in the environment this was built in. Test the full
chain once on your own setup before relying on it live.
