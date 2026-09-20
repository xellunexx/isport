# runner.ps1 — lauched in a SEPARATE console (cmd start) so children survive the caller.
# Starts: localhost static server (:8043) + cloudflare quick tunnel. Logs to .server\logs\.
$ErrorActionPreference = "SilentlyContinue"
$BASE = Split-Path -Parent $PSScriptRoot
$SRV  = Join-Path $BASE ".server"
$WEB  = Join-Path $SRV "webroot"
$BIN  = Join-Path $SRV "bin\cloudflared.exe"
$LOGS = Join-Path $SRV "logs"
$PYEXE = "C:\Users\ochak\OneDrive\Documents\Default Project\.venv\Scripts\python.exe"

# stop leftovers
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
foreach ($c in (Get-NetTCPConnection -LocalPort 8043 -State Listen -ErrorAction SilentlyContinue)) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 400

# webroot sync (junctions for dirs, copy for the one file)
foreach ($dir in @("assets", "data", "img")) {
  $dst = Join-Path $WEB $dir
  if (-not (Test-Path $dst)) { cmd /c mklink /J "$dst" "$(Join-Path $BASE $dir)" | Out-Null }
}
Copy-Item (Join-Path $BASE "index.html") (Join-Path $WEB "index.html") -Force

# static server (localhost-only; WAN reaches it only via the tunnel)
Start-Process -FilePath $PYEXE -ArgumentList @("-m","http.server","8043","--bind","127.0.0.1","--directory",$WEB) `
  -WindowStyle Hidden -RedirectStandardOutput (Join-Path $LOGS "http.out.log") -RedirectStandardError (Join-Path $LOGS "http.log")
Start-Sleep -Milliseconds 700

# cloudflare quick tunnel (logs the public URL to stderr)
Start-Process -FilePath $BIN -ArgumentList @("tunnel","--url","http://127.0.0.1:8043","--no-autoupdate") `
  -WindowStyle Hidden -RedirectStandardError (Join-Path $LOGS "tunnel.log") -RedirectStandardOutput (Join-Path $LOGS "tunnel.out.log")
"launched"
