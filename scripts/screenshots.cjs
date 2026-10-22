/* Documentation-only renderer. No account, network camera, or live footage.
 * Optional dependency: npm install --no-save --package-lock=false playwright
 * Then: npx playwright install chromium && node scripts/screenshots.cjs
 * PLAYWRIGHT_EXECUTABLE_PATH can select an existing Chromium installation.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'docs/screenshots');
const cameras = ['Front porch', 'Driveway', 'Garden', 'Back door'].map((name, i) => ({name, mac:'demo-'+i, model:'GW_GC1', online:true}));

// Original vector illustrations, deliberately recognizable as demo scenes.
function scene(i) {
  const skies = ['#b2c6c3','#a9bac9','#b5c7b7','#a9b9ba'];
  const house = ['#d8c5a5','#c5c3b6','#dccab3','#b9c1b1'];
  let detail = '';
  if (i === 1) detail = '<path d="M520 345 L940 345 L1200 720 L330 720Z" fill="#8e9593"/><rect x="585" y="245" width="260" height="165" rx="6" fill="#879795"/><path d="M585 280H845M585 315H845M585 350H845" stroke="#697c79" stroke-width="4"/>';
  else if (i === 2) detail = '<rect x="90" y="410" width="1040" height="170" fill="#b3a282"/><path d="M90 450H1130M90 500H1130M90 550H1130" stroke="#817c5f" stroke-width="5"/><path d="M240 500L290 430L330 500M450 500L490 420L540 500M720 500L770 420L810 500" fill="#426f4d"/>';
  else detail = '<path d="M520 720L570 390H735L855 720Z" fill="#b8b4a2"/><rect x="610" y="245" width="115" height="205" fill="#506d68"/><circle cx="704" cy="355" r="6" fill="#e2c58e"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="${skies[i]}"/><circle cx="1090" cy="108" r="43" fill="#ede1b9"/><path d="M0 350Q300 240 630 355T1280 330V720H0Z" fill="#73947a"/><rect x="380" y="205" width="565" height="280" fill="${house[i]}"/><path d="M320 220L660 48L1000 220Z" fill="#526563"/><rect x="430" y="260" width="115" height="105" fill="#728d90"/><path d="M487 260V365M430 312H545" stroke="#e4dfcc" stroke-width="8"/>${detail}<rect x="0" y="550" width="1280" height="170" fill="#668368" opacity=".5"/><path d="M140 550V235M1110 550V290" stroke="#5d7060" stroke-width="35"/><g fill="#4d755c"><circle cx="140" cy="220" r="110"/><circle cx="80" cy="290" r="90"/><circle cx="205" cy="290" r="95"/><circle cx="1110" cy="270" r="85"/><circle cx="1180" cy="320" r="75"/></g><rect x="25" y="650" width="410" height="45" rx="8" fill="#18342c" opacity=".9"/><text x="45" y="680" fill="#edf6ec" font-family="Arial" font-size="23">ILLUSTRATED DEMO · NO LIVE VIDEO</text></svg>`;
}
async function main() {
  fs.mkdirSync(out, {recursive:true});
  const server = http.createServer((req, res) => {
    const relative = decodeURIComponent(req.url.split('?')[0]);
    const file = path.resolve(root, 'app', '.' + (relative === '/' ? '/index.html' : relative));
    if (!file.startsWith(path.join(root, 'app') + path.sep)) {res.writeHead(403).end(); return;}
    try {res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));}
    catch (_) {res.writeHead(404).end();}
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined});
    const page = await browser.newPage({viewport:{width:1920,height:1080}, deviceScaleFactor:1});
    const origin = 'http://127.0.0.1:' + server.address().port;
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/api.js') return route.fulfill({contentType:'text/javascript',body:`window.WyzeAPI=function(){this.tokens=null;};WyzeAPI.prototype.cameras=function(){return Promise.resolve(${JSON.stringify(cameras)});};WyzeAPI.prototype.stream=function(camera){return Promise.resolve({demo:${JSON.stringify(cameras.map(c=>c.mac))}.indexOf(camera.mac)});};WyzeAPI.prototype.clear=function(){this.tokens=null;};`});
      if (url.pathname === '/stream.js') return route.fulfill({contentType:'text/javascript',body:`window.CameraStream=function(video,status){this.stop=function(){};this.start=function(params){video.poster='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(${JSON.stringify(cameras.map((_,i)=>scene(i)))}[params.demo]);status('Demo scene · no live video');};};HTMLMediaElement.prototype.play=function(){return Promise.resolve();};`});
      return route.continue();
    });
    async function capture(name) {
      await page.screenshot({path:path.join(out,name+'.png')});
    }
    await page.goto(origin);
    await page.evaluate(() => {
      const label = document.createElement('div');
      label.textContent = 'INTERFACE PREVIEW · DEMO CAMERAS · NO LIVE FOOTAGE';
      label.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99;text-align:center;background:#b4edbf;color:#102719;font:bold 18px Arial;padding:7px;letter-spacing:2px;pointer-events:none';
      document.body.appendChild(label);
      document.querySelector('footer').style.bottom = '55px';
    });
    await capture('sign-in');
    await page.evaluate(() => {localStorage.setItem('camera-view-session-v1',JSON.stringify({access_token:'demo',refresh_token:'demo'}));});
    await page.reload();
    await page.evaluate(() => {
      const label = document.createElement('div');
      label.textContent = 'INTERFACE PREVIEW · DEMO CAMERAS · NO LIVE FOOTAGE';
      label.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99;text-align:center;background:#b4edbf;color:#102719;font:bold 18px Arial;padding:7px;letter-spacing:2px;pointer-events:none';
      document.body.appendChild(label);
      document.querySelector('footer').style.bottom = '55px';
    });
    await page.locator('#two').click();
    await page.locator('.camera').nth(0).click();
    await page.locator('.camera').nth(1).click();
    await page.locator('#watchSelected').click();
    await page.waitForFunction(() => [...document.querySelectorAll('#wallGrid video')].every(v => v.poster));
    await capture('two-cameras');
    await page.locator('#wallBack').click();
    await page.locator('#all').click();
    await page.waitForFunction(() => document.querySelectorAll('#wallGrid video[poster]').length === 4);
    await page.locator('.feedbar button').nth(0).click();
    await capture('all-cameras');
    await page.locator('#wallSound').click();
    await capture('sound-selection');
    if (errors.length) throw Error(errors.join('\n'));
    console.log('Captured four credential-free interface previews.');
  } finally {if (browser) await browser.close(); await new Promise(resolve => server.close(resolve));}
}
main().catch(e => {console.error(e);process.exitCode=1;});
