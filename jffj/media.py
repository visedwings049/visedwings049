"""Sound effects and shuffled background music.

Drop files into assets/sfx and assets/music (bundled read-only, alongside the fonts) and
they're picked up automatically - nothing else to configure. Empty or missing folders are
not errors: playback just no-ops quietly, so the app works fine before any media is added.
"""
import random
from pathlib import Path

from PySide6.QtCore import QUrl
from PySide6.QtMultimedia import QAudioOutput, QMediaPlayer, QSoundEffect

from jffj import paths

SFX_EXTENSIONS = {".wav", ".mp3", ".ogg"}
MUSIC_EXTENSIONS = {".mp3", ".wav", ".ogg", ".m4a", ".flac"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}
SFX_POOL_SIZE = 4  # separate QSoundEffect instances so rapid clicks don't cut each other off


def _files(folder: Path, extensions: set) -> list:
    if not folder.is_dir():
        return []
    return sorted(f for f in folder.iterdir() if f.is_file() and f.suffix.lower() in extensions)


def find_splash_video() -> Path | None:
    files = _files(paths.SPLASH_DIR, VIDEO_EXTENSIONS)
    return files[0] if files else None


class SoundManager:
    """Plays a random short sound effect on demand (button clicks, etc.)."""

    def __init__(self, muted: bool = False):
        self.muted = muted
        self._sources = [QUrl.fromLocalFile(str(p)) for p in _files(paths.SFX_DIR, SFX_EXTENSIONS)]
        self._pool = [QSoundEffect() for _ in range(SFX_POOL_SIZE)]
        self._next = 0

    def play_random(self):
        if self.muted or not self._sources:
            return
        effect = self._pool[self._next]
        self._next = (self._next + 1) % len(self._pool)
        effect.setSource(random.choice(self._sources))
        effect.setVolume(0.8)
        effect.play()

    def set_muted(self, muted: bool):
        self.muted = muted


class MusicPlayer:
    """Loops a shuffled background playlist; reshuffles once it runs out."""

    def __init__(self, muted: bool = False, volume: float = 0.35):
        self._tracks = _files(paths.MUSIC_DIR, MUSIC_EXTENSIONS)
        self._queue: list = []
        self._volume = volume
        self.player = QMediaPlayer()
        self.audio_output = QAudioOutput()
        self.player.setAudioOutput(self.audio_output)
        self.audio_output.setVolume(0 if muted else volume)
        self.player.mediaStatusChanged.connect(self._on_status)

    def _on_status(self, status):
        if status == QMediaPlayer.MediaStatus.EndOfMedia:
            self._play_next()

    def _play_next(self):
        if not self._tracks:
            return
        if not self._queue:
            self._queue = self._tracks.copy()
            random.shuffle(self._queue)
        track = self._queue.pop(0)
        self.player.setSource(QUrl.fromLocalFile(str(track)))
        self.player.play()

    def start(self):
        if self._tracks and self.player.playbackState() != QMediaPlayer.PlaybackState.PlayingState:
            self._play_next()

    def set_muted(self, muted: bool):
        self.audio_output.setVolume(0 if muted else self._volume)

    def stop(self):
        self.player.stop()
