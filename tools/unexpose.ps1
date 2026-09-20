# unexpose.ps1 — take the site off the WAN: stop tunnel + local static server.
$PORT = 8043
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
$conns = Get-NetTCPConnection -LocalPort $PORT -State Listen -ErrorAction SilentlyContinue
foreach ($c in $conns) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }
"stopped: tunnel + static server (port $PORT)"
