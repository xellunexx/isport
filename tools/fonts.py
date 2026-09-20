# Download Sofia Sans + Sofia Sans Extra Condensed woff2 (cyrillic/cyrillic-ext/greek/latin/latin-ext).
import os, re, sys, requests
sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FDIR = os.path.join(BASE, "assets", "fonts")
os.makedirs(FDIR, exist_ok=True)

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"}
css_url = ("https://fonts.googleapis.com/css2?family=Sofia+Sans:ital,wght@0,1..1000;1,1..1000"
           "&family=Sofia+Sans+Extra+Condensed:ital,wght@0,1..1000;1,1..1000&display=swap")
css = requests.get(css_url, headers=UA, timeout=30).text
blocks = re.findall(r"/\*\s*([a-z-]+)\s*\*/\s*@font-face\s*{(.*?)}", css, re.S)
keep = {"cyrillic", "cyrillic-ext", "greek", "latin", "latin-ext"}
got = {}
for subset, body in blocks:
    if subset not in keep:
        continue
    fam = re.search(r"font-family:\s*'([^']+)'", body).group(1)
    wght = re.search(r"font-weight:\s*([\d ]+)", body).group(1).strip()
    url = re.search(r"url\((https://[^)]+)\)", body).group(1)
    famkey = "sofiac" if "Condensed" in fam else "sofia"
    fn = f"{famkey}-{subset}.woff2"
    if (famkey, subset) in got:  # variable font -> single file per subset; ital comes as second face w/ same src
        continue
    r = requests.get(url, headers=UA, timeout=30)
    open(os.path.join(FDIR, fn), "wb").write(r.content)
    got[(famkey, subset)] = fn
    print(fn, len(r.content))
print("total:", len(got))
