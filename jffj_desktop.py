"""JFFJ Card Generator - native desktop app (PySide6)."""
import hashlib
import io
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from PIL import Image
from PySide6.QtCore import QSize, Qt, QThread, QTimer, Signal, QUrl
from PySide6.QtGui import QColor, QDesktopServices, QIcon, QImage, QPixmap
from PySide6.QtMultimedia import QAudioOutput, QMediaPlayer
from PySide6.QtMultimediaWidgets import QVideoWidget
from PySide6.QtWidgets import (
    QApplication, QCheckBox, QColorDialog, QComboBox, QFileDialog, QFormLayout, QHBoxLayout,
    QInputDialog, QLabel, QLineEdit, QListWidget, QListWidgetItem, QMainWindow, QMessageBox,
    QPlainTextEdit, QPushButton, QScrollArea, QSizePolicy, QSlider, QSplitter, QTabWidget,
    QVBoxLayout, QWidget,
)

from jffj import folder_watch, mail_out, media, presets
from jffj.folder_watch import FolderWatcher
from jffj.mail_out import test_login
from jffj.settings import read_env, update_env
from jffj.render import (
    ACCENT, CANVAS_SIZES, DEFAULT_IMAGE_OPACITY, FONTS, GRADIENTS, TAGLINE, CardSettings, render_card,
)

from jffj import paths

GMAIL_SENDER = "Jacobruchotzke@gmail.com"


def _force_gmail_settings():
    """Gmail-only app: these fields are always correct regardless of .env history (e.g. a
    leftover Outlook-era file from before this app dropped Outlook support). The app password
    itself is left untouched - only it is meant to persist per-machine.
    """
    os.environ["JFFJ_PROVIDER"] = "gmail"
    os.environ["JFFJ_SMTP_HOST"] = "smtp.gmail.com"
    os.environ["JFFJ_SMTP_PORT"] = "587"
    os.environ["JFFJ_SMTP_USE_TLS"] = "true"
    os.environ["JFFJ_SMTP_USER"] = GMAIL_SENDER
    os.environ["JFFJ_EMAIL_FROM"] = GMAIL_SENDER


paths.ensure_user_files()
load_dotenv(paths.ENV_PATH)
_force_gmail_settings()

DEFAULT_LIBRARY_DIR = paths.LIBRARY_DIR
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
THUMB_SIZE = 150
EMAIL_COOLDOWN_S = 30

DARK_STYLE = """
QWidget { background: #16130f; color: #ece7e2; font-size: 13px; }
QMainWindow, QScrollArea, QSplitter { background: #16130f; }
QLabel { background: transparent; }

QTabWidget::pane { border: 1px solid #2e2a26; background: #1b1712; }
QTabBar::tab {
    background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 #2a2521, stop:1 #1b1712);
    color: #b8b2ab;
    padding: 8px 14px;
    border: 1px solid #2e2a26;
    border-bottom: none;
}
QTabBar::tab:selected {
    background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 #362a26, stop:1 #241c19);
    color: #f2ece6;
    border-bottom: 3px solid #a3372c;
}
QTabBar::tab:hover:!selected { color: #e8e2db; }

QPushButton {
    background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 #e2e2e2, stop:0.45 #b7b7b7, stop:0.55 #9a9a9a, stop:1 #707070);
    color: #17140f;
    border: 1px solid #5c5c5c;
    border-radius: 5px;
    padding: 6px 12px;
    font-weight: 600;
}
QPushButton:hover {
    background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 #eeeeee, stop:0.45 #c4c4c4, stop:0.55 #a6a6a6, stop:1 #7c7c7c);
}
QPushButton:pressed {
    background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 #8f8f8f, stop:1 #6a6a6a);
}
QPushButton:disabled { background: #3a3733; color: #756f68; border-color: #3a3733; }

QPushButton#primary {
    background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 #c0473a, stop:0.5 #9c2f26, stop:1 #7a221b);
    color: #fdf2ef;
    border: 1px solid #5c1c16;
    font-weight: bold;
}
QPushButton#primary:hover {
    background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 #d15445, stop:0.5 #ad362b, stop:1 #872720);
}
QPushButton#primary:pressed {
    background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 #7a221b, stop:1 #5c1c16);
}

QLineEdit, QPlainTextEdit, QComboBox {
    background: #1f1b17;
    color: #ece7e2;
    border: 1px solid #3a352f;
    border-radius: 3px;
    padding: 4px;
    selection-background-color: #a3372c;
}
QComboBox::drop-down { border: none; width: 20px; }
QComboBox QAbstractItemView {
    background: #201c18; color: #ece7e2; selection-background-color: #a3372c; border: 1px solid #3a352f;
}

QListWidget { background: #100e0b; border: 1px solid #2e2a26; }
QListWidget::item:selected { border: 2px solid #a3372c; background: #2a2521; }

QScrollBar:vertical { background: #17140f; width: 12px; margin: 0; }
QScrollBar::handle:vertical {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #7a7a7a, stop:0.5 #b7b7b7, stop:1 #7a7a7a);
    min-height: 24px; border-radius: 5px;
}
QScrollBar::handle:vertical:hover { background: #c4c4c4; }
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical { height: 0; }

QSlider::groove:horizontal {
    height: 5px; border-radius: 2px;
    background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 #302b26, stop:1 #14110d);
    border: 1px solid #3a352f;
}
QSlider::handle:horizontal {
    background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 #d9695c, stop:0.5 #a3372c, stop:1 #7a221b);
    width: 15px; margin: -6px 0; border-radius: 7px; border: 1px solid #5c1c16;
}
QSlider::handle:horizontal:hover {
    background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 #e37f70, stop:0.5 #b7473b, stop:1 #8a2920);
}

QCheckBox::indicator { width: 15px; height: 15px; border: 1px solid #5c5c5c; border-radius: 3px; background: #201c18; }
QCheckBox::indicator:checked {
    background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 #c0473a, stop:1 #7a221b);
    border: 1px solid #5c1c16;
}

QStatusBar { background: #14110d; color: #b8b2ab; border-top: 1px solid #2e2a26; }
"""


def pil_to_pixmap(img: Image.Image) -> QPixmap:
    rgb = img.convert("RGB")
    qimg = QImage(rgb.tobytes(), rgb.width, rgb.height, rgb.width * 3, QImage.Format.Format_RGB888)
    return QPixmap.fromImage(qimg.copy())


class ThumbWorker(QThread):
    """Builds small cached thumbnails off the UI thread so big PNG libraries stay snappy."""
    ready = Signal(str, str)  # image path, thumbnail path

    def __init__(self, paths: list, cache_dir: Path):
        super().__init__()
        self.paths = paths
        self.cache_dir = cache_dir

    def run(self):
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        for p in self.paths:
            if self.isInterruptionRequested():
                return
            src = Path(p)
            try:
                key = hashlib.sha1(f"{src}|{src.stat().st_mtime_ns}".encode()).hexdigest()[:16]
                thumb = self.cache_dir / f"{key}.jpg"
                if not thumb.exists():
                    with Image.open(src) as im:
                        im = im.convert("RGB")
                        im.thumbnail((THUMB_SIZE * 2, THUMB_SIZE * 2))
                        im.save(thumb, "JPEG", quality=82)
                self.ready.emit(str(src), str(thumb))
            except Exception:
                continue


class InboxWorker(QThread):
    """Checks the synced watch folder for new images."""
    done = Signal(list, str)

    def __init__(self, folder_watcher: FolderWatcher):
        super().__init__()
        self.folder_watcher = folder_watcher

    def run(self):
        try:
            saved, msg = self.folder_watcher.check()
            self.done.emit([str(p) for p in saved], msg or "No watch folder set.")
        except Exception as exc:
            self.done.emit([], f"Watch folder check failed: {exc}")


class LoginTestWorker(QThread):
    done = Signal(str)

    def run(self):
        self.done.emit(test_login())


class SendWorker(QThread):
    finished_ok = Signal()
    failed = Signal(str)

    def __init__(self, to, subject, body, image_bytes, filename):
        super().__init__()
        self.args = (to, subject, body, image_bytes, filename)

    def run(self):
        try:
            mail_out.send_card_email(*self.args)
            self.finished_ok.emit()
        except Exception as exc:
            self.failed.emit(str(exc))


class ColorButton(QPushButton):
    changed = Signal()

    def __init__(self, color: str):
        super().__init__()
        self._color = color
        self.setFixedWidth(90)
        self.clicked.connect(self._pick)
        self._paint()

    def color(self) -> str:
        return self._color

    def set_color(self, color: str):
        self._color = color
        self._paint()

    def _paint(self):
        c = QColor(self._color)
        fg = "#000" if c.lightness() > 128 else "#fff"
        self.setStyleSheet(f"background:{self._color}; color:{fg}; border:1px solid #666;")
        self.setText(self._color.upper())

    def _pick(self):
        chosen = QColorDialog.getColor(QColor(self._color), self, "Pick a color")
        if chosen.isValid():
            self._color = chosen.name()
            self._paint()
            self.changed.emit()


class SliderRow(QWidget):
    """Slider with a live value readout. `scale` lets float sliders ride on ints."""
    changed = Signal()

    def __init__(self, lo, hi, value, scale=1, suffix=""):
        super().__init__()
        self.scale = scale
        self.suffix = suffix
        self.slider = QSlider(Qt.Orientation.Horizontal)
        self.slider.setRange(round(lo * scale), round(hi * scale))
        self.slider.setValue(round(value * scale))
        self.readout = QLabel()
        self.readout.setMinimumWidth(48)
        self.readout.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        row = QHBoxLayout(self)
        row.setContentsMargins(0, 0, 0, 0)
        row.addWidget(self.slider, 1)
        row.addWidget(self.readout)
        self.slider.valueChanged.connect(self._on_change)
        self._update_label()

    def value(self):
        v = self.slider.value() / self.scale
        return v if self.scale != 1 else int(v)

    def setValue(self, value):
        self.slider.setValue(round(value * self.scale))

    def _update_label(self):
        v = self.value()
        self.readout.setText(f"{v:.2f}{self.suffix}" if self.scale != 1 else f"{v}{self.suffix}")

    def _on_change(self):
        self._update_label()
        self.changed.emit()


class SplashScreen(QWidget):
    """Startup splash: plays a video clip with the logo over it, then hands off to the app.
    Click, any key, or the video ending all advance; a timeout guards against a bad video file.
    """
    finished = Signal()

    def __init__(self, video_path: Path):
        super().__init__(None, Qt.WindowType.FramelessWindowHint)
        self.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        self.setStyleSheet("background:#000;")
        self.resize(900, 600)
        screen = QApplication.primaryScreen().availableGeometry()
        self.move(screen.center() - self.rect().center())

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        self.video_widget = QVideoWidget()
        layout.addWidget(self.video_widget, 1)

        logo = QLabel(alignment=Qt.AlignmentFlag.AlignCenter)
        pm = QPixmap(str(paths.ICON_PATH))
        if not pm.isNull():
            logo.setPixmap(pm.scaledToHeight(96, Qt.TransformationMode.SmoothTransformation))
        logo.setStyleSheet("background:#000; padding:14px;")
        layout.addWidget(logo)

        self.player = QMediaPlayer(self)
        self.audio_output = QAudioOutput(self)
        self.player.setAudioOutput(self.audio_output)
        self.player.setVideoOutput(self.video_widget)
        self.player.setSource(QUrl.fromLocalFile(str(video_path)))
        self.player.mediaStatusChanged.connect(self._on_status)
        self.player.play()

        self._done = False
        self._safety_timer = QTimer(self, singleShot=True, interval=15000)
        self._safety_timer.timeout.connect(self._finish)
        self._safety_timer.start()

    def _on_status(self, status):
        if status == QMediaPlayer.MediaStatus.EndOfMedia:
            self._finish()

    def mousePressEvent(self, event):
        self._finish()

    def keyPressEvent(self, event):
        self._finish()

    def _finish(self):
        if self._done:
            return
        self._done = True
        self._safety_timer.stop()
        self.player.stop()
        self.finished.emit()
        self.close()


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("JFFJ Card Generator")
        self.resize(1500, 900)

        self.library_dir = DEFAULT_LIBRARY_DIR
        self.selected_image: str | None = None
        self.last_image: Image.Image | None = None
        self.last_size_px = 0
        self.thumb_worker: ThumbWorker | None = None
        self.inbox_worker: InboxWorker | None = None
        self.items_by_path: dict = {}
        self.email_worker: SendWorker | None = None
        self.last_send_at = -EMAIL_COOLDOWN_S
        self.cooldown_timer = QTimer(self, interval=500)
        self.cooldown_timer.timeout.connect(self.update_send_button)
        self.folder_watcher = FolderWatcher(self.library_dir)

        self.render_timer = QTimer(self, singleShot=True, interval=120)
        self.render_timer.timeout.connect(self.render_now)

        muted = read_env(paths.ENV_PATH).get("JFFJ_MUTED", "false").strip().lower() == "true"
        self.sound = media.SoundManager(muted=muted)
        self.music = media.MusicPlayer(muted=muted)

        splitter = QSplitter()
        splitter.addWidget(self._build_library_panel())
        splitter.addWidget(self._build_preview_panel())
        splitter.addWidget(self._build_controls_panel())
        splitter.setSizes([380, 500, 500])
        splitter.setStretchFactor(1, 1)
        splitter.setChildrenCollapsible(False)
        self.setCentralWidget(splitter)

        self.reload_library()
        self.schedule_render()
        self._update_mute_button()
        for btn in self.findChildren(QPushButton):
            btn.clicked.connect(self.sound.play_random)
        # music.start() is called by main() once the splash finishes, not here, so it
        # doesn't play under the splash video's own audio while the window is still hidden.

        QTimer.singleShot(1500, self.check_inbox)  # check the watch folder once on launch

    # ---------- library panel ----------
    def _build_library_panel(self) -> QWidget:
        box = QWidget()
        lay = QVBoxLayout(box)

        top_row = QHBoxLayout()
        self.folder_label = QLabel()
        self.folder_label.setWordWrap(True)
        self.folder_label.setStyleSheet("color:#9a9aa2;")
        top_row.addWidget(self.folder_label, 1)
        self.mute_btn = QPushButton()
        self.mute_btn.setFixedWidth(36)
        self.mute_btn.setToolTip("Mute/unmute sound")
        self.mute_btn.clicked.connect(self.toggle_mute)
        top_row.addWidget(self.mute_btn)
        lay.addLayout(top_row)

        btns = QHBoxLayout()
        change = QPushButton("Change folder…")
        change.clicked.connect(self.choose_folder)
        open_btn = QPushButton("Open folder")
        open_btn.clicked.connect(lambda: QDesktopServices.openUrl(QUrl.fromLocalFile(str(self.library_dir))))
        add = QPushButton("Add images…")
        add.clicked.connect(self.add_images)
        for b in (change, open_btn, add):
            btns.addWidget(b)
        lay.addLayout(btns)

        self.search = QLineEdit(placeholderText="Filter by name…")
        self.search.textChanged.connect(self.apply_filter)
        lay.addWidget(self.search)

        self.grid = QListWidget()
        self.grid.setViewMode(QListWidget.ViewMode.IconMode)
        self.grid.setResizeMode(QListWidget.ResizeMode.Adjust)
        self.grid.setMovement(QListWidget.Movement.Static)
        self.grid.setIconSize(QSize(THUMB_SIZE, THUMB_SIZE * 16 // 9 if False else THUMB_SIZE))
        self.grid.setGridSize(QSize(THUMB_SIZE + 16, THUMB_SIZE + 34))
        self.grid.setWordWrap(True)
        self.grid.setUniformItemSizes(True)
        self.grid.currentItemChanged.connect(self.on_image_selected)
        lay.addWidget(self.grid, 1)

        self.count_label = QLabel()
        lay.addWidget(self.count_label)

        # watch-folder listener
        inbox_row = QHBoxLayout()
        self.inbox_status = QLabel()
        self.inbox_status.setWordWrap(True)
        self.inbox_status.setStyleSheet("color:#9a9aa2;")
        check = QPushButton("Check for images")
        check.clicked.connect(lambda: self.check_inbox(manual=True))
        settings_btn = QPushButton("Settings…")
        settings_btn.setToolTip("Jump to the Settings tab")
        settings_btn.clicked.connect(self.open_settings)
        inbox_row.addWidget(self.inbox_status, 1)
        inbox_row.addWidget(settings_btn)
        inbox_row.addWidget(check)
        lay.addLayout(inbox_row)
        self.refresh_inbox_status()
        return box

    def refresh_inbox_status(self):
        problem = folder_watch.is_configured()
        if folder_watch.watch_dir() is None:
            self.inbox_status.setText("No watch folder set — open Settings to pick one.")
        elif problem:
            self.inbox_status.setText(f"Watch folder off: {problem}")
        else:
            self.inbox_status.setText("Watch folder on.")

    def toggle_mute(self):
        muted = not self.sound.muted
        self.sound.set_muted(muted)
        self.music.set_muted(muted)
        self._update_mute_button()
        try:
            update_env(paths.ENV_PATH, {"JFFJ_MUTED": "true" if muted else "false"})
        except OSError:
            pass

    def _update_mute_button(self):
        self.mute_btn.setText("🔇" if self.sound.muted else "🔊")

    def open_settings(self):
        self.tabs.setCurrentIndex(self.tabs.count() - 1)  # the Settings tab is last
        self.set_watch_folder.setFocus()

    def reload_settings(self):
        """Re-read .env so edits take effect without restarting the app."""
        load_dotenv(paths.ENV_PATH, override=True)
        _force_gmail_settings()
        self.refresh_inbox_status()
        if hasattr(self, "send_btn") and not self.cooldown_timer.isActive():
            self.send_btn.setEnabled(mail_out.smtp_configured())

    def choose_folder(self):
        chosen = QFileDialog.getExistingDirectory(self, "Image library folder", str(self.library_dir))
        if chosen:
            self.library_dir = Path(chosen)
            self.folder_watcher.library_dir = self.library_dir
            self.reload_library()

    def add_images(self):
        files, _ = QFileDialog.getOpenFileNames(self, "Add images", "", "Images (*.png *.jpg *.jpeg *.webp)")
        if not files:
            return
        self.library_dir.mkdir(parents=True, exist_ok=True)
        import shutil
        for f in files:
            dest = self.library_dir / Path(f).name
            if not dest.exists():
                shutil.copy2(f, dest)
        self.reload_library()

    def reload_library(self):
        if self.thumb_worker and self.thumb_worker.isRunning():
            self.thumb_worker.requestInterruption()
            self.thumb_worker.wait(2000)
        self.folder_label.setText(str(self.library_dir))
        self.grid.clear()
        self.items_by_path.clear()
        d = self.library_dir
        files = []
        if d.is_dir():
            files = [f for f in d.iterdir() if f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS]
            files.sort(key=lambda f: f.stat().st_mtime, reverse=True)  # newest first
        placeholder = QPixmap(THUMB_SIZE, THUMB_SIZE)
        placeholder.fill(QColor("#202024"))
        for f in files:
            item = QListWidgetItem(QIcon(placeholder), f.stem[:22])
            item.setToolTip(f.name)
            item.setData(Qt.ItemDataRole.UserRole, str(f))
            self.grid.addItem(item)
            self.items_by_path[str(f)] = item
        self.count_label.setText(f"{len(files)} image(s)" if d.is_dir() else "Folder not found.")
        self.thumb_worker = ThumbWorker([str(f) for f in files], self.library_dir / ".thumbs")
        self.thumb_worker.ready.connect(self.on_thumb_ready)
        self.thumb_worker.start()
        self.apply_filter()

    def on_thumb_ready(self, path: str, thumb: str):
        item = self.items_by_path.get(path)
        if item:
            item.setIcon(QIcon(thumb))

    def apply_filter(self):
        needle = self.search.text().strip().lower()
        for i in range(self.grid.count()):
            it = self.grid.item(i)
            it.setHidden(bool(needle) and needle not in it.toolTip().lower())

    def on_image_selected(self, current, _previous):
        if current is None:
            return
        self.selected_image = current.data(Qt.ItemDataRole.UserRole)
        self.bg_mode.setCurrentText("Image")
        self.schedule_render()

    def check_inbox(self, manual: bool = False):
        if self.inbox_worker and self.inbox_worker.isRunning():
            if manual:
                self.statusBar().showMessage("Already checking — try again in a moment.", 4000)
            return
        self.reload_settings()
        if folder_watch.watch_dir() is None:
            if manual:
                self.statusBar().showMessage("No watch folder set — configure one in Settings.", 8000)
                self.open_settings()
            return
        self.inbox_status.setText("Checking…")
        self.inbox_worker = InboxWorker(self.folder_watcher)
        self.inbox_worker.done.connect(self.on_inbox_done)
        self.inbox_worker.start()

    def on_inbox_done(self, saved: list, message: str):
        self.inbox_status.setText(message)
        if saved:
            self.reload_library()
            first = self.items_by_path.get(saved[0])
            if first:
                self.grid.setCurrentItem(first)
            self.statusBar().showMessage(f"Received {len(saved)} new image(s).", 8000)

    # ---------- preview panel ----------
    def _build_preview_panel(self) -> QWidget:
        box = QWidget()
        lay = QVBoxLayout(box)
        self.preview = QLabel(alignment=Qt.AlignmentFlag.AlignCenter)
        self.preview.setMinimumSize(200, 300)
        self.preview.setSizePolicy(QSizePolicy.Policy.Ignored, QSizePolicy.Policy.Ignored)
        lay.addWidget(self.preview, 1)
        self.info_label = QLabel(alignment=Qt.AlignmentFlag.AlignCenter)
        self.info_label.setStyleSheet("color:#9a9aa2;")
        lay.addWidget(self.info_label)
        save = QPushButton("Save PNG…")
        save.setObjectName("primary")
        save.clicked.connect(self.save_png)
        lay.addWidget(save)
        return box

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self.show_preview_pixmap()

    def show_preview_pixmap(self):
        if self.last_image is None:
            return
        pm = pil_to_pixmap(self.last_image)
        self.preview.setPixmap(pm.scaled(self.preview.size(), Qt.AspectRatioMode.KeepAspectRatio,
                                         Qt.TransformationMode.SmoothTransformation))

    # ---------- controls panel ----------
    def _build_controls_panel(self) -> QWidget:
        tabs = self.tabs = QTabWidget()
        tabs.addTab(self._tab_background(), "Background")
        tabs.addTab(self._tab_text(), "Text")
        tabs.addTab(self._tab_effects(), "Color & Effects")
        tabs.addTab(self._tab_export(), "Frame & Export")
        tabs.addTab(self._tab_settings(), "Settings")
        tabs.setMinimumWidth(440)
        return tabs

    def _tab_settings(self):
        w = QWidget()
        f = QFormLayout(w)

        wf_intro = QLabel("Images added to your library automatically")
        wf_intro.setWordWrap(True)
        f.addRow(wf_intro)
        wf_row = QHBoxLayout()
        self.set_watch_folder = QLineEdit(placeholderText=r"e.g. G:\My Drive\Arico Drop")
        wf_browse = QPushButton("Browse…")
        wf_browse.clicked.connect(self.browse_watch_folder)
        wf_row.addWidget(self.set_watch_folder)
        wf_row.addWidget(wf_browse)
        f.addRow("Watch folder", wf_row)
        wf_note = QLabel(
            "Images dropped into this local folder (e.g. one synced by the Google Drive, "
            "Dropbox, or OneDrive desktop app) are added to the library automatically — "
            "no account needed. A file with a name already in the library is skipped, "
            "so it's never re-added."
        )
        wf_note.setWordWrap(True)
        wf_note.setStyleSheet("color:#9a9aa2;")
        f.addRow(wf_note)

        intro = QLabel("Email account used to send finished cards (optional)")
        intro.setWordWrap(True)
        intro.setStyleSheet("margin-top:14px;")
        f.addRow(intro)

        sending_from = QLabel(f"Sending from: <b>{GMAIL_SENDER}</b>")
        sending_from.setTextFormat(Qt.TextFormat.RichText)
        f.addRow(sending_from)

        gmail_hint = QLabel("Use a Gmail <b>app password</b> — not your normal password.")
        gmail_hint.setWordWrap(True)
        gmail_hint.setTextFormat(Qt.TextFormat.RichText)
        f.addRow(gmail_hint)
        self.set_password = QLineEdit()
        self.set_password.setEchoMode(QLineEdit.EchoMode.Password)
        self.set_show_pw = QCheckBox("Show password")
        self.set_show_pw.toggled.connect(
            lambda on: self.set_password.setEchoMode(QLineEdit.EchoMode.Normal if on else QLineEdit.EchoMode.Password)
        )
        f.addRow("App password", self.set_password)
        f.addRow(self.set_show_pw)

        row = QHBoxLayout()
        save = QPushButton("Save settings")
        save.setObjectName("primary")
        save.clicked.connect(self.save_settings)
        test = QPushButton("Test connection")
        test.clicked.connect(self.test_connection)
        row.addWidget(save)
        row.addWidget(test)
        f.addRow(row)
        self.settings_status = QLabel()
        self.settings_status.setWordWrap(True)
        f.addRow(self.settings_status)
        self.load_settings_fields()
        return self._scroll(w)

    def load_settings_fields(self):
        env = read_env(paths.ENV_PATH)
        self.set_password.clear()
        self.set_password.setPlaceholderText("saved — leave blank to keep" if env.get("JFFJ_SMTP_PASSWORD") else "16-character app password")
        self.set_watch_folder.setText(env.get("JFFJ_WATCH_FOLDER", ""))

    def browse_watch_folder(self):
        chosen = QFileDialog.getExistingDirectory(self, "Watch folder", self.set_watch_folder.text().strip())
        if chosen:
            self.set_watch_folder.setText(chosen)

    def save_settings(self):
        updates = {
            "JFFJ_PROVIDER": "gmail",
            "JFFJ_SMTP_USER": GMAIL_SENDER,
            "JFFJ_EMAIL_FROM": GMAIL_SENDER,
            "JFFJ_SMTP_HOST": "smtp.gmail.com",
            "JFFJ_SMTP_PORT": "587",
            "JFFJ_WATCH_FOLDER": self.set_watch_folder.text().strip(),
        }
        password = self.set_password.text().replace(" ", "")  # Google shows the code in groups of 4
        if password:
            updates["JFFJ_SMTP_PASSWORD"] = password
        try:
            update_env(paths.ENV_PATH, updates)
        except OSError as exc:
            self.settings_status.setText(f"Could not save: {exc}")
            return
        self.reload_settings()
        self.load_settings_fields()
        self.settings_status.setText("Saved. Settings are active now — no restart needed.")

    def test_connection(self):
        self.reload_settings()
        self.settings_status.setText("Testing…")
        self.test_worker = LoginTestWorker()
        self.test_worker.done.connect(self.settings_status.setText)
        self.test_worker.start()

    def _wire(self, widget):
        for sig in ("changed", "stateChanged", "currentTextChanged", "textChanged", "toggled"):
            if hasattr(widget, sig):
                getattr(widget, sig).connect(self.schedule_render)
                break
        return widget

    @staticmethod
    def _scroll(form_widget: QWidget) -> QScrollArea:
        area = QScrollArea()
        area.setWidgetResizable(True)
        area.setWidget(form_widget)
        return area

    def _tab_background(self):
        w = QWidget()
        f = QFormLayout(w)
        self.canvas_size = self._wire(QComboBox())
        self.canvas_size.addItems(list(CANVAS_SIZES))
        self.bg_mode = self._wire(QComboBox())
        self.bg_mode.addItems(["Image", "Gradient", "Solid Color"])
        self.bg_mode.setCurrentText("Image")
        self.image_opacity = self._wire(SliderRow(0, 100, DEFAULT_IMAGE_OPACITY, suffix="%"))
        self.gradient = self._wire(QComboBox())
        self.gradient.addItems(list(GRADIENTS))
        self.bg_color = self._wire(ColorButton("#141414"))
        f.addRow("Canvas size", self.canvas_size)
        f.addRow("Background", self.bg_mode)
        f.addRow("Image opacity", self.image_opacity)
        f.addRow("Gradient", self.gradient)
        f.addRow("Solid color", self.bg_color)
        hint = QLabel("Pick an image from the library on the left.")
        hint.setStyleSheet("color:#9a9aa2;")
        f.addRow(hint)
        return self._scroll(w)

    def _tab_text(self):
        w = QWidget()
        f = QFormLayout(w)
        self.text_edit = self._wire(QPlainTextEdit())
        self.text_edit.setPlaceholderText("Type your message here…")
        self.text_edit.setFixedHeight(130)
        self.text_edit.textChanged.connect(self.schedule_render)
        self.tagline = self._wire(QCheckBox("Append JFFJ tagline to every card"))
        self.tagline.setChecked(True)
        self.font_name = self._wire(QComboBox())
        self.font_name.addItems(list(FONTS))
        self.bold = self._wire(QCheckBox("Bold"))
        self.font_size = self._wire(SliderRow(20, 160, 72))
        self.auto_fit = self._wire(QCheckBox("Shrink to fit if the text runs long"))
        self.auto_fit.setChecked(True)
        self.line_spacing = self._wire(SliderRow(1.0, 2.0, 1.15, scale=20))
        self.alignment = self._wire(QComboBox())
        self.alignment.addItems(["Center", "Left", "Right"])
        self.side_margin = self._wire(SliderRow(40, 300, 100))
        f.addRow("Card text", self.text_edit)
        f.addRow(self.tagline)
        f.addRow("Font", self.font_name)
        f.addRow(self.bold)
        f.addRow("Font size", self.font_size)
        f.addRow(self.auto_fit)
        f.addRow("Line spacing", self.line_spacing)
        f.addRow("Alignment", self.alignment)
        f.addRow("Side margin", self.side_margin)
        return self._scroll(w)

    def _tab_effects(self):
        w = QWidget()
        f = QFormLayout(w)
        self.text_color = self._wire(ColorButton("#FFFFFF"))
        self.text_opacity = self._wire(SliderRow(0, 255, 255))
        self.stroke_on = self._wire(QCheckBox("Stroke / outline"))
        self.stroke_on.setChecked(True)
        self.stroke_width = self._wire(SliderRow(0, 12, 3))
        self.stroke_color = self._wire(ColorButton("#000000"))
        self.shadow_on = self._wire(QCheckBox("Drop shadow"))
        self.shadow_on.setChecked(True)
        self.shadow_color = self._wire(ColorButton("#000000"))
        self.shadow_opacity = self._wire(SliderRow(0, 255, 160))
        self.shadow_dx = self._wire(SliderRow(-40, 40, 4))
        self.shadow_dy = self._wire(SliderRow(-40, 40, 6))
        self.shadow_blur = self._wire(SliderRow(0, 30, 8))
        f.addRow("Text color", self.text_color)
        f.addRow("Text opacity", self.text_opacity)
        f.addRow(self.stroke_on)
        f.addRow("Stroke width", self.stroke_width)
        f.addRow("Stroke color", self.stroke_color)
        f.addRow(self.shadow_on)
        f.addRow("Shadow color", self.shadow_color)
        f.addRow("Shadow opacity", self.shadow_opacity)
        f.addRow("Shadow offset X", self.shadow_dx)
        f.addRow("Shadow offset Y", self.shadow_dy)
        f.addRow("Shadow blur", self.shadow_blur)
        return self._scroll(w)

    def _tab_export(self):
        w = QWidget()
        f = QFormLayout(w)
        self.frame_on = self._wire(QCheckBox("Edge frame"))
        self.frame_color = self._wire(ColorButton(ACCENT))
        self.anchor = self._wire(QComboBox())
        self.anchor.addItems(["Top", "Middle", "Bottom"])
        self.anchor.setCurrentText("Middle")
        self.v_offset = self._wire(SliderRow(-400, 400, 0))
        self.filename = QLineEdit("jffj_card")
        f.addRow(self.frame_on)
        f.addRow("Frame color", self.frame_color)
        f.addRow("Vertical placement", self.anchor)
        f.addRow("Fine-tune position", self.v_offset)
        f.addRow("File name", self.filename)

        preset_sep = QLabel("Style presets")
        preset_sep.setStyleSheet("font-weight:bold; margin-top:14px;")
        f.addRow(preset_sep)
        preset_note = QLabel("Save the look (opacity, frame, fonts, colors…) to reuse later — not the image or card text.")
        preset_note.setWordWrap(True)
        preset_note.setStyleSheet("color:#9a9aa2;")
        f.addRow(preset_note)
        self.preset_combo = QComboBox()
        f.addRow("Saved presets", self.preset_combo)
        preset_row = QHBoxLayout()
        load_btn = QPushButton("Load")
        load_btn.clicked.connect(self.load_preset)
        save_btn = QPushButton("Save as…")
        save_btn.clicked.connect(self.save_preset_as)
        delete_btn = QPushButton("Delete")
        delete_btn.clicked.connect(self.delete_preset)
        preset_row.addWidget(load_btn)
        preset_row.addWidget(save_btn)
        preset_row.addWidget(delete_btn)
        f.addRow(preset_row)
        self.preset_status = QLabel()
        self.preset_status.setWordWrap(True)
        f.addRow(self.preset_status)
        self.refresh_presets()

        sep = QLabel("Email it to yourself")
        sep.setStyleSheet("font-weight:bold; margin-top:14px;")
        f.addRow(sep)
        self.email_to = QLineEdit(placeholderText="you@example.com")
        self.email_subject = QLineEdit()
        send = self.send_btn = QPushButton("Send to my email")
        send.setObjectName("primary")
        send.clicked.connect(self.send_email)
        f.addRow("Your email", self.email_to)
        f.addRow("Subject", self.email_subject)
        f.addRow(send)
        if not mail_out.smtp_configured():
            note = QLabel("Email not configured — fill SMTP settings in .env.")
            note.setStyleSheet("color:#9a9aa2;")
            f.addRow(note)
            send.setEnabled(False)
        return self._scroll(w)

    # ---------- style presets ----------
    def refresh_presets(self, select: str | None = None):
        self.preset_combo.blockSignals(True)
        self.preset_combo.clear()
        self.preset_combo.addItems(presets.list_presets(paths.DATA_DIR))
        if select:
            self.preset_combo.setCurrentText(select)
        self.preset_combo.blockSignals(False)

    def save_preset_as(self):
        name, ok = QInputDialog.getText(self, "Save preset", "Name this preset:")
        if not ok or not name.strip():
            return
        try:
            saved = presets.save_preset(paths.DATA_DIR, name, self.collect())
        except ValueError as exc:
            self.preset_status.setText(str(exc))
            return
        self.refresh_presets(select=saved)
        self.preset_status.setText(f"Saved preset \"{saved}\".")

    def load_preset(self):
        name = self.preset_combo.currentText()
        if not name:
            self.preset_status.setText("No preset selected.")
            return
        values = presets.load_preset(paths.DATA_DIR, name)
        self._apply_preset_values(values)
        self.preset_status.setText(f"Loaded preset \"{name}\".")
        self.schedule_render()

    def delete_preset(self):
        name = self.preset_combo.currentText()
        if not name:
            return
        if QMessageBox.question(self, "Delete preset", f"Delete preset \"{name}\"?") != QMessageBox.StandardButton.Yes:
            return
        presets.delete_preset(paths.DATA_DIR, name)
        self.refresh_presets()
        self.preset_status.setText(f"Deleted preset \"{name}\".")

    def _apply_preset_values(self, v: dict):
        canvas_size = tuple(v["canvas_size"]) if "canvas_size" in v else None
        if canvas_size:
            for label, size in CANVAS_SIZES.items():
                if tuple(size) == canvas_size:
                    self.canvas_size.setCurrentText(label)
                    break
        self.bg_mode.setCurrentText(v["bg_mode"])
        self.image_opacity.setValue(v["image_opacity"])
        self.gradient.setCurrentText(v["gradient_name"])
        self.bg_color.set_color(v["bg_color"])
        self.tagline.setChecked(v["append_tagline"])
        self.font_name.setCurrentText(v["font_name"])
        self.bold.setChecked(v["bold"])
        self.font_size.setValue(v["font_size"])
        self.auto_fit.setChecked(v["auto_fit"])
        self.line_spacing.setValue(v["line_spacing"])
        self.alignment.setCurrentText(v["alignment"])
        self.side_margin.setValue(v["side_margin"])
        self.text_color.set_color(v["text_color"])
        self.text_opacity.setValue(v["text_opacity"])
        self.stroke_on.setChecked(v["stroke_enabled"])
        self.stroke_width.setValue(v["stroke_width"])
        self.stroke_color.set_color(v["stroke_color"])
        self.shadow_on.setChecked(v["shadow_enabled"])
        self.shadow_color.set_color(v["shadow_color"])
        self.shadow_opacity.setValue(v["shadow_opacity"])
        self.shadow_dx.setValue(v["shadow_dx"])
        self.shadow_dy.setValue(v["shadow_dy"])
        self.shadow_blur.setValue(v["shadow_blur"])
        self.frame_on.setChecked(v["frame_enabled"])
        self.frame_color.set_color(v["frame_color"])
        self.anchor.setCurrentText(v["anchor"])
        self.v_offset.setValue(v["v_offset"])

    # ---------- rendering ----------
    def collect(self) -> CardSettings:
        return CardSettings(
            canvas_size=CANVAS_SIZES[self.canvas_size.currentText()],
            bg_mode=self.bg_mode.currentText(),
            bg_image_path=self.selected_image,
            image_opacity=self.image_opacity.value(),
            gradient_name=self.gradient.currentText(),
            bg_color=self.bg_color.color(),
            text=self.text_edit.toPlainText(),
            append_tagline=self.tagline.isChecked(),
            font_name=self.font_name.currentText(),
            bold=self.bold.isChecked(),
            font_size=self.font_size.value(),
            auto_fit=self.auto_fit.isChecked(),
            line_spacing=self.line_spacing.value(),
            alignment=self.alignment.currentText(),
            side_margin=self.side_margin.value(),
            text_color=self.text_color.color(),
            text_opacity=self.text_opacity.value(),
            stroke_enabled=self.stroke_on.isChecked(),
            stroke_width=self.stroke_width.value(),
            stroke_color=self.stroke_color.color(),
            shadow_enabled=self.shadow_on.isChecked(),
            shadow_color=self.shadow_color.color(),
            shadow_opacity=self.shadow_opacity.value(),
            shadow_dx=self.shadow_dx.value(),
            shadow_dy=self.shadow_dy.value(),
            shadow_blur=self.shadow_blur.value(),
            frame_enabled=self.frame_on.isChecked(),
            frame_color=self.frame_color.color(),
            anchor=self.anchor.currentText(),
            v_offset=self.v_offset.value(),
        )

    def schedule_render(self, *_):
        self.render_timer.start()

    def render_now(self):
        s = self.collect()
        try:
            self.last_image, self.last_size_px = render_card(s)
        except Exception as exc:
            self.statusBar().showMessage(f"Render error: {exc}", 8000)
            return
        w, h = s.canvas_size
        self.info_label.setText(f"{w} x {h} · {s.font_name}{' Bold' if s.bold else ''} · {self.last_size_px}px")
        self.show_preview_pixmap()

    # ---------- export ----------
    def save_png(self):
        if self.last_image is None:
            return
        name = (self.filename.text().strip() or "jffj_card") + ".png"
        path, _ = QFileDialog.getSaveFileName(self, "Save card", str(Path.home() / "Downloads" / name), "PNG (*.png)")
        if path:
            self.last_image.save(path, "PNG")
            self.statusBar().showMessage(f"Saved {path}", 6000)

    def send_email(self):
        to = self.email_to.text().strip()
        if not mail_out.EMAIL_RE.match(to):
            QMessageBox.warning(self, "Email", "Enter a valid email address.")
            return
        if self.last_image is None:
            return
        buf = io.BytesIO()
        self.last_image.save(buf, "PNG")
        name = (self.filename.text().strip() or "jffj_card") + ".png"
        subject = self.email_subject.text().strip() or f"JFFJ Card — {name}"
        body = f"JFFJ card: {name}"

        # rate limit: one email per EMAIL_COOLDOWN_S, counted from each attempt (failures included)
        if self.email_worker and self.email_worker.isRunning():
            return
        remaining = EMAIL_COOLDOWN_S - (time.monotonic() - self.last_send_at)
        if remaining > 0:
            QMessageBox.information(self, "Slow down", f"Please wait {int(remaining) + 1}s before sending another email.")
            return
        self.last_send_at = time.monotonic()
        self.send_btn.setEnabled(False)
        self.cooldown_timer.start()
        self.update_send_button()

        self.email_worker = SendWorker(to, subject, body, buf.getvalue(), name)
        self.email_worker.finished_ok.connect(lambda: self.on_email_sent(to, subject, name))
        self.email_worker.failed.connect(lambda err: QMessageBox.critical(self, "Could not send", err))
        self.email_worker.start()

    def on_email_sent(self, to: str, subject: str, name: str):
        QMessageBox.information(
            self, "Email sent",
            f"Email completed.\n\nTo: {to}\nSubject: {subject}\nAttachment: {name}\nSent at: {time.strftime('%H:%M:%S')}",
        )

    def update_send_button(self):
        remaining = EMAIL_COOLDOWN_S - (time.monotonic() - self.last_send_at)
        if remaining > 0:
            self.send_btn.setEnabled(False)
            self.send_btn.setText(f"Wait {int(remaining) + 1}s…")
        else:
            self.cooldown_timer.stop()
            self.send_btn.setText("Send to my email")
            self.send_btn.setEnabled(mail_out.smtp_configured())

    def closeEvent(self, event):
        for worker in (self.thumb_worker, self.inbox_worker, self.email_worker):
            if worker and worker.isRunning():
                worker.requestInterruption()
                worker.wait(3000)
        self.music.stop()
        super().closeEvent(event)


def main():
    if sys.stderr is None or sys.stdout is None:  # pythonw has no console; keep errors in a log instead
        log = open(paths.LOG_PATH, "a", encoding="utf-8", buffering=1)
        sys.stdout = sys.stdout or log
        sys.stderr = sys.stderr or log
    app = QApplication(sys.argv)
    app.setStyleSheet(DARK_STYLE)
    app.setWindowIcon(QIcon(str(paths.ICON_PATH)))

    # Built now but never shown yet, so its (brief) construction cost happens while the
    # splash video is playing instead of as a visible gap after the splash closes.
    win = MainWindow()
    app._jffj_main_window = win  # keep a reference alive; nothing else holds one

    def reveal():
        win.show()
        win.music.start()  # starts only once the app is actually visible, not under the splash

    splash_video = media.find_splash_video()
    if splash_video:
        splash = SplashScreen(splash_video)
        splash.finished.connect(reveal)
        splash.show()
    else:
        reveal()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
