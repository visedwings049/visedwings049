@echo off
cd /d "%~dp0"

if exist ".venv\Scripts\activate.bat" call ".venv\Scripts\activate.bat"

rem pythonw = no console window; errors go to jffj_error.log
start "" pythonw jffj_desktop.py
exit
