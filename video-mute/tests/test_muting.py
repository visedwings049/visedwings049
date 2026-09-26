from mutewords.muting import build_ffmpeg_audio_filter, build_mute_windows


def test_build_mute_windows_applies_padding():
    matches = [{"start": 1.0, "end": 1.2, "text": "damn"}]
    windows = build_mute_windows(matches, pad=0.1, merge_gap=0.0)
    assert windows == [(0.9, 1.3)]


def test_build_mute_windows_merges_close_windows():
    matches = [
        {"start": 1.0, "end": 1.2, "text": "a"},
        {"start": 1.3, "end": 1.5, "text": "b"},
    ]
    windows = build_mute_windows(matches, pad=0.05, merge_gap=0.2)
    assert windows == [(0.95, 1.55)]


def test_build_mute_windows_does_not_merge_far_apart_windows():
    matches = [
        {"start": 1.0, "end": 1.2, "text": "a"},
        {"start": 5.0, "end": 5.2, "text": "b"},
    ]
    windows = build_mute_windows(matches, pad=0.05, merge_gap=0.1)
    assert windows == [(0.95, 1.25), (4.95, 5.25)]


def test_build_mute_windows_clamps_below_zero():
    matches = [{"start": 0.02, "end": 0.1, "text": "a"}]
    windows = build_mute_windows(matches, pad=0.1, merge_gap=0.0)
    assert windows[0][0] == 0.0


def test_build_ffmpeg_audio_filter_empty():
    assert build_ffmpeg_audio_filter([]) is None


def test_build_ffmpeg_audio_filter_format():
    filt = build_ffmpeg_audio_filter([(0.9, 1.3)])
    assert filt == "volume=enable='between(t,0.900,1.300)':volume=0"


def test_build_ffmpeg_audio_filter_chains_multiple_windows():
    filt = build_ffmpeg_audio_filter([(0.0, 0.5), (2.0, 2.5)])
    assert filt == (
        "volume=enable='between(t,0.000,0.500)':volume=0,"
        "volume=enable='between(t,2.000,2.500)':volume=0"
    )
