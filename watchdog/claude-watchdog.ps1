# Watchdog: relaunches Claude Code desktop app if it stops running.
# Usage: .\claude-watchdog.ps1 [-Interval 10]
#   -Interval  seconds between checks (default: 10)

param(
    [int]$Interval = 10
)

# Common install paths for Claude Code on Windows
$SearchPaths = @(
    "$env:LOCALAPPDATA\Programs\claude\Claude.exe",
    "$env:LOCALAPPDATA\Programs\Claude Code\Claude.exe",
    "$env:PROGRAMFILES\Claude\Claude.exe",
    "$env:PROGRAMFILES\Claude Code\Claude.exe"
)

function Find-ClaudeExe {
    # Check environment override first
    if ($env:CLAUDE_BIN -and (Test-Path $env:CLAUDE_BIN)) {
        return $env:CLAUDE_BIN
    }
    foreach ($path in $SearchPaths) {
        if (Test-Path $path) { return $path }
    }
    # Fall back to PATH
    $found = Get-Command claude -ErrorAction SilentlyContinue
    if ($found) { return $found.Source }
    return $null
}

$ClaudeExe = Find-ClaudeExe

if (-not $ClaudeExe) {
    Write-Error "Could not locate the Claude executable. Set `$env:CLAUDE_BIN and re-run."
    exit 1
}

$ProcessName = [System.IO.Path]::GetFileNameWithoutExtension($ClaudeExe)

Write-Host "Watchdog started. Monitoring: $ClaudeExe (check every ${Interval}s)"
Write-Host "Press Ctrl-C to stop."

function Is-ClaudeRunning {
    $procs = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue
    return ($null -ne $procs -and $procs.Count -gt 0)
}

while ($true) {
    if (-not (Is-ClaudeRunning)) {
        $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        Write-Host "[$ts] Claude is not running — relaunching..."
        Start-Process -FilePath $ClaudeExe -WindowStyle Normal
        Start-Sleep -Seconds 3  # give it a moment before re-checking
    }
    Start-Sleep -Seconds $Interval
}
