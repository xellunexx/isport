# i18n: live-board context notes + tray suggestions (x7). Idempotent.
import io, sys
sys.stdout.reconfigure(encoding="utf-8")
P = r"C:\Users\ochak\OneDrive\Documents\Default Project\infraconcept-live\data\i18n.js"
s = io.open(P, encoding="utf-8").read()
if "live_no_ctx" in s:
    print("already patched"); sys.exit(0)

ANCHORS = {
  "bg": 'live_btn:"на живо"',
  "en": 'live_btn:"IRL view"',
  "ro": 'live_btn:"Vedere reală"',
  "el": 'live_btn:"Στην πράξη"',
  "sr": 'live_btn:"Uživo"',
  "mk": 'live_btn:"Во живо"',
  "sq": 'live_btn:"Live view"',
}
ADD = {
  "bg": 'live_no_ctx:"няма реализирани обекти в този раздел — показваме всички", live_brand_note:"марка↔обект няма пряка картография", tray_suggest:"Добави към проекта (според текущите филтри)"',
  "en": 'live_no_ctx:"no delivered projects in this division — showing all", live_brand_note:"no direct brand↔site mapping", tray_suggest:"Add to the project (following current filters)"',
  "ro": 'live_no_ctx:"niciun proiect finalizat în această divizie — afișăm toate", live_brand_note:"fără legătură directă marcă↔locație", tray_suggest:"Adaugă în proiect (după filtrele curente)"',
  "el": 'live_no_ctx:"δεν υπάρχουν έργα σε αυτό τον κλάδο — δείχνουμε όλα", live_brand_note:"χωρίς άμεση αντιστοίχηση μάρκας↔έργου", tray_suggest:"Προσθήκη στο έργο (σύμφωνα με τα φίλτρα)"',
  "sr": 'live_no_ctx:"nema realizovanih objekata u ovom odeljku — pokazujemo sve", live_brand_note:"nema direktnog mapiranja marka↔objekat", tray_suggest:"Dodaj u projekat (prema trenutnim filterima)"',
  "mk": 'live_no_ctx:"нема реализирани објекти во овој оддел — прикажуваме сè", live_brand_note:"нема директна врска марка↔објект", tray_suggest:"Додади во проектот (според тековните филтри)"',
  "sq": 'live_no_ctx:"nuk ka projekte të realizuara në këtë divizion — tregojmë të gjitha", live_brand_note:"pa lidhje të drejtpërdrejtë markë↔objekt", tray_suggest:"Shto në projekt (sipas filtrave aktualë)"',
}
n = 0
for lang in ADD:
    a = ANCHORS[lang]
    assert a in s, f"anchor missing {lang}"
    s = s.replace(a, a + ",\n  " + ADD[lang], 1)
    n += 1
io.open(P, "w", encoding="utf-8").write(s)
print("patched", n)
