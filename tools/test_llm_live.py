# Live persona test: real qwen LLM via the site proxy, admin prefs off default.
import threading, functools, http.server, socketserver, time, sys, os, subprocess, requests
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright
BASE = r"C:\Users\ochak\OneDrive\Documents\Default Project\infraconcept-live"
PORT = 8171
env = dict(os.environ); env["IC_PORT"] = str(PORT)
proc = subprocess.Popen([os.path.join(BASE, ".server", "bin", "node.exe"), os.path.join(BASE, ".server", "server.js")],
                        env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.2)
with sync_playwright() as pw:
    b = pw.chromium.launch(); page = b.new_page(viewport={"width": 1440, "height": 900})
    page.goto(f"http://127.0.0.1:{PORT}/index.html")
    page.wait_for_function("window.appReady === true", timeout=20000)
    page.click("#chatBtn"); page.wait_for_timeout(400)
    stat = page.locator("#chatStatus").inner_text()
    print("status line:", stat)
    page.fill("#chatInput", "kolko projekta imate do sega?")
    page.click("#chatSend")
    # wait for a NEW assistant bubble (non-greeting)
    page.wait_for_function("Array.from(document.querySelectorAll('#chatMsgs .cm.it .cm-b')).length >= 2", timeout=120000)
    stat2 = page.locator("#chatStatus").inner_text()
    answers = page.locator("#chatMsgs .cm.it .cm-b").all_inner_texts()
    answer = answers[-1]
    print("status:", stat2, "| last answer:", answer[:260])
    ok = len(answer.strip()) > 10
    print("LLM answered:", "PASS" if ok else "FAIL")
    b.close()
proc.terminate()
