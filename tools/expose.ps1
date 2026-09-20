# expose.ps1 - put the catalog app on the public internet via Cloudflare quick-tunnel.
# Chain: https://<random>.trycloudflare.com (Cloudflare edge, HTTPS) -> cloudflared.exe on this PC
#        -> http://127.0.0.1:8043 (Python static server, localhost-only) -> .server\webroot (app files only).
# Idempotent. Stop everything with tools\unexpose.ps1.
$BASE  = Split-Path -Parent $PSScriptRoot
$SRV   = Join-Path $BASE ".server"
$WEB   = Join-Path $SRV "webroot"
$LOGS  = Join-Path $SRV "logs"
$PORT  = 8043
$BIN   = Join-Path $SRV "bin\cloudflared.exe"
New-Item -ItemType Directory -Force -Path $WEB, $LOGS, (Split-Path $BIN) | Out-Null

# 1) clean webroot: junctions to app dirs + fresh index.html (crawl/ and tools/ are NOT exposed)
foreach ($dir in @("assets", "data", "img")) {
  $dst = Join-Path $WEB $dir
  if (Test-Path $dst) { cmd /c rmdir "$dst" | Out-Null }
  cmd /c mklink /J "$dst" "$(Join-Path $BASE $dir)" | Out-Null
}
# cache-bust code/css/data refs in index.html BEFORE publishing it to the webroot
& "C:\Users\ochak\OneDrive\Documents\Default Project\.venv\Scripts\python.exe" (Join-Path $BASE "tools\bump_version.py") | Out-Null
Copy-Item (Join-Path $BASE "index.html") (Join-Path $WEB "index.html") -Force

# 1b) regenerate launchers for THIS folder (paths are baked into the .cmd files)
$NODE = Join-Path $SRV "bin\node.exe"
if (-not (Test-Path $NODE)) { Copy-Item "C:\Users\ochak\AppData\Local\Temp\opencode\tools\node-v24.19.0-win-x64\node.exe" $NODE -Force }
Set-Content -Path (Join-Path $SRV "http.cmd") -Encoding ASCII -Value "@echo off`r`n`"$NODE`" `"$SRV\server.js`" 1>>`"$LOGS\http.out.log`" 2>>`"$LOGS\http.log`"`r`n"
Set-Content -Path (Join-Path $SRV "tunnel.cmd") -Encoding ASCII -Value "@echo off`r`n`"$BIN`" tunnel --url http://127.0.0.1:$PORT --no-autoupdate 1>`"$LOGS\tunnel.out.log`" 2>`"$LOGS\tunnel.log`"`r`n"

# 2) local static server (localhost-only) if not listening
if (-not (Get-NetTCPConnection -LocalPort $PORT -State Listen -ErrorAction SilentlyContinue)) {
  Start-Process cmd.exe -ArgumentList "/c `"$SRV\http.cmd`"" -WindowStyle Hidden
  Start-Sleep -Milliseconds 800
  "static server: up on 127.0.0.1:$PORT"
} else { "static server: already on :$PORT" }

# 3) cloudflared quick tunnel if not running
if (-not (Get-Process cloudflared -ErrorAction SilentlyContinue)) {
  if (-not (Test-Path $BIN)) {
    Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $BIN -UseBasicParsing
  }
  $tlog = Join-Path $LOGS "tunnel.log"; if (Test-Path $tlog) { Remove-Item $tlog -Force }
  Start-Process cmd.exe -ArgumentList "/c `"$SRV\tunnel.cmd`"" -WindowStyle Hidden
  "tunnel: starting..."
} else { "tunnel: already running" }

# 4) find and persist the public URL
$url = $null
for ($i = 0; $i -lt 45 -and -not $url; $i++) {
  Start-Sleep -Seconds 1
  $tlog = Join-Path $LOGS "tunnel.log"
  if (Test-Path $tlog) {
    $m = [regex]::Match((Get-Content $tlog -Raw -ErrorAction SilentlyContinue), "https://[a-z0-9-]+\.trycloudflare\.com")
    if ($m.Success) { $url = $m.Value }
  }
}
if ($url) {
  Set-Content -Path (Join-Path $SRV "PUBLIC-URL.txt") -Value $url
  ""
  "PUBLIC URL:  $url"
} else {
  "!! URL not found yet - see .server\logs\tunnel.log"
}
