from mutewords.subtitles import format_timestamp, write_srt


def test_format_timestamp_zero():
    assert format_timestamp(0) == "00:00:00,000"


def test_format_timestamp_with_hours_minutes_seconds_ms():
    assert format_timestamp(3661.234) == "01:01:01,234"


def test_write_srt(tmp_path):
    segments = [
        {"start": 0.0, "end": 1.5, "text": "Hello there"},
        {"start": 1.5, "end": 3.0, "text": "General Kenobi"},
    ]
    out = tmp_path / "out.srt"
    write_srt(segments, str(out))
    content = out.read_text()
    assert content == (
        "1\n"
        "00:00:00,000 --> 00:00:01,500\n"
        "Hello there\n"
        "\n"
        "2\n"
        "00:00:01,500 --> 00:00:03,000\n"
        "General Kenobi\n"
        "\n"
    )
