// Run with Playwright available: node tests/grid-zoom.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(fs.readFileSync(path.join(__dirname, '..', 'index.html')));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => appReady);
    const sample=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','datapour.json'),'utf8'));
    const load=()=>page.evaluate(sample=>{adoptState(parseDoc(sample));state.tool={type:'select'};update(true)},sample);
    const actualSlope = async (i,t) => page.evaluate(({i,t})=>{
      const lane=state.tree[i],track=document.querySelector(`.lane-row[data-lane="${lane.id}"] .lane-track`);
      const rect=track.getBoundingClientRect(),p=laneCharPositions(lane)[t];
      return {x:rect.left+p.x+6,y:rect.top+24};
    },{i,t});
    for(const [i,t] of [[1,2],[2,4],[2,8],[5,4],[5,8]]) {
      await load();const p=await actualSlope(i,t);
      await page.mouse.move(p.x,p.y);
      const hit=await page.evaluate(p=>{const target=document.elementFromPoint(p.x,p.y);const b=boundaryAt({target,clientX:p.x,ctrlKey:false});return b&&{t:b.t,min:b.min,max:b.max}},p);
      assert.equal(hit?.t,t);
      await page.mouse.down();await page.mouse.move(p.x+40,p.y,{steps:5});await page.mouse.up();
      assert.equal(await page.evaluate(({i,t})=>state.tree[i].slots[t+1]?.glyph,{i,t}),
        sample.signal[i].wave[t],'dragging the actual visible slope moves that transition');
    }
    await load();
    await page.evaluate(()=>{const lane=state.tree[1];lane.slots[1].label='';lane.slots[3].label='';renderGrid()});
    const blocked=await actualSlope(1,2);
    await page.mouse.move(blocked.x,blocked.y);
    assert.equal(await page.evaluate(()=>document.querySelector('.boundary-locked')?.dataset.t||null),null,
      'empty hidden labels must not turn an ordinary enable edge into a prohibited cursor');
    const mobile=await browser.newContext({viewport:{width:1200,height:900},hasTouch:true});
    const touchPage=await mobile.newPage();await touchPage.goto(`http://127.0.0.1:${server.address().port}`);await touchPage.waitForFunction(()=>appReady);
    await touchPage.evaluate(sample=>{adoptState(parseDoc(sample));state.tool={type:'select'};update(true)},sample);
    const tp=await touchPage.evaluate(()=>{const lane=state.tree[1];const r=document.querySelector(`.lane-row[data-lane="${lane.id}"] .lane-track`).getBoundingClientRect();return{x:r.left+86,y:r.top+24}});
    const cdp=await mobile.newCDPSession(touchPage);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...tp,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tp.x+40,y:tp.y,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await touchPage.waitForTimeout(150);
    assert.equal(await touchPage.evaluate(()=>laneWaveStr(state.tree[1])),'0..1........','touch should move the visible enable edge, not paint/extend it');
    await touchPage.evaluate(sample=>{adoptState(parseDoc(sample));update(true)},sample);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...tp,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tp.x+40,y:tp.y,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    assert.equal(await touchPage.evaluate(()=>laneWaveStr(state.tree[1])),'0.1.........','pointer cancel restores original waveform');
    await mobile.close();
    await load();
    const pen=await actualSlope(2,4),penSession=await page.context().newCDPSession(page);
    await penSession.send('Input.dispatchMouseEvent',{type:'mouseMoved',...pen,pointerType:'pen'});
    await penSession.send('Input.dispatchMouseEvent',{type:'mousePressed',...pen,pointerType:'pen',button:'left',buttons:1,clickCount:1});
    await penSession.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pen.x+40,y:pen.y,pointerType:'pen',button:'left',buttons:1});
    await penSession.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:pen.x+40,y:pen.y,pointerType:'pen',button:'left',buttons:0,clickCount:1});
    assert.equal(await page.evaluate(()=>laneWaveStr(state.tree[2])),'0....1..0...','pen follows the same edge drag path');
    console.log('PASS: actual ch_en/vld/req slopes with mouse, empty-label cursor, touch, touch cancellation and pen input');
    assert.deepEqual(errors, [], 'no browser runtime errors');
    
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
