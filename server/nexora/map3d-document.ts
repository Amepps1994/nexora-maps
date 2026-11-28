import { mapParentOrigins, trustedExpoWebOrigins } from "../_core/cors";
import { TFL_ATTRIBUTION } from "../../shared/nexora/traffic";

/** Free, keyless vector styles (OpenMapTiles schema, OSM data). https://openfreemap.org */
export const OPENFREEMAP_ORIGIN = "https://tiles.openfreemap.org";
export const MAP3D_STYLES = {
  light: `${OPENFREEMAP_ORIGIN}/styles/positron`,
  dark: `${OPENFREEMAP_ORIGIN}/styles/dark`,
} as const;

function inlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * MAP-3D: the tilted 3D map. Same bridge as the Leaflet page (map-document.ts): it accepts
 * `window.nexoraUpdate(data)` from the native WebView, or window messages only from the
 * embedding web app's allowed origins (SEC-006), and posts replies to those origins only.
 * Place, stop and disruption names are rendered as text, never as HTML.
 *
 * Rendering is MapLibre GL JS (BSD-3) over OpenFreeMap vector tiles, with OpenStreetMap
 * building heights extruded. During guidance (`follow`) the camera tilts to 60° and turns
 * with `heading`. If WebGL is missing or the style cannot load, the page posts
 * `{type:'no3d'}` and the app falls back to the flat map.
 */
export function buildMap3dDocument(parentOrigins: readonly string[]): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"><link rel="stylesheet" href="/api/nexora/map-assets/maplibre-gl.css"><style>
html,body,#map{height:100%;width:100%;margin:0;background:#e9eeeb;font-family:Arial,sans-serif}body.dark,body.dark #map{background:#0b1220}
.nx-attr{position:absolute;left:12px;z-index:2;max-width:min(320px,calc(100vw - 150px));font-size:11px;line-height:15px;color:#334155}.nx-attr-btn{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:0;margin:0;font:inherit;color:inherit;background:rgba(255,255,255,.9);padding:3px 8px;border-radius:11px;box-shadow:0 1px 4px rgba(0,0,0,.18);cursor:pointer;text-align:left}.nx-attr-list{margin-top:4px;background:rgba(255,255,255,.96);padding:6px 9px;border-radius:8px;box-shadow:0 1px 6px rgba(0,0,0,.2)}.nx-attr-list[hidden]{display:none}.nx-attr-list div+div{margin-top:3px}.nx-attr a{color:#087f73}.dark .nx-attr{color:#dbe4f0}.dark .nx-attr-btn,.dark .nx-attr-list{background:rgba(21,34,53,.92)}.dark .nx-attr a{color:#5fd3c4}.open{max-width:min(320px,calc(100vw - 24px))}
.maplibregl-ctrl-top-right{margin-right:4px}.maplibregl-ctrl-top-left{margin-left:2px}.dark .maplibregl-ctrl-group{background:#152235}.dark .maplibregl-ctrl-group button .maplibregl-ctrl-icon{filter:invert(1)}
.pin{background:#087f73;border:3px solid white;width:20px;height:20px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 10px #1b3b3b35;position:relative}.pin:after{content:'';position:absolute;width:6px;height:6px;background:white;border-radius:50%;top:7px;left:7px}.pos{background:#397bff;border:3px solid white;width:14px;height:14px;border-radius:50%;box-shadow:0 0 0 9px #397bff20}.demo-pos{background:#087f73;border:3px solid white;width:16px;height:16px;border-radius:5px;transform:rotate(45deg);box-shadow:0 0 0 9px #18bfa928}
.tfl{width:14px;height:14px;border-radius:4px;transform:rotate(45deg);background:#e0a100;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);box-sizing:border-box;cursor:pointer}.tfl.closed{background:#c62828}.tfl.planned{background:#fff;border-color:#e0a100}.dark .tfl{border-color:#152235}
.stop-pin{width:22px;height:22px;border-radius:11px;background:#fff;border:3px solid #397bff;color:#0b1220;font:700 12px/16px Arial,sans-serif;text-align:center;box-sizing:border-box;box-shadow:0 1px 4px rgba(0,0,0,.35)}.dark .stop-pin{background:#152235;color:#fff}
.maplibregl-popup-content{border-radius:8px;font-size:12px;padding:8px 10px;max-width:240px;color:#0b1220}
.map-error{display:none;position:absolute;top:50%;left:10%;right:10%;background:#fff;border-radius:16px;padding:18px;z-index:1000;color:#243d38;box-shadow:0 3px 15px #0002;text-align:center}
</style></head><body><div id="map"></div><div id="error" class="map-error">3D map tiles are unavailable. Check your connection.</div><script src="/api/nexora/map-assets/maplibre-gl.js"></script><script>
(function(){
 var parents=${inlineJson(parentOrigins)},embedded=!window.ReactNativeWebView&&window.parent&&window.parent!==window;
 var styles=${inlineJson(MAP3D_STYLES)},tflCredits=${inlineJson(TFL_ATTRIBUTION)};
 function send(d){if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify(d));return;}if(!embedded)return;var m=Object.assign({nexora:true},d);
  parents.forEach(function(o){try{window.parent.postMessage(m,o);}catch(_){}});}
 function webgl(){try{var c=document.createElement('canvas');return Boolean(c.getContext('webgl2')||c.getContext('webgl'));}catch(_){return false;}}
 if(!window.maplibregl||!webgl()){send({type:'no3d',reason:window.maplibregl?'webgl':'load'});return;}
 var dark=false,styleReady=false,latest=null,lastRoute='',lastCenter='',lastFollow='',lastTraffic='',lastStops='',following=false;
 var map=new maplibregl.Map({container:'map',style:styles.light,center:[-0.116,51.515],zoom:12.6,pitch:55,bearing:-12,maxPitch:70,attributionControl:false,dragRotate:true,pitchWithRotate:true,fadeDuration:0});
 map.addControl(new maplibregl.NavigationControl({showZoom:false,visualizePitch:true}),'top-left');
 map.addControl(new maplibregl.ScaleControl({unit:'imperial',maxWidth:90}),'top-right');
 // No style within 15 s (offline, OpenFreeMap down): the app falls back to the flat map.
 var styleTimer=setTimeout(function(){if(!styleReady)send({type:'no3d',reason:'load'});},15000);
 var errorShown=false;function showError(on){if(on===errorShown)return;errorShown=on;document.getElementById('error').style.display=on?'block':'none';send({type:'network',online:navigator.onLine});}
 map.on('error',function(e){if(!styleReady&&!(e&&e.sourceId)){clearTimeout(styleTimer);send({type:'no3d',reason:'load'});return;}if(e&&e.sourceId&&e.sourceId.indexOf('nx-')!==0)showError(true);});
 map.on('data',function(e){if(e.dataType==='source'&&e.tile&&e.sourceId&&e.sourceId.indexOf('nx-')!==0)showError(false);});
 // Credits (UX-001): one compact line, expandable. Our constant HTML; TfL lines are text.
 var box=document.createElement('div');box.className='nx-attr';var creditBtn=document.createElement('button');creditBtn.className='nx-attr-btn';creditBtn.type='button';creditBtn.setAttribute('aria-expanded','false');creditBtn.setAttribute('aria-controls','nx-attr-list');var creditList=document.createElement('div');creditList.className='nx-attr-list';creditList.id='nx-attr-list';creditList.hidden=true;box.appendChild(creditBtn);box.appendChild(creditList);document.body.appendChild(box);box.style.top='200px';
 creditBtn.addEventListener('click',function(){var open=creditList.hidden;creditList.hidden=!open;creditBtn.setAttribute('aria-expanded',open?'true':'false');if(open)box.classList.add('open');else box.classList.remove('open');});
 var trafficAttributed=false;
 function renderCredits(){creditBtn.textContent='\\u00a9 OpenStreetMap \\u00b7 OpenFreeMap'+(trafficAttributed?' \\u00b7 TfL':'')+' \\u24d8';creditBtn.setAttribute('aria-label','Map data credits: OpenStreetMap and OpenFreeMap'+(trafficAttributed?' and TfL':'')+'. Tap for details.');
  creditList.textContent='';var row=document.createElement('div');row.innerHTML='<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';creditList.appendChild(row);
  if(trafficAttributed){var head=document.createElement('div');head.textContent='Disruptions:';creditList.appendChild(head);tflCredits.forEach(function(t){var r=document.createElement('div');r.textContent=t;creditList.appendChild(r);});}
  var lib=document.createElement('div');lib.innerHTML='<a href="https://maplibre.org" target="_blank">MapLibre</a>';creditList.appendChild(lib);}
 renderCredits();
 function el(cls,text){var outer=document.createElement('div');var inner=document.createElement('div');inner.className=cls;if(text!=null)inner.textContent=String(text);outer.appendChild(inner);return outer;}
 var markers={destination:null,gps:null,position:null},stopMarkers=[],trafficMarkers=[],suppressPin=false;
 function placeMarker(key,coord,cls){if(coord){if(markers[key])markers[key].setLngLat(coord);else markers[key]=new maplibregl.Marker({element:el(cls),anchor:'center'}).setLngLat(coord).addTo(map);}else if(markers[key]){markers[key].remove();markers[key]=null;}}
 function fc(features){return{type:'FeatureCollection',features:features};}
 function vectorSource(){var s=map.getStyle().sources||{};for(var k in s)if(s[k].type==='vector')return k;return null;}
 function firstSymbol(){var ls=map.getStyle().layers||[];for(var i=0;i<ls.length;i++)if(ls[i].type==='symbol')return ls[i].id;return undefined;}
 function addOverlays(){
  var src=vectorSource();
  (map.getStyle().layers||[]).forEach(function(l){if(l.type==='fill-extrusion')map.removeLayer(l.id);});
  if(src)map.addLayer({id:'nx-buildings',type:'fill-extrusion',source:src,'source-layer':'building',minzoom:13,filter:['!=',['get','hide_3d'],true],paint:{'fill-extrusion-color':dark?'#243349':'#dfe5e2','fill-extrusion-height':['interpolate',['linear'],['zoom'],13,0,14.5,['coalesce',['get','render_height'],8]],'fill-extrusion-base':['interpolate',['linear'],['zoom'],13,0,14.5,['coalesce',['get','render_min_height'],0]],'fill-extrusion-opacity':dark?.9:.82,'fill-extrusion-vertical-gradient':true}},firstSymbol());
  map.addSource('nx-traffic',{type:'geojson',data:fc([])});
  map.addSource('nx-route',{type:'geojson',data:fc([])});
  map.addSource('nx-places',{type:'geojson',data:fc([])});
  map.addLayer({id:'nx-traffic',type:'line',source:'nx-traffic',layout:{'line-cap':'round'},paint:{'line-color':'#c62828','line-width':4,'line-opacity':.85,'line-dasharray':[1.2,1]}});
  map.addLayer({id:'nx-route-casing',type:'line',source:'nx-route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffffff','line-width':10,'line-opacity':.95}});
  map.addLayer({id:'nx-route-line',type:'line',source:'nx-route',filter:['!=',['get','synthetic'],true],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#397bff','line-width':6}});
  map.addLayer({id:'nx-route-demo',type:'line',source:'nx-route',filter:['==',['get','synthetic'],true],layout:{'line-join':'round'},paint:{'line-color':'#087f73','line-width':6,'line-dasharray':[1.4,1.2]}});
  map.addLayer({id:'nx-places',type:'circle',source:'nx-places',paint:{'circle-radius':6,'circle-color':'#087f73','circle-stroke-color':'#ffffff','circle-stroke-width':2,'circle-pitch-alignment':'map'}});
  styleReady=true;clearTimeout(styleTimer);lastRoute='';lastTraffic='';
  if(latest)render(latest,true);
 }
 map.on('style.load',addOverlays);
 map.on('click','nx-places',function(e){var f=e.features&&e.features[0];if(f&&typeof f.properties.id==='string'){suppressPin=true;send({type:'place',id:f.properties.id});}});
 map.on('click',function(e){if(suppressPin){suppressPin=false;return;}send({type:'pin',coordinate:[e.lngLat.lng,e.lngLat.lat]});});
 map.on('mouseenter','nx-places',function(){map.getCanvas().style.cursor='pointer';});map.on('mouseleave','nx-places',function(){map.getCanvas().style.cursor='';});
 // The user moved the map: stop forcing the follow camera until the next update.
 map.on('dragstart',function(){following=false;});
 function padding(ct){var h=window.innerHeight,w=window.innerWidth;return{top:Math.min(ct,h*.3),bottom:Math.min(330,h*.4),left:Math.min(40,w*.1),right:Math.min(40,w*.1)};}
 function render(d,fresh){
  var ct=Number(d.controlTop)||200,motion=d.reducedMotion?0:700;
  box.style.top=ct+'px';var tr=document.querySelector('.maplibregl-ctrl-top-right'),tl=document.querySelector('.maplibregl-ctrl-top-left');if(tr)tr.style.top=(ct-6)+'px';if(tl)tl.style.top=(ct+22)+'px';
  if(!styleReady)return;
  if(d.places)map.getSource('nx-places').setData(fc(d.places.map(function(p){return{type:'Feature',properties:{id:String(p.id),name:String(p.name)},geometry:{type:'Point',coordinates:p.coordinate}};})));
  placeMarker('destination',d.destination,'pin');placeMarker('gps',d.gps,'pos');placeMarker('position',d.position,'demo-pos');
  var sk=JSON.stringify(d.stops||[]);if(sk!==lastStops){lastStops=sk;stopMarkers.forEach(function(m){m.remove();});stopMarkers=(d.stops||[]).map(function(c,i){var e=el('stop-pin',i+1);e.firstChild.setAttribute('aria-label','Stop '+(i+1));return new maplibregl.Marker({element:e}).setLngLat(c).addTo(map);});}
  var tk=JSON.stringify(d.traffic||[]);if(tk!==lastTraffic){lastTraffic=tk;var list=d.traffic||[];
   map.getSource('nx-traffic').setData(fc(list.filter(function(t){return t.lines&&t.lines.length;}).map(function(t){return{type:'Feature',properties:{},geometry:{type:'MultiLineString',coordinates:t.lines}};})));
   trafficMarkers.forEach(function(m){m.remove();});
   trafficMarkers=list.map(function(t){var e=el('tfl'+(t.closure?' closed':'')+(t.planned?' planned':''));var label=document.createElement('div');label.textContent=t.title;
    e.addEventListener('click',function(){suppressPin=true;});
    return new maplibregl.Marker({element:e}).setLngLat(t.point).setPopup(new maplibregl.Popup({offset:10,closeButton:false}).setDOMContent(label)).addTo(map);});
   if(Boolean(list.length)!==trafficAttributed){trafficAttributed=Boolean(list.length);renderCredits();}}
  var me=d.position||d.gps,follow=Boolean(d.follow&&me);
  var key=JSON.stringify(d.route||[])+'|'+Boolean(d.synthetic);
  if(key!==lastRoute){lastRoute=key;var r=d.route||[];
   map.getSource('nx-route').setData(fc(r.length>1?[{type:'Feature',properties:{synthetic:Boolean(d.synthetic)},geometry:{type:'LineString',coordinates:r}}]:[]));
   if(r.length>1&&!follow&&!fresh){var b=new maplibregl.LngLatBounds(r[0],r[0]);r.forEach(function(c){b.extend(c);});map.fitBounds(b,{padding:padding(ct),maxZoom:15,bearing:map.getBearing(),pitch:Math.min(map.getPitch(),50),duration:motion});}}
  if(follow){var fk=JSON.stringify([me,Math.round(d.heading||0)]);
   if(fk!==lastFollow||!following){lastFollow=fk;following=true;
    var opts={center:me,zoom:16,pitch:60,offset:[0,Math.round(window.innerHeight*.18)],duration:motion?900:0};
    if(typeof d.heading==='number'&&isFinite(d.heading))opts.bearing=d.heading;
    map.easeTo(opts);}}
  else if(lastFollow){lastFollow='';following=false;map.easeTo({pitch:55,duration:motion});}
  if(!follow&&d.center&&JSON.stringify(d.center)!==lastCenter){lastCenter=JSON.stringify(d.center);var cz=(d.zoom||14)-1,dy=0;
   // On a phone keep the blue dot between the top controls and the bottom sheet.
   if(d.gps&&d.gps[0]===d.center[0]&&d.gps[1]===d.center[1]&&window.innerWidth<700){var h=window.innerHeight,top=Math.min(ct,h*.3),sheetTop=Math.max(top+80,h-118-Math.min(480,h*.43));dy=h/2-(top+sheetTop)/2;}
   map.easeTo({center:d.center,zoom:cz,offset:[0,-Math.max(0,Math.round(dy))],duration:motion});}
  if(d.command==='zoomIn')map.zoomIn();if(d.command==='zoomOut')map.zoomOut();
 }
 window.nexoraUpdate=function(d){
  if(!d||typeof d!=='object')return;
  var wantDark=Boolean(d.dark);
  if(wantDark)document.body.classList.add('dark');else document.body.classList.remove('dark');
  latest=d;
  if(wantDark!==dark){dark=wantDark;styleReady=false;map.setStyle(dark?styles.dark:styles.light,{diff:false});return;}
  render(d,false);
  setTimeout(function(){map.resize();},100);
 };
 window.addEventListener('message',function(e){if(!embedded||e.source!==window.parent||parents.indexOf(e.origin)<0)return;if(e.data&&e.data.nexoraMap&&e.data.data&&typeof e.data.data==='object')window.nexoraUpdate(e.data.data);});
 window.addEventListener('offline',function(){send({type:'network',online:false});});window.addEventListener('online',function(){send({type:'network',online:true});});
 send({type:'ready'});
})();
</script></body></html>`;
}

/**
 * SEC-008 CSP for the 3D page: scripts and styles from this server only, map data
 * (style, vector tiles, fonts, sprites) from OpenFreeMap only. MapLibre runs its tile
 * worker from a blob URL, so worker-src allows blob:.
 */
export function map3dDocumentCsp(): string {
  const ancestors = [
    "'self'",
    ...trustedExpoWebOrigins(),
    "http://localhost:*",
    "http://127.0.0.1:*",
  ];
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${OPENFREEMAP_ORIGIN}`,
    `connect-src 'self' ${OPENFREEMAP_ORIGIN}`,
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "child-src blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${ancestors.join(" ")}`,
  ].join("; ");
}

/** Served at /api/nexora/map3d. */
export const map3dDocument = buildMap3dDocument(mapParentOrigins());
