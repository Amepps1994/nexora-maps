// Run in the NEXORA Preview browser console after a real route preview is open.
// This is a browser DOM smoke test, NOT native-device verification.
(async () => {
  const results = [];
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const find = text => Array.from(document.querySelectorAll('[role="button"]')).find(e => e.textContent.includes(text));
  const label = text => document.querySelector(`[aria-label="${text}"]`);
  const check = (name, condition) => { if (!condition) throw new Error(name); results.push({ name, passed: true }); };
  find('Start simulation').click(); await wait(250);
  check('simulation warning and hidden bottom tabs', document.body.innerText.includes('SIMULATION ONLY') && !label('Settings'));
  label('Report test incident; pause required').click(); await wait(150);
  check('moving report safety gate', document.body.innerText.includes('Pause simulation before entering'));
  find('Pause').click(); await wait(150);
  label('Report test incident; pause required').click(); await wait(150);
  check('stationary demo report form', document.body.innerText.includes('Local demo community'));
  find('Submit to local test queue').click(); await wait(150);
  check('local moderation queue', document.body.innerText.includes('Test community') && document.body.innerText.includes('pending'));
  find('Confirm').click(); await wait(150);
  check('explicit test confirmation', document.body.innerText.includes('1 test confirmations'));
  label('Close sheet').click(); await wait(100);
  find('Closure').click(); await wait(100);
  check('closure blocks resume with no candidate', find('Recovery required')?.getAttribute('aria-disabled') === 'true');
  find('Recover').click(); await wait(100);
  find('Offline').click(); await wait(100);
  check('offline cached-not-routing disclosure', document.body.innerText.includes('Cached route visible'));
  find('Recover').click(); await wait(100);
  find('Finish simulated journey').click(); await wait(100);
  check('simulation completes without real arrival claim', document.body.innerText.includes('No real-world arrival'));
  find('Review my privacy').click(); await wait(100);
  check('privacy and no hidden sharing', document.body.innerText.includes('No tracking links exist to revoke'));
  return { status: 'PASS', executionSurface: 'Expo Web Preview', checks: results };
})();
