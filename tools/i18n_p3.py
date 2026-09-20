# i18n: admin content keys ×7 (idempotent).
import io, sys
sys.stdout.reconfigure(encoding="utf-8")
P = r"C:\Users\ochak\OneDrive\Documents\Default Project\infraconcept-live\data\i18n.js"
s = io.open(P, encoding="utf-8").read()
ADD = {
  "bg": 'admin_note:"Пази се на това устройство.", admin_content:"Съдържание", admin_herosub:"Подзаглавие на началния екран", admin_apply:"Приложи (преглед)"',
  "en": 'admin_note:"Stored on this device.", admin_content:"Content", admin_herosub:"Hero subtitle", admin_apply:"Apply (preview)"',
  "ro": 'admin_note:"Se păstrează pe acest dispozitiv.", admin_content:"Conținut", admin_herosub:"Subtitlul eroului", admin_apply:"Aplică (previzualizare)"',
  "el": 'admin_note:"Αποθηκεύεται στη συσκευή.", admin_content:"Περιεχόμενο", admin_herosub:"Υπότιτλος αρχικής", admin_apply:"Εφαρμογή (προεπισκόπηση)"',
  "sr": 'admin_note:"Čuva se na ovom uređaju.", admin_content:"Sadržaj", admin_herosub:"Podnaslov naslovnice", admin_apply:"Primeni (pregled)"',
  "mk": 'admin_note:"Се чува на овој уред.", admin_content:"Содржина", admin_herosub:"Поднаслов на насловната", admin_apply:"Примени (преглед)"',
  "sq": 'admin_note:"Ruhet në këtë pajisje.", admin_content:"Përmbajtja", admin_herosub:"Nëntitulli kryesor", admin_apply:"Apliko (pamje)"',
}
n = 0
for lang, block in ADD.items():
    # anchor: that language's admin_note value (first part before comma)
    old = block.split(", admin_content")[0]
    assert old + "," in s, f"admin_note missing for {lang}"
    s = s.replace(old + ",", block + ",\n  ", 1)
    n += 1
io.open(P, "w", encoding="utf-8").write(s)
print("admin content keys patched:", n)
