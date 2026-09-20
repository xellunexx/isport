# refresh_link.ps1 - keep ONE valid public URL for the live build, with zero churn.
# Order: (0) ensure origin :8043  ->  (1) recorded URL verifies? then only normalize+exit
#        (2) else poll cloudflared's log for the latest quick-tunnel URL (never kill a working
#            tunnel);  (3) wait for Cloudflare edge DNS to materialize (can take minutes);
#        (4) verify end-to-end;  (5) only THEN persist PUBLIC-URL.txt + normalize canonicals.
$BASE = Split-Path -Parent $PSScriptRoot
$SRV  = Join-Path $BASE ".server"
$LOGS = Join-Path $SRV "logs"
$PY   = "C:\Users\ochak\OneDrive\Documents\Default Project\.venv\Scripts\python.exe"
$PU   = Join-Path $SRV "PUBLIC-URL.txt"

function Get-Text($p) {
  if (-not (Test-Path $p)) { return "" }
  $raw = Get-Content $p -Raw -ErrorAction SilentlyContinue
  if ([string]::IsNullOrEmpty($raw)) { return "" }
  return $raw
}

# (0) origin alive on :8043
if (-not (Get-NetTCPConnection -LocalPort 8043 -State Listen -ErrorAction SilentlyContinue)) {
  Start-Process cmd.exe -ArgumentList "/c `"$SRV\http.cmd`"" -WindowStyle Hidden
  Start-Sleep -Milliseconds 1500
  "origin started on :8043"
}

function Verify-Live($url) {
  for ($i = 0; $i -lt 40; $i++) {
    try {
      $r = Invoke-WebRequest -Uri "$url/" -UseBasicParsing -TimeoutSec 15
      if ($r.StatusCode -eq 200 -and $r.Content -match "app\.js") { return $true }
    } catch { Start-Sleep -Seconds 2 }
  }
  return $false
}

# (1) recorded URL still live?
$current = $null
if (Test-Path $PU) { $c = (Get-Content $PU -Raw).Trim(); if ($c) { $current = $c } }
if ($current -and (Verify-Live $current)) {
  & $PY (Join-Path $BASE "tools\host_switch.py") $current | Out-Null
  "LIVE (kept): $current"
  exit 0
}

# (2) wait for a quick-tunnel URL in cloudflared's log; start one ONLY if cloudflared is absent
$cand = $null
for ($round = 0; $round -lt 8 -and -not $cand; $round++) {
  if (-not (Get-Process cloudflared -ErrorAction SilentlyContinue)) {
    $tlog0 = Join-Path $LOGS "tunnel.log"
    try { Remove-Item $tlog0 -Force } catch {}
    Start-Process cmd.exe -ArgumentList "/c `"$SRV\tunnel.cmd`"" -WindowStyle Hidden
  }
  $tlog = Join-Path $LOGS "tunnel.log"
  for ($i = 0; $i -lt 30 -and -not $cand; $i++) {
    $raw = Get-Text $tlog
    if ($raw) {
      $m = [regex]::Matches($raw, "https://[a-z0-9-]+\.trycloudflare\.com")
      if ($m.Count) { $cand = $m[$m.Count - 1].Value }
    }
    if (-not $cand) { Start-Sleep -Seconds 2 }
  }
  if ($cand) {
    # (3) DNS materialization WAIT - edge hostnames appear minutes after registration.
    $h = $cand -replace "^https://", ""
    $resolved = $false
    for ($i = 0; $i -lt 150 -and -not $resolved; $i++) {
      $r1 = Resolve-DnsName -Name $h -ErrorAction SilentlyContinue
      if (-not $r1) { $r1 = Resolve-DnsName -Name $h -Server "1.1.1.1" -ErrorAction SilentlyContinue }
      if ($r1) { $resolved = $true; break }
      Start-Sleep -Seconds 4
    }
    if (-not $resolved) { "  $cand never resolved - rotating"; $cand = $null }
  }
}
if (-not $cand) { "!! could not mint a working tunnel URL"; exit 1 }
if (-not (Verify-Live $cand)) { "!! $cand resolved but never served"; exit 1 }

# (5) persist + normalize
Set-Content $PU $cand
& $PY (Join-Path $BASE "tools\host_switch.py") $cand | Out-Null
"normalized canonical hosts -> $cand"
"LIVE: $cand"
