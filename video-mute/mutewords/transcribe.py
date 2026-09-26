"""Transcribing a video/audio file to a word-level transcript using faster-whisper."""


def transcribe(video_path, model_size="small", language=None, device="auto", compute_type="int8"):
    """Transcribe video_path and return (words, segments, detected_language).

    words: list of {"word": str, "start": float, "end": float}
    segments: list of {"start": float, "end": float, "text": str}, suitable for SRT export
    """
    from faster_whisper import WhisperModel

    model = WhisperModel(model_size, device=device, compute_type=compute_type)
    raw_segments, info = model.transcribe(video_path, word_timestamps=True, language=language)

    words = []
    segments = []
    for seg in raw_segments:
        segments.append({"start": seg.start, "end": seg.end, "text": seg.text.strip()})
        for w in seg.words or []:
            words.append({"word": w.word, "start": w.start, "end": w.end})

    return words, segments, info.language
