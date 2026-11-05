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
    await page.evaluate(() => {
      adoptState(parseDoc({signal:[{name:'clk',wave:'p'.repeat(120)},
        {name:'data',wave:'3'.repeat(120),data:Array(120).fill('long bus value')}],
        head:{tick:100000},foot:{tick:100000}}));
      update(true);
    });
    const original = await page.evaluate(() => JSON.stringify(buildJSON()));
    const preview = await page.locator('#wv0').innerHTML();
    await page.evaluate(() => { $('#gridScroll').scrollLeft = 800; });
    const point = await page.evaluate(() => {
      const r = $('#gridScroll').getBoundingClientRect();
      return {x:r.left + 400,y:r.top + 80};
    });
    const timeAt = () => page.evaluate(x =>
      ($('#gridScroll').scrollLeft + x - $('#gridScroll').getBoundingClientRect().left -
        $('#gridInner .time-corner').offsetWidth) / gridCellW(), point.x);
    const before = await timeAt();
    await page.mouse.move(point.x, point.y);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -120);
    await page.keyboard.up('Control');
    await page.waitForFunction(() => gridZoom > 1);
    assert.ok(Math.abs(await timeAt() - before) < 0.05, 'cursor time stays anchored');
    assert.equal(await page.evaluate(() => JSON.stringify(buildJSON())), original,
      'Ctrl+wheel must not paint a cell or alter WaveJSON');
    assert.equal(await page.locator('#wv0').innerHTML(), preview, 'preview remains unchanged');
    const guarded = await page.evaluate(() => {
      const before = JSON.stringify(buildJSON()), zoom = gridZoom;
      const cell = document.querySelector('.cell');
      for (const modifiers of [{altKey:true}, {metaKey:true}, {shiftKey:true}, {ctrlKey:true,altKey:true}]) {
        cell.dispatchEvent(new WheelEvent('wheel', {bubbles:true,cancelable:true,deltaY:120,...modifiers}));
      }
      cell.dispatchEvent(new WheelEvent('wheel', {bubbles:true,cancelable:true,deltaY:0,deltaX:100}));
      return before === JSON.stringify(buildJSON()) && zoom === gridZoom;
    });
    assert.ok(guarded, 'other modifiers and horizontal wheel cannot paint cells');
    await page.evaluate(() => setGridZoom(0.01));
    assert.equal(await page.evaluate(() => gridZoom), 0.25);
    const axes = await page.evaluate(() => ['.time-cells', '.foot-nums'].map(selector => {
      const labels = [...document.querySelectorAll(selector + ' .axis-label')];
      const visible = labels.filter(el => el.textContent && getComputedStyle(el).visibility !== 'hidden');
      return { total:labels.length, visible:visible.length, boxes:visible.map(el => {
        const r = el.getBoundingClientRect(); return {left:r.left,right:r.right};
      }) };
    }));
    for (const axis of axes) {
      assert.ok(axis.visible > 0 && axis.visible < axis.total, 'dense ticks are thinned');
      axis.boxes.slice(1).forEach((box,i) => assert.ok(box.left >= axis.boxes[i].right + 7.5,
        'visible axis labels must not overlap'));
    }
    assert.ok(await page.evaluate(() => {
      const lane = state.tree.find(n => n.name === 'data');
      return laneCharPositions(lane)[1].x === gridCellW();
    }), 'cell positions must refresh with zoom');
    await page.evaluate(() => setGridZoom(100));
    assert.equal(await page.evaluate(() => gridZoom), 3);
    await page.locator('#gridZoomReset').click();
    assert.equal(await page.evaluate(() => gridZoom), 1);
    await page.evaluate(() => { $('#gridScroll').scrollLeft = 0; });
    const cell = page.locator('.lane-row .cell').first();
    const cellBox = await cell.boundingBox();
    await page.mouse.move(cellBox.x + cellBox.width/2, cellBox.y + cellBox.height/2);
    await page.mouse.wheel(0, 120);
    await page.waitForFunction(original => JSON.stringify(buildJSON()) !== original, original);
    assert.equal(await page.evaluate(() => gridZoom), 1, 'plain wheel still edits, never zooms');
    assert.deepEqual(errors, [], 'no browser runtime errors');
    console.log('PASS: cursor anchoring, data/preview isolation, limits/reset, head/foot tick collision, hit geometry and ordinary wheel editing');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
