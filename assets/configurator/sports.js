/* ═══════════════════════════════════════════════════════════════════
   Sports field configurator v2 — "the facility is the hero" (2026-09-13)
   Classic script (no modules/build), owns its module state locally so it
   survives mode switches; app.js only calls window.SportsView.render(page).
   Contracts (built in parallel — coded against these exactly):
     window.SportsScene3D (agent A): mount(el,config)->handle|null;
       handle.update(config) / setView('perspective'|'top') / fit() /
       toggleDims() / setFullscreen(bool) / destroy(). If the engine is
       missing or mount fails, the same #spSceneHost shows the 2D SVG plan.
       mount(el,config,{onPinDrop,onUnpin}) — optional callbacks fired when the user
       drag-drops an equipment unit on the canvas: onPinDrop(id, x, z, q, rotY, elev, tiltX, tiltZ) with
       PIN coordinates (facility corner origin, see below).
     GET  /api/sports/options                      -> {sports,surfaces,fencing,lighting,extras} | 404
     per-sport rules (agent C, optional): dims_min{dims_max{,}l,w},
       surfaces[], cats[], suggested_purps[], poles_hint:'auto';
       fencing may gain gates:{unit,max}.
     GET  /api/sports/catalog?purp=all&cat=sport,play -> [{id,name,brand,purp,cat,age_min,age_max,dims,fall,zone_m2,mats,images}]
     POST /api/sports/configuration {name,config}  -> {ok:true,id}
     GET  /api/sports/configurations               -> list (array | {configurations|items})
     GET  /api/sports/configuration?id=N           -> {id,name,config,updated_at}
   Manual placement pins: equipment entries may carry {x, z, rotY, elev, tiltX, tiltZ, pinned:true}
     where x = H (metres along the field LENGTH from the field min corner)
     and z = V (metres along the WIDTH). (0,0) = field min corner matches
     scene (-l/2,-w/2), so scene pin = [x - l/2, z - w/2]. The commercial
     config keeps {x,z,pinned} verbatim (backend ignores them for pricing).
   ═══════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

const STEPS=['sport','surface','fencing','equipment','extras','total'];
const STEP_KEYS={sport:'stepsSport',surface:'stepsSurface',fencing:'stepsFencing',equipment:'stepsEquipment',extras:'stepsExtras',total:'stepsTotal'};
const STEP_HINTS={sport:'hintSport',surface:'hintSurface',fencing:'hintFencing',equipment:'hintEquipment',extras:'hintExtras',total:'hintTotal'};

/* module state — deliberately NOT on window.STATE: the sports module owns it,
   it persists across mode switches within the session, and render() is re-entrant. */
const S={
  step:1, seen:new Set([1]),
  options:null, errOptions:null, loadingOptions:false,
  catalog:null, catalogCache:Object.create(null), catalogKey:'', errCatalog:null, loadingCatalog:false,
  saved:null, errSaved:null, loadingSaved:false,
  sport:null, dims:{l:0,w:0}, dimsHint:'', dimClamped:false,
  surface:null, variant:null,
  fencingOn:true, fenceHeight:4, fenceOpts:[], gates:0,
  lightingPoles:4, polesAuto:false, extras:{benches:0,stands_50:0,changing_rooms:0},
  equipment:[], purpFilter:'all', equipQuery:'', equipShown:48,
  loadedId:null, loadedName:''
};
let root=null;
let _sceneTimer=null;
let _scene=null, _sceneHost=null, _sceneDead=false, _sceneErr=null, _scenePending=false, _sceneReadyBound=false;
let _equipSceneHost=null;   // capture-observable cache of the pinned-equipment host

/* ── small helpers ─────────────────────────────────────────────────── */
const toNum=v=>{const n=parseFloat(String(v??'').replace(/\s/g,'').replace(',','.'));return Number.isFinite(n)?n:0;};
const toQty=v=>Math.max(0,Math.round(toNum(v)||0));
const humanize=id=>String(id||'').replace(/_/g,' ');
const cap1=s=>s?s.charAt(0).toUpperCase()+s.slice(1):s;
const sportLabel=id=>{const v=t('sports.sportNames.'+id);return v==='sports.sportNames.'+id?cap1(humanize(id)):v;};
const surfaceName=id=>{const v=t('sports.surfaceNames.'+id);return v==='sports.surfaceNames.'+id?cap1(humanize(id)):v;};
const surfaceHint=id=>{const v=t('sports.surfaceHints.'+id);return v==='sports.surfaceHints.'+id?'':v;};
const fenceOptLabel=id=>{const v=t('sports.fenceOpt.'+id);return v==='sports.fenceOpt.'+id?cap1(humanize(id)):v;};
const EXTRA_I18N={benches:'benches',stands_50:'stands',changing_rooms:'rooms'};
const extraLabel=id=>{const k=EXTRA_I18N[id];const v=t('sports.'+(k||''));return k&&v!=='sports.'+k?v:cap1(humanize(id));};
const EXTRA_SPEC_I18N={benches:'specBenches',stands_50:'specStands',changing_rooms:'specRooms',lighting:'specPoles'};
const extraSpec=id=>{const k=EXTRA_SPEC_I18N[id];const v=t('sports.'+(k||''));return k&&v!=='sports.'+k?v:'';};

const optSports=()=>Array.isArray(S.options?.sports)?S.options.sports:[];
const optSurfaces=()=>Array.isArray(S.options?.surfaces)?S.options.surfaces:[];
const fenceHeights=()=>{const h=S.options?.fencing?.heights_m;return Array.isArray(h)&&h.length?h.map(Number).filter(x=>x>0):[2,3,4,6];};
const fenceOptions=()=>{const o=S.options?.fencing?.options;return Array.isArray(o)?o.map(x=>typeof x==='string'?x:x?.id).filter(Boolean):[];};
const gatesRule=()=>{const g=S.options?.fencing?.gates;return g&&typeof g==='object'?{max:toQty(g.max)||4,unit:String(g.unit||'pcs')}:(g?{max:4,unit:'pcs'}:null);};
const optExtras=()=>{const e=S.options?.extras;return Array.isArray(e)&&e.length?e.map(x=>typeof x==='string'?x:x?.id).filter(Boolean):['benches','stands_50','changing_rooms'];};
const polesDefault=()=>{const p=S.options?.lighting?.poles_default;return Number.isFinite(+p)?Math.max(0,Math.round(+p)):4;};
const catById=id=>(S.catalog||[]).find(x=>x&&String(x.id)===String(id))||null;
const selectedQty=id=>(S.equipment.find(e=>String(e.id)===String(id))?.qty)||0;

/* ── per-sport rules (agent C) — degrade gracefully when absent ────── */
const sportRule=id=>optSports().find(x=>x&&x.id===id)||null;
const ruleDims=id=>{
  const r=sportRule(id)||{};
  const mn=r.min&&typeof r.min==='object'?r.min:(r.dims_min&&typeof r.dims_min==='object'?r.dims_min:{});
  const mx=r.max&&typeof r.max==='object'?r.max:(r.dims_max&&typeof r.dims_max==='object'?r.dims_max:{});
  const f=(v,d)=>{const n=+v;return Number.isFinite(n)&&n>0?n:d;};
  return {minL:f(mn.l,5),minW:f(mn.w,5),maxL:f(mx.l,120),maxW:f(mx.w,120)};
};
const ruleSurfaces=id=>{const r=sportRule(id);return Array.isArray(r?.surfaces)&&r.surfaces.length?r.surfaces.map(String):null;};
const surfaceAllowed=id=>{const list=ruleSurfaces(S.sport);return !list||list.includes(String(id));};
const ruleSuggestedPurps=id=>{const r=sportRule(id);return Array.isArray(r?.suggested_purps)?r.suggested_purps.map(String):[];};
const sportCats=id=>{const c=sportRule(id)?.cats;return Array.isArray(c)&&c.length?c.map(String):['sport'];};
const purpLabel=id=>{const v=t('sports.purp.'+id);return v==='sports.purp.'+id?String(id):v;};
const catLabel=id=>({sport:'catalogSport',play:'catalogPlayground',park:'catalogPark'}[id]||'catalogSport');
const rulePolesAuto=id=>sportRule(id)?.poles_hint==='auto';
/* per-sport coupled UX defaults (declaration lives in data/sports_options.json):
   fence_default_m applies while the user has not touched any fencing control;
   benches_default applies while benches qty untouched. 0 m = default to open field. */
const ruleFenceDefault=id=>{const v=sportRule(id)?.fence_default_m;return Number.isFinite(+v)?+v:null;};
const ruleBenchesDefault=id=>{const v=sportRule(id)?.benches_default;return Number.isFinite(+v)?Math.max(0,Math.round(+v)):null;};
function applyCoupledDefaults(sp){
  const fd=ruleFenceDefault(sp?.id);
  if(!S._fenceTouched&&fd!==null){
    if(fd>0&&fenceHeights().map(Number).includes(fd)){S.fencingOn=true;S.fenceHeight=fd;}
    else if(fd===0)S.fencingOn=false;
  }
  const bd=ruleBenchesDefault(sp?.id);
  if(!S._benchesTouched&&bd!==null)S.extras.benches=bd;
}
/* deterministic pole suggestion from field size: corner set + midpoints per
   ~25 m of long edge, rounded to an even count. Advisory only. */
const suggestedPoles=()=>{
  const l=toNum(S.dims.l),w=toNum(S.dims.w);
  if(!(l>0&&w>0))return polesDefault();
  const long=Math.max(l,w),extra=Math.max(0,Math.ceil(long/25)-1);
  return Math.min(12,4+extra*2);
};
const SURFACE_VARIANTS={ // restrained presets; scene reads colors.surface as a key
  turf_multi:['green','blue','red'], turf_football:['green','blue','red'],
  tartan:['red','blue','green'], acrylic:['blue','red','green'],
  turf_natural:['green'], clay:['red'], paving:['grey','sand']
};
const variantsOf=id=>{const v=SURFACE_VARIANTS[id];return Array.isArray(v)&&v.length?v:['green'];};

/* pin helpers — entry {x,z} = H/V metres from the field min corner (H along
   length, V along width); both present+finite = pinned. Range is loose: the
   field surroundings (fences, warmup zones) are legitimate positions. */
const PIN_MARGIN=3;
const isPinned=e=>!!e&&e.pinned===true&&Number.isFinite(+e.x)&&Number.isFinite(+e.z);
const pinRange=()=>({minX:-PIN_MARGIN,maxX:(toNum(S.dims.l)||0)+PIN_MARGIN,minZ:-PIN_MARGIN,maxZ:(toNum(S.dims.w)||0)+PIN_MARGIN});
const fieldMin=()=>({x:-(toNum(S.dims.l)||0)/2,z:-(toNum(S.dims.w)||0)/2});
const fmtPin=v=>{const n=Number(v);return Number.isFinite(n)?n.toFixed(1):'';};
const cssEsc=s=>(typeof CSS!=='undefined'&&CSS.escape)?CSS.escape(s):String(s).replace(/["\\\]]/g,'\\$&');
function placeNewEntry(e,it){
  const center=_scene&&typeof _scene.viewCenter==='function'?_scene.viewCenter():null;
  if(!center)return;
  const R=pinRange(),fp=parseFootprint(it?.dims),radius=(fp?.w||1.5)+1;
  const pinned=S.equipment.filter(item=>item!==e&&isPinned(item));
  const occupied=(x,z)=>pinned.some(item=>Math.hypot(+item.x-x,+item.z-z)<1.5);
  const inside=(x,z)=>x>=R.minX&&x<=R.maxX&&z>=R.minZ&&z<=R.maxZ;
  let x=center.x,z=center.z;
  if(occupied(x,z)){
    const dirs=Array.from({length:8},(_,i)=>i*Math.PI/4);
    let found=null;
    for(const mult of [1,2]){
      for(const angle of dirs){
        const cx=x+Math.cos(angle)*radius*mult,cz=z+Math.sin(angle)*radius*mult;
        if(inside(cx,cz)&&!occupied(cx,cz)){found={x:cx,z:cz};break;}
      }
      if(found)break;
    }
    if(found){x=found.x;z=found.z;}
  }
  if(!inside(x,z)){x=Math.min(R.maxX,Math.max(R.minX,x));z=Math.min(R.maxZ,Math.max(R.minZ,z));}
  e.x=+x.toFixed(3);e.z=+z.toFixed(3);e.pinned=true;
}
/* write entry pin state back into its chip inputs (drag reverse-sync + commit
   normalization); `keep` axis preserves the input the user is typing in */
function syncPinInputs(e,keep){
  if(!root)return;
  const chip=root.querySelector(`[data-sp-sel="${cssEsc(String(e.id))}"]`);
  if(!chip)return;
  chip.classList.toggle('sp-pinned',isPinned(e));
  const h=chip.querySelector('[data-sp-pinh]'),v=chip.querySelector('[data-sp-pinv]');
  const nh=isPinned(e)?fmtPin(e.x):'',nv=isPinned(e)?fmtPin(e.z):'';
  if(h&&keep!=='h'&&document.activeElement!==h)h.value=nh;
  if(v&&keep!=='v'&&document.activeElement!==v)v.value=nv;
}
const commercialEquipment=()=>S.equipment.map(e=>{
  const o={id:e.id,qty:toQty(e.qty)};
  if(isPinned(e)){
    o.x=+(+e.x).toFixed(3);o.z=+(+e.z).toFixed(3);
    if(e.rotY!=null)o.rotY=+(+e.rotY).toFixed(3);
    if(e.elev!=null)o.elev=+(+e.elev).toFixed(3);
    if(e.tiltX!=null)o.tiltX=+(+e.tiltX).toFixed(3);
    if(e.tiltZ!=null)o.tiltZ=+(+e.tiltZ).toFixed(3);
    o.pinned=true;
  }
  return o;
}).filter(e=>e.qty>0);

function buildConfig(){
  const fencing=S.fencingOn?{height:S.fenceHeight,options:[...S.fenceOpts],gates:toQty(S.gates)}:{height:0,options:[],gates:0};
  return {
    sport:S.sport||null,
    dims:{l:toNum(S.dims.l)||0,w:toNum(S.dims.w)||0},
    surface:S.surface||null,
    fencing,
    lighting:{poles:toQty(S.lightingPoles)},
    extras:Object.fromEntries(optExtras().map(id=>[id,toQty(S.extras[id])])),
    equipment:commercialEquipment()
  };
}
function buildSceneConfig(){
  const c=buildConfig();
  c.equipment=commercialEquipment().map(e=>{
    const it=catById(e.id);
    const img=it&&Array.isArray(it.images)&&typeof it.images[0]==='string'?it.images[0]:null;
    const imgT=null;
    const out={id:String(e.id),qty:toQty(e.qty),name:it?String(it.name??e.id):null,purp:it?.purp??null,cat:it?.cat??null,dims:it?.dims??null,zone:it?.zone_m2??null,img,imgT};
    if(e.pinned){
      const pin=[
        +(e.x-(toNum(S.dims.l)||0)/2).toFixed(3),
        +(e.z-(toNum(S.dims.w)||0)/2).toFixed(3),
        +(e.rotY!=null?+e.rotY:0).toFixed(3),
        +(e.elev!=null?+e.elev:0).toFixed(3),
        +(e.tiltX!=null?+e.tiltX:0).toFixed(3),
        +(e.tiltZ!=null?+e.tiltZ:0).toFixed(3)
      ];
      out.pin=pin;
    }
    return out;
  });
  const out={...c,colors:{surface:S.variant||(S.surface?variantsOf(S.surface)[0]:null)}};
  return out;
}

const maxStep=()=>!S.sport?1:(!S.surface?2:STEPS.length);

/* ── 3D scene sync (agent A) with SVG-plan fallback in the same host ── */
/* Capture-observable record of where each equipment entry's first (or pinned)
   unit sits in the CURRENT scene — lets acceptance tests prove pin↔layout
   correspondence without reaching into three.js internals. */
function updateEquipSceneHost(){
  const host={field:{l:toNum(S.dims.l)||0,w:toNum(S.dims.w)||0,cornerOrigin:fieldMin()},entries:[]};
  for(const e of S.equipment){
    if(toQty(e.qty)<=0)continue;
    host.entries.push({id:String(e.id),pinned:isPinned(e),
      H:isPinned(e)?+(+e.x).toFixed(2):null,V:isPinned(e)?+(+e.z).toFixed(2):null});
  }
  _equipSceneHost=host;
}
function normalizeSceneConfig(value){
  if(Array.isArray(value))return value.map(normalizeSceneConfig);
  if(value&&typeof value==='object'){
    const out={};
    Object.keys(value).sort().forEach(k=>{
      if(value[k]!==undefined)out[k]=normalizeSceneConfig(value[k]);
    });
    return out;
  }
  if(typeof value==='number'&&Number.isFinite(value))return Math.round(value*1000)/1000;
  return value;
}
function sceneConfigNow(){return buildSceneConfig();}
let _lastSceneKey='';
function onPinDrop(id,x,z,q,rotY,elev,tiltX,tiltZ){
  const e=S.equipment.find(y=>String(y.id)===String(id));
  if(!e)return;
  /* qty>1: the entry pin anchors unit 0 — undo the dragged unit's trail offset */
  let hx=+x;
  const it=catById(e.id);
  const fp=it?parseFootprint(it.dims):null;
  if(fp&&q>0)hx-=q*(fp.w+1.0);
  e.x=+(+hx).toFixed(2);e.z=+(+z).toFixed(2);
  if(typeof rotY==='number'&&Number.isFinite(rotY))e.rotY=+(+rotY).toFixed(3);
  if(typeof elev==='number'&&Number.isFinite(elev))e.elev=+(+elev).toFixed(3);
  if(typeof tiltX==='number'&&Number.isFinite(tiltX))e.tiltX=+(+tiltX).toFixed(3);
  if(typeof tiltZ==='number'&&Number.isFinite(tiltZ))e.tiltZ=+(+tiltZ).toFixed(3);
  e.pinned=true;
  updateEquipSceneHost();
  syncPinInputs(e);
  scheduleScenePush();
}
function onUnpin(id, push=true){
  const e=S.equipment.find(y=>String(y.id)===String(id));
  if(!e)return;
  e.pinned=false;
  delete e.x;delete e.z;delete e.rotY;delete e.elev;delete e.tiltX;delete e.tiltZ;
  updateEquipSceneHost();
  syncPinInputs(e);
  if(push)scheduleScenePush();
}
function mountScene(){
  const el=$('#spSceneHost',root);
  if(!el)return;
  if(_scene&&_sceneHost===el)return; // already mounted here
  if(_scene){try{_scene.destroy?.()}catch(_e){ }_scene=null;_sceneHost=null;}
  _sceneHost=el;_sceneDead=false;
  const eng=typeof window!=='undefined'?window.SportsScene3D:null;
  if(eng&&typeof eng.mount==='function'){
    let h=null;
    try{h=eng.mount(el,sceneConfigNow(),{onPinDrop,onUnpin});}catch(e){h=null;_sceneErr=e;console.error('[sports] 3D mount failed',e);}
    if(h){_scene=h;_sceneErr=null;updateEquipSceneHost();return;}
    if(!_sceneErr){_sceneErr=new Error(eng.supported&&!eng.supported()?'WebGL unavailable':'mount returned null');console.error('[sports] 3D mount failed',_sceneErr);}
  }else{
    // module script is deferred and may land after the first render: paint the plan, remount when it arrives
    _sceneErr=null;_scenePending=true;
    if(!_sceneReadyBound){
      _sceneReadyBound=true;
      window.addEventListener('sportsscene3d:ready',()=>{
        if(!_scenePending)return;
        _scenePending=false;_sceneHost=null;
        const host=$('#spSceneHost',root);
        if(host){host.classList.remove('sp-scene-2d');host.innerHTML='';}
        mountScene();
      });
      setTimeout(()=>{if(_scenePending&&!window.SportsScene3D){_scenePending=false;_sceneErr=new Error('SportsScene3D module not loaded');console.error('[sports] 3D mount failed',_sceneErr);paintFallbackPlan();}},8000);
    }
  }
  el.classList.add('sp-scene-2d');
  paintFallbackPlan();
}
function paintFallbackPlan(){
  const el=$('#spSceneHost',root);
  if(!el)return;
  el.classList.add('sp-scene-2d');
  const why=_sceneErr?` <span class="sp-scene-why">(${esc(String(_sceneErr.message||_sceneErr))})</span>`:'';
  const note=_scenePending&&!_sceneErr?'':`<div class="sp-scene-note">${esc(t('sports.sceneFallback'))}${why}</div>`;
  el.innerHTML=`${note}<div class="sp-plan2d">${planSvg()}</div>`;
}
function pushScene(){
  updateEquipSceneHost();
  const cfg=sceneConfigNow();
  const key=JSON.stringify(normalizeSceneConfig(cfg));
  if(key===_lastSceneKey)return;
  _lastSceneKey=key;
  if(_scene&&_sceneHost){
    try{_scene.update?.(cfg);return;}catch(e){ /* engine dropped: fall through to 2D */ _scene=null;_sceneErr=e;console.error('[sports] 3D update failed',e); }
  }
  if(!_sceneDead){
    paintFallbackPlan();
  }
}
function scheduleScenePush(){clearTimeout(_sceneTimer);_sceneTimer=setTimeout(pushScene,150);}
function destroyScene(){
  clearTimeout(_sceneTimer);
  if(_scene){try{_scene.destroy?.()}catch(_e){ }}
  _scene=null;_sceneHost=null;
}

/* ── data loads (each: in-flight guard, inline error + retry, never throw) ── */
function ensureOptions(force){
  if(S.loadingOptions)return Promise.resolve(S.options);
  if(S.options&&!force)return Promise.resolve(S.options);
  S.loadingOptions=true;S.errOptions=null;renderErrors();
  S._optP=api('/api/sports/options').then(o=>{
    S.options=o||{};
    if(!fenceHeights().includes(S.fenceHeight))S.fenceHeight=fenceHeights().includes(4)?4:fenceHeights()[0];
    if(!S._polesTouched)S.lightingPoles=polesDefault();
    enforcePanelRules();
    S.errOptions=null;
  }).catch(e=>{S.options=null;S.errOptions=e.message||t('sports.loadFailed');})
    .then(()=>{S.loadingOptions=false;if(STATE.mode==='sports')renderRegions();});
  return S._optP;
}
function ensureCatalog(force){
  const key=sportCats(S.sport).join(',');
  if(S.loadingCatalog&&S.catalogKey===key)return Promise.resolve(S.catalog);
  if(!force&&S.catalogCache[key]){
    S.catalog=S.catalogCache[key];S.catalogKey=key;S.errCatalog=null;
    return Promise.resolve(S.catalog);
  }
  S.loadingCatalog=true;S.errCatalog=null;renderErrors();
  const norm=j=>Array.isArray(j)?j:(Array.isArray(j?.items)?j.items:(Array.isArray(j?.catalog)?j.catalog:null));
  return api('/api/sports/catalog?purp=all&cat='+encodeURIComponent(key))
    .catch(e1=>{if(e1&&/404|not.found/i.test(e1.message||''))return api('/api/sports/catalog?purp=all');throw e1;})
    .then(j=>{
      const arr=norm(j);
      if(!arr)throw new Error(t('sports.catalogFailed'));
      S.catalog=arr;S.catalogKey=key;S.catalogCache[key]=arr;S.errCatalog=null;
    }).catch(e=>{S.catalog=null;S.errCatalog=e.message||t('sports.catalogFailed');})
    .then(()=>{S.loadingCatalog=false;if(STATE.mode==='sports'){renderRegions();scheduleScenePush();}});
}
function ensureSaved(force){
  if(S.loadingSaved)return Promise.resolve(S.saved);
  if(S.saved&&!force)return Promise.resolve(S.saved);
  S.loadingSaved=true;S.errSaved=null;renderErrors();
  const norm=j=>Array.isArray(j)?j:(Array.isArray(j?.configurations)?j.configurations:(Array.isArray(j?.items)?j.items:null));
  return api('/api/sports/configurations').then(j=>{
    S.saved=norm(j)||[];S.errSaved=null;
  }).catch(e=>{S.saved=null;S.errSaved=e.message||t('sports.configsFailed');})
    .then(()=>{S.loadingSaved=false;if(STATE.mode==='sports')updateSaved();});
}

/* when a sport is chosen with rules, dims/surface must obey them. Returns
   what changed so the caller can explain a clamp/auto-pick. */
function enforcePanelRules(){
  if(!S.sport)return '';
  let msg='';
  const R=ruleDims(S.sport);
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,toNum(v)||0));
  const wasL=toNum(S.dims.l),wasW=toNum(S.dims.w);
  if(wasL>0&&(wasL<R.minL||wasL>R.maxL)){S.dims.l=clamp(wasL||R.minL,R.minL,R.maxL);msg=t('sports.dims.clamped',{dim:t('sports.length'),min:R.minL,max:R.maxL,v:S.dims.l});}
  if(wasW>0&&(wasW<R.minW||wasW>R.maxW)){S.dims.w=clamp(wasW||R.minW,R.minW,R.maxW);msg=t('sports.dims.clamped',{dim:t('sports.width'),min:R.minW,max:R.maxW,v:S.dims.w});}
  if(S.surface&&!surfaceAllowed(S.surface)){S.surface=null;S.variant=null;}
  if(!S.variant&&S.surface)S.variant=variantsOf(S.surface)[0]||null;
  if(!S._polesTouched)S.polesAuto=rulePolesAuto(S.sport);
  if(S.polesAuto||!S._polesTouched)S.lightingPoles=S.polesAuto?suggestedPoles():polesDefault();
  S.dimClamped=!!msg;
  return msg;
}

/* ── saved configurations ──────────────────────────────────────────── */
async function loadSaved(id){
  if(!id)return;
  try{
    if(!S.options)await ensureOptions();
    const r=await api('/api/sports/configuration?id='+encodeURIComponent(id));
    let cfg=r?.config;
    if(typeof cfg==='string'){try{cfg=JSON.parse(cfg)}catch{cfg=null}}
    applyConfig(cfg||{});
    S.loadedId=r?.id??id;
    S.loadedName=r?.name||S.loadedName;
    S.step=STEPS.length;S.seen=new Set(STEPS.map((_,i)=>i+1));
    renderRegions();
      scheduleScenePush();
  }catch(e){
    S.errSaved=e.message||t('sports.configsFailed');
    renderErrors();
  }
}
function applyConfig(cfg){
  cfg=cfg&&typeof cfg==='object'?cfg:{};
  const sp=optSports().find(x=>x.id===cfg.sport);
  S.sport=sp?cfg.sport:(typeof cfg.sport==='string'&&cfg.sport?cfg.sport:null);
  const d=cfg.dims||{};
  S.dims={l:toNum(d.l)||toNum(sp?.dims?.l)||0,w:toNum(d.w)||toNum(sp?.dims?.w)||0};
  S.surface=optSurfaces().some(x=>x.id===cfg.surface)?cfg.surface:(typeof cfg.surface==='string'&&cfg.surface?cfg.surface:null);
  const f=cfg.fencing&&typeof cfg.fencing==='object'?cfg.fencing:{};
  const hz=fenceHeights();
  S.fenceHeight=hz.map(Number).includes(Number(f.height))?Number(f.height):(hz.map(Number).includes(4)?4:Number(hz[0])||4);
  S.fencingOn=!!(f&&Number(f.height)>0);
  S.fenceOpts=Array.isArray(f.options)?f.options.map(String).filter(Boolean):[];
  const gr=gatesRule();
  S.gates=gr?Math.min(gr.max,toQty(f.gates)):toQty(f.gates);
  const knownOpts=S.options?.fencing?.options;
  if(Array.isArray(knownOpts))S.fenceOpts=S.fenceOpts.filter(o=>fenceOptions().includes(o));
  S._polesTouched=!rulePolesAuto(S.sport);
  S.polesAuto=rulePolesAuto(S.sport);
  S.lightingPoles=toQty(cfg.lighting?.poles??(S.polesAuto?suggestedPoles():polesDefault()));
  const e=cfg.extras&&typeof cfg.extras==='object'?cfg.extras:{};
  S.extras=Object.fromEntries(optExtras().map(id=>[id,toQty(e[id])]));
  S.equipment=(Array.isArray(cfg.equipment)?cfg.equipment:[])
    .filter(x=>x&&x.id!=null)
    .map(x=>{
      const e={id:String(x.id),qty:Math.max(1,toQty(x.qty)||1)};
      /* back-compat: configs saved before pins simply lack x/z → auto layout */
      const px=(typeof x.x==='number'||typeof x.x==='string')?toNum(x.x):NaN;
      const pz=(typeof x.z==='number'||typeof x.z==='string')?toNum(x.z):NaN;
      if(x.pinned===true&&Number.isFinite(px)&&Number.isFinite(pz)){e.x=px;e.z=pz;e.pinned=true;}
      return e;
    });
  S.variant=typeof cfg.colors?.surface==='string'&&S.surface&&variantsOf(S.surface).includes(cfg.colors.surface)?cfg.colors.surface:(S.surface?variantsOf(S.surface)[0]:null);
  if(S.surface&&!surfaceAllowed(S.surface)){S.surface=null;S.variant=null;}
  const R=ruleDims(S.sport);
  if(toNum(S.dims.l)>0)S.dims.l=Math.min(R.maxL,Math.max(R.minL,toNum(S.dims.l)));
  if(toNum(S.dims.w)>0)S.dims.w=Math.min(R.maxW,Math.max(R.minW,toNum(S.dims.w)));
  S.dimClamped=false;
  /* a loaded config is an explicit choice: coupled defaults stop adapting on sport switch */
  S._fenceTouched=true;S._benchesTouched=true;
  if(S.equipment.length)ensureCatalog();
}
function saveConfig(){
  if(!S.sport)return;
  const name=window.prompt(t('sports.saveName'),S.loadedName||'')?.trim();
  if(!name)return;
  api('/api/sports/configuration',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,config:buildConfig()})})
    .then(r=>{S.loadedId=r?.id??null;S.loadedName=name;S.saved=null;ensureSaved(true);updateSaved();})
    .catch(e=>{S.errSaved=e.message||t('sports.saveFailed');renderErrors();});
}
function newConfig(){
  Object.assign(S,{
    step:1,seen:new Set([1]),sport:null,dims:{l:0,w:0},dimsHint:'',dimClamped:false,surface:null,variant:null,
    fencingOn:true,fenceHeight:fenceHeights().includes(4)?4:fenceHeights()[0]||4,fenceOpts:[],gates:0,
    lightingPoles:polesDefault(),polesAuto:false,extras:Object.fromEntries(optExtras().map(id=>[id,0])),
    equipment:[],purpFilter:'all',equipQuery:'',equipShown:48,loadedId:null,loadedName:''
  });
  S._polesTouched=false;S._fenceTouched=false;S._benchesTouched=false;
  renderRegions();
  scheduleScenePush();
}
function exportJson(){
  if(!S.sport)return;
  const payload={name:S.loadedName||'',config:buildConfig()};
  const slug=(S.loadedName||'draft').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-+|-+$/g,'')||'draft';
  let url=null;
  try{
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=`sports-config-${slug}.json`;
    document.body.appendChild(a);a.click();a.remove();
  }finally{
    if(url)setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
}

/* ── full render (re-entrant; called by app.js render()) ───────────── */
function render(container){
  destroyScene(); // previous host node is discarded with container.innerHTML
  root=container;
  root.innerHTML=shell();
  bindShell();
  renderRegions();
  mountScene();
  if(STATE.sportsAvailable===false){renderOffline();return;}
  ensureOptions();
  ensureSaved();
  if(S.equipment.length||S.step===4)ensureCatalog();
}
function renderRegions(){
  if(!root)return;
  if(S.step>maxStep())S.step=maxStep();
  renderErrors();
  updateSteps();
  renderStepContent();
  updateBadge();
  updateViewerMeta();
  updateSaved();
}
const updateSaved=()=>{const el=$('#spSaved',root);if(el)el.innerHTML=savedOptionsHtml();};

function shell(){
  return `<div class="page-inner sp-page">
  <div class="page-head">
    <div><div class="eyebrow">${t('sports.kicker')}</div><div class="page-title">${t('sports.title')}</div><div class="page-sub">${t('sports.subtitle')}</div></div>
    <div class="sp-strip">
      <select id="spSaved" class="sp-saved" aria-label="${esc(t('sports.saved'))}"></select>
      <span class="sp-badge" id="spTotalBadge" aria-live="polite" title="${esc(t('sports.itemCount'))}"></span>
    </div>
  </div>
  <div id="spError" aria-live="polite"></div>
  <div class="sp-wrap">
    <section class="sp-config" aria-label="${esc(t('sports.title'))}">
      <nav class="sp-steps" id="spSteps" aria-label="${esc(t('sports.title'))}"></nav>
      <div class="sp-panel" id="spStepContent"></div>
    </section>
    <aside class="sp-viewer" aria-label="${esc(t('sports.preview'))}">
      <div class="sp-viewer-head">
        <div><div class="section-title">${t('sports.preview')}</div><div class="section-meta" id="spViewerMeta">${esc(t('sports.previewSub'))}</div></div>
      </div>
      <div id="spSceneHost" class="sp-scene-host"></div>
    </aside>
  </div>
</div>`;
}
function savedOptionsHtml(){
  const head=`<option value="">${esc(t('sports.savedPick'))}</option>`;
  const list=(S.saved||[]).slice().sort((a,b)=>String(b?.updated_at||'').localeCompare(String(a?.updated_at||'')));
  const rows=list.map(c=>`<option value="${esc(String(c.id??''))}"${String(c.id)===String(S.loadedId)?' selected':''}>${esc(c.name||('№ '+c.id))}</option>`).join('');
  const empty=(S.saved&&S.saved.length===0)?`<option value="" disabled>${esc(t('sports.savedNone'))}</option>`:'';
  return head+rows+empty;
}
function renderOffline(){
  const sc=$('#spStepContent',root);if(!sc)return;
  sc.innerHTML=`<div class="sp-locked-note">${t('sports.offline')} <button class="btn ghost" id="spRetryProbe">${t('sports.retry')}</button></div>`;
  $('#spRetryProbe',root)?.addEventListener('click',()=>{if(typeof retrySportsProbe==='function')retrySportsProbe();});
}
function renderErrors(){
  const box=$('#spError',root);if(!box)return;
  const errs=[
    S.errOptions&&['options',S.errOptions],
    S.errCatalog&&['catalog',S.errCatalog],
    S.errSaved&&['saved',S.errSaved]
  ].filter(Boolean);
  box.innerHTML=errs.map(([k,m])=>`<div class="sp-error"><strong>${esc(t('sports.kicker'))}</strong><span>${esc(m)}</span><button class="btn" data-sp-retry="${k}">${t('sports.retry')}</button></div>`).join('');
  box.querySelectorAll('[data-sp-retry]').forEach(b=>b.onclick=()=>{
    const k=b.dataset.spRetry;
    if(k==='options'){S.errOptions=null;renderErrors();ensureOptions(true);}
    else if(k==='catalog'){S.errCatalog=null;renderErrors();ensureCatalog(true);}
    else if(k==='saved'){S.errSaved=null;renderErrors();ensureSaved(true);}
  });
}

/* ── slim horizontal step indicator (gated) ────────────────────────── */
function updateSteps(){
  const st=$('#spSteps',root);if(!st)return;
  const mx=maxStep();
  st.innerHTML=STEPS.map((id,i)=>{
    const n=i+1,done=(id==='sport'&&!!S.sport)||(id==='surface'&&!!S.surface)||n<S.step;
    const cls=`sp-st${n===S.step?' active':''}${done?' done':''}`;
    return `<button class="${cls}" data-sp-goto="${n}" ${n>mx?'disabled':''} aria-current="${n===S.step?'step':'false'}" title="${esc(t('sports.'+STEP_HINTS[id]))}">
      <span class="sp-st-no">${done?'✓':n}</span>
      <span class="sp-st-name">${t('sports.'+STEP_KEYS[id])}</span>
    </button>`;
  }).join('');
  st.querySelectorAll('[data-sp-goto]').forEach(b=>b.onclick=()=>{const n=Number(b.dataset.spGoto);if(n<=maxStep()){S.step=n;S.seen.add(n);renderRegions();if(n===4)ensureCatalog();}});
}
function updateViewerMeta(){
  const el=$('#spViewerMeta',root);if(!el)return;
  const bits=[];
  if(S.sport)bits.push(sportLabel(S.sport));
  if(toNum(S.dims.l)>0&&toNum(S.dims.w)>0)bits.push(`${n2txt(toNum(S.dims.l))} × ${n2txt(toNum(S.dims.w))} m`);
  if(S.surface)bits.push(surfaceName(S.surface));
  el.textContent=bits.length?bits.join(' · '):t('sports.previewSub');
}

/* ── step content ──────────────────────────────────────────────────── */
function renderStepContent(){
  const sc=$('#spStepContent',root);if(!sc)return;
  const step=STEPS[S.step-1];
  const body={sport:renderSport,surface:renderSurface,fencing:renderFencing,equipment:renderEquipment,extras:renderExtras,total:renderTotal}[step]();
  const isLast=S.step===STEPS.length;
  const nextDisabled=S.step>=maxStep()||isLast;
  const nav=`<div class="sp-navrow" data-sp-nav>
      <button class="btn ghost" data-sp-nav-action="back" ${S.step===1?'disabled':''}>← ${t('actions.back')}</button>
      ${maxStep()<STEPS.length&&S.step<STEPS.length?`<span class="helper" style="margin:0">${t('sports.stepLocked')}</span>`:''}
      ${isLast?'':`<button class="btn accent" data-sp-nav-action="next" ${nextDisabled?'disabled':''}>${t('sports.next')} →</button>`}
    </div>`;
  sc.innerHTML=`<div class="sp-card">
    <div class="sp-card-head">
      <div class="card-eyebrow">${t('sports.stepOf',{n:S.step,m:STEPS.length})}</div>
      <div class="sp-card-title">${t('sports.'+STEP_KEYS[step])}</div>
      <p class="sp-card-sub">${t('sports.'+STEP_HINTS[step])}</p>
    </div>
    ${step==='equipment'?nav:''}${body}${step==='equipment'?'':nav}
  </div>`;
  bindStep();
  sc.querySelectorAll('[data-sp-nav-action="back"]').forEach(b=>b.onclick=()=>{
    if(S.step>1){S.step--;renderRegions();}
  });
  sc.querySelectorAll('[data-sp-nav-action="next"]').forEach(b=>b.onclick=()=>{
    if(S.step>=maxStep()||S.step>=STEPS.length)return;
    S.step=Math.min(S.step+1,STEPS.length);S.seen.add(S.step);
    renderRegions();if(S.step===4)ensureCatalog();
  });
}

/* ── pictograms: 1.5px stroke, currentColor; generic fallbacks, never empty ── */
const svgI=(inner,vb)=>`<svg viewBox="${vb||'0 0 24 24'}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
function sportIcon(id){
  const k=String(id||'');
  if(/open_park/.test(k))return svgI('<path d="M7 21V11M4 21h6M5 11l2-5 2 5M7 6V3"/><path d="M14 16h7M15 16v-4h5v4M16 20v-4M20 20v-4M13 20h9"/>');
  if(/basket/.test(k))return svgI('<rect x="7" y="3" width="10" height="6"/><circle cx="12" cy="13" r="2.4"/><path d="M9.6 15.4l.9 5.6M14.4 15.4l-.9 5.6M12 15.4v6.1"/>');
  if(/volley/.test(k))return svgI('<path d="M4 4v17M20 4v17"/><path d="M4 9h16M4 13h16M4 17h16"/><path d="M9 9v4M14 9v4" stroke-dasharray="1.6 1.6"/>');
  if(/tennis/.test(k))return svgI('<rect x="4" y="6" width="16" height="12" rx="1"/><path d="M12 6v12M4 12h16"/><path d="M8 6v12M16 6v12" stroke-dasharray="1.4 1.6"/>');
  if(/workout|street/.test(k))return svgI('<path d="M5 21V7M19 21V7M5 7h14"/><path d="M8.5 21v-8M15.5 21v-8M8.5 13h7"/>');
  if(/multi/.test(k))return svgI('<rect x="3" y="7" width="18" height="10" rx="1"/><circle cx="12" cy="12" r="2.6"/><path d="M12 7v10"/><rect x="9.5" y="9.5" width="5" height="5"/>');
  return svgI('<rect x="3" y="6" width="18" height="12" rx="1"/><path d="M12 6v12"/><circle cx="12" cy="12" r="2.6"/><path d="M3 10h3.4v4H3M21 10h-3.4v4H21"/>');
}
function fenceOptIcon(id){
  if(/net|gallery/.test(id))return svgI('<path d="M4 18L20 6M4 6l16 12M4 12h16" stroke-dasharray="1.8 1.8"/><path d="M3 20V4M21 20V4"/>','0 0 24 24');
  if(/roof/.test(id))return svgI('<path d="M4 11L12 4l8 7"/><path d="M6.5 10v9M17.5 10v9M6.5 19h11"/>');
  if(/galv/.test(id))return svgI('<path d="M12 3l7 4v10l-7 4-7-4V7z"/><path d="M12 3v18M5 7l14 10M19 7L5 17" stroke-dasharray="1.6 1.8"/>');
  return svgI('<circle cx="12" cy="12" r="8"/><path d="M8 12h8M12 8v8"/>');
}
function extraIcon(id){
  if(id==='lighting')return svgI('<path d="M8 21V6"/><path d="M8 6l8-3"/><circle cx="17" cy="4" r="1.6"/><path d="M8 21h5"/><path d="M18.5 7.5l1.6 1.6M19.8 4.5L21.7 4.7" />');
  if(id==='benches')return svgI('<path d="M4 11h16M5.5 11V7h13v4"/><path d="M6.5 11v8M17.5 11v8M6.5 15h11"/>');
  if(id==='stands_50')return svgI('<path d="M4 20h16M6 20v-4h4v-3h4v-3h4v10"/><path d="M4 20l2-8h4"/>');
  if(id==='changing_rooms')return svgI('<rect x="5" y="5" width="14" height="14" rx="1"/><path d="M12 5v14M8.5 12h.01M15.5 12h.01"/>');
  return svgI('<rect x="5" y="5" width="14" height="14" rx="1"/><path d="M5 12h14"/>');
}

/* step 1: sport pictogram grid + size inputs with live rule hints */
function renderSport(){
  const opts=optSports();
  if(!S.options&&S.loadingOptions)return `<div class="empty-state">${t('sports.loading')}</div>`;
  if(!S.options)return `<div class="empty-state">${t('sports.loadFailed')}</div>`;
  const cards=opts.map(sp=>{
    const d=sp.dims||{};
    const meta=(d.l&&d.w)?`${esc(String(d.l))} × ${esc(String(d.w))} m`:'';
    const R=ruleDims(sp.id);
    return `<button class="sp-qc ${S.sport===sp.id?'active':''}" data-sp-sport="${esc(sp.id)}" aria-pressed="${S.sport===sp.id?'true':'false'}">
      <span class="sp-qc-ic">${sportIcon(sp.id)}</span>
      <span class="sp-qc-name">${esc(sportLabel(sp.id))}</span>
      <span class="sp-qc-meta">${meta}</span>
      <span class="sp-qc-range">${t('sports.dimsRange',{min:Math.min(R.minL,R.minW),max:Math.max(R.maxL,R.maxW)})}</span>
    </button>`;
  }).join('');
  let dims='';
  if(S.sport){
    const R=ruleDims(S.sport);
    dims=`<div class="sp-dims">
      <div class="sp-dim"><label for="spDimL">${t('sports.length')}</label><input id="spDimL" type="number" min="${R.minL}" max="${R.maxL}" step="0.1" inputmode="decimal" value="${S.dims.l>0?esc(String(S.dims.l)):''}"><span class="sp-dim-range">${t('sports.dimsRange',{min:R.minL,max:R.maxL})}</span></div>
      <div class="sp-dim"><label for="spDimW">${t('sports.width')}</label><input id="spDimW" type="number" min="${R.minW}" max="${R.maxW}" step="0.1" inputmode="decimal" value="${S.dims.w>0?esc(String(S.dims.w)):''}"><span class="sp-dim-range">${t('sports.dimsRange',{min:R.minW,max:R.maxW})}</span></div>
      <div class="sp-dim-note" id="spDimHint" ${S.dimsHint?'':'hidden'}>${esc(S.dimsHint)}</div>
    </div>`;
  }
  return `<div class="sp-label">${t('sports.chooseSport')}</div>
    <div class="sp-qgrid sp-qgrid-sport">${cards}</div>
    ${dims}`;
}

/* step 2: material swatch tiles + variant dots */
function renderSurface(){
  if(!S.options)return `<div class="empty-state">${S.loadingOptions?t('sports.loading'):t('sports.loadFailed')}</div>`;
  const tiles=optSurfaces().map(sf=>{
    const ok=surfaceAllowed(sf.id);
    const sel=S.surface===sf.id;
    return `<button class="sp-swl ${sel?'active':''} ${ok?'':'off'}" data-sp-surface="${esc(sf.id)}" ${ok?'':'disabled'} aria-pressed="${sel?'true':'false'}" ${ok?'':`title="${esc(t('sports.surfaceWhy'))}"`}>
      <span class="sp-swatch sp-sw-${esc(sf.id)}" aria-hidden="true"></span>
      <span class="sp-swl-tx"><span class="sp-swl-name">${esc(surfaceName(sf.id))}</span><span class="sp-swl-meta">${esc(surfaceHint(sf.id))}</span></span>
    </button>`;
  }).join('');
  let vars='';
  if(S.surface){
    vars=`<div class="sp-variants"><span class="sp-var-lab">${t('sports.variantLabel')}</span>${variantsOf(S.surface).map(v=>`<button class="sp-var sp-v-${esc(v)} ${S.variant===v?'active':''}" data-sp-variant="${esc(v)}" aria-pressed="${S.variant===v?'true':'false'}" title="${esc(t('sports.variant_'+v))}"><span class="sr-only">${esc(t('sports.variant_'+v))}</span></button>`).join('')}</div>`;
  }
  return `<div class="sp-label">${t('sports.chooseSurface')}</div>
    <div class="sp-qgrid sp-qgrid-swl">${tiles}</div>${vars}`;
}

/* step 3: elevation preview + height pills + toggles + gates */
function fenceElevSvg(){
  const hz=fenceHeights();
  const h=Number(S.fenceHeight)||hz[0]||4;
  const maxH=Math.max(...hz,2);
  const sy=vh=> (78/maxH)*vh; // px per metre, 78px drawing height
  const gh=sy(h);
  const base=88,left=26,w=176;
  const posts=[left,left+w/2,left+w];
  let g='';
  g+=`<line x1="10" y1="${base}" x2="${left+w+20}" y2="${base}" class="fe-ground"/>`;
  hz.forEach(hz2=>{
    const y=base-sy(hz2);
    if(Math.abs(hz2-h)>0.001)g+=`<line x1="${left-10}" y1="${y}" x2="${left+w+10}" y2="${y}" class="fe-ghost"/><text x="${left-13}" y="${y+2}" class="fe-hlab" text-anchor="end">${hz2}</text>`;
  });
  for(const x of posts)g+=`<rect x="${x-1.2}" y="${base-gh}" width="2.4" height="${gh}" rx="0.8" class="fe-post"/>`;
  const meshStep=Math.max(3.4,gh/7);
  for(let x=left+3;x<=left+w-3;x+= (w/6)){g+=`<line x1="${x}" y1="${base-gh+2}" x2="${x}" y2="${base-1}" class="fe-mesh"/>`;}
  for(let y=base-meshStep;y>base-gh+1.4;y-=meshStep)g+=`<line x1="${left+2}" y1="${y}" x2="${left+w-2}" y2="${y}" class="fe-mesh"/>`;
  if(toQty(S.gates)>0&&S.gates>=1)g+=`<rect x="${left+w/2-7}" y="${base-sy(Math.min(2.1,h))}" width="14" height="${sy(Math.min(2.1,h))}" class="fe-gate"/>`;
  g+=`<text x="${left+w+8}" y="${base-gh+3}" class="fe-hcur">${esc(String(h))} m</text>`;
  return `<svg viewBox="0 0 236 94" role="img" aria-label="${esc(t('sports.fencingHeight'))}">${g}</svg>`;
}
function renderFencing(){
  const hz=fenceHeights();
  const gr=gatesRule();
  return `<div class="sp-label">${t('sports.fencingTitle')}</div>
    <label class="sp-switch-row"><input type="checkbox" id="spFenceOn" ${S.fencingOn?'checked':''}><span>${t('sports.fencingToggle')}</span></label>
    ${S.fencingOn?`
    <div class="sp-elev">${fenceElevSvg()}</div>
    <div class="sp-label">${t('sports.fencingHeight')}</div>
    <div class="sp-pills">${hz.map(h=>`<button class="sp-pill ${Number(S.fenceHeight)===Number(h)?'active':''}" data-sp-fh="${esc(String(h))}" aria-pressed="${Number(S.fenceHeight)===Number(h)?'true':'false'}">${esc(String(h))} ${t('sports.fencingUnit')}</button>`).join('')}</div>
    ${fenceOptions().length?`<div class="sp-label">${t('sports.fencingOptions')}</div>
    <div class="sp-optrow">${fenceOptions().map(id=>{const on=S.fenceOpts.includes(id);return `<button class="sp-opt ${on?'on':''}" data-sp-fopt="${esc(id)}" aria-pressed="${on?'true':'false'}"><span class="sp-opt-ic">${fenceOptIcon(id)}</span><span class="sp-opt-tx">${esc(fenceOptLabel(id))}</span><span class="sp-opt-chk">${on?'✓':''}</span></button>`;}).join('')}</div>`:''}
    ${gr?`<div class="sp-label">${t('sports.gatesLabel')}</div>
    <div class="sp-gatesrow"><span class="sp-qty"><button type="button" data-sp-gates="-1" aria-label="−">−</button><b>${toQty(S.gates)}</b><button type="button" data-sp-gates="1" aria-label="+">+</button></span><span class="helper sp-gates-hint">${t('sports.gatesHint',{max:gr.max})}</span></div>`:''}`:''}`;
}

/* step 4: equipment — suggested purp chips first, compact filtered grid, selected chips */
function equipItems(){
  const query=String(S.equipQuery||'').trim().toLocaleLowerCase();
  const tokens=query?query.split(/\s+/).filter(Boolean):[];
  return (S.catalog||[]).filter(it=>{
    if(S.purpFilter!=='all'&&String(it?.purp)!==S.purpFilter)return false;
    if(!tokens.length)return true;
    const hay=[it?.name,it?.brand,it?.id,it?.purp,purpLabel(it?.purp)].filter(Boolean).join(' ').toLocaleLowerCase();
    return tokens.every(token=>hay.includes(token));
  });
}
function renderEquipGrid(items){
  const shown=items.slice(0,Math.max(0,S.equipShown||48));
  if(!items.length)return `<div class="empty-state">${t('sports.equipEmpty')}</div>`;
  const cards=shown.map(it=>{
    const q=selectedQty(it.id);
    const name=String(it.name??it.id);
    const img=Array.isArray(it.images)&&it.images[0]?`<img class="sp-ethumb" src="${esc(String(it.images[0]))}" alt="" loading="lazy" onerror="this.outerHTML='<div class=&quot;sp-ethumb-ph&quot;>◌</div>'">`:`<div class="sp-ethumb-ph">◌</div>`;
    const meta=[it.brand,it.dims,it.zone_m2?t('sports.zone')+': '+it.zone_m2:''].filter(Boolean).map(x=>esc(String(x))).join(' · ');
    return `<div class="sp-ecard ${q?'active':''}" data-sp-add="${esc(String(it.id))}" tabindex="0">
      <div class="sp-ethumb-wrap">${img}${q?`<span class="sp-ebadge">×${q}</span>`:''}</div>
      <div class="sp-ebody">
        <div class="sp-ename" title="${esc(name)}">${esc(name)}</div>
        <div class="sp-emeta" title="${esc(meta.replace(/&amp;/g,'&'))}">${meta}</div>
        <div class="sp-eactions">
          ${q?`<span class="sp-qty"><button type="button" data-sp-dec="${esc(String(it.id))}" aria-label="−">−</button><b>${q}</b><button type="button" data-sp-inc="${esc(String(it.id))}" aria-label="+">+</button></span>
               <button type="button" class="sp-x" data-sp-del="${esc(String(it.id))}" aria-label="${esc(t('sports.remove'))}">×</button>`
             :`<span></span><button type="button" class="sp-add">${t('sports.add')}</button>`}
        </div>
      </div>
    </div>`;
  }).join('');
  const remaining=items.length-shown.length;
  return `<div class="sp-egrid">${cards}</div>${remaining>0?`<button type="button" class="btn ghost sp-emore" data-sp-more>${t('sports.showMore',{n:remaining})}</button>`:''}`;
}
function updateEquipGrid(scope=root){
  const wrap=scope?.querySelector?.('#spEquipGrid');
  if(!wrap)return;
  const items=equipItems();
  const count=scope.querySelector('.sp-ecount');
  if(count)count.textContent=t('sports.equipCount',{n:items.length});
  wrap.innerHTML=renderEquipGrid(items);
  bindEquipGrid(wrap);
}
function bumpEquipment(id,d){
  const cur=S.equipment.find(e=>String(e.id)===String(id));
  if(!cur){
    if(d>0){
      const e={id:String(id),qty:1};
      placeNewEntry(e,catById(id));
      S.equipment.push(e);
    }
  }else{
    cur.qty=Math.max(0,toQty(cur.qty)+d);
    if(cur.qty===0)S.equipment=S.equipment.filter(x=>x!==cur);
  }
  renderStepContent();touched();
  if(!cur&&d>0&&_scene&&typeof _scene.selectById==='function'){
    pushScene();
    _scene.selectById(id);
  }
}
function bindEquipGrid(scope){
  if(!scope)return;
  scope.querySelectorAll('[data-sp-add]').forEach(c=>{
    c.removeAttribute('role');
    c.setAttribute('tabindex','0');
  });
  scope.querySelectorAll('.sp-add').forEach(b=>b.addEventListener('click',e=>{
    e.stopPropagation();
    const card=b.closest('[data-sp-add]');
    if(card)bumpEquipment(card.dataset.spAdd,1);
  }));
  scope.querySelectorAll('[data-sp-inc]').forEach(b=>b.onclick=e=>{e.stopPropagation();bumpEquipment(b.dataset.spInc,1);});
  scope.querySelectorAll('[data-sp-dec]').forEach(b=>b.onclick=e=>{e.stopPropagation();bumpEquipment(b.dataset.spDec,-1);});
  scope.querySelectorAll('[data-sp-more]').forEach(b=>b.onclick=()=>{
    S.equipShown+=48;
    updateEquipGrid(scope);
  });
}
function renderEquipment(){
  if(S.errCatalog&&!S.catalog)return `<div class="empty-state">${t('sports.catalogFailed')}</div>`;
  if(!S.catalog)return `<div class="empty-state">${S.loadingCatalog?t('sports.equipLoading'):t('sports.loading')}</div>`;
  const cats=sportCats(S.sport);
  const sugg=ruleSuggestedPurps(S.sport);
  const purpButton=p=>`<button class="sp-chip ${S.purpFilter===p?'active':''}${sugg.includes(p)?' sugg':''}" data-sp-purp="${esc(String(p))}">${esc(purpLabel(p))}</button>`;
  const chips=cats.length>1
    ? `<div class="sp-chip-groups" role="group" aria-label="${esc(t('sports.equipmentTitle'))}">
       ${cats.map(cat=>{
         const ps=[...new Set(S.catalog.filter(x=>String(x?.cat||'sport')===cat).map(x=>x?.purp).filter(v=>v!=null&&v!=='').map(String))];
         const ordered=[...sugg.filter(p=>ps.includes(p)),...ps.filter(p=>!sugg.includes(p))];
         return ordered.length?`<div class="sp-chip-group"><div class="sp-chip-head">${esc(t('sports.'+catLabel(cat)))}</div><div class="sp-chips">${ordered.map(purpButton).join('')}</div></div>`:'';
       }).join('')}
       <div class="sp-chips"><button class="sp-chip ${S.purpFilter==='all'?'active':''}" data-sp-purp="all">${t('sports.filterAll')}</button></div>
     </div>`
    : `<div class="sp-chips" role="group" aria-label="${esc(t('sports.equipmentTitle'))}">
       ${[...new Set(S.catalog.map(x=>x?.purp).filter(v=>v!=null&&v!=='').map(String))].map(purpButton).join('')}
       <button class="sp-chip ${S.purpFilter==='all'?'active':''}" data-sp-purp="all">${t('sports.filterAll')}</button>
     </div>`;
  const sel=S.equipment.length?`<div class="sp-selchips">${S.equipment.map(e=>{const it=catById(e.id);const R=pinRange();const pin=isPinned(e);
    return `<span class="sp-selchip ${pin?'sp-pinned':''}" data-sp-sel="${esc(String(e.id))}">
      <span class="nm">${esc(String(it?.name??e.id))}</span>
      <span class="sp-qty"><button type="button" data-sp-dec="${esc(e.id)}" aria-label="−">−</button><b>${e.qty}</b><button type="button" data-sp-inc="${esc(e.id)}" aria-label="+">+</button></span>
      <span class="sp-pinpos" title="${esc(t('sports.posHint',{min:R.minX,maxH:R.maxX,maxV:R.maxZ}))}">
        <label>${esc(t('sports.posH'))}<input class="sp-pos" data-sp-pinh="${esc(String(e.id))}" type="number" min="${R.minX}" max="${R.maxX}" step="0.1" inputmode="decimal" value="${pin?fmtPin(e.x):''}" placeholder="—"></label>
        <label>${esc(t('sports.posV'))}<input class="sp-pos" data-sp-pinv="${esc(String(e.id))}" type="number" min="${R.minZ}" max="${R.maxZ}" step="0.1" inputmode="decimal" value="${pin?fmtPin(e.z):''}" placeholder="—"></label>
        <span class="sp-pinunit">${t('sports.fencingUnit')}</span>
      </span>
      <button type="button" class="sp-x" data-sp-del="${esc(e.id)}" aria-label="${esc(t('sports.remove'))}">×</button>
    </span>`}).join('')}</div>`:'';
  const posNote=S.equipment.length?`<div class="sp-posnote">${t('sports.posAuto')}</div>`:'';
  const items=equipItems();
  const resetPins=S.equipment.length?`<div class="sp-equip-tools"><button type="button" class="btn ghost" data-sp-reset-pins>${t('sports.resetAllPins')}</button></div>`:'';
  return `<div class="sp-ehead"><label class="sp-esearch"><input type="search" id="spEquipQ" placeholder="${esc(t('sports.equipSearch'))}" value="${esc(S.equipQuery)}"></label><span class="sp-ecount" aria-live="polite">${esc(t('sports.equipCount',{n:items.length}))}</span></div>${chips}${sel}${posNote}${resetPins}<div id="spEquipGrid">${renderEquipGrid(items)}</div>`;
}

/* step 5: extras — pictogram rows */
function renderExtras(){
  const row=(label,spec,icon,val,attr,suggested)=>{
    return `<div class="sp-extra-row">
      <span class="sp-ex-ic">${icon}</span>
      <span class="sp-ex-tx"><span class="sp-ex-name">${esc(label)}</span><span class="sp-ex-spec">${esc(spec||'')}</span></span>
      ${suggested?`<button type="button" class="sp-ex-sug" data-sp-polesauto="1">${t('sports.polesSuggested',{n:suggestedPoles()})}</button>`:''}
      <span class="sp-qty big"><button type="button" ${attr} data-sp-delta="-1" aria-label="−">−</button><b>${toQty(val)}</b><button type="button" ${attr} data-sp-delta="1" aria-label="+">+</button></span>
    </div>`;
  };
  return `<div class="sp-label">${t('sports.extrasTitle')}</div>
    ${row(t('sports.poles'),extraSpec('lighting'),extraIcon('lighting'),S.lightingPoles,'data-sp-x="lighting"',S.polesAuto)}
    ${optExtras().map(id=>row(extraLabel(id),extraSpec(id),extraIcon(id),S.extras[id],`data-sp-x="${esc(id)}"`,false)).join('')}`;
}

/* step 6: plain quantity summary — intentionally contains no commercial values */
function summaryRows(){
  const rows=[];
  const add=(label,qty,unit='')=>{const n=toQty(qty);if(n>0)rows.push({label,value:n,unit});};
  const addValue=(label,value,unit='')=>{if(value!==null&&value!==undefined&&String(value).trim())rows.push({label,value,unit});};
  if(toNum(S.dims.l)>0&&toNum(S.dims.w)>0){
    add(t('sports.surfaceArea'),toNum(S.dims.l)*toNum(S.dims.w),'m²');
  }
  if(S.fencingOn){
    add(t('sports.fenceLength'),2*(toNum(S.dims.l)+toNum(S.dims.w)),'m');
    addValue(t('sports.fencingHeight'),`${n2txt(S.fenceHeight)} m`);
    for(const option of S.fenceOpts)addValue(fenceOptLabel(option),t('sports.selected'));
    add(t('sports.gatesLabel'),S.gates,'бр.');
  }
  add(t('sports.poles'),S.lightingPoles,'бр.');
  for(const id of optExtras()){const qty=S.extras[id];add(extraLabel(id),qty,'бр.');}
  for(const e of S.equipment){const it=catById(e.id);add(String(it?.name||e.id),e.qty,'бр.');}
  return rows;
}
function renderTotal(){
  const rows=summaryRows();
  const bits=[];
  if(S.sport)bits.push(sportLabel(S.sport));
  if(toNum(S.dims.l)>0&&toNum(S.dims.w)>0)bits.push(`${n2txt(S.dims.l)} × ${n2txt(S.dims.w)} m`);
  if(S.surface)bits.push(surfaceName(S.surface));
  const heading=bits.join(' · ');
  const html=rows.length?rows.map(r=>`<div class="sp-lrow"><span class="sp-lrow-item">${esc(r.label)}</span><span class="sp-lrow-qty"><b>${esc(String(r.value))}</b>${r.unit?' '+esc(r.unit):''}</span></div>`).join(''):`<div class="empty-state">${esc(t('sports.summaryEmpty'))}</div>`;
  return `<div class="sp-summary-head">${esc(heading)}</div>
    <div id="spTotalPanel">${html}</div>
    <div class="sp-totalbar">
      <div class="sp-totalactions"><button class="btn accent" id="spSave" ${S.sport?'':'disabled'}>${t('sports.save')}</button><button class="btn" id="spNew">${t('sports.newCta')}</button><button class="btn ghost" id="spExport" ${S.sport?'':'disabled'}>${t('sports.exportJson')}</button></div>
    </div>`;
}
/* ── per-step event bindings ───────────────────────────────────────── */
function touched(){
  updateSteps();
  updateViewerMeta();
  updateBadge();
  scheduleScenePush();
}
function bindStep(){
  const sc=$('#spStepContent',root);if(!sc)return;
  sc.querySelectorAll('[data-sp-sport]').forEach(b=>b.onclick=()=>{
    const id=b.dataset.spSport;
    const sp=optSports().find(x=>String(x.id)===String(id));
    S.sport=id;
    S.catalog=null;S.catalogKey='';S.purpFilter='all';S.equipQuery='';S.equipShown=48;
    if(sp?.dims){S.dims={l:toNum(sp.dims.l)||S.dims.l,w:toNum(sp.dims.w)||S.dims.w};}
    S.polesAuto=false;
    applyCoupledDefaults(sp);
    S.dimsHint=enforcePanelRules();
    renderStepContent();touched();if(S.step===4||S.equipment.length)ensureCatalog();
  });
  sc.querySelectorAll('[data-sp-surface]').forEach(b=>b.onclick=()=>{
    const id=b.dataset.spSurface;
    if(!surfaceAllowed(id))return;
    S.surface=id;
    if(!variantsOf(id).includes(S.variant))S.variant=variantsOf(id)[0]||null;
    renderStepContent();touched();
  });
  sc.querySelectorAll('[data-sp-variant]').forEach(b=>b.onclick=()=>{
    S.variant=b.dataset.spVariant;renderStepContent();scheduleScenePush();
  });
  const dimL=$('#spDimL',sc),dimW=$('#spDimW',sc);
  const onDim=()=>{
    S.dims={l:toNum(dimL?.value)||0,w:toNum(dimW?.value)||0};
    S.dimsHint='';
    updateViewerMeta();scheduleScenePush();
  };
  const onDimBlur=()=>{
    if(!S.sport)return;
    const R=ruleDims(S.sport);
    let msg='';
    const cl=(el,axis,mn,mx,lab)=>{
      if(!el)return;const v=toNum(el.value);
      if(v>0&&(v<mn||v>mx)){const nv=Math.min(mx,Math.max(mn,v));el.value=nv;S.dims[axis]=nv;msg=t('sports.dimsClamped',{dim:lab,min:mn,max:mx,v:nv});}
    };
    cl(dimL,'l',R.minL,R.maxL,t('sports.length'));
    cl(dimW,'w',R.minW,R.maxW,t('sports.width'));
    S.dimsHint=msg;
    const h=$('#spDimHint',sc);
    if(h){h.hidden=!msg;h.textContent=msg;}
    if(msg){updateViewerMeta();scheduleScenePush();}
  };
  dimL?.addEventListener('input',onDim);
  dimW?.addEventListener('input',onDim);
  dimL?.addEventListener('blur',onDimBlur);
  dimW?.addEventListener('blur',onDimBlur);
  $('#spFenceOn',sc)?.addEventListener('change',e=>{S.fencingOn=e.target.checked===true;S._fenceTouched=true;renderStepContent();touched();});
  sc.querySelectorAll('[data-sp-fh]').forEach(b=>b.onclick=()=>{S.fenceHeight=toNum(b.dataset.spFh)||S.fenceHeight;S._fenceTouched=true;renderStepContent();touched();});
  sc.querySelectorAll('[data-sp-fopt]').forEach(b=>b.onclick=()=>{
    const id=b.dataset.spFopt;
    if(S.fenceOpts.includes(id))S.fenceOpts=S.fenceOpts.filter(x=>x!==id);else S.fenceOpts.push(id);
    S._fenceTouched=true;renderStepContent();touched();
  });
  sc.querySelectorAll('[data-sp-gates]').forEach(b=>b.onclick=e=>{
    e.preventDefault();
    const gr=gatesRule(),mx=gr?gr.max:4;
    S.gates=Math.max(0,Math.min(mx,toQty(S.gates)+(Number(b.dataset.spGates)||0)));
    S._fenceTouched=true;renderStepContent();touched();
  });
  sc.querySelectorAll('[data-sp-purp]').forEach(b=>b.onclick=()=>{
    S.purpFilter=b.dataset.spPurp||'all';
    S.equipQuery='';S.equipShown=48;
    renderStepContent();
  });
  const equipQ=$('#spEquipQ',sc);
  let equipQTimer=0;
  equipQ?.addEventListener('input',()=>{
    clearTimeout(equipQTimer);
    equipQTimer=setTimeout(()=>{
      S.equipQuery=String(equipQ.value||'');
      S.equipShown=48;
      updateEquipGrid(sc);
    },120);
  });
  bindEquipGrid(sc.querySelector('#spEquipGrid'));
  /* H/V pin inputs: numeric → pin live; empty → unpin on commit;
     non-numeric → ignore + revert on blur */
  const onPinInput=(inp,axis,commit)=>{
    const e=S.equipment.find(x2=>String(x2.id)===String(inp.dataset[axis==='h'?'spPinh':'spPinv']));
    if(!e)return;
    const raw=String(inp.value??'').trim();
    if(raw===''){
      /* empty = unpin → back to auto layout. Fire as soon as BOTH axes are
         empty (input-time), with blur as the commit fallback for real typing. */
      const bothEmpty=(chip=>{
        if(!chip)return true;
        const h=chip.querySelector('[data-sp-pinh]'),v=chip.querySelector('[data-sp-pinv]');
        return (!h||!String(h.value).trim())&&(!v||!String(v.value).trim());
      })(inp.closest&&inp.closest('.sp-selchip'));
      if((commit||bothEmpty)&&isPinned(e)){
        delete e.x;delete e.z;delete e.pinned;
        updateEquipSceneHost();renderStepContent();scheduleScenePush();
      }else if(commit){
        syncPinInputs(e);
      }
      return;
    }
    const n=parseFloat(raw.replace(/\s/g,'').replace(',','.'));
    if(!Number.isFinite(n)){                    // ignore while typing; revert on blur
      if(commit)syncPinInputs(e);
      return;
    }
    const R=pinRange();
    const cx=v=>Math.min(R.maxX,Math.max(R.minX,v));
    const cz=v=>Math.min(R.maxZ,Math.max(R.minZ,v));
    const nx=cx(axis==='h'?n:(isPinned(e)?+e.x:0));
    const nz=cz(axis==='v'?n:(isPinned(e)?+e.z:0));
    e.x=+nx.toFixed(3);e.z=+nz.toFixed(3);e.pinned=true;
    updateEquipSceneHost();
    syncPinInputs(e,axis==='h'?'h':'v');
    scheduleScenePush();
  };
  sc.querySelectorAll('[data-sp-pinh]').forEach(i=>{
    i.addEventListener('click',e=>e.stopPropagation());
    i.addEventListener('input',()=>onPinInput(i,'h',false));
    i.addEventListener('blur',()=>onPinInput(i,'h',true));
  });
  sc.querySelectorAll('[data-sp-pinv]').forEach(i=>{
    i.addEventListener('click',e=>e.stopPropagation());
    i.addEventListener('input',()=>onPinInput(i,'v',false));
    i.addEventListener('blur',()=>onPinInput(i,'v',true));
  });
  sc.querySelectorAll('[data-sp-del]').forEach(b=>b.onclick=e=>{
    e.stopPropagation();
    S.equipment=S.equipment.filter(x=>String(x.id)!==String(b.dataset.spDel));
    renderStepContent();touched();
  });
  sc.querySelectorAll('[data-sp-reset-pins]').forEach(b=>b.onclick=e=>{
    e.stopPropagation();
    for(const item of S.equipment)onUnpin(item.id, false);
    renderStepContent();touched();
  });
  sc.querySelectorAll('.sp-eactions').forEach(w=>w.addEventListener('click',e=>e.stopPropagation()));
  sc.querySelectorAll('.sp-eactions').forEach(w=>w.addEventListener('keydown',e=>e.stopPropagation()));
  sc.querySelectorAll('[data-sp-x]').forEach(b=>b.onclick=()=>{
    const key=b.dataset.spX,d=Number(b.dataset.spDelta)||0;
    if(key==='lighting'){S.lightingPoles=Math.max(0,toQty(S.lightingPoles)+d);S._polesTouched=true;S.polesAuto=false;}
    else{S.extras[key]=Math.max(0,toQty(S.extras[key])+d);if(key==='benches')S._benchesTouched=true;}
    renderStepContent();touched();
  });
  sc.querySelectorAll('[data-sp-polesauto]').forEach(b=>b.onclick=()=>{
    S.lightingPoles=suggestedPoles();S._polesTouched=true;S.polesAuto=false;
    renderStepContent();touched();
  });
  $('#spSave',sc)?.addEventListener('click',saveConfig);
  $('#spNew',sc)?.addEventListener('click',newConfig);
  $('#spExport',sc)?.addEventListener('click',exportJson);
}

/* ── shell-level bindings ──────────────────────────────────────────── */
function bindShell(){
  const sel=$('#spSaved',root);
  if(sel)sel.onchange=()=>{if(sel.value)loadSaved(sel.value);else sel.selectedIndex=0;};
}
function updateBadge(){
  const b=$('#spTotalBadge',root);if(!b)return;
  const count=S.equipment.reduce((sum,e)=>sum+toQty(e.qty),0);
  b.textContent=`${count} ${t('sports.itemCount')}`;
}

/* ── 2D plan fallback (metres, deterministic first-fit) — v1 renderer ── */
function parseFootprint(dims){
  const m=String(dims||'').replace(/,/g,'.').match(/\d+(?:\.\d+)?/g);
  if(!m||m.length<2)return {w:1.2,d:1.2};
  let a=parseFloat(m[0]),b=parseFloat(m[1]);
  if(!Number.isFinite(a)||!Number.isFinite(b)||a<=0||b<=0)return {w:1.2,d:1.2};
  if(Math.max(a,b)>25){a/=100;b/=100;}
  return {w:a,d:b};
}
function parseZone(z){
  const m=String(z??'').replace(',','.').match(/\d+(?:\.\d+)?/);
  const v=m?parseFloat(m[0]):0;
  return Number.isFinite(v)&&v>0?v:0;
}
function planLayout(){
  const l=Math.max(toNum(S.dims.l)||0,1),w=Math.max(toNum(S.dims.w)||0,1);
  const fo=S.fencingOn?0.8:0;
  const gap=S.fencingOn?2.6:1.6;
  const horiz=l>=w;
  const items=[];
  for(const e of S.equipment){
    const it=catById(e.id);
    const fp=parseFootprint(it?.dims);
    const zone=parseZone(it?.zone_m2);
    for(let i=0;i<toQty(e.qty);i++)items.push({name:String(it?.name??e.id),w:fp.w,d:fp.d,zone});
  }
  const placed=[];
  let minX=-(l/2)-fo-1.5,maxX=(l/2)+fo+1.5,minY=-(w/2)-fo-1.5,maxY=(w/2)+fo+1.5;
  const acc=(x,y,r)=>{minX=Math.min(minX,x-r);maxX=Math.max(maxX,x+r);minY=Math.min(minY,y-r);maxY=Math.max(maxY,y+r);};
  if(horiz){
    let cursor=-l/2,band=1;
    for(const it of items){
      const rw=it.w,rh=it.d,step=rw+1.0;
      if(cursor+rw>l/2+0.001&&band===1){band=-1;cursor=-l/2;}
      const cx=cursor+rw/2,cy=band*(w/2+fo+gap+rh/2);
      cursor+=step;
      placed.push({cx,cy,rw,rh,zone:it.zone,name:it.name});
      const halo=it.zone>0?Math.sqrt(it.zone/Math.PI):0;
      acc(cx,cy,Math.max(rw,rh)/2+halo+0.9);
    }
  }else{
    let cursor=-w/2,band=-1;
    for(const it of items){
      const rw=it.d,rh=it.w,step=rh+1.0;
      if(cursor+rh>w/2+0.001&&band===-1){band=1;cursor=-w/2;}
      const cy=cursor+rh/2,cx=band*(l/2+fo+gap+rw/2);
      cursor+=step;
      placed.push({cx,cy,rw,rh,zone:it.zone,name:it.name});
      const halo=it.zone>0?Math.sqrt(it.zone/Math.PI):0;
      acc(cx,cy,Math.max(rw,rh)/2+halo+0.9);
    }
  }
  const fw=l/2+fo,fh=w/2+fo;
  const cands=[[-fw,-fh],[fw,-fh],[fw,fh],[-fw,fh]];
  if(horiz){cands.push([0,-fh],[0,fh],[-fw,0],[fw,0],[-fw/2,-fh],[fw/2,-fh],[-fw/2,fh],[fw/2,fh]);}
  else{cands.push([-fw,0],[fw,0],[0,-fh],[0,fh],[-fw,-fh/2],[-fw,fh/2],[fw,-fh/2],[fw,fh/2]);}
  const poleN=Math.min(Math.max(toQty(S.lightingPoles),0),20);
  const poles=cands.slice(0,Math.min(poleN,cands.length));
  poles.forEach(([x,y])=>acc(x,y,0.8));
  return {l,w,fo,placed,poles,fw,fh,view:{minX:minX-1,maxX:maxX+1,minY:minY-1,maxY:maxY+1}};
}
function planSvg(){
  const P=planLayout();
  const {l,w,fo,fw,fh}=P;
  const minX=P.view.minX,minY=P.view.minY,vw=P.view.maxX-P.view.minX,vh=P.view.maxY-P.view.minY;
  const n2=v=>Number(v).toFixed(2);
  const parts=[];
  if(S.fencingOn)parts.push(`<rect class="sp2-fence" x="${n2(-fw)}" y="${n2(-fh)}" width="${n2(2*fw)}" height="${n2(2*fh)}" rx="0.4"/>`);
  parts.push(`<rect class="sp2-field" x="${n2(-l/2)}" y="${n2(-w/2)}" width="${n2(l)}" height="${n2(w)}" rx="0.3"/>`);
  const cr=Math.min(l,w)/6;
  parts.push(`<g class="sp2-mark"><line x1="0" y1="${n2(-w/2)}" x2="0" y2="${n2(w/2)}"/><circle cx="0" cy="0" r="${n2(cr)}" fill="none"/><circle cx="0" cy="0" r="0.18" fill="#fff" stroke="none"/></g>`);
  for(const p of P.placed){
    if(p.zone>0)parts.push(`<circle class="sp2-halo" cx="${n2(p.cx)}" cy="${n2(p.cy)}" r="${n2(Math.sqrt(p.zone/Math.PI))}"/>`);
  }
  for(const p of P.placed){
    parts.push(`<rect class="sp2-equip" x="${n2(p.cx-p.rw/2)}" y="${n2(p.cy-p.rh/2)}" width="${n2(p.rw)}" height="${n2(p.rh)}"/>`);
    const label=p.name.length>18?p.name.slice(0,17)+'…':p.name;
    const R=Math.max(p.rw,p.rh)/2+(p.zone>0?0.6:0.9);
    parts.push(`<text class="sp2-label" x="${n2(p.cx)}" y="${n2(p.cy+R+0.75)}" font-size="0.95" text-anchor="middle">${esc(label)}</text>`);
  }
  for(const [x,y] of P.poles){
    parts.push(`<circle class="sp2-pole" cx="${n2(x)}" cy="${n2(y)}" r="0.38"/>`);
  }
  parts.push(`<text class="sp2-dim" x="${n2(minX+0.2)}" y="${n2(minY+1.1)}" font-size="0.95">${n2(l)} × ${n2(w)} m</text>`);
  return `<svg viewBox="${n2(minX)} ${n2(minY)} ${n2(vw)} ${n2(vh)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(t('sports.preview'))}">${parts.join('')}</svg>`;
}
const n2txt=v=>{const n=Number(v)||0;return n===Math.trunc(n)?String(Math.trunc(n)):n.toFixed(1);};

window.SportsView={render};
})();
