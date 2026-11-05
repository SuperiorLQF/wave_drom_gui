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
    const load = async (zoom=1) => page.evaluate(zoom => {
      adoptState(parseDoc({signal:[{name:'sig',wave:'0...1...0...',node:'....a...b...'},
        {name:'bus',wave:'3...4...5...',data:['A','B','C'],node:'....c...d...'}],edge:['a->b delay']}));
      state.tool={type:'select'};gridZoom=zoom;update(true);
      undoStack.length=0;redoStack.length=0;undoBase=JSON.stringify(buildJSON());lastCommitTag=null;
      $('#gridScroll').scrollLeft=0;
    },zoom);
    const read = () => page.evaluate(() => JSON.stringify(buildJSON()));
    const states = lane => page.evaluate(i=>Array.from({length:laneLen(state.tree[i])},(_,t)=>({...effectiveSlotAt(state.tree[i],t)})),lane);
    const cellBox = async (i,t) => {
      const id=await page.evaluate(i=>state.tree[i].id,i);
      return page.locator(`.cell[data-lane="${id}"][data-t="${t}"]`).boundingBox();
    };
    const wheel = async (i,t,alt=true) => {
      const r=await cellBox(i,t);await page.mouse.move(r.x+r.width/2,r.y+r.height/2);
      if(alt) await page.keyboard.down('Alt');
      await page.mouse.wheel(0,-120);
      if(alt) await page.keyboard.up('Alt');
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    };
    const shift = async (i,t,count,{cancel=false,back=false}={}) => {
      const r=await cellBox(i,t),step=await page.evaluate(i=>gridCellW()*(state.tree[i].period||1),i);
      const x=r.x+(t===0?6:1),y=r.y+r.height/2;
      await page.keyboard.down('Alt');await page.mouse.move(x,y);await page.mouse.down();
      await page.mouse.move(x+count*step,y,{steps:5});
      if(back) await page.mouse.move(x,y,{steps:5});
      if(cancel) await page.keyboard.press('Escape');
      await page.mouse.up();await page.keyboard.up('Alt');
    };
    await load();const original=await read();const before=await states(0);
    await wheel(0,2);const after=await states(0);
    assert.notEqual(after[2].glyph,before[2].glyph,'Alt+wheel changes hovered cell');
    after.forEach((slot,t)=>{if(t!==2) assert.deepEqual(slot,before[t],`cell ${t} must retain its effective state`)});
    assert.equal(await page.evaluate(()=>gridZoom),1,'Alt does not zoom');
    assert.equal(await page.evaluate(()=>undoStack.length),1);
    await page.evaluate(()=>doUndo());assert.equal(await read(),original,'one undo restores inserted recovery event too');
    await load();const busBefore=await states(1);await wheel(1,1);const busAfter=await states(1);
    busAfter.forEach((slot,t)=>{if(t!==1)assert.deepEqual(slot,busBefore[t],'bus values and labels beyond the edited cell survive')});
    await load();await page.evaluate(()=>storeSet('wdgui-deglitch','1'));const cleanBefore=await states(0);await wheel(0,3);const cleanAfter=await states(0);
    cleanAfter.forEach((slot,t)=>{if(t!==3)assert.deepEqual(slot,cleanBefore[t],'single-cell editing bypasses whole-run normalization')});
    await page.evaluate(()=>storeSet('wdgui-deglitch','0'));
    await load();await wheel(0,11);assert.equal(await page.evaluate(()=>laneLen(state.tree[0])),12,'last cell edit does not extend document');
    await load();await page.evaluate(()=>{state.tree[0].slots[3]={glyph:'|'};update(true)});const gapBefore=await read();await wheel(0,2);
    assert.equal(await read(),gapBefore,'gap marker is never silently overwritten');
    await load();const other=await page.evaluate(()=>JSON.stringify(buildJSON().signal[1]));const dragBefore=await read();await shift(0,4,3);
    assert.equal(await page.evaluate(()=>laneWaveStr(state.tree[0])),'0......1...0...','all following transitions shift without changing their spacing');
    assert.deepEqual(await page.evaluate(()=>state.tree[0].nodeByT),{'7':'a','11':'b'},'all subsequent nodes move with the tail');
    assert.equal(await page.evaluate(()=>JSON.stringify(buildJSON().signal[1])),other,'other signal stays unchanged');
    assert.deepEqual(await page.evaluate(()=>buildJSON().edge),['a->b delay'],'node connections survive shifting');
    assert.equal(await page.evaluate(()=>undoStack.length),1,'tail shift is one undo step');
    await page.evaluate(()=>doUndo());assert.equal(await read(),dragBefore);await page.evaluate(()=>doRedo());
    assert.equal(await page.evaluate(()=>laneWaveStr(state.tree[0])),'0......1...0...');
    await load();await shift(1,4,2);
    assert.equal(await page.evaluate(()=>laneWaveStr(state.tree[1])),'3.....4...5...');
    assert.deepEqual(await page.evaluate(()=>buildJSON().signal[1].data),['A','B','C'],'bus labels retain order');
    await load();const cancelBefore=await read();await shift(1,4,3,{cancel:true});assert.equal(await read(),cancelBefore,'Escape restores length, nodes and waveform');
    assert.equal(await page.evaluate(()=>undoStack.length),0);
    await load();const backBefore=await read();await shift(1,4,2,{back:true});assert.equal(await read(),backBefore,'drag back to start restores original');
    await load();await shift(0,4,-2);assert.equal(await page.evaluate(()=>laneWaveStr(state.tree[0])),'0...1...0...','leftwards motion cannot overwrite earlier content');
    await load(0.25);await shift(1,4,2);assert.equal(await page.evaluate(()=>laneWaveStr(state.tree[1])),'3.....4...5...','tail shift respects zoom');
    await load();await page.evaluate(()=>{state.tree[0].period=2;state.tree[0].phase=0.5;update(true)});await shift(0,4,2);
    assert.equal(await page.evaluate(()=>laneWaveStr(state.tree[0])),'0.....1...0...','tail shift respects period and phase');
    await load();await page.evaluate(()=>{state.tree[0].slots[5]={glyph:'0'};update(true)});await shift(0,4,2);
    assert.equal(await page.evaluate(()=>laneWaveStr(state.tree[0])),'0.....10..0...','adjacent events can shift together');
    await load();await shift(0,0,2);assert.equal(await page.evaluate(()=>laneWaveStr(state.tree[0])),'x.0...1...0...','moving first event pads with unknown state');
    assert.deepEqual(errors, [], 'no browser runtime errors');
    console.log('PASS: Alt single-cell wheel, downstream state/labels, gap preservation, normalization isolation, tail drag, nodes/edges, undo/redo, Escape, zoom and period/phase');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
