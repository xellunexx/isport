# Apply the P2 i18n deltas (role keys + concept disclaimers) per language. Idempotent.
import io, sys, re
sys.stdout.reconfigure(encoding="utf-8")
P = r"C:\Users\ochak\OneDrive\Documents\Default Project\infraconcept-live\data\i18n.js"
s = io.open(P, encoding="utf-8").read()

ROLE = {
  "bg": ('diy_role_anchor:"Котва", diy_role_fill:"Допълва", diy_role_safe:"Побира се"',
         "Избери продукти — подреждаме ги на план, със зоните за безопасност. Концепция за обсъждане — не одобрен инженерен дизайн."),
  "en": ('diy_role_anchor:"Anchor", diy_role_fill:"Area fit", diy_role_safe:"Fits"',
         "Pick products — we lay them out on the plan, safety zones included. A discussion concept — not an approved engineering design."),
  "ro": ('diy_role_anchor:"Piesă principală", diy_role_fill:"Completează", diy_role_safe:"Încape"',
         "Alege produse — le așezăm pe plan, cu zone de siguranță. Concept de discuție — nu este un proiect tehnic aprobat."),
  "el": ('diy_role_anchor:"Άγκυρα", diy_role_fill:"Συμπλήρωση", diy_role_safe:"Χωράει"',
         "Διάλεξε προϊόντα — τα τοποθετούμε στο πλάνο, με ζώνες ασφαλείας. Ιδέα για συζήτηση — όχι εγκεκριμένη μελέτη."),
  "sr": ('diy_role_anchor:"Sidro", diy_role_fill:"Dopuna", diy_role_safe:"Staje"',
         "Izaberi proizvode — raspoređujemo ih na plan, sa bezbednosnim zonama. Koncept za razgovor — nije odobren inženjerski projekat."),
  "mk": ('diy_role_anchor:"Котва", diy_role_fill:"Дополнување", diy_role_safe:"Се вбира"',
         "Избери производи — ги подредуваме на план, со безбедносни зони. Концепција за дискусија — не одобрен инженерски проект."),
  "sq": ('diy_role_anchor:"Spiranca", diy_role_fill:"Plotëson", diy_role_safe:"Futet"',
         "Zgjidh produkte — i vendosim në plan, me zonat e sigurisë. Koncept për diskutim — jo projekt inxhinierik i miratuar."),
}
DIY_D_ANCHORS = {
  "bg": '"Избери продукти — подреждаме ги на план, със зоните за безопасност."',
  "en": '"Pick products — we lay them out on the plan, safety zones included."',
  "ro": '"Alege produse — le așezăm pe plan, cu zone de siguranță."',
  "el": '"Διάλεξε προϊόντα — τα τοποθετούμε στο πλάνο, με ζώνες ασφαλείας."',
  "sr": '"Izaberi proizvode — raspoređujemo ih na plan, sa bezbednosnim zonama."',
  "mk": '"Избери производи — ги подредуваме на план, со безбедносни зони."',
  "sq": '"Zgjidh produkte — i vendosim në plan, me zonat e sigurisë."',
}
n = 0
# per-language: find each lang's diy_d value and extend in place
for lang, (roles, newd) in ROLE.items():
    old_d = DIY_D_ANCHORS[lang]
    assert old_d in s, f"diy_d anchor missing for {lang}"
    s = s.replace(old_d, f'"{newd}",\n  {roles}', 1)
    n += 1
io.open(P, "w", encoding="utf-8").write(s)
print("patched langs:", n)
