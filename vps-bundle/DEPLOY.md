# Инфра Концепт — VPS deployment (no LLM)

Оne folder, zero third-party Python packages (`serve_vps.py` uses only the standard library).

## Layout
```
vps-bundle/
  serve_vps.py        # the origin (python 3.9+)
  site/               # the full production web root
    index.html        # the app
    assets/ data/ img/
    p/ series/ brand/ cat/ audience/ project/   # 2,743 static SEO pages
    sitemap.xml robots.txt redirects.json
```

## Run (manual)

```bash
python3 serve_vps.py --host 0.0.0.0 --port 8000 --root site
```

Upload `vps-bundle/` anywhere (scp/rsync). Requires ONLY python3 installed.

## As a service (systemd, Ubuntu/Debian)

```bash
sudo mkdir -p /opt/infraconcept-web
sudo cp -r vps-bundle/* /opt/infraconcept-web/
sudo tee /etc/systemd/system/infraconcept-web.service >/dev/null <<'EOF'
[Unit]
Description=Infraconcept web catalog
After=network.target
[Service]
Type=simple
WorkingDirectory=/opt/infraconcept-web
ExecStart=/usr/bin/python3 /opt/infraconcept-web/serve_vps.py --host 127.0.0.1 --port 8000 --root site
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload && sudo systemctl enable --now infraconcept-web
sudo ufw allow 8000   # or front it with Caddy/nginx for TLS and port 80/443
```

Point your domain at the VPS, front with Caddy for free TLS, and the site is done.
LLM sidecar (/api/chat) is intentionally NOT in this build; configure later via `LLM_BASE` if you ever want Площадко live.

Verify locally before shipping: run `tools/test_deploy.py` from the source tree.
