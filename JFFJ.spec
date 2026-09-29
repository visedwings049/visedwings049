# -*- mode: python ; coding: utf-8 -*-
import sys

is_mac = sys.platform == "darwin"
icon_file = "assets/jffj.icns" if is_mac else "assets/jffj.ico"

a = Analysis(
    ['jffj_desktop.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('assets/fonts', 'assets/fonts'),
        ('assets/jffj.ico', 'assets'),
        ('assets/jffj.icns', 'assets'),
        ('assets/jffj_icon.png', 'assets'),
        ('assets/sfx', 'assets/sfx'),
        ('assets/music', 'assets/music'),
        ('assets/splash', 'assets/splash'),
        ('assets/library/Arico', 'assets/library/Arico'),
    ],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['streamlit', 'tkinter', 'numpy', 'pandas'],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='JFFJ',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=not is_mac,  # UPX on macOS is flaky (especially Apple Silicon) and unnecessary here
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=[icon_file],
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=not is_mac,
    upx_exclude=[],
    name='JFFJ',
)

if is_mac:
    app = BUNDLE(
        coll,
        name='JFFJ.app',
        icon=icon_file,
        bundle_identifier='com.slumberrealms.jffj',
        info_plist={
            'CFBundleName': 'JFFJ Card Generator',
            'CFBundleShortVersionString': '1.0.0',
            'CFBundleVersion': '1.0.0',
            'NSHighResolutionCapable': True,
            'NSHumanReadableCopyright': 'Slumber Realms',
            # No camera/mic/contacts access is used, so no usage-description keys are needed.
            # ~/Documents is deliberately avoided at runtime (see jffj/paths.py) so this app
            # never needs a Documents-folder access prompt either.
        },
    )
