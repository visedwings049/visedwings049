"""Watches a local folder - typically one synced by the Google Drive/Dropbox/OneDrive desktop
app - for new images and copies them into the card library. No accounts, passwords, or API
keys needed here: the cloud sync client does all the syncing, this just watches its output.
"""
import os
from pathlib import Path

from jffj.image_store import save_image


def watch_dir() -> Path | None:
    raw = os.environ.get("JFFJ_WATCH_FOLDER", "").strip()
    return Path(raw) if raw else None


def is_configured() -> str | None:
    """Returns a human-readable problem, or None if ready."""
    d = watch_dir()
    if d is None:
        return None  # watch folder is optional - not an error if unset
    if not d.is_dir():
        return f"Watch folder not found: {d}"
    return None


class FolderWatcher:
    def __init__(self, library_dir: Path):
        self.library_dir = library_dir

    def check(self) -> tuple:
        """One poll. Returns (list of saved Paths, status message)."""
        d = watch_dir()
        if d is None:
            return [], None  # not configured - nothing to report
        if not d.is_dir():
            return [], f"Watch folder not found: {d}"

        self.library_dir.mkdir(parents=True, exist_ok=True)
        saved: list = []
        try:
            entries = sorted(d.iterdir())
        except OSError as exc:
            return [], f"Could not read watch folder: {exc}"
        for f in entries:
            if not f.is_file():
                continue
            try:
                payload = f.read_bytes()
            except OSError:
                continue
            path = save_image(payload, f.name, self.library_dir)
            if path:
                saved.append(path)
        return saved, f"Watch folder checked - {len(saved)} new image(s)."
