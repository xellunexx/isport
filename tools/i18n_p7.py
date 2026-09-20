# i18n: Площадко chat + admin LLM keys (x7). Idempotent guard: skip if asst_greet present.
import io, sys
sys.stdout.reconfigure(encoding="utf-8")
P = r"C:\Users\ochak\OneDrive\Documents\Default Project\infraconcept-live\data\i18n.js"
s = io.open(P, encoding="utf-8").read()
if "asst_greet" in s:
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
  "bg": 'asst_greet:"Здравейте! Аз съм {name} — асистентът на Инфра Концепт. Питайте ме за настилки, съоръжения, марки, срокове.", asst_admin:"Асистент (LLM)", admin_llm_base:"LLM endpoint (OpenAI-съвместим)", admin_llm_model:"Модел", admin_llm_test:"Тествай връзката", admin_llm_off:"офлайн — вградени отговори, запитвания през формата"',
  "en": 'asst_greet:"Hello! I am {name} — the Infraconcept assistant. Ask me about flooring, equipment, brands, timelines.", asst_admin:"Assistant (LLM)", admin_llm_base:"LLM endpoint (OpenAI-compatible)", admin_llm_model:"Model", admin_llm_test:"Test connection", admin_llm_off:"offline — canned answers, enquiries via the form"',
  "ro": 'asst_greet:"Bună! Sunt {name} — asistentul Infraconcept. Întreabă-mă despre pardoseli, echipamente, mărci, termene.", asst_admin:"Asistent (LLM)", admin_llm_base:"Endpoint LLM (compatibil OpenAI)", admin_llm_model:"Model", admin_llm_test:"Testează conexiunea", admin_llm_off:"offline — răspunsuri încorporate, cereri prin formular"',
  "el": 'asst_greet:"Γεια! Είμαι ο {name} — βοηθός της Infraconcept. Ρώτα για δάπεδα, εξοπλισμό, μάρκες, χρονοδιάγραμμα.", asst_admin:"Βοηθός (LLM)", admin_llm_base:"LLM endpoint (υβρωτατο OpenAI)", admin_llm_model:"Μοντέλο", admin_llm_test:"Δοκιμή σύνδεσης", admin_llm_off:"offline — έτοιμες απαντήσεις, αιτήματα από τη φόρμα"',
  "sr": 'asst_greet:"Zdravo! Ja sam {name} — Infraconcept asistent. Pitaj o podlogama, opremi, markama, rokovima.", asst_admin:"Asistent (LLM)", admin_llm_base:"LLM endpoint (OpenAI-kompatibilan)", admin_llm_model:"Model", admin_llm_test:"Testiraj vezu", admin_llm_off:"offline — ugrađeni odgovori, upiti preko forme"',
  "mk": 'asst_greet:"Здраво! Јас сум {name} — асистент на Инфра Концепт. Прашај за настилки, опрема, марки, срокови.", asst_admin:"Асистент (LLM)", admin_llm_base:"LLM endpoint (OpenAI-компатибилен)", admin_llm_model:"Модел", admin_llm_test:"Тестирај врска", admin_llm_off:"офлајн — вградени одговори, барања преку формата"',
  "sq": 'asst_greet:"Përshëndetje! Jam {name} — asistenti i Infraconcept. Pyet për dysheme, pajisje, marka, afate.", asst_admin:"Asistent (LLM)", admin_llm_base:"Endpoint LLM (përputhshëm OpenAI)", admin_llm_model:"Modeli", admin_llm_test:"Testo lidhjen", admin_llm_off:"offline — përgjigje të integruara, kërkesa nga forma"',
}
n = 0
for lang in ADD:
    a = ANCHORS[lang]
    assert a in s, f"anchor missing {lang}"
    s = s.replace(a, a + ",\n  " + ADD[lang], 1)
    n += 1
io.open(P, "w", encoding="utf-8").write(s)
print("patched", n)
