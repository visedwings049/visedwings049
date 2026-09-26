from mutewords.wordlist import _normalize, find_matches, load_wordlist


def word(text, start, end):
    return {"word": text, "start": start, "end": end}


def test_normalize_strips_punctuation_and_case():
    assert _normalize(" Damn!") == "damn"
    assert _normalize("it's") == "it's"


def test_find_matches_single_word():
    words = [word("this", 0.0, 0.2), word("is", 0.2, 0.4), word("damn", 0.4, 0.7), word("cool", 0.7, 1.0)]
    matches = find_matches(words, {"damn"})
    assert len(matches) == 1
    assert matches[0]["start"] == 0.4
    assert matches[0]["end"] == 0.7
    assert matches[0]["text"] == "damn"


def test_find_matches_no_matches():
    words = [word("this", 0.0, 0.2), word("is", 0.2, 0.4), word("fine", 0.4, 0.7)]
    assert find_matches(words, {"damn"}) == []


def test_find_matches_multiword_phrase_preferred_over_single_word():
    words = [
        word("oh", 0.0, 0.1),
        word("son", 0.1, 0.3),
        word("of", 0.3, 0.4),
        word("a", 0.4, 0.5),
        word("bitch", 0.5, 0.8),
    ]
    matches = find_matches(words, {"bitch", "son of a bitch"})
    assert len(matches) == 1
    assert matches[0]["start"] == 0.1
    assert matches[0]["end"] == 0.8
    assert matches[0]["text"] == "son of a bitch"


def test_find_matches_case_and_punctuation_insensitive():
    words = [word("Damn,", 1.0, 1.3), word("it.", 1.3, 1.5)]
    matches = find_matches(words, {"damn"})
    assert len(matches) == 1


def test_find_matches_multiple_non_adjacent():
    words = [word("damn", 0.0, 0.2), word("ok", 0.2, 0.4), word("shit", 0.4, 0.6)]
    matches = find_matches(words, {"damn", "shit"})
    assert [m["text"] for m in matches] == ["damn", "shit"]


def test_load_wordlist_ignores_comments_and_blank_lines(tmp_path):
    p = tmp_path / "words.txt"
    p.write_text("# comment\nDamn\n\nHell  # inline comment\n")
    words = load_wordlist(str(p))
    assert words == {"damn", "hell"}
