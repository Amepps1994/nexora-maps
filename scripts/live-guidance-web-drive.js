// Mock-GPS end-to-end drive of the live guidance path in the web build.
// Usage: node scripts/live-guidance-web-drive.js <repo-dir> <output.json>
// dist-web/ is not committed. Build it first from <repo-dir>:
//   npx expo export --platform web --output-dir dist-web
const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const path = require("path");
const W = process.argv[2];
const OUT = process.argv[3];
const route = JSON.parse(fs.readFileSync(path.join(W, "docs/live-route-sample.json"), "utf8")).routes[0];
const dist = path.join(W, "dist-web");
if (!fs.existsSync(path.join(dist, "index.html"))) {
  console.error(`No web build at ${dist}. Run: npx expo export --platform web --output-dir dist-web`);
  process.exit(1);
}
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  let f = path.join(dist, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, p, "index.html");
  if (!fs.existsSync(f)) f = path.join(dist, "index.html");
  const ext = path.extname(f);
  res.setHeader("Content-Type", { ".js": "application/javascript", ".html": "text/html", ".css": "text/css", ".png": "image/png", ".ttf": "font/ttf" }[ext] || "application/octet-stream");
  fs.createReadStream(f).pipe(res);
}).listen(8099);

function hav(a, b) { const r = Math.PI / 180, dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r; const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2; return 2 * 6371008.8 * Math.asin(Math.sqrt(h)); }
const g = route.geometry, cum = [0];
for (let i = 1; i < g.length; i++) cum.push(cum[i - 1] + hav(g[i - 1], g[i]));
const total = cum.at(-1);
function at(d, lateral = 0) {
  let i = 0; while (i < g.length - 2 && cum[i + 1] < d) i++;
  const seg = cum[i + 1] - cum[i], t = seg ? Math.min(1, Math.max(0, (d - cum[i]) / seg)) : 0;
  const a = g[i], b = g[i + 1]; const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  if (!lateral) return p;
  const k = Math.cos(p[1] * Math.PI / 180), dx = (b[0] - a[0]) * k, dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  return [p[0] + (-dy / len) * lateral / 111195 / k, p[1] + (dx / len) * lateral / 111195];
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 412, height: 900 }, permissions: ["geolocation"], geolocation: { longitude: g[0][0], latitude: g[0][1], accuracy: 6 } });
  const page = await context.newPage();
  const log = [];
  page.on("console", (m) => { if (m.type() === "error") log.push("console: " + m.text()); });
  await page.addInitScript(() => {
    window.__spoken = [];
    const fake = { speaking: false, pending: false, paused: false, speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend({}), 0); }, cancel() {}, pause() {}, resume() {}, getVoices() { return []; }, addEventListener() {}, removeEventListener() {}, onvoiceschanged: null };
    Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
    if (!window.SpeechSynthesisUtterance) window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  });
  const routeRequests = [];
  await page.route("http://api.mock.test/**", async (r) => {
    const url = r.request().url();
    if (url.includes("/routes")) {
      const body = JSON.parse(r.request().postData() || "{}");
      routeRequests.push(body);
      // Reroute requests get the same provider route, as a fresh object.
      return r.fulfill({ json: { routes: [{ ...route, id: `osrm-driving-${routeRequests.length - 1}` }] } });
    }
    if (url.includes("/capabilities")) return r.fulfill({ json: {} });
    return r.fulfill({ status: 404, json: { error: "mock" } });
  });
  await page.route("https://**tile**/**", (r) => r.fulfill({ status: 204, body: "" }));
  await page.goto("http://localhost:8099/");
  await page.waitForTimeout(4000);
  const click = async (text) => { await page.getByText(text, { exact: false }).first().click(); await page.waitForTimeout(700); };
  await click("Where would you like to go?");
  await page.screenshot({ path: OUT + "/00-search.png" });
  await page.getByLabel("Search destinations").first().fill("Tate");
  await page.waitForTimeout(800);
  await page.getByText("Tate Modern", { exact: true }).last().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: OUT + "/01-place.png" });
  await click("Find routes").catch(() => {});
  await page.waitForTimeout(500);
  if (await page.getByText("Calculate provider routes").count()) await click("Calculate provider routes");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT + "/02-routes.png" });
  await click("Start live GPS guidance");
  await page.waitForTimeout(1500);
  const states = [];
  const sample = async (label) => {
    const text = await page.locator("body").innerText();
    const banner = (text.match(/LIVE GPS[^\n]*/) || [""])[0];
    states.push({ label, banner, spoken: await page.evaluate(() => window.__spoken.length) });
  };
  // Drive at ~13 m/s, one fix per 400 ms of wall clock (timestamps are browser-side).
  let d = 0;
  let deviated = false;
  for (; d <= total; d += 13) {
    let lateral = 0;
    if (d > 1500 && d < 1500 + 13 * 6) lateral = 90; // leave the route for 6 fixes
    await context.setGeolocation({ longitude: at(d, lateral)[0], latitude: at(d, lateral)[1], accuracy: 6 });
    await page.waitForTimeout(lateral ? 1100 : 250);
    if (lateral && !deviated) { deviated = true; }
    if (Math.abs(d - 650) < 7) { await sample("650m"); await page.screenshot({ path: OUT + "/03-live-driving.png" }); }
    if (lateral && d > 1500 + 13 * 4 && d < 1500 + 13 * 5) { await sample("off-route"); await page.screenshot({ path: OUT + "/04-off-route.png" }); }
    if (Math.abs(d - 3300) < 7) { await sample("3300m"); await page.screenshot({ path: OUT + "/05-before-southwark.png" }); }
  }
  await context.setGeolocation({ longitude: g.at(-1)[0], latitude: g.at(-1)[1], accuracy: 5 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: OUT + "/06-arrived.png" });
  const finalText = await page.locator("body").innerText();
  const spoken = await page.evaluate(() => window.__spoken);
  const result = { totalM: Math.round(total), routeRequests: routeRequests.map((b) => ({ origin: b.origin, mode: b.mode })), states, spoken, arrived: /arriv|complete/i.test(finalText), finalBannerExcerpt: finalText.slice(0, 400), errors: log };
  fs.writeFileSync(OUT + "/result.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
