# i18n p6: undo_filters, cleared_note, tray_curated, diy_clear (x7). Idempotent.
import io, sys
sys.stdout.reconfigure(encoding="utf-8")
P = r"C:\Users\ochak\OneDrive\Documents\Default Project\infraconcept-live\data\i18n.js"
s = io.open(P, encoding="utf-8").read()
if "undo_filters" in s:
    print("already patched"); sys.exit(0)

ANCHORS = {
  "bg": 'tray_clear:"Изчисти проекта"',
  "en": 'tray_clear:"Clear project"',
  "ro": 'tray_clear:"Golește proiectul"',
  "el": 'tray_clear:"Καθαρισμός έργου"',
  "sr": 'tray_clear:"Isprazni projekat"',
  "mk": 'tray_clear:"Исчисти го проектот"',
  "sq": 'tray_clear:"Pastro projektin"',
}
ADD = {
  "bg": 'undo_filters:"върни предишните", cleared_note:"Нулирани при избора на марка/подбор", tray_curated:"Препоръчани от нас — по един от марка", diy_clear:"Изчисти плана"',
  "en": 'undo_filters:"undo previous", cleared_note:"Cleared by the brand/persona selection", tray_curated:"Our picks — one per brand", diy_clear:"Clear the plan"',
  "ro": 'undo_filters:"restaurează anterioarele", cleared_note:"Șterse la alegerea mărcii/audienței", tray_curated:"Alegerile noastre — câte unul per marcă", diy_clear:"Golește planul"',
  "el": 'undo_filters:"επαναφορά προηγούμενων", cleared_note:"Καθαρίστηκαν με την επιλογή μάρκας/κοινού", tray_curated:"Οι επιλογές μας — μία ανά μάρκα", diy_clear:"Καθαρισμός πλάνου"',
  "sr": 'undo_filters:"vrati prethodne", cleared_note:"Obrisano pri izboru marke/publike", tray_curated:"Naši izbori — po jedan po marki", diy_clear:"Očisti plan"',
  "mk": 'undo_filters:"врати ги претходните", cleared_note:"Изчистено при избор на марка/публика", tray_curated:"Наши избори — по еден на марка", diy_clear:"Исчисти го планот"',
  "sq": 'undo_filters:"kthe të mëparshmet", cleared_note:"U pastruan me zgjedhjen e markës/audiences", tray_curated:"Zgjedhjet tona — njërën për secilën markë", diy_clear:"Pastro planin"',
}
n = 0
for lang in ADD:
    a = ANCHORS[lang]
    assert a in s, f"anchor missing {lang}"
    s = s.replace(a, a + ",\n  " + ADD[lang], 1)
    n += 1
io.open(P, "w", encoding="utf-8").write(s)
print("patched", n)
