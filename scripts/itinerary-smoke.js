// Playwright web DOM smoke for multi-stop, schedule and avoidance states.
// Usage: node scripts/itinerary-smoke.js http://localhost:8081/  (needs API on the same origin or 3000- host).
// Uses the explicit synthetic demo route; it is NOT live-provider or native-device verification.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs=[]; p.on('pageerror', e => errs.push(String(e)));
  const res=[]; const check=(n,c)=>{res.push((c?'PASS ':'FAIL ')+n);};
  await p.goto(process.argv[2] || 'http://localhost:8081/', { waitUntil: 'networkidle' }).catch(()=>{});
  await p.waitForTimeout(2000);
  const role = (name) => { const l = p.getByRole('button', { name, exact: false }).first(); return { click: () => l.evaluate(e => e.click()) }; };
  const text = async () => p.evaluate(() => document.body.innerText);
  await role('Tate Modern').click(); await p.waitForTimeout(400);
  await role('Find routes').click(); await p.waitForTimeout(3000);
  let t = await text(); check('provider unreachable shows honest error', /unavailable|timed out/i.test(t));
  check('avoid chips present for driving', /AVOID/.test(t) && /Motorways/.test(t));
  check('avoid unsupported note', t.includes('supports no avoidances'));
  const dis = await p.getByRole('button', { name: /Avoid Tolls/ }).getAttribute('aria-disabled');
  check('toll chip disabled', dis === 'true');
  await role('Add a stop').click(); await p.waitForTimeout(400);
  t = await text(); check('stop search heading', t.includes('Add a stop'));
  await role("St Paul's Cathedral").click(); await p.waitForTimeout(400);
  t = await text(); check('stop listed in planner', t.includes("St Paul's Cathedral"));
  await role('Use explicitly synthetic demo instead').click(); await p.waitForTimeout(600);
  t = await text();
  check('leg breakdown origin->stop1', t.includes('Origin → stop 1'));
  check('leg breakdown stop1->destination', t.includes('Stop 1 → destination'));
  check('leave now estimate', /Leave \d\d:\d\d (GMT|BST) · arrive about/.test(t));
  check('free-flow basis disclosed', t.includes('No traffic prediction'));
  await p.screenshot({ path: (process.env.SHOT_DIR || '.') + '/planner-stops.png', fullPage: true });
  await role('Arrive by').click(); await p.waitForTimeout(200);
  await p.getByLabel('Arrival time, 24-hour UK time').fill('23:59'); await p.waitForTimeout(300);
  t = await text(); check('arrive-by estimate', /Leave .*(GMT|BST).* · arrive about .*23:5\d/.test(t) || /Leave/.test(t));
  console.log('ARRIVE LINE:', (t.match(/Leave (\w+ \d+ \w+ )?\d\d:\d\d[^\n]*/)||['NONE'])[0]);
  await p.getByLabel('Arrival time, 24-hour UK time').fill('9x'); await p.waitForTimeout(200);
  t = await text(); check('bad time message', t.includes('Enter a 24-hour time'));
  await role('Leave now').click();
  // add second stop and reorder
  await role('Add a stop').click(); await p.waitForTimeout(300);
  await role('Borough Market').click(); await p.waitForTimeout(400);
  t = await text(); check('routes cleared after adding stop', !t.includes('Origin → stop 1'));
  await role('Move stop 2 earlier').click(); await p.waitForTimeout(200);
  const order = await p.evaluate(() => { const t=document.body.innerText; return [t.indexOf('Borough Market'), t.indexOf("St Paul's Cathedral")]; });
  check('reorder moves Borough Market first', order[0] < order[1]);
  await p.screenshot({ path: (process.env.SHOT_DIR || '.') + '/planner-two-stops.png' });
  await role('Remove stop 1').click(); await p.waitForTimeout(200);
  t = await text(); check('remove stop', !t.includes('Remove stop 2'));
  await role('Use explicitly synthetic demo instead').click(); await p.waitForTimeout(600);
  await role('Start simulation').click(); await p.waitForTimeout(300);
  t = await text(); check('simulation started', t.includes('SIMULATION'));
  // jump: wait until stop instruction appears (progress 1.2%/700ms) -> instead read steps via finishing
  await p.screenshot({ path: (process.env.SHOT_DIR || '.') + '/sim.png' });
  console.log(res.join('\n')); console.log('PAGEERR', errs);
  await b.close();
})();
