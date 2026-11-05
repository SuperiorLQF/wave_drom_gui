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
    const nativeSpecs = (() => {
      const source=fs.readFileSync(path.join(__dirname,'..','SKILL/wavedrom-render/vendor/wavedrom.bundle.js'),'utf8');
      const section=source.slice(source.indexOf('switch(Edge.shape)'),source.indexOf('return{lx:'));
      return [...section.matchAll(/case"([^"]+)"/g)].map(m=>m[1]);
    })();
    const configured=await page.evaluate(()=>EDGE_SHAPES.flatMap(shape=>Object.values(shape.specs)));
    assert.deepEqual([...configured].sort(),[...nativeSpecs].sort(),'every offered combination matches native WaveDrom');
    await page.evaluate(()=>{
      adoptState(parseDoc({signal:[{name:'a',wave:'0..1',node:'a...'}, {name:'b',wave:'1..0',node:'..b.'}],
        edge:EDGE_SHAPES.flatMap(shape=>Object.values(shape.specs)).map(spec=>'a'+spec+'b label')}));
      update(true);
      $('#edgeMask').classList.add('open');
    });
    const original=await page.evaluate(()=>JSON.stringify(buildJSON()));
    assert.equal(await page.locator('#edgeList .edge-shape').count(),20);
    assert.equal(await page.evaluate(()=>JSON.stringify(buildJSON())),original,'rendering controls preserves imported syntax');
    const picker=page.locator('#edgeList .edge-style-pick').first();
    await picker.locator('.edge-direction').selectOption('both');
    await page.waitForFunction(()=>state.edges[0].spec==='<->');
    await picker.locator('.edge-shape').selectOption('horizontal-vertical');
    assert.equal(await page.evaluate(()=>state.edges[0].spec),'<-|>');
    assert.match(await picker.locator('.edge-preview-path').getAttribute('d'),/H63V28/,'L preview follows horizontal then vertical');
    await picker.locator('.edge-shape').selectOption('vertical-horizontal');
    assert.equal(await page.evaluate(()=>state.edges[0].spec),'|->','unsupported bidirectional option falls back to native end arrow');
    assert.equal(await picker.locator('.edge-direction option[value="both"]').evaluate(el=>el.disabled),true);
    await picker.locator('.edge-direction').selectOption('none');
    assert.equal(await page.evaluate(()=>state.edges[0].spec),'|-','new no-arrow vertical-horizontal style serializes');
    assert.match(await picker.locator('.edge-preview-path').getAttribute('d'),/V28H63/);
    await picker.locator('.edge-shape').selectOption('range');
    assert.equal(await page.evaluate(()=>state.edges[0].spec),'+');
    assert.equal(await picker.locator('.edge-direction').isDisabled(),true);
    await picker.locator('.edge-shape').selectOption('horizontal-vertical-horizontal');
    assert.equal(await page.evaluate(()=>state.edges[0].spec),'-|->');
    assert.match(await picker.locator('.edge-preview-path').getAttribute('d'),/H36V28H63/,'three segment preview must contain two bends');
    await page.waitForTimeout(150);
    const edited=await page.evaluate(()=>JSON.stringify(buildJSON()));
    assert.ok(JSON.parse(edited).edge.includes('a-|->b label'),'endpoints and label survive style changes');
    await page.evaluate(()=>{doUndo();doRedo()});
    assert.equal(await page.evaluate(()=>JSON.stringify(buildJSON())),edited,'undo and redo preserve style edit');
    await page.evaluate(()=>{$('#edgeMask').classList.remove('open');nodeLinkLetter='a';$('#nodeLinkMask').classList.add('open');renderNodeLinks()});
    const nodePicker=page.locator('#nodeLinkList .edge-style-pick').first();
    assert.equal(await nodePicker.locator('.edge-shape').inputValue(),'horizontal-vertical-horizontal');
    await nodePicker.locator('.edge-shape').selectOption('curve-straight');
    assert.equal(await page.evaluate(()=>state.edges[0].spec),'~->','node dialog uses shared controls');
    await page.waitForTimeout(150);
    await page.evaluate(()=>{ const json=buildJSON();adoptState(parseDoc(json));update(true); });
    assert.equal(await page.evaluate(()=>state.edges.length),20,'all native styles round trip');
    assert.equal(await page.evaluate(()=>state.rawEdges.length),0,'no native style becomes raw/uneditable');
    assert.equal(await page.locator('#edgeList .edge-shape').first().inputValue(),'curve-straight');
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'/tmp/edge-styles-mobile.png',fullPage:true});
    await page.setViewportSize({width:1440,height:900});
    await page.screenshot({path:'/tmp/edge-styles-desktop.png',fullPage:true});
    assert.deepEqual(errors, [], 'no browser runtime errors');
    console.log('PASS: all 20 native styles, shape/direction controls in both dialogs, accurate previews, valid combinations, WaveJSON round trip and undo/redo');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
