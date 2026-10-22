# Claude Console Watchdog

Keeps the Claude Code desktop app running. If it crashes, the watchdog detects it within a few seconds and relaunches it automatically — so you never lose remote control.

## macOS / Linux

```bash
chmod +x claude-watchdog.sh
./claude-watchdog.sh
```

Runs a check every 10 seconds by default:

```bash
./claude-watchdog.sh --interval 5
```

If Claude isn't on your PATH or in `/Applications`, point to it explicitly:

```bash
CLAUDE_BIN=/path/to/Claude ./claude-watchdog.sh
```

**Run in the background (survives terminal close):**

```bash
nohup ./claude-watchdog.sh > ~/claude-watchdog.log 2>&1 &
echo $! > ~/claude-watchdog.pid
```

To stop it: `kill $(cat ~/claude-watchdog.pid)`

---

## Windows (PowerShell)

```powershell
.\claude-watchdog.ps1
```

Custom interval:

```powershell
.\claude-watchdog.ps1 -Interval 5
```

If the script can't find Claude, set the path:

```powershell
$env:CLAUDE_BIN = "C:\path\to\Claude.exe"
.\claude-watchdog.ps1
```

**Run minimized at startup** — paste into PowerShell to create a Startup shortcut:

```powershell
$WsShell = New-Object -ComObject WScript.Shell
$Shortcut = $WsShell.CreateShortcut("$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\claude-watchdog.lnk")
$Shortcut.TargetPath = "powershell.exe"
$Shortcut.Arguments = "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PWD\claude-watchdog.ps1`""
$Shortcut.Save()
```
