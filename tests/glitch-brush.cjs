// Requires Playwright; run: CHROMIUM_PATH=/usr/bin/chromium node tests/glitch-brush.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(__dirname,'..','index.html')))});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
try{const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));const base='http://127.0.0.1:'+server.address().port;
await page.goto(base);await page.waitForFunction(()=>appReady);
const load=async(wave='11111111111')=>page.evaluate(wave=>{adoptState(parseDoc({signal:[{name:'sig',wave,...(wave.length>=7?{node:'..a...b'}:{})},{name:'keep',wave:'11111111111'}],...(wave.length>=7?{edge:['a->b delay']}:{})}));storeSet('wdgui-deglitch','0');gridZoom=1;update(true);undoStack.length=0;redoStack.length=0;undoBase=JSON.stringify(buildJSON());lastCommitTag=null;setBrush('glitch')},wave);
const read=()=>page.evaluate(()=>JSON.stringify(buildJSON()));
const wave=()=>page.evaluate(()=>laneWaveStr(state.tree[0]));
const point=async(t)=>{const id=await page.evaluate(()=>state.tree[0].id),r=await page.locator(`.cell[data-lane="${id}"][data-t="${t}"]`).boundingBox();return{x:r.x+r.width/2,y:r.y+r.height/2}};
const click=async t=>{const p=await point(t);await page.mouse.click(p.x,p.y)};
await load();const before=await read();await click(2);
assert.equal(await wave(),'11.11111111','remove only the touched same-level explicit state');
assert.deepEqual(await page.evaluate(()=>state.tree[0].nodeByT),{2:'a',6:'b'});assert.deepEqual(await page.evaluate(()=>buildJSON().edge),['a->b delay']);
assert.equal(await page.evaluate(()=>undoStack.length),1);await click(2);assert.equal(await read(),before,'second click restores original explicit state');
await load('1........');await click(3);assert.equal(await wave(),'1..1.....','add an explicit 1, never an inverted pulse');await click(3);assert.equal(await wave(),'1........');
await load('0........');await click(3);assert.equal(await wave(),'0..0.....','low-level analogue');
await load('1H.h.1...');const styles=await read();await click(1);assert.equal((await wave())[1],'.');await click(1);assert.equal(await read(),styles,'restore H arrow style precisely');
await load('0101010');const realPulses=await read();for(let i=1;i<6;i++)await click(i);assert.equal(await read(),realPulses,'010/101 pulses are real transitions, not targeted glitches');
await load('0...111...');await click(4);assert.equal(await wave(),'0...111...','keep first true rising transition');await click(5);assert.equal(await wave(),'0...1.1...');
await load('11111111111');const strokeBefore=await read(),p1=await point(2),p2=await point(6);await page.mouse.move(p1.x,p1.y);await page.mouse.down();await page.waitForTimeout(800);await page.mouse.move(p2.x,p2.y,{steps:20});await page.mouse.move(p1.x,p1.y,{steps:20});await page.mouse.up();
assert.equal(await wave(),'11.....1111','erase stroke converts touched repetitions to holds exactly once');assert.equal(await page.evaluate(()=>undoStack.length),1);await page.evaluate(()=>doUndo());assert.equal(await read(),strokeBefore);await page.evaluate(()=>doRedo());assert.equal(await wave(),'11.....1111');
await load('1........');const addStart=await point(2),addEnd=await point(6);await page.mouse.move(addStart.x,addStart.y);await page.mouse.down();await page.mouse.move(addEnd.x,addEnd.y,{steps:20});await page.mouse.up();assert.equal(await wave(),'1.11111..','addition materializes only the covered continuation cells');
await load();const cancelBefore=await read(),p=await point(2);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await read(),cancelBefore);assert.equal(await page.evaluate(()=>undoStack.length),0);
await page.evaluate(()=>{storeSet('wdgui-deglitch','1');enterAutoChain(true);setChainSel(state.tree[0],2);setBrush('glitch')});assert.equal(await page.evaluate(()=>deglitchOn()),false);assert.equal(await page.evaluate(()=>autoChain),false);
for(const mode of ['bar','compact','vgroup','panel']){await page.evaluate(mode=>setBrushMode(mode),mode);assert.ok(await page.locator('[data-brush="glitch"]').count())}
await page.evaluate(()=>{setBrushMode('fab');document.body.appendChild(createBrushPanel())});assert.ok(await page.getByRole('button',{name:'Toggle glitch',exact:true}).count());
for(const [value,brick,y] of [['1111','1m1',13],['0000','0m0',35]]){
 await load(value);await page.evaluate(()=>renderPreview());
 const result=await page.evaluate(({brick,y})=>({d:document.querySelector('.lane-track svg.mini path.wtrace').getAttribute('d'),native:[...document.querySelectorAll('#wv0 [id="wavelane_draw_0_0"] use')].filter(u=>(u.getAttribute('xlink:href')||u.getAttribute('href'))==='#'+brick).length}),{brick,y});
 assert.equal(result.native,3,'native renders a notch at each repeated state');
 assert.equal((result.d.match(/L[\d.]+ 24L/g)||[]).length,3,'editor renders the same three triangular notches');
 await page.evaluate(()=>deglitchAll());await page.evaluate(()=>update(true));assert.equal(await wave(),value[0]+'...','all-toolbar normalizer and local brush share semantics');
 assert.equal(await page.evaluate(()=>document.querySelector('.lane-track svg.mini path.wtrace').getAttribute('d').includes(' 24L')),false,'normalized holds remove editor notches');
}
await load('1111');await page.evaluate(()=>{closeBrushPanel();setBrushMode('bar');renderPreview()});await page.screenshot({path:'/tmp/same-level-glitches.png',fullPage:true});
const mobile=await browser.newContext({viewport:{width:1200,height:900},hasTouch:true}),touch=await mobile.newPage();await touch.goto(base);await touch.waitForFunction(()=>appReady);await touch.evaluate(()=>{adoptState(parseDoc({signal:[{wave:'1111111'}]}));update(true);setBrush('glitch')});
const tp=await touch.evaluate(()=>{const r=document.querySelector('.cell[data-t="2"]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}});await touch.touchscreen.tap(tp.x,tp.y);assert.equal(await touch.evaluate(()=>laneWaveStr(state.tree[0])),'11.1111');await mobile.close();
assert.deepEqual(errors,[]);console.log('PASS: same-level explicit/hold toggling, real pulse preservation, H style restoration, local stroke/undo/cancel, palette/touch controls, and native 1m1/0m0 notch parity');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
