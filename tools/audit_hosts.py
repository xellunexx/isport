# Audit which hosts the deployed SEO layer currently references (after several tunnel hops).
import re, pathlib, collections, sys
sys.stdout.reconfigure(encoding="utf-8")
w = pathlib.Path(r"C:\Users\ochak\OneDrive\Documents\Default Project\infraconcept-live\.server\webroot")
hosts = collections.Counter()
pat = re.compile(r"https://[a-z0-9.-]+\.(?:trycloudflare\.com|lhr\.life|localhost\.run)")
for f in w.rglob("*"):
    if f.is_file() and f.suffix in (".html", ".xml", ".txt", ".json"):
        s = f.read_text(encoding="utf-8", errors="ignore")
        for m in pat.findall(s):
            hosts[m] += 1
for h, n in hosts.most_common():
    print(n, h)
