# LLM layer checks: status endpoint, chat proxy offline 502, canned FAQ answers, admin wiring.
import threading, functools, http.server, socketserver, time, sys, os, subprocess, requests, json
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright

BASE = r"C:\Users\ochak\OneDrive\Documents\Default Project\infraconcept-live"
PORT = 8170
# run the REAL production origin (node server.js) on PORT
env = dict(os.environ); env["IC_PORT"] = str(PORT)
proc = subprocess.Popen([os.path.join(BASE, ".server", "bin", "node.exe"), os.path.join(BASE, ".server", "server.js")],
                        env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.2)
if proc.poll() is not None:
    print("!! node origin didn't start"); sys.exit(1)

fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (f"   [{extra}]" if extra else ""))
    if not cond: fails.append(name)

# 1. status endpoint (llama not running -> online:false, no crash)
r = requests.get(f"http://127.0.0.1:{PORT}/api/llm-status", timeout=15)
check("llm-status stays up when LLM offline", r.status_code == 200 and r.json().get("online") is False, r.text[:80])

# 2. chat proxy with LLM offline -> 502 handled (not crash), JSON
r = requests.post(f"http://127.0.0.1:{PORT}/api/chat", json={"messages": [{"role": "user", "content": "zdravej"}]}, timeout=20)
check("proxy 502-json, no crash", r.status_code in (502, 504) and "error" in r.text, str(r.status_code))

with sync_playwright() as pw:
    b = pw.chromium.launch(); page = b.new_page(viewport={"width": 1440, "height": 940})
    page.goto(f"http://127.0.0.1:{PORT}/index.html")
    page.wait_for_function("window.appReady === true", timeout=20000)
    page.wait_for_timeout(300)
    page.click("#chatBtn"); page.wait_for_timeout(350)
    check("chat opens", page.locator("#chat").is_visible())
    check("greeted by name", "Площадко" in page.locator("#chatMsgs").inner_text())
    check("quick chips rendered", page.locator("#chatQuick .chip").count() == 4)
    # canned FAQ path (LLM offline): ask about flooring
    page.fill("#chatInput", "каква настилка е най-добра за детска площадка"); page.click("#chatSend")
    page.wait_for_function("document.querySelectorAll('#chatMsgs .cm').length >= 3", timeout=15000)
    txt = page.locator("#chatMsgs").inner_text()
    check("canned flooring answer", "Innoflex" in txt or "Corkeen" in txt or "каучук" in txt)
    check("chip to catalog offered", page.locator("#chatMsgs .cm-chips .chip").count() >= 1)
    # free text that matches nothing -> noIdea + offline note
    page.fill("#chatInput", "колко е яко у вас"); page.click("#chatSend")
    page.wait_for_function("document.querySelectorAll('#chatMsgs .cm').length >= 5", timeout=15000)
    txt2 = page.locator("#chatMsgs").inner_text()
    check("no-idea + offline note", "445 492" in txt2 or "офлайн" in txt2)
    # admin: set base + model then test-shows-offline; persists
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    page.click("#adminBtn"); page.wait_for_timeout(250)
    page.fill("#cllmbase", "http://127.0.0.1:10000/v1")
    page.evaluate("document.getElementById('cllmbase').dispatchEvent(new Event('change'))")
    st = page.evaluate("JSON.parse(localStorage.getItem('ic-admin')).llmBase")
    check("admin llmBase persisted", st == "http://127.0.0.1:10000/v1", st)
    page.click("#cllmtest"); page.wait_for_timeout(1500)
    check("llm test reports offline cleanly", "±" not in page.locator("#cllmstat").inner_text())
    b.close()

proc.terminate(); proc.wait(timeout=8)
print("\n" + ("LLM LAYER ALL PASS" if not fails else f"FAILURES: {fails}"))
sys.exit(1 if fails else 0)
