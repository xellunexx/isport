# Replace evaluate(scrollIntoView) call sites with the instant-scroll helper.
import io, re, sys
sys.stdout.reconfigure(encoding="utf-8")
p = r"C:\Users\ochak\OneDrive\Documents\Default Project\infraconcept-live\tools\test_browser.py"
s = io.open(p, encoding="utf-8").read()
s2, n = re.subn(
    r'page\.evaluate\("document\.querySelector\(\x27(#[a-zA-Z]+)\x27\)\.scrollIntoView\(\)"\)',
    lambda mo: "scroll_instant(page, '%s')" % mo.group(1), s)
io.open(p, "w", encoding="utf-8").write(s2)
print("sites replaced:", n)

