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
    const load = async (zoom=1) => page.evaluate(({sample,zoom})=>{
      adoptState(parseDoc(sample));state.tool={type:'select'};gridZoom=zoom;update(true);
      undoStack.length=0;redoStack.length=0;undoBase=JSON.stringify(buildJSON());lastCommitTag=null;
    },{sample,zoom});
    const doc=()=>page.evaluate(()=>JSON.stringify(buildJSON()));
    const words=()=>page.evaluate(()=>state.tree[3].slots.flatMap((slot,t)=>slot?.label!==undefined?[{t,label:slot.label}]:[]));
    const drag=async (i,t,delta,{alt=false,cancel=false,back=false}={})=>{
      const id=await page.evaluate(i=>state.tree[i].id,i);
      const r=await page.locator(`.cell[data-lane="${id}"][data-t="${t}"]`).boundingBox();
      const step=await page.evaluate(i=>gridCellW()*(state.tree[i].period||1),i);
      const x=r.x+1,y=r.y+r.height/2;
      if(alt)await page.keyboard.down('Alt');
      await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+delta*step,y,{steps:5});
      if(back)await page.mouse.move(x,y,{steps:5});
      if(cancel)await page.keyboard.press('Escape');
      await page.mouse.up();if(alt)await page.keyboard.up('Alt');
    };
    await load();const before=await doc();const others=await page.evaluate(()=>JSON.stringify(buildJSON().signal.filter((_,i)=>i!==3)));
    await drag(3,5,1);
    assert.deepEqual(await words(),[{t:4,label:'DAT0'},{t:6,label:'DAT1'},{t:7,label:'DAT2'},{t:8,label:'DAT3'}],
      'supplied consecutive bus words must be directly draggable without Alt');
    assert.equal(await page.evaluate(()=>JSON.stringify(buildJSON().signal.filter((_,i)=>i!==3))),others,'other sample lanes unchanged');
    assert.equal(await page.evaluate(()=>undoStack.length),1);
    await page.evaluate(()=>doUndo());assert.equal(await doc(),before,'undo preserves the exact supplied JSON');
    await page.evaluate(()=>doRedo());assert.equal((await words())[1].t,6);
    await load();await drag(3,6,-1);
    assert.deepEqual(await words(),[{t:3,label:'DAT0'},{t:4,label:'DAT1'},{t:5,label:'DAT2'},{t:7,label:'DAT3'}],
      'left drag moves only collided predecessors and leaves later words in place');
    await load();await drag(3,4,2);
    assert.deepEqual((await words()).map(w=>w.t),[6,7,8,9],'first dense word pushes only necessary following words');
    await load();await drag(3,7,1);
    assert.deepEqual((await words()).map(w=>w.t),[4,5,6,8],'last bus word can move the adjacent unknown boundary');
    await load();await drag(3,5,1,{cancel:true});assert.equal(await doc(),before,'Escape cancels ripple movement');
    await load();await drag(3,5,2,{back:true});assert.equal(await doc(),before,'dragging back exactly restores the sample');
    await load();await page.evaluate(()=>{state.tree[3].nodeByT={5:'a',6:'b',7:'c'};state.edges=[{from:'a',to:'b',spec:'->',label:'delay'}];update(true)});
    await drag(3,5,2);
    assert.deepEqual(await page.evaluate(()=>state.tree[3].nodeByT),{7:'a',8:'b',9:'c'},'nodes follow their data words');
    assert.deepEqual(await page.evaluate(()=>buildJSON().edge),['a->b delay']);
    await load(0.25);await drag(3,5,1);assert.deepEqual((await words()).map(w=>w.t),[4,6,7,8],'dense bus hit works at 25%');
    await load();await drag(4,5,1);
    assert.deepEqual(await page.evaluate(()=>buildJSON().signal[4].data),['0','1','2','3'],'ID bus values remain intact');
    await load();await drag(1,2,1);assert.equal(await page.evaluate(()=>laneWaveStr(state.tree[1])),'0..1........','sample channel enable edge works');
    await load();await drag(2,4,1);assert.equal(await page.evaluate(()=>laneWaveStr(state.tree[2])),'0....1..0...','sample valid edge works');
    await load();await drag(5,8,1);assert.equal(await page.evaluate(()=>laneWaveStr(state.tree[5])),'0...1....0..','sample request falling edge works');
    const addLaterWord=()=>page.evaluate(()=>{state.tree[3].slots[11]={glyph:'2',label:'DAT4'};update(true)});
    await load();await addLaterWord();await drag(3,5,1);
    assert.equal((await words()).find(w=>w.label==='DAT4').t,11,'ordinary drag stops before a distant later word');
    await load();await addLaterWord();await drag(3,5,1,{alt:true});
    assert.equal((await words()).find(w=>w.label==='DAT4').t,12,'Alt also moves a distant later word');
    await load();await page.evaluate(()=>{state.tree[3].nodeByT[10]='z';update(true)});await drag(3,5,4);
    assert.equal(await page.evaluate(()=>state.tree[3].nodeByT[10]),'z','independent continuation node is a hard stop');
    assert.deepEqual((await words()).map(w=>w.t),[4,6,7,8],'ripple clamps before fixed metadata without losing bus words');
    await load();await drag(3,5,1,{alt:true});
    assert.deepEqual((await words()).map(w=>w.t),[4,6,7,8],'Alt retains whole-tail shifting');
    assert.deepEqual(errors, [], 'no browser runtime errors');
    console.log('PASS: exact datapour sample, crowded data/ID buses, targeted neighbour displacement, nodes/labels, undo/redo, cancel, zoom, signal edges and Alt tail drag');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
