"""Turning matched-word timestamps into ffmpeg mute windows/filters."""

import subprocess


def build_mute_windows(matches, pad=0.15, merge_gap=0.1):
    """Pad each match and merge overlapping/nearby windows into a sorted list of (start, end)."""
    raw = sorted((max(0.0, m["start"] - pad), m["end"] + pad) for m in matches)
    merged = []
    for start, end in raw:
        if merged and start <= merged[-1][1] + merge_gap:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def build_ffmpeg_audio_filter(windows):
    """Build an ffmpeg -af filter string that silences each (start, end) window."""
    if not windows:
        return None
    parts = [f"volume=enable='between(t,{start:.3f},{end:.3f})':volume=0" for start, end in windows]
    return ",".join(parts)


def mute_video(input_path, output_path, windows, video_codec="copy"):
    """Re-mux input_path to output_path with audio silenced during the given windows."""
    if not windows:
        cmd = ["ffmpeg", "-y", "-i", input_path, "-c", "copy", output_path]
    else:
        audio_filter = build_ffmpeg_audio_filter(windows)
        cmd = [
            "ffmpeg", "-y", "-i", input_path,
            "-af", audio_filter,
            "-c:v", video_codec,
            output_path,
        ]
    subprocess.run(cmd, check=True)
