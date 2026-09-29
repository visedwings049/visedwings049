@echo off
cd /d "%~dp0"
python tools\make_icon.py
python -m PyInstaller --noconfirm --clean --windowed --name JFFJ --icon assets\jffj.ico ^
  --add-data "assets\fonts;assets\fonts" --add-data "assets\jffj.ico;assets" ^
  --add-data "assets\sfx;assets\sfx" --add-data "assets\music;assets\music" --add-data "assets\splash;assets\splash" ^
  --add-data "assets\library\Arico;assets\library\Arico" ^
  --exclude-module streamlit --exclude-module tkinter --exclude-module numpy --exclude-module pandas ^
  jffj_desktop.py
set ISCC="%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"
if not exist %ISCC% set ISCC="C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
%ISCC% installer.iss
echo.
echo Installer: installer\JFFJ_Setup.exe
pause
