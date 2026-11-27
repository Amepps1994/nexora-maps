export const mapDocument = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"><link rel="stylesheet" href="/api/nexora/map-assets/leaflet.css"><style>
html,body,#map{height:100%;width:100%;margin:0;background:#e9eeeb;font-family:Arial,sans-serif}.leaflet-control-attribution{font-size:10px!important;background:rgba(255,255,255,.93)!important;padding:4px 8px!important;border-radius:5px;color:#334155!important}.leaflet-control-attribution a{color:#087f73!important}.leaflet-bottom{bottom:10px}.leaflet-control-scale{margin-left:16px!important}.leaflet-control-scale-line{border-color:#64748b!important}.leaflet-tile-pane{filter:saturate(.30) contrast(.94) brightness(1.04)}.dark .leaflet-tile-pane{filter:invert(.91) hue-rotate(175deg) saturate(.25) brightness(.80)}.pin{background:#087f73;border:3px solid white;width:20px;height:20px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 10px #1b3b3b35}.pin:after{content:'';position:absolute;width:6px;height:6px;background:white;border-radius:50%;top:7px;left:7px}.pos{background:#397bff;border:3px solid white;width:14px;height:14px;border-radius:50%;box-shadow:0 0 0 9px #397bff20}.demo-pos{background:#087f73;border:3px solid white;width:16px;height:16px;border-radius:5px;transform:rotate(45deg);box-shadow:0 0 0 9px #18bfa928}.spot{background:#fff;color:#526a64;border:1px solid #d9e4de;border-radius:24px;padding:6px 9px;font-size:12px;font-weight:bold;white-space:nowrap;box-shadow:0 2px 7px #0b122015}.leaflet-tooltip{border:0;box-shadow:0 2px 8px #0b122018;border-radius:8px;font-size:12px}.map-error{display:none;position:absolute;top:50%;left:10%;right:10%;background:#fff;border-radius:16px;padding:18px;z-index:1000;color:#243d38;box-shadow:0 3px 15px #0002;text-align:center}
.tfl{width:14px;height:14px;border-radius:4px;transform:rotate(45deg);background:#e0a100;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);box-sizing:border-box}.tfl.closed{background:#c62828}.tfl.planned{background:#fff;border-color:#e0a100}.dark .tfl{border-color:#152235}
.stop-pin{width:22px;height:22px;border-radius:11px;background:#fff;border:3px solid #397bff;color:#0b1220;font:700 12px/16px Arial,sans-serif;text-align:center;box-sizing:border-box;box-shadow:0 1px 4px rgba(0,0,0,.35)}.dark .stop-pin{background:#152235;color:#fff}
</style></head><body><div id="map"></div><div id="error" class="map-error">Map tiles are unavailable. Check your connection. Cached route is not offline navigation.</div><script src="/api/nexora/map-assets/leaflet.js"></script><script>
(function(){
 if(!window.L){document.getElementById('error').style.display='block';return;}
 var map=L.map('map',{zoomControl:false,attributionControl:true}).setView([51.515,-.116],13);
 map.attributionControl.setPosition('topright');
 // Offline packs define window.nexoraTileLayer (PMTiles vector tiles read on-device); keep this hook.
 var tiles=(window.nexoraTileLayer?window.nexoraTileLayer(L):L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',keepBuffer:0})).addTo(map);
 tiles.on('tileerror',function(){document.getElementById('error').style.display='block';send({type:'network',online:navigator.onLine});});
 tiles.on('tileload',function(){document.getElementById('error').style.display='none';send({type:'network',online:navigator.onLine});});
 L.control.scale({position:'topright',imperial:true,metric:false}).addTo(map);
 var trafficLayer=L.layerGroup().addTo(map),lastTraffic='',trafficAttribution='Disruptions: Powered by TfL Open Data · Contains OS data &copy; Crown copyright and database rights 2016 · Geomni UK Map data &copy; and database rights [2019]',trafficAttributed=false;
 var routeLayer=L.layerGroup().addTo(map), destination=null, position=null,gps=null, spots=L.layerGroup().addTo(map),stopLayer=L.layerGroup().addTo(map),lastStops='',lastRoute='',lastCenter='';
 function send(d){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(d));else window.parent.postMessage({nexora:true,...d},'*');}
 function icon(cls,w,h){return L.divIcon({className:'',html:'<div class="'+cls+'"></div>',iconSize:[w,h],iconAnchor:[w/2,h/2]});}
 map.on('click',function(e){send({type:'pin',coordinate:[e.latlng.lng,e.latlng.lat]});});
 window.nexoraUpdate=function(d){
  document.querySelectorAll('.leaflet-top.leaflet-right').forEach(function(e){e.style.top=(d.controlTop||200)+'px';});
  if(d.dark)document.body.classList.add('dark');else document.body.classList.remove('dark');
  if(d.places){spots.clearLayers();d.places.forEach(function(p){L.circleMarker([p.coordinate[1],p.coordinate[0]],{radius:5,color:'#ffffff',weight:2,fillColor:'#087f73',fillOpacity:1}).bindTooltip(p.name).on('click',function(){send({type:'place',id:p.id});}).addTo(spots);});}
  if(d.destination){var ll=[d.destination[1],d.destination[0]];if(destination)destination.setLatLng(ll);else destination=L.marker(ll,{icon:icon('pin',24,24)}).addTo(map);}else if(destination){map.removeLayer(destination);destination=null;}
  var sk=JSON.stringify(d.stops||[]);if(sk!==lastStops){lastStops=sk;stopLayer.clearLayers();(d.stops||[]).forEach(function(c,i){L.marker([c[1],c[0]],{icon:L.divIcon({className:'',html:'<div class="stop-pin" aria-label="Stop '+(i+1)+'">'+(i+1)+'</div>',iconSize:[22,22],iconAnchor:[11,11]}),keyboard:false}).addTo(stopLayer);});}
  if(d.gps){var ll=[d.gps[1],d.gps[0]];if(gps)gps.setLatLng(ll);else gps=L.marker(ll,{icon:icon('pos',20,20)}).addTo(map);}else if(gps){map.removeLayer(gps);gps=null;}
  if(d.position){var ll=[d.position[1],d.position[0]];if(position)position.setLatLng(ll);else position=L.marker(ll,{icon:icon('demo-pos',22,22)}).addTo(map);}else if(position){map.removeLayer(position);position=null;}
  var key=JSON.stringify(d.route||[]);if(key!==lastRoute){lastRoute=key;routeLayer.clearLayers();if(d.route&&d.route.length){var latlng=d.route.map(function(c){return[c[1],c[0]];});L.polyline(latlng,{color:'#fff',weight:9,opacity:.95,lineCap:'round'}).addTo(routeLayer);var poly=L.polyline(latlng,{color:d.synthetic?'#087f73':'#397bff',weight:5,opacity:1,lineCap:'round',dashArray:d.synthetic?'8 7':null}).addTo(routeLayer);map.fitBounds(poly.getBounds(),{paddingTopLeft:[40,180],paddingBottomRight:[40,330],maxZoom:15,animate:false});}}
  var tk=JSON.stringify(d.traffic||[]);if(tk!==lastTraffic){lastTraffic=tk;trafficLayer.clearLayers();var list=d.traffic||[];
   list.forEach(function(t){(t.lines||[]).forEach(function(line){L.polyline(line.map(function(c){return[c[1],c[0]];}),{color:'#c62828',weight:5,opacity:.85,dashArray:'6 5',interactive:false}).addTo(trafficLayer);});
    var label=document.createElement('div');label.textContent=t.title;label.style.maxWidth='240px';label.style.whiteSpace='normal';
    L.marker([t.point[1],t.point[0]],{icon:L.divIcon({className:'',html:'<div class="tfl'+(t.closure?' closed':'')+(t.planned?' planned':'')+'"></div>',iconSize:[14,14],iconAnchor:[7,7]}),keyboard:false,zIndexOffset:-100}).bindTooltip(label,{direction:'top'}).addTo(trafficLayer);});
   if(list.length&&!trafficAttributed){map.attributionControl.addAttribution(trafficAttribution);trafficAttributed=true;}
   if(!list.length&&trafficAttributed){map.attributionControl.removeAttribution(trafficAttribution);trafficAttributed=false;}}
  if(d.center&&JSON.stringify(d.center)!==lastCenter){lastCenter=JSON.stringify(d.center);var cz=d.zoom||14,cll=[d.center[1],d.center[0]];
   // On a phone the bottom sheet covers the lower part of the map, so centring on the device
   // position would hide the blue dot behind it. Put the point between the top controls and the sheet.
   if(d.gps&&d.gps[0]===d.center[0]&&d.gps[1]===d.center[1]&&window.innerWidth<700){var h=window.innerHeight,top=Math.min(d.controlTop||200,h*.3),sheetTop=Math.max(top+80,h-118-Math.min(480,h*.43)),y=(top+sheetTop)/2,dy=h/2-y;if(dy>0)cll=map.unproject(map.project(cll,cz).add([0,dy]),cz);}
   map.setView(cll,cz,{animate:!d.reducedMotion});}
  if(d.command==='zoomIn')map.zoomIn();if(d.command==='zoomOut')map.zoomOut();
  setTimeout(function(){map.invalidateSize();},100);
 };
 window.addEventListener('message',function(e){if(e.data&&e.data.nexoraMap)window.nexoraUpdate(e.data.data);});
 window.addEventListener('offline',function(){send({type:'network',online:false});});window.addEventListener('online',function(){send({type:'network',online:true});});
 send({type:'ready'});
})();
</script></body></html>`;
