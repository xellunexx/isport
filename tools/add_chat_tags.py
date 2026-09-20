# insert data/assistant.js + assets/js/chat.js script tags (idempotent)
import io, sys
sys.stdout.reconfigure(encoding="utf-8")
p = r"C:\Users\ochak\OneDrive\Documents\Default Project\infraconcept-live\index.html"
s = io.open(p, encoding="utf-8").read()
if "data/assistant.js" in s:
    print("already"); sys.exit(0)
import re
m = re.search(r'(<script src="assets/js/app\.js[^"]*"></script>)', s)
assert m, "app.js tag not found"
insert = '<script src="data/assistant.js?v=1"></script>\n<script src="assets/js/chat.js?v=1"></script>\n'
s = s[:m.start()] + insert + s[m.start():]
io.open(p, "w", encoding="utf-8").write(s)
print("inserted chat+assistant tags")
