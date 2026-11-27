// Turn a NEXORA route sample into a GPX track for the Android emulator
// (Extended controls > Location > Routes > Import GPX/KML, then play).
// Usage: node scripts/mock-gps-gpx.js docs/live-route-sample.json docs/mock-gps/kings-cross-tate-modern.gpx [speedMps] [detourAtM]
const fs = require("fs");
const [, , input, output, speedArg = "11", detourArg = ""] = process.argv;
const route = JSON.parse(fs.readFileSync(input, "utf8")).routes[0];
const speed = Number(speedArg);
const detourAt = detourArg ? Number(detourArg) : null;
const g = route.geometry;
const R = 6371008.8, rad = Math.PI / 180;
const hav = (a, b) => {
  const h = Math.sin(((b[1] - a[1]) * rad) / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(((b[0] - a[0]) * rad) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const cum = [0];
for (let i = 1; i < g.length; i++) cum.push(cum[i - 1] + hav(g[i - 1], g[i]));
const total = cum[cum.length - 1];
function at(d, lateral) {
  let i = 0;
  while (i < g.length - 2 && cum[i + 1] < d) i++;
  const seg = cum[i + 1] - cum[i];
  const t = seg ? Math.min(1, (d - cum[i]) / seg) : 0;
  const a = g[i], b = g[i + 1];
  const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  if (!lateral) return p;
  const k = Math.cos(p[1] * rad), dx = (b[0] - a[0]) * k, dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  return [p[0] + ((-dy / len) * lateral) / 111195 / k, p[1] + ((dx / len) * lateral) / 111195];
}
const start = Date.UTC(2026, 10, 27, 12, 0, 0);
const pts = [];
for (let d = 0, s = 0; ; d += speed, s++) {
  const along = Math.min(d, total);
  // Optional detour: 90 m to the side for 8 fixes, to exercise off-route rerouting.
  const lateral = detourAt !== null && along > detourAt && along < detourAt + speed * 8 ? 90 : 0;
  const [lon, lat] = at(along, lateral);
  pts.push(`   <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"><time>${new Date(start + s * 1000).toISOString()}</time></trkpt>`);
  if (along >= total) break;
}
fs.writeFileSync(
  output,
  `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="NEXORA mock GPS" xmlns="http://www.topografix.com/GPX/1/1">\n <trk><name>${route.source} · ${Math.round(total)} m at ${speed} m/s${detourAt !== null ? ` · detour at ${detourAt} m` : ""}</name><trkseg>\n${pts.join("\n")}\n </trkseg></trk>\n</gpx>\n`,
);
console.log(`${pts.length} points, ${Math.round(total)} m -> ${output}`);
