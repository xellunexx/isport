/* Sports 3D scene viewer strings. Bulgarian is the active UI; English is fallback. */
(function(){
'use strict';
function put(lang,view){
  if(typeof I18N==='undefined'||!I18N[lang])return;
  I18N[lang].sports=Object.assign(I18N[lang].sports||{},{scene:{view:view}});
}
put('en',{
  perspective:'Perspective', top:'Top / Plan', fit:'Fit', dims:'Dims',
  fullscreen:'Fullscreen', exitFullscreen:'Exit fullscreen', rotate:'Rotate',
  tilt:'Tilt', raise:'Raise', lower:'Lower', reset:'Reset', grid:'Grid',
  sideTilt:'Side tilt', hint:'Drag to move · Ctrl rotate · Shift raise · Alt tilt · Space no snap · Del remove',
  gridSnap:'Grid 0.25 m', rotSnap:'15°', equipment:'Equipment', deselect:'Deselect',
  x:'X', z:'Z', elev:'Alt', rot:'Rot', tiltZ:'TiltZ', propHint:'Click a ball to kick it',
  resetAllPins:'Reset all pins'
});
put('bg',{
  perspective:'Перспектива', top:'Отгоре / План', fit:'Побери', dims:'Размери',
  fullscreen:'Цял екран', exitFullscreen:'Изход от цял екран', rotate:'Завърти',
  tilt:'Наклон', raise:'Повдигни', lower:'Свали', reset:'Нулирай', grid:'Мрежа',
  sideTilt:'Страничен наклон', hint:'Влачи за преместване · Ctrl завъртане · Shift повдигане · Alt наклон · Space без прилепване · Del премахване',
  gridSnap:'Мрежа 0,25 м', rotSnap:'15°', equipment:'Оборудване', deselect:'Отмени избора',
  x:'X', z:'Z', elev:'Вис.', rot:'Завърт.', tiltZ:'Страничен наклон', propHint:'Кликни топка, за да я ритнеш',
  resetAllPins:'Нулирай всички позиции'
});
})();
