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
    const load = async (zoom=1, config={}) => page.evaluate(({zoom,config}) => {
      adoptState(parseDoc({signal:[{name:'sig',wave:'0...1...0...'},
        {name:'bus',wave:'3...4...5...',data:['A','B','C'],node:'....a.......'}],config}));
      state.tool={type:'select'}; gridZoom=zoom; update(true);
      undoStack.length=0; redoStack.length=0; undoBase=JSON.stringify(buildJSON()); lastCommitTag=null;
      $('#gridScroll').scrollLeft=0;
    },{zoom,config});
    const doc = () => page.evaluate(() => JSON.stringify(buildJSON()));
    const point = async (lane,t) => page.locator(`.lane-row[data-lane="${await page.evaluate(i=>state.tree[i].id,lane)}"] .cell[data-t="${t}"]`).boundingBox();
    const move = async (lane,t,steps,options={}) => {
      const r=await point(lane,t);
      const w=await page.evaluate(i=>gridCellW()*(state.tree[i].period||1),lane);
      const x=r.x+(options.edgeOffset||1),y=r.y+r.height/2;
      await page.mouse.move(x,y);await page.mouse.down();
      await page.mouse.move(x+steps*w,y,{steps:5});
      if(options.cancel) await page.keyboard.press('Escape');
      await page.mouse.up();
    };
    await load();
    const before=await doc();
    await move(0,4,2,{edgeOffset:8});
    assert.equal(await page.evaluate(()=>laneWaveStr(state.tree[0])),'0.....1.0...','rising edge moves right');
    assert.equal(await page.evaluate(()=>undoStack.length),1,'one drag is one undo step');
    await page.evaluate(()=>doUndo());assert.equal(await doc(),before,'undo restores entire drag');
    await page.evaluate(()=>doRedo());assert.equal(await page.evaluate(()=>laneWaveStr(state.tree[0])),'0.....1.0...');
    await load();await move(0,4,-2);
    assert.equal(await page.evaluate(()=>laneWaveStr(state.tree[0])),'0.1.....0...','rising edge moves left');
    await load();await move(0,8,2);
    assert.equal(await page.evaluate(()=>laneWaveStr(state.tree[0])),'0...1.....0.','falling edge moves right');
    await load();await move(1,4,2);
    assert.deepEqual(await page.evaluate(()=>({wave:laneWaveStr(state.tree[1]),label:state.tree[1].slots[6].label,node:state.tree[1].nodeByT[6]})),
      {wave:'3.....4.5...',label:'B',node:'a'},'bus label and node move with boundary');
    await load();await move(0,4,20);
    assert.equal(await page.evaluate(()=>laneWaveStr(state.tree[0])),'0......10...','cannot cross the next event');
    await load();const original=await doc();await move(1,4,2,{cancel:true});
    assert.equal(await doc(),original,'Escape cancels without changing document');
    assert.equal(await page.evaluate(()=>undoStack.length),0,'cancel does not add undo history');
    await load(0.25);await move(1,4,2);
    assert.equal(await page.evaluate(()=>laneWaveStr(state.tree[1])),'3.....4.5...','drag works at minimum zoom');
    await load(2);await move(0,4,-1);
    assert.equal(await page.evaluate(()=>laneWaveStr(state.tree[0])),'0..1....0...','drag works zoomed in');
    await load();await page.evaluate(()=>{state.tree[0].period=2;state.tree[0].phase=0.5;update(true)});
    await move(0,4,1);
    assert.equal(await page.evaluate(()=>laneWaveStr(state.tree[0])),'0....1..0...','period and phase use actual geometry');
    await load();await page.evaluate(()=>{state.tree[1].nodeByT[6]='b';update(true)});await move(1,4,4);
    assert.equal(await page.evaluate(()=>laneWaveStr(state.tree[1])),'3....4..5...','other node is a hard stop');
    await load(1,{hbounds:[2,11]});await move(0,4,1);
    assert.equal(await page.evaluate(()=>laneWaveStr(state.tree[0])),'0....1..0...','cropped timeline coordinates stay correct');
    await load();const noMove=await doc();await move(0,4,0);
    assert.equal(await doc(),noMove,'clicking a boundary does not mutate data');
    assert.equal(await page.evaluate(()=>undoStack.length),0,'no-op adds no undo step');
    const repeated = async (wave='000011110000') => page.evaluate(wave=>{
      adoptState(parseDoc({signal:[{name:'explicit',wave}]}));
      state.tool={type:'select'};gridZoom=1;update(true);
      undoStack.length=0;redoStack.length=0;undoBase=JSON.stringify(buildJSON());lastCommitTag=null;
    },wave);
    const levels = () => page.evaluate(()=>Array.from({length:laneLen(state.tree[0])},(_,t)=>effectiveSlotAt(state.tree[0],t).glyph).join(''));
    await repeated();const explicitBefore=await doc();await move(0,4,2);
    assert.equal(await levels(),'000000110000','explicit repeated levels must support edge dragging without Alt');
    await page.evaluate(()=>doUndo());assert.equal(await doc(),explicitBefore,'undo preserves original explicit notation');
    await repeated();await move(0,4,-2);
    assert.equal(await levels(),'001111110000','explicit low plateau can shrink without creating extra edges');
    await repeated();await move(0,8,2);
    assert.equal(await levels(),'000011111100','falling edge recognizes repeated levels too');
    await repeated();await move(0,4,20);
    assert.equal(await levels(),'000000010000','neighbouring actual transition remains a hard stop');
    await repeated('0...11110000');await move(0,4,2);
    assert.equal(await levels(),'000000110000','mixed continuation and explicit notation works');
    await repeated();await page.evaluate(()=>{state.tree[0].nodeByT[6]='a';update(true)});await move(0,4,3);
    assert.equal(await levels(),'000001110000','node in redundant plateau must not be overwritten');
    assert.equal(await page.evaluate(()=>state.tree[0].nodeByT[6]),'a');
    await repeated();await page.evaluate(()=>{gridZoom=0.25;renderGrid()});await move(0,4,2,{edgeOffset:6});
    assert.equal(await levels(),'000000110000','small-zoom hit area follows the actual visible slope');
    await repeated('x...1...z...');await move(0,4,2);
    assert.equal(await levels(),'xxxxxx11zzzz','transitions out of unknown state are draggable');
    await repeated('3...x...4...');await move(0,4,2);
    assert.equal(await levels(),'333333xx4444','bus to unknown boundary is draggable');
    await repeated('0101');const lockedBefore=await doc();
    const locked=await page.evaluate(()=>movableBoundary(state.tree[0],1));
    assert.equal(locked.locked,false,'one-cycle pulses are recognized as draggable edges');
    await move(0,1,1);assert.equal(await levels(),'00101','tight transitions move without deleting the pulse');
    await page.evaluate(()=>doUndo());assert.equal(await doc(),lockedBefore,'undo restores the original one-cycle pulse');
    await load();await page.evaluate(()=>{state.tool={type:'glyph',char:'0'}});
    assert.equal(await page.evaluate(()=>boundaryAt({target:document.querySelector('.cell'),ctrlKey:false})),null,'paint tool does not activate edge dragging');
    assert.deepEqual(errors, [], 'no browser runtime errors');
    console.log('PASS: rising/falling/bus boundary drag, labels/nodes, neighbour stops, undo/redo, Escape, min/max zoom and period/phase geometry');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
