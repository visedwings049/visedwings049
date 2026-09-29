"""Where things live, both when run from source and when installed as an .exe.

  RESOURCE_DIR - read-only bundled files (fonts, icon)
  DATA_DIR     - writable user data (.env, image library, error log)
"""
import sys
from pathlib import Path

FROZEN = getattr(sys, "frozen", False)

if FROZEN:
    RESOURCE_DIR = Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    if sys.platform == "darwin":
        # ~/Documents is one of macOS's TCC-protected folders - programmatic (non-dialog)
        # access triggers a one-time permission prompt, and a denial breaks the app silently.
        # ~/Library/Application Support isn't protected, and is the macOS convention anyway.
        DATA_DIR = Path.home() / "Library" / "Application Support" / "JFFJ"
    else:
        DATA_DIR = Path.home() / "Documents" / "JFFJ"
else:
    RESOURCE_DIR = Path(__file__).resolve().parent.parent
    DATA_DIR = RESOURCE_DIR

FONTS_DIR = RESOURCE_DIR / "assets" / "fonts"
# Qt has no built-in .ico/.icns image support, so the runtime app/window icon uses the plain
# PNG (Qt loads that reliably on every platform). The .ico/.icns files are packaging-only -
# used directly by JFFJ.spec for the Windows EXE resource and the macOS bundle's Info.plist.
ICON_PATH = RESOURCE_DIR / "assets" / "jffj_icon.png"
SFX_DIR = RESOURCE_DIR / "assets" / "sfx"
MUSIC_DIR = RESOURCE_DIR / "assets" / "music"
SPLASH_DIR = RESOURCE_DIR / "assets" / "splash"
SAMPLE_LIBRARY_DIR = RESOURCE_DIR / "assets" / "library" / "Arico"  # bundled read-only starter images
ENV_PATH = DATA_DIR / ".env"
LIBRARY_DIR = (DATA_DIR / "Library" / "Arico") if FROZEN else (DATA_DIR / "assets" / "library" / "Arico")
LOG_PATH = DATA_DIR / "jffj_error.log"

ENV_TEMPLATE = """# JFFJ settings. Fill in, save, then restart the app.

# Watch folder: a local folder (e.g. one synced by the Google Drive, Dropbox, or OneDrive
# desktop app) - anything dropped in it is added to the library automatically, no account
# needed. A file whose name is already in the library is skipped, never re-imported.
JFFJ_WATCH_FOLDER=

# Optional: sends finished cards by Gmail. Use an "app password"
# (Google Account > Security > App passwords), not your normal password.
JFFJ_PROVIDER=gmail
JFFJ_SMTP_HOST=smtp.gmail.com
JFFJ_SMTP_PORT=587
JFFJ_SMTP_USER=
JFFJ_SMTP_PASSWORD=
JFFJ_SMTP_USE_TLS=true
JFFJ_EMAIL_FROM=

# Sound effects and background music (drop files into assets/sfx and assets/music).
JFFJ_MUTED=false
"""


def ensure_user_files() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    # Seed if the library is missing OR exists-but-empty (e.g. a prior install left a bare
    # folder behind) - not just "missing", so a stray empty folder can't permanently block it.
    needs_seed = FROZEN and (not LIBRARY_DIR.exists() or not any(LIBRARY_DIR.iterdir()))
    LIBRARY_DIR.mkdir(parents=True, exist_ok=True)
    if needs_seed and SAMPLE_LIBRARY_DIR.is_dir():
        import shutil
        for src in SAMPLE_LIBRARY_DIR.iterdir():
            if src.is_file():
                shutil.copy2(src, LIBRARY_DIR / src.name)
    if FROZEN and not ENV_PATH.exists():
        ENV_PATH.write_text(ENV_TEMPLATE, encoding="utf-8")
