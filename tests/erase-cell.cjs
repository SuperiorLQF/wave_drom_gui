// Run with Playwright available: node tests/erase-cell.cjs
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
    const load=async (wave='0...1...0...')=>page.evaluate(wave=>{
      adoptState(parseDoc({signal:[{name:'sig',wave,node:'..a...b.....'},
        {name:'other',wave:'1...........'}],head:{tick:0},foot:{tick:0},edge:['a->b delay']}));
      state.tool={type:'select'};update(true);
      undoStack.length=0;redoStack.length=0;undoBase=JSON.stringify(buildJSON());lastCommitTag=null;
    },wave);
    const doc=()=>page.evaluate(()=>JSON.stringify(buildJSON()));
    const states=()=>page.evaluate(()=>Array.from({length:laneLen(state.tree[0])},(_,t)=>({...effectiveSlotAt(state.tree[0],t)})));
    const click=async(t,alt=false)=>{
      const id=await page.evaluate(()=>state.tree[0].id);
      await page.locator(`.cell[data-lane="${id}"][data-t="${t}"]`).click({button:'right',modifiers:alt?['Alt']:[]});
    };
    await load();const before=await doc(),oldStates=await states();
    await click(2);
    assert.equal(await page.evaluate(()=>state.tree[0].slots[2].glyph),'z','right-click clears a middle hold to high impedance');
    assert.equal(await page.evaluate(()=>laneLen(state.tree[0])),12,'right-click preserves timing');
    const after=await states();after.forEach((slot,t)=>{if(t!==2)assert.deepEqual(slot,oldStates[t],'all other effective cell values remain unchanged')});
    assert.equal(await page.evaluate(()=>state.tree[0].nodeByT[2]),undefined,'clearing removes the current node');
    assert.deepEqual(await page.evaluate(()=>buildJSON().edge||[]),[],'incident connections are removed');
    assert.equal(await page.evaluate(()=>state.tree[0].nodeByT[6]),'b','other node time stays unchanged');
    await page.evaluate(()=>doUndo());assert.equal(await doc(),before,'undo restores original timing, state, nodes and edges');
    await page.evaluate(()=>doRedo());assert.equal(await page.evaluate(()=>state.tree[0].slots[2].glyph),'z');
    await load();const original=JSON.parse(await doc());await click(2,true);
    assert.equal(await page.evaluate(()=>laneWaveStr(state.tree[0])),'0..1...0...','Alt right-click really removes a middle continuation');
    assert.equal(await page.evaluate(()=>laneLen(state.tree[0])),11);
    assert.equal(await page.evaluate(()=>state.tree[0].nodeByT[5]),'b','later nodes shift one cell left');
    assert.deepEqual(await page.evaluate(()=>buildJSON().signal[1]),original.signal[1],'other signal unchanged');
    assert.deepEqual(await page.evaluate(()=>buildJSON().head),original.head,'global ticks unchanged');
    assert.deepEqual(await page.evaluate(()=>buildJSON().foot),original.foot);
    await page.evaluate(()=>doUndo());assert.deepEqual(JSON.parse(await doc()),original);
    await load();await click(4);
    assert.equal(await page.evaluate(()=>laneWaveStr(state.tree[0])),'0...z1..0...','clearing a real rising state recovers it on the following cell');
    await load();await click(11);assert.equal(await page.evaluate(()=>laneLen(state.tree[0])),12,'clearing last cell retains the last beat');
    assert.equal(await page.evaluate(()=>state.tree[0].slots[11].glyph),'z');
    await page.evaluate(()=>handleAct('add-col',{dataset:{n:'-1'}}));
    assert.equal(await page.evaluate(()=>laneLen(state.tree[0])),11,'toolbar minus still trims the end instead of writing z');
    await load();await click(11,true);assert.equal(await page.evaluate(()=>laneLen(state.tree[0])),11,'Alt right-click deletes the final beat too');
    await load();await page.evaluate(()=>{state.tree[0].period=2;state.tree[0].phase=0.5;update(true)});await click(2,true);
    assert.equal(await page.evaluate(()=>state.tree[0].period),2);
    assert.equal(await page.evaluate(()=>laneLen(state.tree[0])),11,'delete uses this lane cell index with period/phase');
    await load();await page.evaluate(()=>{enterAutoChain(true);setChainSel(state.tree[0],6)});await click(2,true);
    assert.equal(await page.evaluate(()=>chainSel.t),5,'automatic selection follows shifted content');
    await page.evaluate(()=>exitAutoChain());
    await page.evaluate(()=>{adoptState(parseDoc({signal:[{name:'bus',wave:'3...4...',data:['A','B']}]}));update(true)});
    const busBefore=await states();await click(2);const busAfter=await states();
    assert.equal(busAfter[2].glyph,'z');
    busAfter.forEach((slot,t)=>{if(t!==2)assert.deepEqual(slot,busBefore[t],'bus labels outside the cleared cell survive')});
    await page.evaluate(()=>{const json=buildJSON();adoptState(parseDoc(json));update(true)});
    assert.equal(await page.evaluate(()=>state.tree[0].slots[2].glyph),'z','clear-to-z survives WaveJSON round trip');
    console.log('PASS: right-click high impedance, Alt right-click cycle deletion, timing/state recovery, nodes/edges, labels, undo/redo, period/phase, automatic selection and toolbar trimming');
    assert.deepEqual(errors, [], 'no browser runtime errors');

  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
