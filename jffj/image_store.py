"""Shared helper for saving an incoming image into the card library, deduped by filename.

Used by the synced-folder watcher (folder_watch.py). A file whose target name is already
in the library is skipped - it is never re-imported, even if its contents changed.
"""
import hashlib
import re
from io import BytesIO
from pathlib import Path

from PIL import Image

IMAGE_FORMATS = {"PNG": ".png", "JPEG": ".jpg", "WEBP": ".webp"}
MAX_IMAGE_BYTES = 25 * 1024 * 1024


def clean_filename(name: str, fallback: str) -> str:
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(name or "").stem).strip("._")[:60]
    return stem or fallback


def save_image(payload: bytes, filename: str, library_dir: Path) -> Path | None:
    """Decodes and copies payload into library_dir if it's a real, new-named PNG/JPEG/WEBP. Returns the saved path, or None."""
    if not payload or len(payload) > MAX_IMAGE_BYTES:
        return None
    try:
        with Image.open(BytesIO(payload)) as img:
            fmt = img.format
            img.verify()
    except Exception:
        return None
    if fmt not in IMAGE_FORMATS:
        return None
    stem = clean_filename(filename, f"arico_{hashlib.sha256(payload).hexdigest()[:10]}")
    dest = library_dir / f"{stem}{IMAGE_FORMATS[fmt]}"
    if dest.exists():
        return None  # a file with this name is already in the library - never re-import it
    dest.write_bytes(payload)
    return dest
