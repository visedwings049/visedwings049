"""Named style presets: every CardSettings field except the image and the custom text,
so a look (frame, colors, opacity, fonts...) can be saved and reused across cards.
"""
import json
import re
from dataclasses import asdict
from pathlib import Path

from jffj.render import CardSettings

EXCLUDED_FIELDS = {"bg_image_path", "text"}


def _presets_dir(data_dir: Path) -> Path:
    d = data_dir / "Presets"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _safe_name(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9 _-]+", "", name).strip()[:60]


def list_presets(data_dir: Path) -> list:
    return sorted(p.stem for p in _presets_dir(data_dir).glob("*.json"))


def save_preset(data_dir: Path, name: str, settings: CardSettings) -> str:
    safe = _safe_name(name)
    if not safe:
        raise ValueError("Enter a preset name.")
    values = {k: v for k, v in asdict(settings).items() if k not in EXCLUDED_FIELDS}
    path = _presets_dir(data_dir) / f"{safe}.json"
    path.write_text(json.dumps(values, indent=2), encoding="utf-8")
    return safe


def load_preset(data_dir: Path, name: str) -> dict:
    path = _presets_dir(data_dir) / f"{name}.json"
    return json.loads(path.read_text(encoding="utf-8"))


def delete_preset(data_dir: Path, name: str) -> None:
    path = _presets_dir(data_dir) / f"{name}.json"
    path.unlink(missing_ok=True)
