# Stamp index.html's local asset refs with ?v=<UTC minute> so browsers/edges NEVER
# keep stale code while keeping index.html (the document) no-cache.
import io, re, sys, time
sys.stdout.reconfigure(encoding="utf-8")
BASE = r"C:\Users\ochak\OneDrive\Documents\Default Project\infraconcept-live\index.html"
s = io.open(BASE, encoding="utf-8").read()
STAMP = time.strftime("%Y%m%d%H%M", time.gmtime())

def bump(m):
    path = m.group(1)
    return f"{path}?v={STAMP}"

n = 0
def _rep(s, pattern):
    global n
    s2, c = re.subn(pattern, bump, s)
    n += c
    return s2

s = _rep(s, r'(assets/(?:js|css)/[\w./-]+\.(?:js|css))(?:\?v=\d+)?')
s = _rep(s, r'(data/(?:catalog|i18n|brands)\.js)(?:\?v=\d+)?')
io.open(BASE, "w", encoding="utf-8").write(s)
print("stamped", n, "asset refs with v=" + STAMP)
