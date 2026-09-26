"""Loading banned-word lists and matching them against a word-level transcript."""

import re

_PUNCT_RE = re.compile(r"[^\w']")


def _normalize(word):
    """Lowercase a transcript token and strip surrounding punctuation."""
    return _PUNCT_RE.sub("", word).strip().lower()


def load_wordlist(path):
    """Load a wordlist file: one word or phrase per line, '#' starts a comment."""
    words = set()
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.split("#", 1)[0].strip()
            if line:
                words.add(line.lower())
    return words


def find_matches(transcript_words, banned_phrases):
    """Find occurrences of banned words/phrases in a word-level transcript.

    transcript_words: list of {"word": str, "start": float, "end": float}
    banned_phrases: iterable of strings, possibly multi-word (e.g. "son of a bitch")

    Returns a list of {"start": float, "end": float, "text": str} matches,
    scanning left to right and preferring the longest phrase match at each
    position so multi-word phrases take priority over single-word overlaps.
    """
    phrase_tuples = sorted(
        (tuple(_normalize(w) for w in phrase.split()) for phrase in banned_phrases if phrase.strip()),
        key=len,
        reverse=True,
    )
    normalized = [_normalize(w["word"]) for w in transcript_words]
    matches = []
    i = 0
    n = len(transcript_words)
    while i < n:
        matched_len = 0
        for phrase in phrase_tuples:
            length = len(phrase)
            if length and i + length <= n and tuple(normalized[i:i + length]) == phrase:
                matched_len = length
                break
        if matched_len:
            start = transcript_words[i]["start"]
            end = transcript_words[i + matched_len - 1]["end"]
            text = " ".join(w["word"].strip() for w in transcript_words[i:i + matched_len])
            matches.append({"start": start, "end": end, "text": text})
            i += matched_len
        else:
            i += 1
    return matches
