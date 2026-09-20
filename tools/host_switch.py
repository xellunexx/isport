# Normalize ALL absolute/canonical host refs in the deployed webroot to the current public URL.
# (Pattern-based — survives any number of historic tunnel hops; doesn't chase the previous one.)
# Usage: host_switch.py [current_public_url]   (default: .server/PUBLIC-URL.txt)
import io, pathlib, re, sys
sys.stdout.reconfigure(encoding="utf-8")
new = sys.argv[1] if len(sys.argv) > 1 else None
if not new:
    new = pathlib.Path(r"C:\Users\ochak\OneDrive\Documents\Default Project\infraconcept-live\.server\PUBLIC-URL.txt").read_text(encoding="utf-8").strip()
assert new.startswith("http"), "need a URL"
new = new.rstrip("/")
PAT = re.compile(r"https://[a-z0-9.-]+\.(?:trycloudflare\.com|lhr\.life|localhost\.run)")
w = pathlib.Path(r"C:\Users\ochak\OneDrive\Documents\Default Project\infraconcept-live\.server\webroot")
n = 0
for f in w.rglob("*"):
    if f.is_file() and f.suffix in (".html", ".xml", ".txt", ".json"):
        s = f.read_text(encoding="utf-8", errors="ignore")
        s2 = PAT.sub(new, s)
        if s2 != s:
            f.write_text(s2, encoding="utf-8")
            n += 1
print("host-normalized files:", n, "->", new)
BuilDr_VARS = pathlib.Path(r"C:\Users\ochak\OneDrive\Documents\Default Project\infraconcept-live\tools\seo_build.py")
s = io.open(BuilDr_VARS, encoding="utf-8").read()
s = re.sub(r'HOST = "[^"]*"', f'HOST = "{new}"', s, count=1)
io.open(BuilDr_VARS, "w", encoding="utf-8").write(s)
print("seo_build HOST ->", new)


