(function(){
  'use strict';

  const root=window;
  root.STATE=root.STATE||{mode:'sports',lang:'bg',sportsAvailable:true};
  root.STATE.mode='sports';
  root.STATE.lang='bg';
  root.STATE.sportsAvailable=true;
  root.I18N=root.I18N||{en:{},bg:{}};
  root.I18N.en=root.I18N.en||{};
  root.I18N.bg=root.I18N.bg||{};

  function deepGet(obj,path){return String(path).split('.').reduce((a,k)=>a?.[k],obj);}
  function interpolate(value,vars={}){
    return String(value??'').replace(/\{(\w+)\}/g,(_,k)=>vars[k]??`{${k}}`);
  }
  root.t=function(path,vars={}){
    const dict=root.I18N[root.STATE.lang]||root.I18N.en;
    const value=deepGet(dict,path)??deepGet(root.I18N.en,path)??path;
    return interpolate(value,vars);
  };
  root.$=(selector,scope=document)=>scope.querySelector(selector);
  root.$$=(selector,scope=document)=>Array.from(scope.querySelectorAll(selector));
  root.esc=function(value){
    return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  };
  root.notify=function(title,message){
    const text=[title,message].filter(Boolean).join(' — ');
    if(text)window.setTimeout(()=>window.alert(text),0);
  };

  const savedKey='ic.configurator.saved';
  const readSaved=()=>{
    try{
      const value=JSON.parse(localStorage.getItem(savedKey)||'[]');
      return Array.isArray(value)?value:[];
    }catch{return [];}
  };
  const writeSaved=value=>localStorage.setItem(savedKey,JSON.stringify(value));
  const catalog=()=>Array.isArray(root.IC_DATA?.products)?root.IC_DATA.products:[];
  const mapProduct=p=>({
    id:String(p.id),cat:p.cat||'',name:p.n||String(p.id),brand:p.brand||'',
    purp:p.purp||'',age_min:Array.isArray(p.age)?p.age[0]:0,age_max:Array.isArray(p.age)?p.age[1]:99,
    age:Array.isArray(p.age)?p.age:[0,99],dims:p.sp?.d||null,fall:p.sp?.f||null,
    zone_m2:p.sp?.z||null,mats:Array.isArray(p.mats)?p.mats:[],images:Array.isArray(p.img)?p.img:[],cutout:false
  });
  root.api=function(path,opts={}){
    const url=String(path||'');
    if(url==='/api/sports/options'){
      return Promise.resolve(root.IC_SPORTS_OPTIONS||{sports:[],surfaces:[],fencing:{},lighting:{},extras:[]});
    }
    if(url.startsWith('/api/sports/catalog')){
      const query=new URLSearchParams(url.split('?')[1]||'');
      const cats=new Set((query.get('cat')||'').split(',').map(x=>x.trim()).filter(Boolean));
      let products=catalog().map(mapProduct);
      if(cats.size)products=products.filter(p=>cats.has(String(p.cat)));
      return Promise.resolve(products);
    }
    if(url==='/api/sports/configurations'){
      return Promise.resolve(readSaved());
    }
    if(url.startsWith('/api/sports/configuration?id=')){
      const id=decodeURIComponent(url.split('=')[1]||'');
      const found=readSaved().find(x=>String(x.id)===String(id));
      return found?Promise.resolve(found):Promise.reject(new Error('Конфигурацията не е намерена.'));
    }
    if(url==='/api/sports/configuration'&&String(opts.method||'GET').toUpperCase()==='POST'){
      return Promise.resolve().then(()=>{
        const body=typeof opts.body==='string'?JSON.parse(opts.body||'{}'):(opts.body||{});
        const rows=readSaved();
        const id=String(Date.now());
        const record={id,name:String(body.name||'Конфигурация'),config:body.config||{},updated_at:new Date().toISOString()};
        rows.push(record);writeSaved(rows);return {ok:true,id};
      });
    }
    return Promise.reject(new Error('Неподдържана локална заявка.'));
  };

  let rendered=false;
  function openConfigurator(event){
    event?.preventDefault();
    event?.stopImmediatePropagation();
    const overlay=document.getElementById('cfg');
    const mount=document.getElementById('cfgRoot');
    if(!overlay||!mount)return;
    overlay.hidden=false;
    document.body.style.overflow='hidden';
    if(!rendered&&root.SportsView?.render){
      rendered=true;
      root.SportsView.render(mount);
    }
    requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
  }
  function closeConfigurator(){
    const overlay=document.getElementById('cfg');
    if(overlay)overlay.hidden=true;
    document.body.style.overflow='';
  }
  function bind(){
    const hero=document.getElementById('diyOpenHero');
    if(hero)hero.addEventListener('click',openConfigurator,true);
    const overlay=document.getElementById('cfg');
    overlay?.addEventListener('click',event=>{
      if(event.target.closest('[data-close]'))closeConfigurator();
    });
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&!document.getElementById('cfg')?.hidden)closeConfigurator();
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);
  else bind();
})();
