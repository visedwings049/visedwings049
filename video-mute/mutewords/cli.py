"""Command-line entry point: transcribe -> detect bad language -> mute -> render."""

import argparse
import json
import os
import sys

from . import muting as muting_mod
from . import subtitles as subtitles_mod
from . import transcribe as transcribe_mod
from . import wordlist as wordlist_mod

_PACKAGE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_WORDLIST = os.path.join(_PACKAGE_ROOT, "wordlists", "default_profanity_en.txt")


def build_parser():
    parser = argparse.ArgumentParser(
        prog="mutewords",
        description="Transcribe a video, find specified language via the transcript, and mute it.",
    )
    parser.add_argument("input", help="Path to the input video file")
    parser.add_argument("-o", "--output", help="Path to the output video file (default: <input>.muted.<ext>)")
    parser.add_argument("--words", help="Path to a custom wordlist file (one word/phrase per line)")
    parser.add_argument("--extra-word", action="append", default=[],
                         help="Additional word or phrase to mute; repeatable")
    parser.add_argument("--no-default-wordlist", action="store_true",
                         help="Don't merge in the bundled default profanity list")
    parser.add_argument("--lang", help="Language hint for transcription (e.g. 'en'); auto-detected if omitted")
    parser.add_argument("--model", default="small",
                         help="Whisper model size: tiny/base/small/medium/large-v3 (default: small)")
    parser.add_argument("--device", default="auto", help="Transcription device: auto/cpu/cuda (default: auto)")
    parser.add_argument("--compute-type", default="int8", help="faster-whisper compute type (default: int8)")
    parser.add_argument("--pad", type=float, default=0.15,
                         help="Seconds of padding added around each muted word (default: 0.15)")
    parser.add_argument("--merge-gap", type=float, default=0.1,
                         help="Merge mute windows within this many seconds of each other (default: 0.1)")
    parser.add_argument("--srt", help="Also write the generated subtitles to this .srt path")
    parser.add_argument("--report", help="Write a JSON report of matches/mute windows to this path")
    parser.add_argument("--dry-run", action="store_true",
                         help="Transcribe and detect only; don't render a muted video")
    return parser


def resolve_wordlist(args):
    words = set()
    if not args.no_default_wordlist:
        words |= wordlist_mod.load_wordlist(DEFAULT_WORDLIST)
    if args.words:
        words |= wordlist_mod.load_wordlist(args.words)
    words |= {w.lower() for w in args.extra_word}
    return words


def default_output_path(input_path):
    base, ext = os.path.splitext(input_path)
    return f"{base}.muted{ext or '.mp4'}"


def main(argv=None):
    args = build_parser().parse_args(argv)

    banned = resolve_wordlist(args)
    if not banned:
        print("No words to mute (empty wordlist); pass --words or --extra-word.", file=sys.stderr)
        return 1

    print(f"Transcribing {args.input} (model={args.model})...")
    words, segments, detected_lang = transcribe_mod.transcribe(
        args.input,
        model_size=args.model,
        language=args.lang,
        device=args.device,
        compute_type=args.compute_type,
    )
    print(f"Transcribed {len(words)} words (language: {detected_lang}).")

    matches = wordlist_mod.find_matches(words, banned)
    windows = muting_mod.build_mute_windows(matches, pad=args.pad, merge_gap=args.merge_gap)
    print(f"Found {len(matches)} flagged match(es) -> {len(windows)} mute window(s).")
    for m in matches:
        print(f"  [{m['start']:.2f}s - {m['end']:.2f}s] {m['text']!r}")

    if args.srt:
        subtitles_mod.write_srt(segments, args.srt)
        print(f"Wrote subtitles to {args.srt}")

    if args.report:
        report = {
            "input": args.input,
            "language": detected_lang,
            "matches": matches,
            "mute_windows": [{"start": s, "end": e} for s, e in windows],
        }
        with open(args.report, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
        print(f"Wrote report to {args.report}")

    if args.dry_run:
        return 0

    output = args.output or default_output_path(args.input)
    print(f"Rendering muted video to {output}...")
    muting_mod.mute_video(args.input, output, windows)
    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
