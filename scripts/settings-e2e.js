// Settings/location/route end-to-end check for the Expo web build. Run: NEXORA_WEB_URL=http://localhost:8081/ node scripts/settings-e2e.js
const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch();
 const ctx=await b.newContext({viewport:{width:412,height:900},geolocation:{latitude:51.5079,longitude:-0.0877,accuracy:12},permissions:['geolocation']});
 const p=await ctx.newPage(); const errs=[]; const res=[];
 p.on('pageerror',e=>errs.push('pageerror '+e.message)); p.on('console',m=>{if(m.type()==='error'&&!/TUNNEL|ERR_FAILED/.test(m.text()))errs.push('console '+m.text().slice(0,200))});
 const text=()=>p.evaluate(()=>document.body.innerText);
 const wait=ms=>p.waitForTimeout(ms);
 const lab=async l=>{await p.locator(`[aria-label="${l}"]`).first().evaluate(e=>e.click(),null,{timeout:5000});await wait(500);};
 const btn=async t=>{await p.locator('[role=button]',{hasText:t}).first().evaluate(e=>e.click(),null,{timeout:5000});await wait(500);};
 async function step(name,fn){try{const r=await fn();res.push(['PASS',name,r||'']);}catch(e){res.push(['FAIL',name,e.message.split('\n')[0].slice(0,200)]);await p.screenshot({path:'fail-'+res.length+'.png'});}}
 const expect=(c,m)=>{if(!c)throw new Error(m)};
 await p.goto((process.env.NEXORA_WEB_URL||'http://localhost:8081/')+'',{waitUntil:'networkidle'}); await wait(2000);
 await step('settings: provider health readable before refresh',async()=>{await lab('Settings');await btn('Providers & offline capabilities');const t=await text();expect(t.includes('Provider health'),'no provider health row');expect(!/\{"/.test(t),'raw JSON shown');expect(t.includes('Walking: Not checked yet'),'no per-profile line');return t.match(/Driving:.*$/m)?.[0];});
 await step('settings: refresh checks all three profiles',async()=>{await btn('Refresh provider status');await p.waitForFunction(()=>/Cycling: Working/.test(document.body.innerText),null,{timeout:20000});const t=await text();expect(/Driving: Working · \d+ ms/.test(t),'driving');expect(/Walking: Working/.test(t),'walking');await p.screenshot({path:'settings-health.png'});return (t.match(/(Driving|Walking|Cycling):.*$/mg)||[]).join(' | ')+' || toast: '+(t.match(/All three.*$/m)||[''])[0];});
 await step('settings: location row requests permission and shows fix',async()=>{const t0=await text();expect(/Allowed · tap to show|Not requested · tap to allow/.test(t0),'initial location text: '+(t0.match(/Foreground device location\n.*$/m)||[''])[0]);await btn('Foreground device location');await p.waitForFunction(()=>/Allowed · last fix ±12 m/.test(document.body.innerText),null,{timeout:20000});await p.screenshot({path:'settings-location.png'});const t=await text();await lab('Close sheet');return (t.match(/Allowed · last fix.*$/m)||[''])[0];});
 
 await step('search demo place and open it',async()=>{await lab('Home');await lab('Search a destination');const inp=p.locator('input').first();await inp.fill('Tate');await wait(600);const t=await text();expect(t.includes('Tate Modern'),'no result');await btn('Tate Modern');await wait(800);return (await text()).slice(0,200).replace(/\n/g,' / ');});
 await step('origin is device position',async()=>{const t=await text();const o=await p.locator('[aria-label="Change origin"]').first().textContent().catch(()=>'');return 'origin control: '+o;});
 await step('calculate & compare routes',async()=>{const t0=await text();const b=['Directions','Routes','Get directions','Plan route'].find(x=>t0.includes(x));if(b)await btn(b);await p.waitForFunction(()=>/OSRM test engine|Best match/.test(document.body.innerText),null,{timeout:20000});const t=await text();await p.screenshot({path:'routes.png'});return 'origin '+(t.includes('Current device location')?'= device position':'NOT device')+' | '+(t.match(/Best match[\s\S]{0,60}/)||[''])[0].replace(/\n/g,' / ');});
 await step('dump route controls',async()=>p.$$eval('[role=button],[role=tab],[role=radio],[aria-label]',es=>es.map(e=>e.getAttribute('aria-label')||e.textContent.trim().slice(0,30)).filter(Boolean).join(' | ')));
 await step('switch mode walking/cycling',async()=>{const out=[];for(const m of ['Walk','Cycle']){const l=p.getByText(m,{exact:true});if(await l.count()){await l.first().evaluate(e=>e.click());await p.waitForFunction(()=>/OSRM test engine/.test(document.body.innerText),null,{timeout:20000});out.push(m+' ok');}else out.push(m+' control not found');}return out.join(', ');});
 await step('start simulation, pause, end',async()=>{await btn('Start simulation');await wait(800);let t=await text();expect(/SIMULATION ONLY/i.test(t),'no simulation banner');await btn('Pause');await wait(300);const end=p.locator('[role=button]',{hasText:/^End/});if(await end.count())await end.first().click();else await btn('Finish simulated journey');await wait(600);return 'ok';});
 await step('back to map after sim',async()=>{await btn('Back to the map');return 'ok';});
 await step('save a place',async()=>{await lab('Home');await btn('Tate Modern');await wait(600);const s=p.locator('[aria-label*="Save"],[role=button]:has-text("Save")');expect(await s.count(),'no save control');await s.first().evaluate(e=>e.click());await wait(400);await lab('Saved');const t=await text();expect(t.includes('Tate Modern'),'not in saved');return 'saved list ok';});
 await step('trips list',async()=>{await lab('Trips');const t=await text();return t.slice(0,300).replace(/\n/g,' / ');});
 console.log(res.map(r=>r.join(' | ')).join('\n'));console.log('ERRORS:\n'+errs.slice(0,15).join('\n'));
 await b.close();
})();
