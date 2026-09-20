# Replace composer.js lines 129..238 (old layout/shelf-pack/draw/roundRect) with ICP delegation.
import io, sys
sys.stdout.reconfigure(encoding="utf-8")
P = r"C:\Users\ochak\OneDrive\Documents\Default Project\infraconcept-live\assets\js\composer.js"
s = io.open(P, encoding="utf-8").read()
lines = s.split("\n")
assert lines[128].strip().startswith("/* ---------- layout"), lines[128]
assert lines[237].strip().startswith("function roundRect"), lines[237]

NEW = """  /* ---------- layout + rendering delegate to ICP (assets/js/plan.js) ---------- */
  function planToItems() {
    const items = [];
    for (const [id, qty] of plan.entries()) {
      const p = IC.byId.get(id); if (!p) continue;
      for (let i = 0; i < qty; i++) {
        const fp = ICP.parseDims(p.sp && p.sp.d) || { w: 2, d: 2, est: true };
        items.push({ p, dims: fp, pad: ICP.safetyPad(p), est: !!fp.est });
      }
    }
    return items;
  }
  function paddedArea(p) { const it = ICP.parseDims(p.sp && p.sp.d) || { w: 2, d: 2 }; const pad = ICP.safetyPad(p); return (it.w + 2 * pad) * (it.d + 2 * pad); }

  function draw() {
    const cv = $("#diyCanvas"), wrap = $("#diyWrap");
    if (!cv || !wrap || !window.ICP) return;
    const space = $("#diySpace").value || "mix";
    const area = Math.max(12, parseFloat($("#diyArea").value) || 80);
    const age = $("#diyAge").value;
    const items = planToItems();
    $("#diyEmpty").hidden = items.length > 0;
    $("#diyEmpty").textContent = T("diy_empty");
    const L = ICP.render(cv, wrap, items, {
      space, areaM2: area,
      title: T("diy_concept") + " — " + T("space_" + space),
      kicker: (age ? T("age_" + age.slice(1)) : T("diy_all_ages")) + " \u00b7 " + plan.size + " " + T("diy_items") + " \u00b7 " + area + " m\u00b2",
    });
    let areaUse = 0, users = 0, zones = 0, est = 0;
    for (const it of items) {
      areaUse += (it.dims.w + 2 * it.pad) * (it.dims.d + 2 * it.pad);
      zones += ICP.parseZone(it.p.sp && it.p.sp.z);
      users += parseUsers(it.p.sp && it.p.sp.u);
      if (it.est) est++;
    }
    drawStats(items.length, areaUse, zones, users, est);
    window.__lastLayout = L;
  }"""

lines = lines[:128] + [NEW] + lines[238:]
io.open(P, "w", encoding="utf-8").write("\n".join(lines))
print("spliced. new line count:", len(lines))
