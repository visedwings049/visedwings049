# mutewords

Transcribe a video, find the language you specify (profanity, or any
custom word/phrase list) using the transcript's word-level timestamps,
and re-render the video with just those moments muted.

## How it works

1. **Transcribe** — [faster-whisper](https://github.com/SYSTRAN/faster-whisper)
   transcribes the video and returns word-level timestamps plus subtitle
   segments.
2. **Review** — every transcript word is checked (case/punctuation
   insensitive) against a wordlist. Multi-word phrases (e.g.
   `"son of a bitch"`) are matched as a unit.
3. **Mute** — each match's timestamps are padded and nearby matches are
   merged into mute windows, then `ffmpeg` re-encodes the audio track with
   those windows silenced (video stream is stream-copied, so there's no
   quality loss on the picture).

## Requirements

- Python 3.9+
- [`ffmpeg`](https://ffmpeg.org/) available on your `PATH`
- `pip install -r requirements.txt`

## Usage

```bash
python -m mutewords input.mp4
```

This writes `input.muted.mp4` next to the source file, muting any word in
the bundled default English profanity list (`wordlists/default_profanity_en.txt`).

### Common options

```bash
python -m mutewords input.mp4 \
  -o clean.mp4 \
  --words my_wordlist.txt \       # use your own list instead of/alongside the default
  --extra-word "some phrase" \    # add one-off words/phrases (repeatable)
  --lang en \                     # skip language auto-detection
  --model medium \                # bigger whisper model = more accurate, slower
  --pad 0.2 \                     # seconds of silence padding around each hit
  --merge-gap 0.15 \              # merge mute windows this close together
  --srt subtitles.srt \           # also export the generated subtitles
  --report report.json            # JSON report of every match and mute window
```

Use `--dry-run` to transcribe and see what would be muted (plus `--srt`/
`--report`) without rendering a new video — handy for tuning your wordlist
before committing to a full render.

Use `--no-default-wordlist` if you only want to mute the words you pass in
via `--words`/`--extra-word`, not the bundled defaults.

### Wordlist file format

One word or phrase per line; `#` starts a comment; blank lines are ignored.

```
damn
hell
son of a bitch
```

## Development

```bash
pip install -r requirements-dev.txt
pytest
```

The test suite covers the pure logic (word matching, mute-window building,
SRT formatting) without requiring `ffmpeg` or a real whisper model.
