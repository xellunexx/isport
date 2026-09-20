# Drive the chat over the WAN (persona subject + a product-faceting subject), capture the transcript.
import sys, time, requests
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright

URL = "https://compromise-secondary-bill-nails.trycloudflare.com/"
with sync_playwright() as pw:
    b = pw.chromium.launch(); page = b.new_page(viewport={"width": 1500, "height": 920})
    page.goto(URL, wait_until="domcontentloaded")
    page.wait_for_function("window.appReady === true", timeout=45000)
    page.wait_for_timeout(400)
    page.click("#chatBtn"); page.wait_for_timeout(400)
    stat = page.locator("#chatStatus").inner_text()

    def ask(q):
        pre = page.locator("#chatMsgs .cm").count()
        page.fill("#chatInput", q); page.click("#chatSend")
        before_ans = page.locator("#chatMsgs .cm.it").count()
        page.wait_for_function(f"document.querySelectorAll('#chatMsgs .cm.it .cm-b').length > {before_ans}", timeout=120000)
        page.wait_for_timeout(400)

    ask("здравей! представи се и кажи с какво помагаш.")
    ask("коя настилка препоръчваш за детска площадка със съоръжения с височина и какви са сроковете?")
    stat2 = page.locator("#chatStatus").inner_text()
    print("STATUS: pre:", repr(stat), "| during:", repr(stat2))
    print("=== TRANSCRIPT (WAN, real LLM) ===")
    for m in page.locator("#chatMsgs .cm").all():
        who = "Площадко" if "it" in (m.get_attribute("class") or "") else "USER"
        body = m.locator(".cm-b").inner_text()
        print(f"\n[{who}]\n{body}")
    b.close()
