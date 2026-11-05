// Usage: node tests/prototype/stroke-entry.cjs /absolute/path/to/tennis-quick-strokes.html
const fs=require('node:fs');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const source=fs.readFileSync(process.argv[2],'utf8');
new vm.Script(source.match(/<script>([\s\S]*?)<\/script>/)[1]);
function bridge(initial) {
  window.testHost={pending:0,snapshots:[]};
  window.openai={widgetState:initial,setWidgetState(snapshot){
    const value=JSON.parse(JSON.stringify(snapshot));
    window.testHost.snapshots.push(value);window.testHost.pending++;
    return new Promise(resolve=>setTimeout(()=>{
      window.openai.widgetState=value;
      window.dispatchEvent(new CustomEvent('openai:set_globals',{detail:{globals:{widgetState:value}}}));
      window.testHost.pending--;resolve();
    },20));
  }};
}
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{}),args:['--no-sandbox']});
  try {
    const page=await browser.newPage({viewport:{width:736,height:1400}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    let frame,app;
    async function load(initial=null) {
      const html='<html style="color-scheme:light"><head><meta charset="utf-8"></head><body style="margin:0"><script>('+bridge.toString()+')('+JSON.stringify(initial).replace(/</g,'\\u003c')+');</script>'+source+'</body></html>';
      await page.setContent('<iframe sandbox="allow-scripts" style="width:100%;height:2400px;border:0" srcdoc="'+html.replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'"></iframe>');
      frame=page.locator('iframe').contentFrame();app=frame.locator('#tt-quick');
      await app.locator('.tt-pointscore').first().waitFor();
    }
    async function drain(){await frame.locator('body').evaluate(async()=>{while(window.testHost.pending)await new Promise(r=>setTimeout(r,5));});}
    async function latest(){await drain();return frame.locator('body').evaluate(()=>window.testHost.snapshots.at(-1));}
    async function emit(state){await frame.locator('body').evaluate((_,snapshot)=>window.dispatchEvent(new CustomEvent('openai:set_globals',{detail:{globals:{widgetState:snapshot}}})),state);}
    async function action(name){await app.locator('[data-action="'+name+'"]').click();await drain();}
    async function ending(actor,type){await app.locator('[data-action="ending"][data-actor="'+actor+'"][data-ending="'+type+'"]').click();await drain();}
    async function shot(stroke){await app.locator('[data-action="stroke"][data-stroke="'+stroke+'"]').click();await drain();}
    async function record(actor,type,stroke){const before=(await latest()).privateContent.quick.actions.length;await ending(actor,type);assert.equal((await latest()).privateContent.quick.actions.length,before,'No score advance before stroke selection');await shot(stroke);assert.equal((await latest()).privateContent.quick.actions.length,before+1,'One point saved per stroke selection');}
    async function tableRow(player,stroke){return app.locator('table[data-player="'+player+'"] [data-stroke-row="'+stroke+'"] td').allTextContents();}
    await load();
    await ending(0,'winner');
    const pending=await latest();
    assert.deepEqual(await app.locator('.tt-pointscore').allTextContents(),['30','15']);
    assert.equal(await app.locator('[aria-label="Choose last stroke"]').isVisible(),true);
    await emit(pending);
    assert.equal(await app.locator('[aria-label="Choose last stroke"]').isVisible(),true);
    await action('cancel-stroke');
    assert.deepEqual(await app.locator('.tt-pointscore').allTextContents(),['30','15']);
    console.log('PASS Ending selection survives state echoes; Back does not advance or undo the score');

    const cases=[[0,'winner','Forehand'],[0,'unforced','Backhand'],[1,'forced','Volley'],[1,'winner','Overhead'],[0,'forced','Other'],[1,'unforced','Forehand'],[0,'winner','Backhand'],[1,'winner','Volley'],[0,'forced','Forehand'],[0,'winner','Serve']];
    for(const args of cases)await record(...args);
    await app.locator('[data-action="point"][data-winner="0"]').click();await drain();
    await record(1,'unforced','Unknown');
    await app.locator('[data-field="mode"]').selectOption('detailed');await drain();
    await app.locator('[data-action="double"]').last().click();await drain();
    assert.equal((await latest()).privateContent.quick.actions.at(-1).stroke,'Serve');
    await action('ace');
    assert.equal((await latest()).privateContent.quick.actions.at(-1).stroke,'Serve');
    await action('report');
    assert.deepEqual(await tableRow(0,'Forehand'),['2','0','1']);
    assert.deepEqual(await tableRow(0,'Backhand'),['1','2','0']);
    assert.deepEqual(await tableRow(0,'Other'),['0','0','1']);
    assert.deepEqual(await tableRow(0,'Serve'),['2','0','0']);
    assert.deepEqual(await tableRow(1,'Volley'),['1','0','1']);
    assert.deepEqual(await tableRow(1,'Overhead'),['1','0','0']);
    assert.deepEqual(await tableRow(1,'Forehand'),['0','1','0']);
    assert.deepEqual(await tableRow(1,'Backhand'),['0','0','1']);
    assert.deepEqual(await tableRow(1,'Unknown'),['0','1','0']);
    assert.match(await app.innerText(),/Stroke recorded for 15\/16/);
    console.log('PASS Player and stroke breakdowns, Other versus unseen, service outcomes, and data coverage');

    const saved=await latest();await load(saved);
    assert.deepEqual(await tableRow(0,'Forehand'),['2','0','1']);
    await action('history');
    await app.locator('[data-action="details"][data-index="0"]').click();await drain();
    await app.locator('[data-detail="stroke"]').selectOption('Overhead');
    await app.locator('[data-detail="note"]').fill('Corrected opening winner');
    await emit(saved);
    assert.equal(await app.locator('[data-detail="note"]').inputValue(),'Corrected opening winner');
    await action('save-details');await action('report');
    assert.deepEqual(await tableRow(0,'Forehand'),['1','0','1']);
    assert.deepEqual(await tableRow(0,'Overhead'),['1','0','0']);
    await action('live');await action('undo');await action('report');
    assert.deepEqual(await tableRow(0,'Serve'),['1','0','0']);
    assert.match(await app.innerText(),/Corrected opening winner/);
    console.log('PASS Details remain stable; report updates after stroke edits, undo, and reload');

    for(const width of [736,360,320]) {
      await page.setViewportSize({width,height:1400});
      const clipped=await frame.locator('body').evaluate(()=>document.documentElement.scrollWidth>innerWidth);
      assert.equal(clipped,false,'Report overflow at '+width);
      const overflow=await app.locator('table th,table td').evaluateAll(nodes=>nodes.filter(n=>n.scrollWidth>n.clientWidth+1).map(n=>n.textContent));
      assert.deepEqual(overflow,[],'Table text overflow at '+width);
    }
    if(process.env.PROTOTYPE_SCREENSHOT_DIR){await page.setViewportSize({width:480,height:1400});await app.screenshot({path:process.env.PROTOTYPE_SCREENSHOT_DIR+'/tennis-stroke-report.png'});}
    await load();await ending(1,'forced');
    const pendingSaved=await latest();await load(pendingSaved);
    assert.equal(await app.locator('[aria-label="Choose last stroke"]').isVisible(),true);
    await shot('Volley');assert.deepEqual(await app.locator('.tt-pointscore').allTextContents(),['40','15']);
    await app.locator('[data-field="mode"]').selectOption('detailed');await drain();
    await action('first-fault');await action('second-in');await ending(0,'winner');await action('cancel-stroke');
    assert.equal((await latest()).privateContent.quick.draft.second,true);
    assert.match(await app.innerText(),/First serve fault · second serve in/);
    await ending(0,'winner');
    await page.setViewportSize({width:320,height:1400});
    const short=await app.locator('[data-action="stroke"]').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().height<44).map(n=>n.textContent));assert.deepEqual(short,[]);
    if(process.env.PROTOTYPE_SCREENSHOT_DIR){await page.setViewportSize({width:480,height:1400});await app.screenshot({path:process.env.PROTOTYPE_SCREENSHOT_DIR+'/tennis-stroke-entry.png'});}
    console.log('PASS Pending entry restores once, serve observations survive Back, narrow layouts and touch targets');
    assert.deepEqual(errors,[]);console.log('All stroke entry and state-echo checks passed.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
