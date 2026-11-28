import { mapParentOrigins } from "../_core/cors";
import { TFL_ATTRIBUTION } from "../../shared/nexora/traffic";

/** JSON for an inline <script>: no "</script>" or HTML comment can close it early. */
function inlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * The Leaflet page the app shows in a WebView (native) or an iframe (web).
 *
 * SEC-006: the React Native bridge drives it through injectJavaScript, so on native no
 * window message is accepted at all. In an iframe only messages from the embedding window
 * whose origin is in `parentOrigins` are accepted, and replies are posted to those origins
 * only, never '*'. Place and disruption names are rendered as text, never as HTML.
 *
 * UX-001: credits sit in one compact line under the top controls, expandable to the full
 * OpenStreetMap and TfL licence text in one tap, instead of Leaflet's multi-line band.
 */
export function buildMapDocument(parentOrigins: readonly string[]): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"><link rel="stylesheet" href="/api/nexora/map-assets/leaflet.css"><style>
html,body,#map{height:100%;width:100%;margin:0;background:#e9eeeb;font-family:Arial,sans-serif}.nx-attr{margin-left:12px!important;max-width:min(320px,calc(100vw - 150px));font-size:11px;line-height:15px;color:#334155}.nx-attr-btn{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:0;margin:0;font:inherit;color:inherit;background:rgba(255,255,255,.9);padding:3px 8px;border-radius:11px;box-shadow:0 1px 4px rgba(0,0,0,.18);cursor:pointer;text-align:left}.nx-attr-list{margin-top:4px;background:rgba(255,255,255,.96);padding:6px 9px;border-radius:8px;box-shadow:0 1px 6px rgba(0,0,0,.2)}.nx-attr-list[hidden]{display:none}.nx-attr-list div+div{margin-top:3px}.nx-attr a{color:#087f73}.dark .nx-attr{color:#dbe4f0}.dark .nx-attr-btn,.dark .nx-attr-list{background:rgba(21,34,53,.92)}.dark .nx-attr a{color:#5fd3c4}.open .nx-attr-list{max-width:min(320px,calc(100vw - 24px))}.leaflet-bottom{bottom:10px}.leaflet-control-scale{margin-left:16px!important}.leaflet-control-scale-line{border-color:#64748b!important}.leaflet-tile-pane{filter:saturate(.30) contrast(.94) brightness(1.04)}.dark .leaflet-tile-pane{filter:invert(.91) hue-rotate(175deg) saturate(.25) brightness(.80)}.pin{background:#087f73;border:3px solid white;width:20px;height:20px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 10px #1b3b3b35}.pin:after{content:'';position:absolute;width:6px;height:6px;background:white;border-radius:50%;top:7px;left:7px}.pos{background:#397bff;border:3px solid white;width:14px;height:14px;border-radius:50%;box-shadow:0 0 0 9px #397bff20}.demo-pos{background:#087f73;border:3px solid white;width:16px;height:16px;border-radius:5px;transform:rotate(45deg);box-shadow:0 0 0 9px #18bfa928}.spot{background:#fff;color:#526a64;border:1px solid #d9e4de;border-radius:24px;padding:6px 9px;font-size:12px;font-weight:bold;white-space:nowrap;box-shadow:0 2px 7px #0b122015}.leaflet-tooltip{border:0;box-shadow:0 2px 8px #0b122018;border-radius:8px;font-size:12px}.map-error{display:none;position:absolute;top:50%;left:10%;right:10%;background:#fff;border-radius:16px;padding:18px;z-index:1000;color:#243d38;box-shadow:0 3px 15px #0002;text-align:center}
.tfl{width:14px;height:14px;border-radius:4px;transform:rotate(45deg);background:#e0a100;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);box-sizing:border-box}.tfl.closed{background:#c62828}.tfl.planned{background:#fff;border-color:#e0a100}.dark .tfl{border-color:#152235}
.stop-pin{width:22px;height:22px;border-radius:11px;background:#fff;border:3px solid #397bff;color:#0b1220;font:700 12px/16px Arial,sans-serif;text-align:center;box-sizing:border-box;box-shadow:0 1px 4px rgba(0,0,0,.35)}.dark .stop-pin{background:#152235;color:#fff}
</style></head><body><div id="map"></div><div id="error" class="map-error">Map tiles are unavailable. Check your connection. Cached route is not offline navigation.</div><script src="/api/nexora/map-assets/leaflet.js"></script><script>
(function(){
 if(!window.L){document.getElementById('error').style.display='block';return;}
 var parents=${inlineJson(parentOrigins)},embedded=!window.ReactNativeWebView&&window.parent&&window.parent!==window;
 var map=L.map('map',{zoomControl:false,attributionControl:false}).setView([51.515,-.116],13);
 // Offline packs define window.nexoraTileLayer (PMTiles vector tiles read on-device); keep this hook.
 var tiles=(window.nexoraTileLayer?window.nexoraTileLayer(L):L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',keepBuffer:0})).addTo(map);
 tiles.on('tileerror',function(){document.getElementById('error').style.display='block';send({type:'network',online:navigator.onLine});});
 tiles.on('tileload',function(){document.getElementById('error').style.display='none';send({type:'network',online:navigator.onLine});});
 L.control.scale({position:'topright',imperial:true,metric:false}).addTo(map);
 // Credits (UX-001). Tile credits are our own constant HTML (layer option); TfL lines are text.
 var tflCredits=${inlineJson(TFL_ATTRIBUTION)},trafficAttributed=false,creditBtn,creditList;
 var credits=L.control({position:'topleft'});
 credits.onAdd=function(){var box=L.DomUtil.create('div','nx-attr');creditBtn=L.DomUtil.create('button','nx-attr-btn',box);creditBtn.type='button';creditBtn.setAttribute('aria-expanded','false');creditBtn.setAttribute('aria-controls','nx-attr-list');creditList=L.DomUtil.create('div','nx-attr-list',box);creditList.id='nx-attr-list';creditList.hidden=true;
  L.DomEvent.disableClickPropagation(box);L.DomEvent.disableScrollPropagation(box);
  L.DomEvent.on(creditBtn,'click',function(){var open=creditList.hidden;creditList.hidden=!open;creditBtn.setAttribute('aria-expanded',open?'true':'false');if(open)L.DomUtil.addClass(box,'open');else L.DomUtil.removeClass(box,'open');});
  return box;};
 function renderCredits(){if(!creditList)return;creditBtn.textContent='\u00a9 OpenStreetMap'+(trafficAttributed?' \u00b7 TfL':'')+' \u24d8';creditBtn.setAttribute('aria-label','Map data credits: OpenStreetMap'+(trafficAttributed?' and TfL':'')+'. Tap for details.');
  creditList.textContent='';var row=document.createElement('div');row.innerHTML=(tiles.options&&tiles.options.attribution)||'&copy; OpenStreetMap contributors';creditList.appendChild(row);
  if(trafficAttributed){var head=document.createElement('div');head.textContent='Disruptions:';creditList.appendChild(head);tflCredits.forEach(function(t){var r=document.createElement('div');r.textContent=t;creditList.appendChild(r);});}
  var lib=document.createElement('div');lib.innerHTML='<a href="https://leafletjs.com" target="_blank">Leaflet</a>';creditList.appendChild(lib);}
 credits.addTo(map);renderCredits();
 var trafficLayer=L.layerGroup().addTo(map),lastTraffic='';
 var routeLayer=L.layerGroup().addTo(map), destination=null, position=null,gps=null, spots=L.layerGroup().addTo(map),stopLayer=L.layerGroup().addTo(map),lastStops='',lastRoute='',lastCenter='';
 function send(d){if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify(d));return;}if(!embedded)return;var m=Object.assign({nexora:true},d);
  // Explicit target origins only: the browser drops the message unless the parent is one of them.
  parents.forEach(function(o){try{window.parent.postMessage(m,o);}catch(_){}});}
 function textNode(v){var el=document.createElement('span');el.textContent=String(v==null?'':v);return el;}
 function icon(cls,w,h){return L.divIcon({className:'',html:'<div class="'+cls+'"></div>',iconSize:[w,h],iconAnchor:[w/2,h/2]});}
 map.on('click',function(e){send({type:'pin',coordinate:[e.latlng.lng,e.latlng.lat]});});
 window.nexoraUpdate=function(d){
  var ct=Number(d.controlTop)||200;document.querySelectorAll('.leaflet-top.leaflet-right,.leaflet-top.leaflet-left').forEach(function(e){e.style.top=ct+'px';});
  if(d.dark)document.body.classList.add('dark');else document.body.classList.remove('dark');
  if(d.places){spots.clearLayers();d.places.forEach(function(p){L.circleMarker([p.coordinate[1],p.coordinate[0]],{radius:5,color:'#ffffff',weight:2,fillColor:'#087f73',fillOpacity:1}).bindTooltip(textNode(p.name)).on('click',function(){send({type:'place',id:p.id});}).addTo(spots);});}
  if(d.destination){var ll=[d.destination[1],d.destination[0]];if(destination)destination.setLatLng(ll);else destination=L.marker(ll,{icon:icon('pin',24,24)}).addTo(map);}else if(destination){map.removeLayer(destination);destination=null;}
  var sk=JSON.stringify(d.stops||[]);if(sk!==lastStops){lastStops=sk;stopLayer.clearLayers();(d.stops||[]).forEach(function(c,i){L.marker([c[1],c[0]],{icon:L.divIcon({className:'',html:'<div class="stop-pin" aria-label="Stop '+(i+1)+'">'+(i+1)+'</div>',iconSize:[22,22],iconAnchor:[11,11]}),keyboard:false}).addTo(stopLayer);});}
  if(d.gps){var ll=[d.gps[1],d.gps[0]];if(gps)gps.setLatLng(ll);else gps=L.marker(ll,{icon:icon('pos',20,20)}).addTo(map);}else if(gps){map.removeLayer(gps);gps=null;}
  if(d.position){var ll=[d.position[1],d.position[0]];if(position)position.setLatLng(ll);else position=L.marker(ll,{icon:icon('demo-pos',22,22)}).addTo(map);}else if(position){map.removeLayer(position);position=null;}
  var key=JSON.stringify(d.route||[]);if(key!==lastRoute){lastRoute=key;routeLayer.clearLayers();if(d.route&&d.route.length){var latlng=d.route.map(function(c){return[c[1],c[0]];});L.polyline(latlng,{color:'#fff',weight:9,opacity:.95,lineCap:'round'}).addTo(routeLayer);var poly=L.polyline(latlng,{color:d.synthetic?'#087f73':'#397bff',weight:5,opacity:1,lineCap:'round',dashArray:d.synthetic?'8 7':null}).addTo(routeLayer);map.fitBounds(poly.getBounds(),{paddingTopLeft:[40,180],paddingBottomRight:[40,330],maxZoom:15,animate:false});}}
  var tk=JSON.stringify(d.traffic||[]);if(tk!==lastTraffic){lastTraffic=tk;trafficLayer.clearLayers();var list=d.traffic||[];
   list.forEach(function(t){(t.lines||[]).forEach(function(line){L.polyline(line.map(function(c){return[c[1],c[0]];}),{color:'#c62828',weight:5,opacity:.85,dashArray:'6 5',interactive:false}).addTo(trafficLayer);});
    var label=document.createElement('div');label.textContent=t.title;label.style.maxWidth='240px';label.style.whiteSpace='normal';
    L.marker([t.point[1],t.point[0]],{icon:L.divIcon({className:'',html:'<div class="tfl'+(t.closure?' closed':'')+(t.planned?' planned':'')+'"></div>',iconSize:[14,14],iconAnchor:[7,7]}),keyboard:false,zIndexOffset:-100}).bindTooltip(label,{direction:'top'}).addTo(trafficLayer);});
   if(Boolean(list.length)!==trafficAttributed){trafficAttributed=Boolean(list.length);renderCredits();}}
  if(d.center&&JSON.stringify(d.center)!==lastCenter){lastCenter=JSON.stringify(d.center);var cz=d.zoom||14,cll=[d.center[1],d.center[0]];
   // On a phone the bottom sheet covers the lower part of the map, so centring on the device
   // position would hide the blue dot behind it. Put the point between the top controls and the sheet.
   if(d.gps&&d.gps[0]===d.center[0]&&d.gps[1]===d.center[1]&&window.innerWidth<700){var h=window.innerHeight,top=Math.min(ct,h*.3),sheetTop=Math.max(top+80,h-118-Math.min(480,h*.43)),y=(top+sheetTop)/2,dy=h/2-y;if(dy>0)cll=map.unproject(map.project(cll,cz).add([0,dy]),cz);}
   map.setView(cll,cz,{animate:!d.reducedMotion});}
  if(d.command==='zoomIn')map.zoomIn();if(d.command==='zoomOut')map.zoomOut();
  setTimeout(function(){map.invalidateSize();},100);
 };
 // SEC-006: only the embedding web app may drive the map; the native bridge uses injectJavaScript.
 window.addEventListener('message',function(e){if(!embedded||e.source!==window.parent||parents.indexOf(e.origin)<0)return;if(e.data&&e.data.nexoraMap&&e.data.data&&typeof e.data.data==='object')window.nexoraUpdate(e.data.data);});
 window.addEventListener('offline',function(){send({type:'network',online:false});});window.addEventListener('online',function(){send({type:'network',online:true});});
 send({type:'ready'});
})();
</script></body></html>`;
}

/** Served at /api/nexora/map. Parent origins come from env at start-up, like CORS. */
export const mapDocument = buildMapDocument(mapParentOrigins());
