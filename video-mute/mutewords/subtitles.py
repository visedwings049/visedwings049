"""Writing transcript segments out as SRT subtitles."""


def format_timestamp(seconds):
    """Format seconds as an SRT timestamp: HH:MM:SS,mmm."""
    total_ms = int(round(seconds * 1000))
    hours, total_ms = divmod(total_ms, 3600000)
    minutes, total_ms = divmod(total_ms, 60000)
    secs, ms = divmod(total_ms, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{ms:03d}"


def write_srt(segments, path):
    """Write transcript segments ({"start", "end", "text"}) to an SRT file at path."""
    with open(path, "w", encoding="utf-8") as f:
        for index, seg in enumerate(segments, start=1):
            f.write(f"{index}\n")
            f.write(f"{format_timestamp(seg['start'])} --> {format_timestamp(seg['end'])}\n")
            f.write(f"{seg['text'].strip()}\n\n")
