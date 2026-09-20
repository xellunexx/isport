# Find the description/spec container on a product page.
from bs4 import BeautifulSoup
import re, os, sys
sys.stdout.reconfigure(encoding="utf-8")

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
html = open(os.path.join(BASE, "crawl", "raw", "product_example.html"), encoding="utf-8").read()
soup = BeautifulSoup(html, "lxml")

# the paragraph with dims
p = soup.find(string=re.compile(r"Размери на съоръжението"))
node = p
for i in range(6):
    node = node.parent
    txt = node.get_text(" | ", strip=True)
    print(f"--- ancestor {node.name} .{'.'.join(node.get('class', [])) or '-'} (len={len(txt)}) ---")
    print(txt[:600].replace("\n", " "))
    print()
