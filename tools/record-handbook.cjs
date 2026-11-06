/* Record actual editor interactions, then encode GIFs and PNG covers.
 * Requires Playwright, Chromium and ffmpeg. No application source is modified.
 * CHROMIUM_PATH=/usr/bin/chromium node tools/record-handbook.cjs [--only=zoom]
 */
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {spawnSync}=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(root,'images/handbook');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'wavedrom-handbook-'));
const sample={signal:[{name:'CLK',wave:'p...............'}, {name:'VALID',wave:'0...1...0.......'},
 {name:'DATA',wave:'x...222=x.......',data:['DAT0','DAT1','DAT2','DAT3']},
 {name:'READY',wave:'0.....1...0.....'}],head:{tick:0}};
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(root,'index.html')))});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function ffmpeg(args){const r=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||'ffmpeg failed')}
(async()=>{
 fs.mkdirSync(output,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 const demos=[
 ['draw','基础绘制 · 笔刷与延续',async api=>{
   const {page,caption,cell,drag}=api;
   await api.load({signal:[{name:'VALID',wave:'0...............'},{name:'READY',wave:'0...............'}],head:{tick:0}});
   await caption('选择 1 笔刷，在第 4 格按下并向右拖动。');await page.locator('#palette [data-brush="1"]').click();
   await drag(await cell(0,4),await cell(0,7));await wait(550);
   await caption('选择 0 笔刷，在第 8 格落下低电平，完成有效区间。');await page.locator('#palette [data-brush="0"]').click();
   const p=await cell(0,8);await page.mouse.click(p.x,p.y);await wait(650);
   assert.equal(await page.evaluate(()=>laneWaveStr(state.tree[0])),'0...1...0.......');
   await caption('结果：4～7 拍保持高电平；后面的 . 自动延续。');
 }],
 ['zoom','时间轴缩放 · Ctrl＋滚轮',async api=>{
   const {page,caption,cell}=api;await api.load(sample);
   const p=await cell(1,6);await page.mouse.move(p.x,p.y);
   await caption('鼠标放在编辑网格内，按住 Ctrl 上滚放大。');await page.keyboard.down('Control');
   for(let i=0;i<3;i++){await page.mouse.wheel(0,-100);await wait(220)}await page.keyboard.up('Control');
   assert.ok(await page.evaluate(()=>gridZoom>1));await wait(650);
   await caption('Ctrl 下滚缩小；刻度会按可用空间自动避让。');await page.keyboard.down('Control');
   for(let i=0;i<5;i++){await page.mouse.wheel(0,100);await wait(170)}await page.keyboard.up('Control');await wait(550);
   await caption('点击网格工具栏的百分比，回到 100%。');await page.locator('#gridZoomReset').click();assert.equal(await page.evaluate(()=>gridZoom),1);
 }],
 ['edge-drag','边沿调整 · 普通拖动与 Alt 拖动',async api=>{
   const {page,caption,cell,drag}=api;await api.load(sample);
   await caption('选择工具下，靠近上升沿拖动：只调整这一处分界。');await drag(await cell(1,4,true),await cell(1,6,true));
   assert.equal(await page.evaluate(()=>laneWaveStr(state.tree[1])),'0.....1.0.......');await wait(650);
   await caption('Ctrl＋Z 撤销，再按住 Alt 拖动同一边沿。');await page.keyboard.press('Control+z');await wait(400);
   await page.keyboard.down('Alt');await drag(await cell(1,4,true),await cell(1,6,true));await page.keyboard.up('Alt');
   assert.equal(await page.evaluate(()=>laneWaveStr(state.tree[1])),'0.....1...0.......');
   await caption('结果：Alt 将该信号全部后续一起延迟，其他信号不动。');
 }],
 ['dense-bus','密集总线 · 调整单拍数据边界',async api=>{
   const {page,caption,cell,drag}=api;await api.load(sample);
   await caption('DAT0～DAT3 连续单拍排列，也能直接拖动边界。');await drag(await cell(2,5,true),await cell(2,7,true));
   assert.deepEqual(await page.evaluate(()=>state.tree[2].slots.flatMap((s,t)=>s?.label?[t]:[])),[4,7,8,9]);await wait(700);
   await caption('发生碰撞时只顺延必要的数据块，数据顺序不会丢失。');await page.keyboard.press('Control+z');await wait(450);
   await caption('向左拖动，必要的前置数据块会相应让位。');await drag(await cell(2,6,true),await cell(2,5,true));
   assert.deepEqual(await page.evaluate(()=>state.tree[2].slots.flatMap((s,t)=>s?.label?[t]:[])),[3,4,5,7]);
 }],
 ['wheel','状态微调 · 普通滚轮与 Alt＋滚轮',async api=>{
   const {page,caption,cell}=api;await api.load({signal:[{name:'CONTROL',wave:'0...............'},{name:'REFERENCE',wave:'0...............'}],head:{tick:0}});
   let p=await cell(0,4);await page.mouse.move(p.x,p.y);
   await caption('普通上滚：改为 1，后面的延续格也跟随高电平。');await page.mouse.wheel(0,-120);await wait(800);
   assert.equal(await page.evaluate(()=>effectiveSlotAt(state.tree[0],7).glyph),'1');
   await caption('Ctrl＋Z 后，按住 Alt 在同一格上滚。');await page.keyboard.press('Control+z');await wait(450);
   p=await cell(0,4);await page.mouse.move(p.x,p.y);await page.keyboard.down('Alt');await page.mouse.wheel(0,-120);await page.keyboard.up('Alt');await wait(650);
   assert.equal(await page.evaluate(()=>effectiveSlotAt(state.tree[0],5).glyph),'0');
   await caption('结果：只改当前一格，下一格恢复原低电平。');
 }],
 ['erase-delete','清除与删拍 · 右键和 Alt＋右键',async api=>{
   const {page,caption,cell}=api;await api.load(sample);
   await caption('右键当前格：置为高阻态 z，拍数不变。');let p=await cell(1,5);await page.mouse.click(p.x,p.y,{button:'right'});await wait(700);
   assert.equal(await page.evaluate(()=>state.tree[1].slots[5].glyph),'z');assert.equal(await page.evaluate(()=>laneLen(state.tree[1])),16);
   await caption('Ctrl＋Z 后，在同一格按 Alt＋右键。');await page.keyboard.press('Control+z');await wait(450);
   p=await cell(1,5);await page.mouse.move(p.x,p.y);await page.keyboard.down('Alt');await page.mouse.click(p.x,p.y,{button:'right'});await page.keyboard.up('Alt');await wait(600);
   assert.equal(await page.evaluate(()=>laneLen(state.tree[1])),15);assert.equal(await page.evaluate(()=>state.tree[1].slots[7].glyph),'0');
   await caption('结果：删除这一拍，本信号后续前移；其他信号不变。');
 }],
 ['glitch-brush','毛刺笔刷 · 局部保留与去除',async api=>{
   const {page,caption,cell,drag}=api;await api.load({signal:[{name:'HIGH',wave:'1111111111111111'},{name:'LOW',wave:'0000000000000000'}],head:{tick:0}});
   await caption('重复的 1／0 会显示尖刺。选择“毛刺笔刷”。');await page.locator('#glitchBrushBtn').click();await wait(350);
   await caption('点一下去除当前毛刺；再点同一格恢复。');let p=await cell(0,3);await page.mouse.click(p.x,p.y);await wait(650);assert.equal(await page.evaluate(()=>state.tree[0].slots[3].glyph),'.');
   await page.mouse.click(p.x,p.y);await wait(500);assert.equal(await page.evaluate(()=>state.tree[0].slots[3].glyph),'1');
   await caption('拖过需要平滑的区域，未涂到的毛刺保留。');await drag(await cell(0,5),await cell(0,10));await wait(550);
   assert.equal(await page.evaluate(()=>laneWaveStr(state.tree[0]).slice(5,11)),'......');
   await caption('低电平同样适用；每格一次，整次拖涂可撤销。');await drag(await cell(1,5),await cell(1,10));
   assert.equal(await page.evaluate(()=>laneWaveStr(state.tree[1]).slice(5,11)),'......');
 }],
 ['edge-styles','节点连线 · 形状与方向分别选择',async api=>{
   const {page,caption}=api;await api.load({signal:[{name:'REQUEST',wave:'0...1...........',node:'....a...........'},{name:'RESPONSE',wave:'0.......1.......',node:'........b.......'}],edge:['a->b latency'],head:{tick:0}});
   await caption('打开“节点／连线”面板。');await page.locator('[data-act="open-edge-pop"]').first().click();
   const picker=page.locator('#edgeList .edge-style-pick').first();await picker.waitFor({state:'visible'});await wait(500);
   await caption('先选路径形状，再选箭头方向；预览实时更新。');await picker.locator('.edge-shape').selectOption('horizontal-vertical-horizontal');await wait(650);
   await picker.locator('.edge-direction').selectOption('both');await wait(700);assert.equal(await page.evaluate(()=>state.edges[0].spec),'<-|->');
   await caption('也可切换平滑曲线，保持双向箭头。');await picker.locator('.edge-shape').selectOption('curve');await wait(600);assert.equal(await page.evaluate(()=>state.edges[0].spec),'<~>');
   await page.evaluate(()=>document.querySelector('#edgeMask').classList.remove('open'));await caption('结果保留标准 WaveDrom edge 语法，可继续编辑和导出。');
 }]
 ];
 try{
  for(const [name,title,run] of demos){
   if(process.argv.some(a=>a.startsWith('--only='))&&!process.argv.includes('--only='+name))continue;
   const context=await browser.newContext({viewport:{width:1120,height:720},locale:'zh-CN',reducedMotion:'reduce',recordVideo:{dir:scratch,size:{width:1120,height:720}}});
   await context.addInitScript(()=>{
    localStorage.setItem('wdgui-lang','zh');localStorage.setItem('wdgui-theme','light');localStorage.setItem('wdgui-trace','slim');localStorage.setItem('wdgui-viewmode','desktop');
    window.addEventListener('pointermove',e=>{const c=document.getElementById('hb-cursor');if(c)c.style.transform=`translate(${e.clientX}px,${e.clientY}px)`},{capture:true});
    window.addEventListener('pointerdown',()=>document.getElementById('hb-cursor')?.classList.add('down'),{capture:true});
    window.addEventListener('pointerup',()=>document.getElementById('hb-cursor')?.classList.remove('down'),{capture:true});
    const keys=new Set();for(const type of ['keydown','keyup'])window.addEventListener(type,e=>{if(['Control','Alt','Shift'].includes(e.key)){if(type==='keydown')keys.add(e.key);else keys.delete(e.key);const k=document.getElementById('hb-keys');if(k)k.textContent=[...keys].map(v=>v==='Control'?'Ctrl':v).join(' + ')}},{capture:true});
   });
   const created=Date.now(),page=await context.newPage(),video=page.video(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>appReady);await page.evaluate(()=>document.fonts.ready);
   await page.addStyleTag({content:`#hb-title{position:fixed;inset:0 0 auto;height:46px;z-index:9000;display:flex;align-items:center;padding:0 22px;background:#173a47;color:white;font:600 19px system-ui;pointer-events:none}#hb-caption{position:fixed;right:18px;bottom:12px;width:630px;z-index:9000;border-radius:10px;background:#173a47ed;color:white;padding:13px 18px;font:500 18px/1.5 system-ui;pointer-events:none;box-shadow:0 4px 20px #0002}#hb-keys{position:fixed;top:54px;right:18px;z-index:9000;background:#f2d49b;color:#263445;border-radius:6px;padding:4px 10px;font:700 17px monospace;pointer-events:none}#hb-keys:empty{display:none}#hb-cursor{position:fixed;top:0;left:0;width:24px;height:30px;z-index:9999;pointer-events:none;filter:drop-shadow(1px 2px 1px #0006)}#hb-cursor.down:after{content:'';position:absolute;width:34px;height:34px;border:3px solid #eb9d42;border-radius:50%;left:-13px;top:-13px;background:#f4bc5b30}#hb-cursor svg{position:relative;z-index:1}.toast{display:none!important}`});
   await page.evaluate(title=>{
    for(const [id,text]of [['hb-title',title],['hb-caption',''],['hb-keys','']]){const el=document.createElement('div');el.id=id;el.textContent=text;document.body.appendChild(el)}
    const cursor=document.createElement('div');cursor.id='hb-cursor';cursor.innerHTML='<svg width="22" height="28" viewBox="0 0 22 28"><path d="M2 2v22l6-6 4 9 4-2-4-9h8z" fill="white" stroke="#173a47" stroke-width="1.8"/></svg>';document.body.appendChild(cursor);
   },title);
   const api={page,
    load:async json=>{await page.evaluate(json=>{if(autoChain)exitAutoChain();adoptState(parseDoc(json));state.tool={type:'select'};state.sizes.namew=150;gridZoom=1;state.zoom=1;state.autoFit=false;storeSet('wdgui-deglitch','0');setBrushMode('bar');document.documentElement.dataset.view='below';update(true);undoStack.length=0;redoStack.length=0;undoBase=JSON.stringify(buildJSON());lastCommitTag=null;},json);await wait(450)},
    caption:async text=>{await page.evaluate(text=>document.getElementById('hb-caption').textContent=text,text);await wait(550)},
    cell:async(i,t,edge=false)=>{const id=await page.evaluate(i=>state.tree[i].id,i),box=await page.locator(`.cell[data-lane="${id}"][data-t="${t}"]`).boundingBox();assert.ok(box,'target cell exists');return{x:box.x+(edge?5:box.width/2),y:box.y+box.height/2}},
    drag:async(a,b)=>{await page.mouse.move(a.x,a.y);await wait(200);await page.mouse.down();for(let i=1;i<=16;i++){await page.mouse.move(a.x+(b.x-a.x)*i/16,a.y+(b.y-a.y)*i/16);await wait(45)}await page.mouse.up();await wait(350)}
   };
   const offset=(Date.now()-created)/1000,start=Date.now();
   console.log('Recording',name);await run(api);await wait(1400);const duration=(Date.now()-start)/1000;
   assert.deepEqual(errors,[],'recording must not contain app errors');await context.close();const source=await video.path();
   ffmpeg(['-ss',String(offset),'-t',String(duration),'-i',source,'-vf','fps=8,scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle','-loop','0',path.join(output,name+'.gif')]);
   ffmpeg(['-i',path.join(output,name+'.gif'),'-frames:v','1',path.join(output,name+'.png')]);
   console.log('Saved',name,Math.round(fs.statSync(path.join(output,name+'.gif')).size/1024)+' KiB');
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
