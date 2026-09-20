# Check pagination on series pages + innoflex page structure.
from bs4 import BeautifulSoup
import re, os, sys
sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

for name in ["series_pejki-fulco", "extra_innoflex", "list_park_fulco"]:
    p = os.path.join(BASE, "crawl", "raw", name + ".html")
    if not os.path.exists(p):
        print("missing", name)
        continue
    html = open(p, encoding="utf-8").read()
    soup = BeautifulSoup(html, "lxml")
    print("==== ", name, len(html))
    pag = soup.select(".pagination a, .page-numbers, a.page-link, [class*=paginat] a, a[href*=paged], a[href*=product-page]")
    for a in pag[:20]:
        print("  pag:", a.get("href"))
    # any data attributes suggesting ajax pagination
    for el in soup.select("[data-page], [data-max], [data-total], [data-posts]")[:8]:
        print("  data:", el.name, el.attrs)
    prod_links = [a["href"] for a in soup.find_all("a", href=True) if re.match(r"https?://infraconcept\.bg/product/[^/]+/?$", a["href"])]
    print("  product links:", len(set(prod_links)))
