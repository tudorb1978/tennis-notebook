// Run against `npm run web -- --localhost --port 8093`.
// PLAYWRIGHT_MODULE and CHROME_EXECUTABLE can point to an existing local browser runtime.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const pwName=process.env.PLAYWRIGHT_MODULE||'playwright';
const {chromium}=require(pwName);
const {expect}=require(pwName+'/test');
const base=process.env.APP_URL||'http://localhost:8093';
const output=process.env.TEST_OUTPUT||'/tmp';

(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{}),args:['--no-sandbox']});
  let context=await browser.newContext({viewport:{width:412,height:915},acceptDownloads:true});
  let page=await context.newPage();const errors=[];
  const wire=()=>{page.on('pageerror',e=>errors.push(e.message));page.on('console',message=>{if(message.type()==='error'&&/Unexpected text node|must be rendered within a <Text>/i.test(message.text()))errors.push(message.text());});};wire();
  const button=name=>page.getByRole('button',{name,exact:true});
  const lightAppearance=async()=>{
    const newMatch=button('Start recording your first match');
    await expect(newMatch).toHaveCSS('background-color','rgb(33, 74, 56)');
    const background=await newMatch.evaluate(element=>{
      for(let ancestor=element.parentElement;ancestor;ancestor=ancestor.parentElement){
        const {width,height}=ancestor.getBoundingClientRect();
        const color=getComputedStyle(ancestor).backgroundColor;
        if(width>=innerWidth&&height>=innerHeight&&color!=='rgba(0, 0, 0, 0)')return color;
      }
      return null;
    });
    assert.equal(background,'rgb(244, 245, 237)');
  };
  const idle=async()=>{await expect(page.getByText('Saving…',{exact:true})).toHaveCount(0);};
  const points=async(a,b)=>{
    await expect(page.locator('[data-testid^="score-0-"]').last()).toHaveText(a);
    await expect(page.locator('[data-testid^="score-1-"]').last()).toHaveText(b);
  };
  const noPointSaved=()=>expect(page.getByTestId('point-saved-confirmation')).toHaveCount(0,{timeout:1000});
  const pointSaved=async(score,context,winnerSide,next='Next point')=>{
    // React Native's web animation calculates elapsed time with Date.now().
    await page.clock.setSystemTime(await page.evaluate(()=>Date.now()));
    const confirmation=page.getByTestId('point-saved-confirmation');
    await expect(confirmation).toBeVisible({timeout:1000});
    await expect(confirmation).toHaveCSS('opacity','1',{timeout:1000});
    await expect(confirmation.getByText('Point saved',{exact:true})).toBeVisible({timeout:1000});
    await expect(page.getByTestId('point-saved-score')).toHaveText(score,{timeout:1000});
    await expect(page.getByTestId('point-saved-context')).toHaveText(context,{timeout:1000});
    await expect(page.getByTestId('point-saved-result')).toHaveText(`${winnerSide===0?'Point won':'Point lost'} · ${next}`,{timeout:1000});
    await expect(page.getByTestId('point-saved-accent')).toHaveCSS('background-color',winnerSide===0?'rgb(224, 242, 174)':'rgb(223, 235, 245)');
    await expect(confirmation).toHaveCSS('pointer-events','none');
  };
  const choose=async(label,value)=>{await page.getByText(label,{exact:true}).locator('..').getByRole('button',{name:value,exact:true}).click();};
  const pickWinner=side=>page.getByTestId(`point-winner-${side}`).click();
  const skipServiceDetails=async()=>{
    for(let attempts=0;attempts<3&&await page.getByTestId('skip-service-detail').count();attempts++){
      const current=await page.locator('[data-testid^="service-step-"]').getAttribute('data-testid');
      await page.getByTestId('skip-service-detail').click();
      await expect(page.getByTestId(current)).toHaveCount(0);await idle();
    }
    await expect(page.getByTestId('skip-service-detail')).toHaveCount(0);
  };
  const serviceQuestion=async(step,missed=false)=>{
    for(const name of ['first-serve','second-serve','return-result','return-stroke']){
      const question=page.getByTestId(`service-step-${name}`);
      if(name===step)await expect(question).toBeVisible();else await expect(question).toHaveCount(0);
    }
    await expect(page.getByTestId('service-choices')).toHaveCount(step==='point-ending'?0:1);
    await expect(page.getByTestId('skip-service-detail')).toHaveCount(step==='point-ending'?0:1);
    for(const side of [0,1]){
      const option=page.getByTestId(`point-winner-${side}`);
      if(step==='point-ending'&&!missed)await expect(option).toBeVisible();else await expect(option).toHaveCount(0);
    }
    if(step!=='point-ending'){
      await expect(button('Not sure which error')).toHaveCount(0);
      await expect(page.locator('[data-testid^="ending-section-"]')).toHaveCount(0);
    }
  };
  const captureService=async(step,missed=false)=>{
    const viewport=page.viewportSize();
    for(const width of [390,320]){
      await page.setViewportSize({width,height:915});await serviceQuestion(step,missed);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.screenshot({path:path.join(output,`tennis-guided-${missed?'missed-return':step}-${width}.png`),fullPage:true});
    }
    await page.setViewportSize(viewport);
  };
  const moreHeading=()=>page.getByRole('heading',{name:'More shot types',exact:true});
  const moreShots=async(actor,type)=>{await page.getByTestId(`more-shots-${actor}-${type}`).click();await expect(moreHeading()).toBeVisible();};
  const openMore=async(actor,type)=>{await skipServiceDetails();await pickWinner(type==='winner'?actor:1-actor);await moreShots(actor,type);};
  const closeMore=async()=>{await button('Close').click();await expect(moreHeading()).toHaveCount(0);await idle();await noPointSaved();};
  const directShot=async(actor,type,shot)=>{await page.getByTestId(`shot-${actor}-${type}-${shot}`).click();await expect(moreHeading()).toHaveCount(0);await idle();};
  const rareShot=async(value)=>{await page.getByTestId(`stroke-${value}`).click();await expect(moreHeading()).toHaveCount(0);await idle();};
  const record=async(actor,type,shot)=>{
    await skipServiceDetails();
    await pickWinner(type==='winner'?actor:1-actor);
    if(['forehand','backhand','volley'].includes(shot))await directShot(actor,type,shot);
    else{await moreShots(actor,type);await rareShot(shot);}
  };
  const shotChoices=async(winner)=>{
    const sections=([0,1]).flatMap(side=>(side===winner?['winner']:['unforced-error','forced-error']).map(ending=>`ending-section-${side}-${ending}`));
    const displayed=page.locator('[data-testid^="ending-section-"]');
    await expect(displayed).toHaveCount(sections.length);
    for(let i=0;i<sections.length;i++)await expect(displayed.nth(i)).toHaveAttribute('data-testid',sections[i]);
    for(const side of [0,1])for(const ending of ['winner','unforced-error','forced-error']){
      const available=(side===winner)===(ending==='winner');
      for(const shot of ['forehand','backhand','volley']){
        const option=page.getByTestId(`shot-${side}-${ending}-${shot}`);
        if(available)await expect(option).toBeVisible();else await expect(option).toHaveCount(0);
      }
      const more=page.getByTestId(`more-shots-${side}-${ending}`);
      if(available)await expect(more).toBeVisible();else await expect(more).toHaveCount(0);
    }
  };
  const reportSection=name=>page.getByTestId(`match-report-${name}`);
  const reportStage=index=>page.getByTestId(`report-stage-${index}`);
  const reportPoint=number=>page.getByTestId(`report-point-${number}`);
  const shotStat=(player,strokeName,metric,value)=>page.getByLabel(`${player}, ${strokeName}, ${metric}: ${value}`,{exact:true});
  const setupSectionOrder=async()=>{
    const players=await page.getByText('Players',{exact:true}).boundingBox();
    const event=await page.getByRole('textbox',{name:'Tournament or group',exact:true}).boundingBox();
    const format=await page.getByText('Match format',{exact:true}).boundingBox();
    const depth=await page.getByText('Recording depth',{exact:true}).boundingBox();
    assert.ok(players.y<event.y&&event.y<format.y&&format.y<depth.y,'Setup order must be Players, event/context, format, recording depth');
  };
  const openStart=async(opponent)=>{
    await page.getByRole('button',{name:`Alex vs ${opponent}, Not started`,exact:true}).click();
    await button('Start match').click();
    await expect(page.getByRole('heading',{name:'Who serves first?',exact:true})).toBeVisible();
    await expect(page.getByTestId('start-match')).toBeDisabled();
  };
  const confirmStart=async()=>{
    await page.getByTestId('first-server-0').click();
    await page.getByTestId('start-match').click();await expect(page.getByTestId('point-winner-0')).toBeVisible();await idle();
  };
  const correction=async(games,score,nextServer='Jamie')=>{
    await button('Correct score').click();
    for(let i=0;i<2;i++)await page.getByRole('textbox',{name:`${i?'Jamie':'Alex'} games`,exact:true}).fill(String(games[i]));
    if(games[0]===3&&games[1]===3){
      for(let i=0;i<2;i++)await page.getByRole('textbox',{name:`${i?'Jamie':'Alex'} points`,exact:true}).fill(String(score[i]));
    }else{
      const labels=page.getByText('Points',{exact:true});
      // Scope to the two correction cards, excluding the scoreboard column heading.
      for(let i=0;i<2;i++)await labels.nth(i+1).locator('..').getByRole('button',{name:['0','15','30','40','Ad'][score[i]],exact:true}).click();
    }
    await choose('Next server',nextServer);await page.getByTestId('apply-correction').click();await expect(page.getByRole('button',{name:'Apply correction',exact:true})).toHaveCount(0);await idle();await noPointSaved();
  };
  try{
    await page.clock.setFixedTime(new Date('2026-11-05T11:40:00Z'));
    await page.emulateMedia({colorScheme:'dark'});
    await page.goto(base,{waitUntil:'domcontentloaded'});await expect(page.getByText('Your tennis notebook',{exact:true})).toBeVisible({timeout:60000});
    await lightAppearance();
    await page.emulateMedia({colorScheme:'light'});await lightAppearance();
    await page.emulateMedia({colorScheme:'dark'});await lightAppearance();
    console.log('PASS Light appearance remains readable with a dark system preference and theme changes');
    await expect(button('New match & event')).toHaveCount(0);
    await button('Start recording your first match').click();
    await expect(page.getByTestId('fast4-single')).toHaveAttribute('aria-pressed','true');
    await expect(page.getByTestId('recording-depth-endings')).toHaveAttribute('aria-pressed','true');
    await setupSectionOrder();
    await page.getByTestId('new-player-name').fill('Alex');await page.getByTestId('opponent-name').fill('Jamie');
    await page.getByTestId('fast4-match-tiebreak').click();await page.getByRole('textbox',{name:'Tournament or group',exact:true}).fill('Club tournament');
    await expect(page.getByText('First server',{exact:true})).toHaveCount(0);
    await page.getByTestId('save-match').click();
    await expect(page.getByRole('button',{name:'Alex vs Jamie, Not started',exact:true})).toBeVisible();
    await page.reload({waitUntil:'domcontentloaded'});
    await openStart('Jamie');
    await page.clock.setFixedTime(new Date('2026-11-05T12:00:00Z'));
    await confirmStart();
    const matchClock=page.getByTestId('match-clock');
    await expect(matchClock).toHaveText('Playing time · 00:00');
    const rallyEnding=page.getByText('Last shot of the rally',{exact:true});
    const entryTop=(await page.getByTestId('point-winner-0').boundingBox()).y;
    await noPointSaved();
    await expect(rallyEnding).toHaveCount(0);
    await pickWinner(0);await expect(rallyEnding).toBeVisible();
    await noPointSaved();
    await shotChoices(0);
    for(const width of [390,320]){
      await page.setViewportSize({width,height:915});await shotChoices(0);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.screenshot({path:path.join(output,`tennis-last-shot-${width}.png`),fullPage:true});
    }
    await moreShots(0,'winner');await points('0','0');await noPointSaved();
    await expect(page.getByTestId('stroke-serve')).toBeVisible();
    for(const shot of ['forehand','backhand','volley'])await expect(page.getByTestId(`stroke-${shot}`)).toHaveCount(0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(output,'tennis-more-shots-320.png'),fullPage:true});
    await closeMore();await expect(page.getByText('Alex won the point',{exact:true})).toBeVisible();await points('0','0');
    await page.setViewportSize({width:412,height:915});
    await button('Definitions').click();
    await expect(page.getByRole('heading',{name:'Outcome definitions',exact:true})).toBeVisible();
    await expect(page.getByText('A shot that wins the point without the opponent touching the ball.',{exact:true})).toBeVisible();
    await expect(page.getByText('A miss on a shot the player could reasonably be expected to keep in play.',{exact:true})).toBeVisible();
    await expect(page.getByText('The player reaches the ball, but it is too difficult to get back into play.',{exact:true})).toBeVisible();
    await button('Done').click();await points('0','0');
    await expect(button('Ace')).toHaveCount(0);await expect(button('Double fault')).toHaveCount(0);
    await button('Change winner').click();await pickWinner(1);
    await shotChoices(1);
    await expect(button('Double fault')).toHaveCount(0);await expect(button('Ace')).toHaveCount(0);
    await moreShots(0,'forced-error');await expect(page.getByTestId('stroke-serve')).toHaveCount(0);
    await closeMore();await points('0','0');
    await button('Change winner').click();
    const otherServer=page.getByTestId('toggle-point-server');
    await expect(otherServer.locator('..').getByRole('button',{name:'Correct score',exact:true})).toBeVisible();
    await otherServer.click();await expect(page.getByText('Jamie serving · this point only',{exact:true})).toBeVisible();
    await otherServer.click();await expect(page.getByText('Alex serving',{exact:true})).toBeVisible();
    await otherServer.click();await expect(page.getByText('Jamie serving · this point only',{exact:true})).toBeVisible();
    await page.reload({waitUntil:'domcontentloaded'});await expect(page.getByText('Jamie serving · this point only',{exact:true})).toBeVisible();
    await pickWinner(0);await expect(rallyEnding).toBeVisible();
    await page.reload({waitUntil:'domcontentloaded'});await expect(page.getByText('Alex won the point',{exact:true})).toBeVisible();
    await moreShots(0,'winner');await points('0','0');await noPointSaved();
    await expect(page.getByTestId('stroke-serve')).toHaveCount(0);
    await page.reload({waitUntil:'domcontentloaded'});await expect(moreHeading()).toBeVisible();await points('0','0');await noPointSaved();
    await closeMore();await expect(page.getByText('Alex won the point',{exact:true})).toBeVisible();
    const initialMatchNotes='Settled after the first set.';
    const matchNotes=initialMatchNotes+'\nWork on the second serve under pressure.';
    const matchNotesField=page.getByRole('textbox',{name:'Notes about the match',exact:true});
    await button('Match notes').click();await matchNotesField.fill(initialMatchNotes);await button('Save match notes').click();
    await expect(button('Save match notes')).toHaveCount(0);
    await noPointSaved();
    await expect(rallyEnding).toBeVisible();await points('0','0');
    await directShot(0,'winner','forehand');await points('15','0');
    await pointSaved('15–0','Set 1 · Games 0–0',0);
    assert.equal((await page.getByTestId('point-winner-0').boundingBox()).y,entryTop);
    await expect(page.getByText('Previous point · Alex',{exact:true})).toBeVisible();
    await otherServer.click();await noPointSaved();
    await otherServer.click();await noPointSaved();
    console.log('PASS Direct shot entry follows fixed player order, and More shot types restores or cancels without saving');
    await expect(page.getByText('Alex serving',{exact:true})).toBeVisible();
    await page.getByTestId('tab-history').click();await expect(page.getByText('Jamie served · out of turn',{exact:true})).toBeVisible();
    await page.getByTestId('tab-record').click();
    console.log('PASS Actual server survives reload, is flagged in history, and applies to one point');

    await page.clock.setFixedTime(new Date('2026-11-05T12:00:05Z'));
    await expect(matchClock).toHaveText('Playing time · 00:05');
    await button('Pause').click();await expect(button('Resume recording')).toBeVisible();
    await button('Match notes').click();await expect(matchNotesField).toHaveValue(initialMatchNotes);
    await matchNotesField.fill(matchNotes);await button('Save match notes').click();
    await expect(button('Save match notes')).toHaveCount(0);await expect(button('Resume recording')).toBeVisible();
    await button('Match details').click();
    await expect(page.getByRole('textbox',{name:'Tournament or group',exact:true})).toHaveValue('Club tournament');
    await page.getByRole('textbox',{name:'Tournament or group',exact:true}).fill('County Juniors');
    await page.getByRole('textbox',{name:'Date (YYYY-MM-DD)',exact:true}).fill('2026-11-04');
    await page.getByRole('textbox',{name:'Round',exact:true}).fill('Quarter-final');
    await page.getByRole('textbox',{name:'Venue',exact:true}).fill('Riverside Club');
    const surfaces=page.getByText('Surface',{exact:true}).locator('..');
    for(const name of ['Artificial clay','Artificial grass (astro turf)','Acrylic','Tarmac'])await expect(surfaces.getByRole('button',{name,exact:true})).toBeVisible();
    for(const name of ['Hard','Unknown'])await expect(surfaces.getByRole('button',{name,exact:true})).toHaveCount(0);
    await choose('Surface','Artificial clay');
    await expect(button('Indoor')).toHaveAttribute('aria-pressed','false');
    await button('Indoor').click();await expect(button('Indoor')).toHaveAttribute('aria-pressed','true');
    await button('Outdoor').click();await expect(button('Indoor')).toHaveAttribute('aria-pressed','false');
    await button('Outdoor').click();await expect(button('Outdoor')).toHaveAttribute('aria-pressed','false');
    await button('Outdoor').click();
    await page.getByRole('textbox',{name:'Conditions',exact:true}).fill('Windy');
    await button('Save match details').click();await expect(button('Save match details')).toHaveCount(0);
    await page.reload({waitUntil:'domcontentloaded'});await expect(button('Resume recording')).toBeVisible();
    await expect(page.getByText('County Juniors',{exact:true})).toBeVisible();await points('15','0');
    await page.clock.setFixedTime(new Date('2026-11-05T12:00:20Z'));
    await expect(matchClock).toHaveText('Playing time · 00:05');
    const pausedMatch=page.getByRole('button',{name:/^Alex vs Jamie, Paused,/});
    await page.getByTestId('back-to-matches').click();await pausedMatch.click();
    await expect(button('Resume match')).toBeVisible();await button('Open report').click();
    await expect(page.getByRole('heading',{name:'Match report',exact:true})).toBeVisible();
    await expect(matchClock).toHaveText('Playing time · 00:05');
    await page.getByTestId('back-to-matches').click();await pausedMatch.click();
    await button('Resume match').click();await expect(page.getByTestId('point-winner-0')).toBeVisible();await points('15','0');
    await page.clock.setFixedTime(new Date('2026-11-05T12:00:23Z'));
    await expect(matchClock).toHaveText('Playing time · 00:08');

    await button('Add notes').click();await expect(page.getByText('Recorded outcome',{exact:true})).toHaveCount(0);
    const pointNotesField=page.getByRole('textbox',{name:'Notes',exact:true});
    const collapsedNotesHeight=(await pointNotesField.boundingBox()).height;
    await pointNotesField.focus();
    await expect.poll(async()=>(await pointNotesField.boundingBox()).height).toBeGreaterThan(collapsedNotesHeight);
    const focusedNotesHeight=(await pointNotesField.boundingBox()).height;
    await pointNotesField.fill('One\nTwo\nThree\nFour\nFive');
    await expect.poll(async()=>(await pointNotesField.boundingBox()).height).toBeGreaterThan(focusedNotesHeight);
    await button('Long rally (est. over 15 shots)').click();await button('Call was disputed').click();
    const attribution=page.getByText('Call made by',{exact:true}).locator('..').getByRole('button');
    await expect(attribution).toHaveCount(3);
    for(const option of await attribution.all())await expect(option).toHaveAttribute('aria-pressed','false');
    await choose('Call made by','Jamie');await choose('Call made by','Jamie');
    await expect(attribution.nth(1)).toHaveAttribute('aria-pressed','false');
    await choose('Call made by','Jamie');await pointNotesField.fill('Winner after a long rally');
    await page.getByTestId('save-point-notes').click();await expect(button('Save notes')).toHaveCount(0);
    await noPointSaved();
    await expect(page.getByText('Winner · Forehand',{exact:true})).toBeVisible();await points('15','0');
    await button('Edit point').click();await expect(page.getByRole('textbox',{name:'Notes',exact:true})).toHaveCount(0);
    await choose('Stroke','Backhand');
    await page.getByText('Outcome and stroke',{exact:true}).locator('..').getByRole('button',{name:'Definitions',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Outcome definitions',exact:true})).toBeVisible();await button('Done').click();
    await page.getByTestId('save-point-details').click();await expect(button('Save changes')).toHaveCount(0);
    await noPointSaved();
    await expect(page.getByText('Winner · Backhand',{exact:true})).toBeVisible();
    await page.getByTestId('tab-report').click();
    await expect(page.getByTestId('tab-record')).toBeEnabled();
    await expect(page.getByTestId('undo')).toBeEnabled();
    await expect(page.getByText(matchNotes,{exact:true})).toBeVisible();
    await button('View notable points (1)').click();
    await expect(page.getByTestId('report-points-notable')).toHaveAttribute('aria-pressed','true');
    const firstNote=reportPoint(1);
    await expect(firstNote.getByText('0–0 0–0',{exact:true})).toBeVisible();
    await expect(firstNote.getByText('Alex · Winner · Backhand',{exact:true})).toBeVisible();
    await expect(firstNote.getByText('Winner after a long rally',{exact:true})).toBeVisible();
    await expect(firstNote.getByRole('button',{name:'Edit point',exact:true})).toBeEnabled();
    await page.reload({waitUntil:'domcontentloaded'});await expect(button('Edit notes')).toBeVisible();await points('15','0');await noPointSaved();
    await page.getByTestId('tab-report').click();await button('Edit match notes').click();
    await expect(matchNotesField).toHaveValue(matchNotes);await button('Cancel').click();
    await page.getByTestId('tab-record').click();
    await page.getByTestId('undo').click();await idle();await expect(page.getByText('Winner · Forehand',{exact:true})).toBeVisible();await expect(button('Edit notes')).toBeVisible();await noPointSaved();
    await page.getByTestId('undo').click();await idle();await expect(button('Add notes')).toBeVisible();await noPointSaved();
    await record(0,'unforced-error','backhand');await points('15','15');
    await pointSaved('15–15','Set 1 · Games 0–0',1);
    const firstConfirmationAt=performance.now();
    await page.waitForTimeout(800);
    await context.setOffline(true);await record(1,'forced-error','volley');await points('30','15');await context.setOffline(false);
    await pointSaved('30–15','Set 1 · Games 0–0',0);
    const priorTimerDelay=Math.max(0,1550-(performance.now()-firstConfirmationAt));
    if(priorTimerDelay)await page.waitForTimeout(priorTimerDelay);
    await pointSaved('30–15','Set 1 · Games 0–0',0);
    console.log('PASS Point details, app reload, undo of edits, and recording without a network');

    // Each common stroke commits directly from its outcome row. Undo keeps the report fixture intact.
    const endingLabels={winner:'Winner','unforced-error':'Unforced error','forced-error':'Forced error'};
    const shotLabels={forehand:'Forehand',backhand:'Backhand',volley:'Volley',other:'Other',unknown:'Not sure'};
    const previousSummary=winner=>page.getByText(`Previous point · ${winner===0?'Alex':'Jamie'}`,{exact:true}).locator('..');
    const undoTemporaryPoint=async()=>{await page.getByTestId('undo').click();await points('30','15');await noPointSaved();};
    for(const [endingIndex,type] of ['winner','unforced-error','forced-error'].entries()){
      for(const [shotIndex,shot] of ['forehand','backhand','volley'].entries()){
        const actor=(endingIndex+shotIndex)%2,winner=type==='winner'?actor:1-actor;
        await record(actor,type,shot);
        await points(winner===0?'40':'30',winner===0?'15':'30');
        await expect(previousSummary(winner).getByText(`${endingLabels[type]} · ${shotLabels[shot]}`,{exact:true})).toBeVisible();
        await undoTemporaryPoint();
      }
    }
    for(const shot of ['other','unknown']){
      await record(0,'winner',shot);await points('40','15');
      await expect(previousSummary(0).getByText(`Winner · ${shotLabels[shot]}`,{exact:true})).toBeVisible();
      await undoTemporaryPoint();
    }
    await pickWinner(0);await button("I'm not sure how it ended").click();await points('40','15');
    await expect(previousSummary(0).getByText('Outcome only',{exact:true})).toBeVisible();
    await undoTemporaryPoint();
    for(const [type,winner,label] of [['winner',0,'Ace'],['unforced-error',1,'Double fault']]){
      await openMore(0,type);await rareShot('serve');
      await points(winner===0?'40':'30',winner===0?'15':'30');
      await expect(previousSummary(winner).getByText(`${label} · Serve`,{exact:true})).toBeVisible();
      await undoTemporaryPoint();
    }
    console.log('PASS Common shots save in one tap; rare, unknown and serve outcomes retain their distinct statistics');

    const recordingMode=page.getByTestId('recording-mode');
    await expect(button('Score, serve & last shot')).toHaveCount(0);
    await expect(recordingMode).toHaveText('Recording · Score & last shot');
    await recordingMode.click();await button('Score').click();
    await pickWinner(0);await points('40','15');await pointSaved('40–15','Set 1 · Games 0–0',0);
    await page.getByTestId('undo').click();await points('30','15');await noPointSaved();
    await recordingMode.click();await button('Score & last shot').click();await idle();
    await expect(recordingMode).toHaveText('Recording · Score & last shot');
    await recordingMode.scrollIntoViewIfNeeded();await expect(matchClock).toBeInViewport();
    await recordingMode.click();await expect(button('Score & last shot')).toBeVisible();
    await button('Cancel').click();await expect(button('Score, serve & last shot')).toHaveCount(0);
    await recordingMode.click();await button('Score, serve & last shot').click();await idle();
    await expect(recordingMode).toHaveText('Recording · Score, serve & last shot');
    await serviceQuestion('first-serve');await expect(page.getByTestId('service-let')).toBeVisible();
    await captureService('first-serve');
    await expect(page.getByTestId('first-in')).toHaveCSS('background-color','rgb(224, 242, 174)');
    await otherServer.click();await serviceQuestion('first-serve');
    await expect(page.getByTestId('first-in')).toHaveCSS('background-color','rgb(223, 235, 245)');
    await page.getByTestId('first-fault').click();await serviceQuestion('second-serve');
    await expect(page.getByTestId('second-in')).toHaveCSS('background-color','rgb(223, 235, 245)');
    await otherServer.click();await serviceQuestion('second-serve');
    await expect(page.getByTestId('second-in')).toHaveCSS('background-color','rgb(224, 242, 174)');
    await page.getByTestId('service-back').click();await serviceQuestion('first-serve');
    await page.getByTestId('skip-service-detail').click();await serviceQuestion('return-result');
    await expect(page.getByTestId('return-result-in')).toHaveCSS('background-color','rgb(223, 235, 245)');
    await page.reload({waitUntil:'domcontentloaded'});await serviceQuestion('return-result');await noPointSaved();
    await page.getByTestId('skip-service-detail').click();await serviceQuestion('point-ending');await points('30','15');
    await openMore(0,'winner');await rareShot('serve');await points('40','15');
    await expect(previousSummary(0).getByText('Ace · Serve',{exact:true})).toBeVisible();
    const observedChoice=(label,value)=>page.getByText('Serve and return',{exact:true}).locator('..')
      .getByText(label,{exact:true}).locator('..').getByRole('button',{name:value,exact:true});
    await button('Edit point').click();
    for(const label of ['First serve','Return result','Return stroke'])await expect(observedChoice(label,'Not sure')).toHaveAttribute('aria-pressed','true');
    await button('Cancel').click();await undoTemporaryPoint();

    await page.getByTestId('first-fault').click();await serviceQuestion('second-serve');
    await page.getByTestId('skip-service-detail').click();await serviceQuestion('return-result');
    await page.getByTestId('skip-service-detail').click();await serviceQuestion('point-ending');
    await pickWinner(0);await button("I'm not sure how it ended").click();await points('40','15');
    await button('Edit point').click();
    await expect(observedChoice('First serve','Fault')).toHaveAttribute('aria-pressed','true');
    for(const label of ['Second serve','Return result','Return stroke'])await expect(observedChoice(label,'Not sure')).toHaveAttribute('aria-pressed','true');
    await button('Cancel').click();await undoTemporaryPoint();

    // Back preserves the observation; answering an earlier question again clears stale later details.
    await page.getByTestId('first-fault').click();await serviceQuestion('second-serve');
    await page.getByTestId('second-in').click();await serviceQuestion('return-result');
    await captureService('return-result');
    await expect(page.getByTestId('service-let')).toHaveCount(0);
    await page.getByTestId('return-result-in').click();await serviceQuestion('return-stroke');
    await captureService('return-stroke');
    await expect(page.getByTestId('return-stroke-backhand')).toHaveCSS('background-color','rgb(223, 235, 245)');
    await page.getByTestId('return-stroke-backhand').click();await serviceQuestion('point-ending');
    await captureService('point-ending');
    await page.getByTestId('service-back').click();await serviceQuestion('return-stroke');
    await page.getByTestId('service-back').click();await serviceQuestion('return-result');
    await page.getByTestId('skip-service-detail').click();await serviceQuestion('point-ending');
    await page.getByTestId('service-back').click();await serviceQuestion('return-result');
    await page.getByTestId('skip-service-detail').click();await serviceQuestion('point-ending');
    await pickWinner(0);await button("I'm not sure how it ended").click();await points('40','15');
    await button('Edit point').click();
    await expect(observedChoice('First serve','Fault')).toHaveAttribute('aria-pressed','true');
    await expect(observedChoice('Second serve','In')).toHaveAttribute('aria-pressed','true');
    for(const label of ['Return result','Return stroke'])await expect(observedChoice(label,'Not sure')).toHaveAttribute('aria-pressed','true');
    await button('Cancel').click();await undoTemporaryPoint();

    await page.getByTestId('first-fault').click();await serviceQuestion('second-serve');
    await page.getByTestId('second-in').click();await serviceQuestion('return-result');
    await page.getByTestId('return-result-in').click();await serviceQuestion('return-stroke');
    await page.reload({waitUntil:'domcontentloaded'});await serviceQuestion('return-stroke');await points('30','15');await noPointSaved();
    await page.getByTestId('return-stroke-backhand').click();await serviceQuestion('point-ending');
    await openMore(0,'unforced-error');await expect(page.getByTestId('stroke-serve')).toHaveCount(0);await points('30','15');await closeMore();
    await expect(page.getByText('Jamie won the point',{exact:true})).toBeVisible();await button('Change winner').click();
    await record(1,'unforced-error','backhand');await points('40','15');
    await button('Edit point').click();await choose('Player playing the final shot','Alex');
    const editStroke=page.getByText('Stroke',{exact:true}).locator('..');
    await expect(editStroke.getByRole('button',{name:'Serve',exact:true})).toHaveCount(0);
    await choose('Ending','Winner');await choose('Stroke','Serve');await choose('Ending','Unforced error');
    await button('Save changes').click();await expect(page.getByRole('alert').filter({hasText:'marked In'})).toBeVisible();await noPointSaved();
    await button('Cancel').click();await points('40','15');
    await openMore(0,'winner');await page.reload({waitUntil:'domcontentloaded'});await expect(moreHeading()).toBeVisible();await points('40','15');await closeMore();await directShot(0,'winner','forehand');await points('0','0');
    await pointSaved('1–0','Game to Alex · Set 1',0,'Next game');
    await page.screenshot({path:path.join(output,'tennis-android-recording.png'),fullPage:true});
    console.log('PASS Guided serve/return entry gates each question, preserves skipped drafts, clears rerecorded dependents and follows actual player colours');

    await serviceQuestion('first-serve');await expect(page.getByTestId('serve-ace')).toBeVisible();
    await expect(page.getByTestId('second-double-fault')).toHaveCount(0);
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.getByTestId('serve-ace').click();await points('0','15');
    await pointSaved('0–15','Set 1 · Games 1–0',1);
    await expect(page.getByTestId('point-saved-confirmation')).toHaveCount(0,{timeout:3000});
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.getByTestId('first-fault').click();await serviceQuestion('second-serve');
    await expect(page.getByTestId('serve-ace')).toBeVisible();await expect(page.getByTestId('second-double-fault')).toBeVisible();
    await page.getByTestId('serve-ace').click();await points('0','30');
    await page.getByTestId('first-fault').click();await serviceQuestion('second-serve');
    await page.getByTestId('second-double-fault').click();await points('15','30');
    await pointSaved('15–30','Set 1 · Games 1–0',0);
    await page.getByTestId('first-in').click();await serviceQuestion('return-result');
    await expect(page.getByTestId('second-double-fault')).toHaveCount(0);await expect(page.getByTestId('service-let')).toHaveCount(0);
    await page.getByTestId('skip-service-detail').click();await serviceQuestion('point-ending');
    await openMore(1,'forced-error');await expect(page.getByTestId('stroke-serve')).toHaveCount(0);await points('15','30');await closeMore();
    await button('Change winner').click();
    await openMore(1,'winner');await expect(page.getByTestId('stroke-serve')).toHaveCount(0);await closeMore();
    await button('Change winner').click();
    await page.getByTestId('service-back').click();await serviceQuestion('return-result');
    await page.getByTestId('service-back').click();await serviceQuestion('first-serve');
    await page.getByTestId('first-fault').click();await serviceQuestion('second-serve');
    await page.getByTestId('second-in').click();await serviceQuestion('return-result');
    await page.getByTestId('return-result-in').click();await serviceQuestion('return-stroke');
    await page.getByTestId('return-stroke-backhand').click();await serviceQuestion('point-ending');
    for(const step of ['return-stroke','return-result','second-serve','first-serve']){
      await page.getByTestId('service-back').click();await serviceQuestion(step);
    }
    await page.getByTestId('serve-ace').click();await points('15','40');
    await button('Edit point').click();
    await expect(observedChoice('First serve','In')).toHaveAttribute('aria-pressed','true');
    await expect(page.getByText('Serve and return',{exact:true}).locator('..').getByText('Second serve',{exact:true})).toHaveCount(0);
    for(const label of ['Return result','Return stroke'])await expect(observedChoice(label,'Not sure')).toHaveAttribute('aria-pressed','true');
    await button('Cancel').click();
    console.log('PASS Detailed mode records aces and double faults, and an in serve cannot end as a serve error');

    const generalEnding=page.getByText('Who won the point?',{exact:true});
    await page.getByTestId('first-in').click();await serviceQuestion('return-result');
    await page.getByTestId('return-result-error').click();await serviceQuestion('return-stroke');
    await expect(page.getByText('Alex missed the return',{exact:true})).toHaveCount(0);
    await page.getByTestId('return-stroke-backhand').click();await serviceQuestion('point-ending',true);
    await captureService('point-ending',true);
    await expect(page.getByText('Alex missed the return',{exact:true})).toBeVisible();
    await button('Definitions').click();await expect(page.getByRole('heading',{name:'Outcome definitions',exact:true})).toBeVisible();
    await button('Done').click();await expect(page.getByText('Alex missed the return',{exact:true})).toBeVisible();
    await expect(button("I'm not sure how it ended")).toHaveCount(0);
    await page.getByTestId('service-back').click();await serviceQuestion('return-stroke');
    await page.getByTestId('service-back').click();await serviceQuestion('return-result');
    await page.getByTestId('return-result-in').click();await serviceQuestion('return-stroke');
    await page.getByTestId('skip-service-detail').click();await serviceQuestion('point-ending');await expect(generalEnding).toBeVisible();
    await page.getByTestId('service-back').click();await serviceQuestion('return-stroke');
    await page.getByTestId('service-back').click();await serviceQuestion('return-result');
    await page.getByTestId('return-result-error').click();await serviceQuestion('return-stroke');
    await page.getByTestId('return-stroke-backhand').click();await serviceQuestion('point-ending',true);
    await button('Forced error').click();await points('0','0');
    await otherServer.click();await page.getByTestId('first-in').click();await serviceQuestion('return-result');
    await page.getByTestId('return-result-error').click();await serviceQuestion('return-stroke');
    await page.getByTestId('skip-service-detail').click();await serviceQuestion('point-ending',true);
    await expect(page.getByText('Alex missed the return',{exact:true})).toBeVisible();
    await page.reload({waitUntil:'domcontentloaded'});await serviceQuestion('point-ending',true);
    await expect(page.getByText('Alex missed the return',{exact:true})).toBeVisible();
    await expect(generalEnding).toHaveCount(0);await button('Unforced error').click();await points('0','15');
    await otherServer.click();await page.getByTestId('first-in').click();await serviceQuestion('return-result');
    await page.getByTestId('return-result-error').click();await serviceQuestion('return-stroke');
    await page.getByTestId('return-stroke-forehand').click();await serviceQuestion('point-ending',true);
    await button('Not sure which error').click();await points('0','30');
    await expect(page.getByText('Previous point · Jamie',{exact:true}).locator('..').getByText('Outcome only',{exact:true})).toBeVisible();
    await page.getByTestId('undo').click();await points('0','15');
    console.log('PASS Missed-return classification follows stroke entry, restores explicit unknown answers and awards the actual server');

    await button('Add notes').click();
    await expect(button('Not noted')).toHaveCount(0);
    const longRally=button('Long rally (est. over 15 shots)');
    await expect(longRally).toHaveAttribute('aria-pressed','false');
    await longRally.click();await expect(longRally).toHaveAttribute('aria-pressed','true');
    await longRally.click();await expect(longRally).toHaveAttribute('aria-pressed','false');
    await longRally.click();
    await button('Very long rally (est. over 25 shots)').click();
    await choose('Call made by','Official');
    await button('Call was disputed').click();
    await button('Call was incorrect').click();
    await expect(button('Call was disputed')).toHaveAttribute('aria-pressed','true');
    await expect(button('Call was incorrect')).toHaveAttribute('aria-pressed','true');
    const tired=button('Alex · Looks tired');
    const mindset=page.getByRole('button',{name:/^Mindset, effort and resilience/});
    await expect(mindset).toHaveAttribute('aria-expanded','false');
    await expect(tired).toHaveCount(0);
    await mindset.click();
    await expect(mindset).toHaveAttribute('aria-expanded','true');
    const saveNotes=page.getByTestId('save-point-notes');
    await expect(saveNotes).toBeInViewport({ratio:1});
    const saveNotesY=(await saveNotes.boundingBox()).y;
    await expect(page.getByText('Positive',{exact:true})).toBeVisible();
    await expect(page.getByText('Negative',{exact:true})).toBeVisible();
    await button('Alex · Great effort').click();
    await button('Jamie · Uses calming techniques').click();
    await expect(tired).toHaveAttribute('aria-pressed','false');
    await tired.click();await expect(tired).toHaveAttribute('aria-pressed','true');
    await tired.click();await expect(tired).toHaveAttribute('aria-pressed','false');
    await tired.click();
    await button('Jamie · Bad body language').click();
    await expect.poll(()=>page.getByTestId('point-notes-scroll').evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
    await expect(saveNotes).toBeInViewport({ratio:1});
    assert.equal((await saveNotes.boundingBox()).y,saveNotesY);
    await expect(mindset).toContainText('4 observations marked');
    await saveNotes.click();await expect(button('Save notes')).toHaveCount(0);await points('0','15');

    const alexStakes=page.getByTestId('point-stakes-0');
    const jamieStakes=page.getByTestId('point-stakes-1');
    await correction([3,3],[6,6]);await points('6','6');
    await expect(alexStakes).toHaveCount(0);await expect(jamieStakes).toHaveCount(0);
    await record(0,'winner','forehand');await points('7','6');await expect(alexStakes).toHaveText('Alex · Set point');
    await pointSaved('7–6','Set 1 · Tie-break at 3–3',0);
    await record(0,'winner','overhead');await points('0','0');
    await pointSaved('4–3[6]','Set 1 to Alex',0,'Next set');
    await correction([0,3],[0,3]);await expect(jamieStakes).toHaveText('Jamie · Set point');
    await otherServer.click();await expect(jamieStakes).toHaveText('Jamie · Set point · Break point');
    await otherServer.click();await expect(jamieStakes).toHaveText('Jamie · Set point');
    await record(1,'winner','forehand');await points('0','0');
    await pointSaved('0–4','Set 2 to Jamie',1,'Match tie-break next');
    // The deciding match tie-break has no game fields.
    await button('Correct score').click();await page.getByRole('textbox',{name:'Alex points',exact:true}).fill('9');await page.getByRole('textbox',{name:'Jamie points',exact:true}).fill('9');await choose('Next server','Alex');await page.getByTestId('apply-correction').click();await idle();await points('9','9');
    await expect(alexStakes).toHaveCount(0);await expect(jamieStakes).toHaveCount(0);
    await record(0,'winner','forehand');await points('10','9');
    await pointSaved('10–9','Match tie-break',0);
    await expect(alexStakes).toHaveText('Alex · Match point');
    const tieBreakNoteText='Stayed composed at nine all.';
    await button('Add notes').click();await pointNotesField.fill(tieBreakNoteText);
    await page.getByTestId('save-point-notes').click();await expect(button('Save notes')).toHaveCount(0);
    await page.clock.setFixedTime(new Date('2026-11-05T12:01:00Z'));
    await record(0,'winner','overhead');await points('11','9');await expect(page.getByText('Alex wins',{exact:true}).first()).toBeVisible();
    await pointSaved(/^4–3\[6\]\s+0–4\s+11–9$/,'Alex wins',0,'Match complete');
    await expect(page.getByTestId('point-saved-confirmation')).toHaveCount(0,{timeout:3000});
    console.log('PASS Saved-point confirmation follows persisted scores, boundaries, rapid input and reduced motion');
    await expect(alexStakes).toHaveCount(0);
    await page.clock.setFixedTime(new Date('2026-11-05T12:01:12Z'));
    await expect(matchClock).toHaveText('Playing time · 00:45');
    await expect(page.getByTestId('tab-report')).toHaveAttribute('aria-pressed','true');
    await expect(page.getByTestId('tab-record')).toHaveCount(0);
    await expect(button('Undo last action')).toHaveCount(0);
    await expect(button('Edit point')).toHaveCount(0);
    await page.getByTestId('tab-history').click();
    await expect(page.getByRole('heading',{name:'Point history',exact:true})).toBeVisible();
    await expect(page.getByTestId('tab-record')).toHaveCount(0);
    await expect(button('Undo last action')).toHaveCount(0);
    await expect(button('Edit point')).toHaveCount(0);
    await page.getByTestId('tab-report').click();
    await expect(page.getByText('Playing time 45s',{exact:true})).toBeVisible();
    await expect(page.getByTestId('score-1-0')).toHaveText('3[6]');
    await expect(page.getByTestId('score-0-2')).toHaveText('11');
    await expect(page.getByTestId('score-1-2')).toHaveText('9');
    const pressureRow=label=>page.getByText(label,{exact:true}).locator('..');
    await expect(pressureRow('Set points · Own chances').getByText('1 won · 0 lost',{exact:true})).toHaveCount(2);
    await expect(pressureRow('Match points · Own chances').getByText('1 won · 0 lost',{exact:true})).toBeVisible();
    await expect(pressureRow('Match points · Faced').getByText('0 saved · 1 lost',{exact:true})).toBeVisible();
    await expect(page.getByText('Paused 15s',{exact:true})).toBeVisible();
    await expect(page.getByText('County Juniors · Quarter-final · Riverside Club · Artificial clay · Outdoor · Windy',{exact:true})).toBeVisible();
    await button('Match details').click();await expect(page.getByRole('textbox',{name:'Date (YYYY-MM-DD)',exact:true})).toHaveValue('2026-11-04');
    await expect(button('Outdoor')).toHaveAttribute('aria-pressed','true');await button('Cancel').click();
    await expect(shotStat('Jamie','Serve','Winners',3)).toBeVisible();
    await expect(shotStat('Jamie','Serve','Unforced errors',1)).toBeVisible();
    await expect(shotStat('Jamie','Serve','Forced errors',0)).toBeVisible();
    await expect(page.getByText('Long rally (est. over 15 shots) · 0',{exact:true})).toBeVisible();
    await expect(page.getByText('Very long rally (est. over 25 shots) · 1',{exact:true})).toBeVisible();
    await expect(page.getByText('Looks tired · Alex 1 · Jamie 0',{exact:true})).toBeVisible();
    await expect(page.getByText('Great effort · Alex 1 · Jamie 0',{exact:true})).toBeVisible();
    await expect(page.getByText('Uses calming techniques · Alex 0 · Jamie 1',{exact:true})).toBeVisible();
    await expect(page.getByText('Bad body language · Alex 0 · Jamie 1',{exact:true})).toBeVisible();
    for(const title of ['Disputed calls','Incorrect calls']){
      await expect(page.getByText(title,{exact:true}).locator('..').getByText('Official · 1',{exact:true})).toBeVisible();
    }
    await expect(page.getByText(matchNotes,{exact:true})).toBeVisible();
    await page.screenshot({path:path.join(output,'tennis-android-report.png'),fullPage:true});
    console.log('PASS Set tie-break, second set, deciding match tie-break, and two-clear completion');

    await button('View notable points (2)').click();
    await expect(reportSection('points')).toHaveAttribute('aria-pressed','true');
    await expect(page.getByTestId('report-points-notable')).toHaveAttribute('aria-pressed','true');
    await expect(reportStage(0)).toHaveAccessibleName('Set 1, 4–3[6]');
    await expect(reportPoint(11).getByText('Call was disputed and incorrect · Call by Official',{exact:true})).toBeVisible();
    await expect(reportPoint(1)).toHaveCount(0);
    await page.getByTestId('report-points-all').click();
    await expect(reportPoint(1).getByText('0–0 0–0',{exact:true})).toBeVisible();
    await expect(reportPoint(1).getByLabel('Alex won the point',{exact:true})).toHaveText('W');
    await expect(reportPoint(12).getByText('3–3 6–6',{exact:true})).toBeVisible();

    await reportStage(1).click();
    await expect(reportStage(1)).toHaveAttribute('aria-pressed','true');
    await expect(reportPoint(12)).toHaveCount(0);
    await expect(reportPoint(14).getByText('0–3 0–40',{exact:true})).toBeVisible();
    await expect(reportPoint(14).getByLabel('Alex lost the point',{exact:true})).toHaveText('L');
    const stageStats=page.getByTestId('report-stage-stats');
    await stageStats.click();
    await expect(reportPoint(14)).toHaveCount(0);
    await expect(page.getByText('Set 2 stats',{exact:true})).toBeVisible();
    await expect(shotStat('Jamie','Forehand','Winners',1)).toBeVisible();
    await expect(shotStat('Alex','Forehand','Winners',0)).toBeVisible();
    await expect(shotStat('Jamie','Serve','Winners',3)).toHaveCount(0);

    await reportStage(2).click();
    await expect(reportStage(2)).toHaveAccessibleName('Match tie-break, 11–9');
    await expect(page.getByText('Match tie-break stats',{exact:true})).toBeVisible();
    await expect(shotStat('Alex','Overhead','Winners',1)).toBeVisible();
    await expect(shotStat('Jamie','Forehand','Winners',0)).toBeVisible();
    await stageStats.click();
    await expect(reportPoint(16).getByText('10–9',{exact:true})).toBeVisible();
    await page.getByTestId('report-points-notable').click();
    await expect(reportPoint(16)).toHaveCount(0);
    const tieBreakNote=reportPoint(15);
    await expect(tieBreakNote.getByText('9–9',{exact:true})).toBeVisible();
    await expect(tieBreakNote.getByText('Alex · Winner · Forehand',{exact:true})).toBeVisible();
    await expect(tieBreakNote.getByRole('button',{name:'Edit point',exact:true})).toHaveCount(0);
    await tieBreakNote.getByRole('button',{name:'Edit notes',exact:true}).click();
    await expect(pointNotesField).toHaveValue(tieBreakNoteText);
    const editedTieBreakNote=`${tieBreakNoteText} Reset after the point.`;
    await pointNotesField.fill(editedTieBreakNote);
    await page.getByTestId('save-point-notes').click();
    await expect(button('Save notes')).toHaveCount(0);
    await expect(tieBreakNote.getByText(editedTieBreakNote,{exact:true})).toBeVisible();
    console.log('PASS Match report stages, pre-point scores, win/loss, stroke stats, and finished-match notes');

    const pdfHeading=page.getByRole('heading',{name:'Export match PDF',exact:true});
    for(const [variant,choice] of [['summary',/^Stats summary\./],['point-by-point',/^Point-by-point\./],['combined',/^Combined report\./]]){
      await button('PDF report').click();await expect(pdfHeading).toBeVisible();
      const [pdf]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:choice}).click()]);
      assert.ok(pdf.suggestedFilename().endsWith(`-${variant}.pdf`));
      const pdfPath=path.join(output,`tennis-app-report-${variant}.pdf`);await pdf.saveAs(pdfPath);
      const pdfBytes=fs.readFileSync(pdfPath);assert.equal(pdfBytes.subarray(0,4).toString(),'%PDF');assert.ok(pdfBytes.length>1000);
      await expect(pdfHeading).toHaveCount(0);
    }
    console.log('PASS All three report formats generate downloadable PDFs from local records');

    await reportSection('overview').click();
    const csvDownload=page.waitForEvent('download');await button('Export points CSV').click();const csv=await csvDownload;await csv.saveAs(path.join(output,'tennis-points-test.csv'));
    const exportedPoints=fs.readFileSync(path.join(output,'tennis-points-test.csv'),'utf8');
    assert.match(exportedPoints,/Forehand/);
    assert.match(exportedPoints,/"Jamie","Jamie","Jamie","Ace","Serve","in","unknown"/);
    assert.match(exportedPoints,/"Jamie","Jamie","Jamie","Ace","Serve","fault","in"/);
    assert.match(exportedPoints,/"Jamie","Alex","Jamie","Double fault","Serve","fault","fault"/);
    assert.match(exportedPoints,/"Jamie","Jamie","Alex","Forced error","Backhand","in","unknown","backhand","error"/);
    assert.match(exportedPoints,/"Jamie","Jamie","Alex","Unforced error","Not sure","in","unknown","unknown","error"/);
    assert.match(exportedPoints,/"true","official","","Very long rally \(est\. over 25 shots\)","","Great effort \| Looks tired","Uses calming techniques \| Bad body language","true"/);
    await page.getByTestId('back-to-matches').click();await expect(page.getByText('Your tennis notebook',{exact:true})).toBeVisible();
    await button('Add match to event').click();await button('County Juniors · 2026-11-04').click();
    await expect(page.getByText('Adding to County Juniors',{exact:true})).toBeVisible();
    await expect(page.getByRole('textbox',{name:'Venue',exact:true})).toHaveValue('Riverside Club');
    await expect(page.getByRole('textbox',{name:'Conditions',exact:true})).toHaveValue('Windy');
    await expect(page.getByRole('textbox',{name:'Round',exact:true})).toHaveValue('');
    await expect(page.getByRole('textbox',{name:'Date (YYYY-MM-DD)',exact:true})).toHaveValue('2026-11-05');
    await expect(button('Outdoor')).toHaveAttribute('aria-pressed','true');
    await expect(page.getByTestId('fast4-match-tiebreak')).toHaveAttribute('aria-pressed','true');
    await expect(page.getByTestId('recording-depth-detailed')).toHaveAttribute('aria-pressed','true');
    await page.getByTestId('opponent-name').fill('Taylor');await page.getByTestId('normal-match-tiebreak').click();
    await page.getByTestId('recording-depth-endings').click();
    await page.getByTestId('save-match').click();await openStart('Taylor');await confirmStart();
    await record(0,'unforced-error','backhand');await points('0','15');
    await pickWinner(0);await button("I'm not sure how it ended").click();await points('15','15');
    await page.getByTestId('tab-history').click();await expect(page.getByText('Ending not recorded',{exact:true})).toBeVisible();
    await page.getByTestId('back-to-matches').click();
    await expect(page.getByText('2026-11-04 to 2026-11-05',{exact:true})).toBeVisible();
    await button('Event performance').click();await expect(button('Event · County Juniors')).toBeVisible();
    await expect(pressureRow('Match points · Own chances').getByText('1 won · 0 lost',{exact:true})).toBeVisible();
    await expect(page.getByText('2 matches · 18 recorded points',{exact:true})).toBeVisible();
    await expect(page.getByText('1 won · 0 lost · 1 without a result',{exact:true})).toBeVisible();
    const playerPDFDownload=page.waitForEvent('download');await button('Export player PDF').click();
    await (await playerPDFDownload).saveAs(path.join(output,'tennis-player-performance.pdf'));
    await page.getByTestId('back-to-matches').click();

    await page.getByTestId('new-match').click();await page.getByTestId('opponent-name').fill('Sam');
    await expect(page.getByTestId('fast4-single')).toHaveAttribute('aria-pressed','true');
    await expect(page.getByTestId('recording-depth-endings')).toHaveAttribute('aria-pressed','true');
    await setupSectionOrder();
    await page.getByRole('textbox',{name:'Tournament or group',exact:true}).fill('County Juniors');
    await button('Date, event and conditions').click();
    await page.getByRole('textbox',{name:'Date (YYYY-MM-DD)',exact:true}).fill('2026-10-04');
    await page.getByTestId('save-match').click();await openStart('Sam');await confirmStart();
    await record(0,'winner','forehand');await points('15','0');
    await page.getByTestId('back-to-matches').click();
    await button('Player performance').click();
    await expect(page.getByText('3 matches · 19 recorded points',{exact:true})).toBeVisible();
    await choose('Period','Last month');await expect(page.getByText('2 matches · 18 recorded points',{exact:true})).toBeVisible();
    await choose('Period','Last 3 months');await expect(page.getByText('3 matches · 19 recorded points',{exact:true})).toBeVisible();
    await choose('Period','Custom period');
    await page.getByRole('textbox',{name:'From (YYYY-MM-DD)',exact:true}).fill('2026-10-04');
    await page.getByRole('textbox',{name:'To (YYYY-MM-DD)',exact:true}).fill('2026-10-04');
    await expect(page.getByText('1 match · 1 recorded point',{exact:true})).toBeVisible();
    await button('Event · All events').click();await button('County Juniors · 2026-11-04 to 2026-11-05').click();
    await expect(page.getByText('No matches for this player in the selected event and period.',{exact:true})).toBeVisible();
    await page.getByTestId('back-to-matches').click();
    console.log('PASS Event reuse copies context, and event and date filters scope the player report and PDF');

    await expect(button('Back up all records')).toHaveCount(0);await expect(button('Restore backup')).toHaveCount(0);
    await button('Settings').click();await expect(page.getByRole('heading',{name:'Settings',exact:true})).toBeVisible();
    const download=page.waitForEvent('download');await button('Back up all records').click();const file=await download;const backupPath=path.join(output,'tennis-app-backup.json');await file.saveAs(backupPath);const backup=JSON.parse(fs.readFileSync(backupPath,'utf8'));assert.equal(backup.matches.length,3);assert.equal(backup.players.length,1);
    const [jamie,taylor,sam]=['Jamie','Taylor','Sam'].map(name=>backup.matches.find(match=>match.players[1].name===name));
    assert.equal(jamie.eventId,taylor.eventId);assert.notEqual(sam.eventId,jamie.eventId);
    assert.equal(taylor.surface,'Artificial clay');assert.equal(taylor.courtSetting,'Outdoor');
    assert.equal(jamie.matchNotes,matchNotes);assert.equal(taylor.matchNotes,undefined);
    console.log('PASS Separate events with the same name survive backup with their own identities');

    await context.close();context=await browser.newContext({viewport:{width:412,height:915},acceptDownloads:true});page=await context.newPage();wire();await page.goto(base,{waitUntil:'domcontentloaded'});await expect(page.getByText('Your tennis notebook',{exact:true})).toBeVisible();
    await button('Settings').click();const chooser=page.waitForEvent('filechooser');await button('Restore backup').click();await (await chooser).setFiles(backupPath);await expect(page.getByText('1 new players and 3 new matches.',{exact:true})).toBeVisible();await button('Import new records').click();await expect(page.getByText('Restored 3 matches. Existing records were kept.',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:/^Alex vs Jamie, Completed,/}).click();
    await expect(page.getByRole('heading',{name:'Match report',exact:true})).toBeVisible();await points('11','9');
    await expect(page.getByText(matchNotes,{exact:true})).toBeVisible();
    await page.setViewportSize({width:320,height:915});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await reportSection('points').click();await reportStage(2).click();
    await expect(reportPoint(15).getByText(editedTieBreakNote,{exact:true})).toBeVisible();
    await page.getByTestId('report-stage-stats').click();
    await expect(shotStat('Alex','Overhead','Winners',1)).toBeVisible();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.getByTestId('back-to-matches').click();await button('Settings').click();
    const chooserAgain=page.waitForEvent('filechooser');await button('Restore backup').click();await (await chooserAgain).setFiles(backupPath);await expect(page.getByText('0 new players and 0 new matches.',{exact:true})).toBeVisible();await expect(button('Import new records')).toBeDisabled();await button('Cancel').click();
    const taylorMatch=page.getByText('Alex vs Taylor',{exact:true});
    await page.getByRole('button',{name:/^Alex vs Taylor, In progress,/}).click();
    await expect(button('Match notes')).toBeInViewport();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await pickWinner(0);await expect(page.getByText('Last shot of the rally',{exact:true})).toBeVisible();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await button('Change winner').click();
    await button('Match details').click();await button('Delete match').click();
    await expect(page.getByRole('heading',{name:'Delete this match?',exact:true})).toBeVisible();
    await expect(page.getByRole('alert').filter({hasText:'This cannot be undone.'})).toBeVisible();
    await expect(taylorMatch).toBeVisible();
    await button('Keep match').click();await expect(button('Save match details')).toBeVisible();await points('15','15');
    await button('Delete match').click();await button('Delete permanently').click();
    await expect(page.getByText('Match deleted.',{exact:true})).toBeVisible();await expect(taylorMatch).toHaveCount(0);
    await page.reload({waitUntil:'domcontentloaded'});await expect(page.getByText('Your tennis notebook',{exact:true})).toBeVisible();
    await expect(taylorMatch).toHaveCount(0);await expect(page.getByText('Alex vs Jamie',{exact:true})).toBeVisible();
    await button('Player performance').click();await expect(page.getByText('2 matches · 17 recorded points',{exact:true})).toBeVisible();
    console.log('PASS Deletion requires confirmation, removes only the selected match, and updates player totals');

    await page.getByTestId('back-to-matches').click();
    const otherPlayer={id:'settings-other-player',name:'Jordan',createdAt:sam.createdAt};
    const otherMatch={...sam,id:'settings-other-match',revision:1,eventId:'event:settings-other',group:'Other player practice',
      players:[{id:otherPlayer.id,name:otherPlayer.name},{id:null,name:'Casey'}]};
    const otherBackup={...backup,players:[otherPlayer],matches:[otherMatch]};
    await button('Settings').click();
    const otherChooser=page.waitForEvent('filechooser');await button('Restore backup').click();
    await (await otherChooser).setFiles({name:'other-player.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(otherBackup))});
    await expect(page.getByText('1 new players and 1 new matches.',{exact:true})).toBeVisible();
    await button('Import new records').click();
    await expect(button('Jordan')).toBeVisible();
    await button('Alex').click();
    await button('Settings').click();await button('Rename Alex').click();
    const playerName=page.getByRole('textbox',{name:'Player name',exact:true});
    const renameHeading=page.getByRole('heading',{name:'Rename player',exact:true});
    await expect(renameHeading).toBeVisible();await expect(playerName).toHaveValue('Alex');
    await playerName.fill('Not saved');await button('Keep name').click();
    await expect(button('Rename Alex')).toBeVisible();
    await button('Rename Alex').click();await playerName.fill('Alexander');await button('Save name').click();
    await expect(renameHeading).toHaveCount(0);
    await expect(button('Rename Alexander')).toBeVisible();
    await expect(button('Delete Jordan')).toBeVisible();
    const settingsBackup=async()=>{
      const pending=page.waitForEvent('download');
      await button('Back up all records').click();
      return JSON.parse(fs.readFileSync(await (await pending).path(),'utf8'));
    };
    const renamedBackup=await settingsBackup();
    const renamedPlayer=renamedBackup.players.find(player=>player.id===backup.players[0].id);
    assert.equal(renamedPlayer.name,'Alexander');
    const renamedMatches=renamedBackup.matches.filter(match=>match.players[0].id===renamedPlayer.id);
    assert.equal(renamedMatches.length,2);
    for(const previous of [jamie,sam]){
      const renamed=renamedMatches.find(match=>match.id===previous.id);
      assert.equal(renamed.players[0].name,'Alexander');
      assert.equal(renamed.players[0].id,previous.players[0].id);
      assert.deepEqual(renamed.events,previous.events);
      assert.ok(renamed.revision>=2);
    }
    assert.deepEqual(renamedBackup.matches.find(match=>match.id===otherMatch.id),otherMatch);
    await expect(button('Alexander')).toHaveAttribute('aria-pressed','true');
    await expect(button('Alex')).toHaveCount(0);
    await expect(page.getByRole('button',{name:/^Alexander vs Jamie, Completed,/})).toBeVisible();
    await page.reload({waitUntil:'domcontentloaded'});
    await expect(button('Alexander')).toBeVisible();
    await page.getByRole('button',{name:/^Alexander vs Jamie, Completed,/}).click();
    await expect(page.getByRole('heading',{name:'Match report',exact:true})).toBeVisible();
    await expect(page.getByText('Alexander',{exact:true}).first()).toBeVisible();
    await expect(page.getByText('Looks tired · Alexander 1 · Jamie 0',{exact:true})).toBeVisible();
    await points('11','9');
    await page.getByTestId('back-to-matches').click();
    await button('Alexander').click();await button('Settings').click();await button('Delete Alexander').click();
    const deletePlayerHeading=page.getByRole('heading',{name:'Delete Alexander?',exact:true});
    await expect(deletePlayerHeading).toBeVisible();
    await expect(page.getByRole('alert').filter({hasText:/cannot be undone/i})).toBeVisible();
    await expect(page.getByText('2 saved matches',{exact:true})).toBeVisible();
    await expect(page.getByText('17 recorded points',{exact:true})).toBeVisible();
    await button('Keep player').click();
    await expect(button('Delete Alexander')).toBeVisible();
    await button('Done').click();
    await expect(page.getByRole('button',{name:/^Alexander vs Jamie, Completed,/})).toBeVisible();
    await expect(page.getByRole('button',{name:/^Alexander vs Sam, In progress,/})).toBeVisible();
    await button('Settings').click();await button('Delete Alexander').click();await button('Delete player & data').click();
    await expect(deletePlayerHeading).toHaveCount(0);
    await expect(button('Delete Alexander')).toHaveCount(0);await expect(button('Delete Jordan')).toBeVisible();
    await button('Done').click();
    await expect(button('All players')).toHaveAttribute('aria-pressed','true');
    await expect(button('Alexander')).toHaveCount(0);
    await expect(page.getByRole('button',{name:/^Alexander vs /})).toHaveCount(0);
    const jordanMatch=page.getByRole('button',{name:/^Jordan vs Casey, In progress,/});
    await expect(jordanMatch).toBeVisible();
    await button('Settings').click();const remainingBackup=await settingsBackup();
    assert.deepEqual(remainingBackup.players,[otherPlayer]);assert.deepEqual(remainingBackup.matches,[otherMatch]);
    await page.reload({waitUntil:'domcontentloaded'});await expect(jordanMatch).toBeVisible();
    await expect(page.getByTestId('tab-record')).toHaveCount(0);
    await button('Settings').click();await button('Delete Jordan').click();
    await expect(page.getByRole('heading',{name:'Delete Jordan?',exact:true})).toBeVisible();
    await button('Delete player & data').click();
    await expect(button('Delete Jordan')).toHaveCount(0);
    const emptyBackup=await settingsBackup();
    assert.deepEqual(emptyBackup.players,[]);assert.deepEqual(emptyBackup.matches,[]);
    await page.reload({waitUntil:'domcontentloaded'});
    await expect(button('Start recording your first match')).toBeVisible();
    await expect(button('Jordan')).toHaveCount(0);
    await button('Start recording your first match').click();
    await expect(page.getByTestId('new-player-name')).toHaveValue('');
    await expect(page.getByTestId('opponent-name')).toHaveValue('');
    console.log('PASS Settings player rename preserves history; confirmed deletion removes only owned data and resets the last-player empty state');

    // Separate imported fixtures exercise setup defaults and opponent edits without changing report totals above.
    await context.close();context=await browser.newContext({viewport:{width:390,height:915},acceptDownloads:true});page=await context.newPage();wire();
    await page.goto(base,{waitUntil:'domcontentloaded'});await expect(button('Start recording your first match')).toBeVisible();
    const regressionPlayer={...backup.players[0],id:'setup-opponent-regression-player'};
    const ownedPlayers=name=>[{id:regressionPlayer.id,name:regressionPlayer.name},{id:null,name}];
    const inheritanceCases=[
      {preset:'fast4-single',mode:'score',format:structuredClone(sam.format)},
      {preset:'fast4-match-tiebreak',mode:'endings',format:structuredClone(jamie.format)},
      {preset:'normal-match-tiebreak',mode:'detailed',format:structuredClone(taylor.format)},
    ].map((item,index)=>({...item,group:`Inherited defaults ${index+1}`,eventId:`event:defaults-${index+1}`}));
    inheritanceCases[0].format.stages[0].tieBreak.pointsToWin=5;
    for(const [index,item]of inheritanceCases.entries())item.format.name=`Event rules ${index+1}`;
    const unstartedFixture=(id,name,group,eventId,format,mode,date)=>({...sam,id,revision:1,players:ownedPlayers(name),
      group,eventId,date,format,mode,firstServer:null,timingStartedAt:null,events:[],draft:structuredClone(sam.draft),
      createdAt:`${date}T09:00:00.000Z`,updatedAt:`${date}T09:00:00.000Z`});
    const inheritanceFixtures=inheritanceCases.flatMap((item,index)=>[
      unstartedFixture(`defaults-old-${index}`,`Earlier opponent ${index}`,item.group,item.eventId,
        inheritanceCases[(index+1)%3].format,inheritanceCases[(index+1)%3].mode,'2026-11-08'),
      unstartedFixture(`defaults-latest-${index}`,`Latest opponent ${index}`,item.group,item.eventId,item.format,item.mode,'2026-11-09'),
    ]);
    const startedEvents=structuredClone(sam.events);
    const startedPoint=startedEvents.find(event=>event.type==='point');
    startedPoint.input.observations={...sam.draft.observations,...startedPoint.input.observations,notes:'Started rally note remains'};
    const editFixtures=[
      {...sam,id:'opponent-edit-started',revision:1,players:ownedPlayers('Started opponent'),eventId:'event:opponent-started',
        group:'Opponent edit started',events:startedEvents,matchNotes:'Started match note remains'},
      {...jamie,id:'opponent-edit-completed',revision:1,players:ownedPlayers('Completed opponent'),eventId:'event:opponent-completed',group:'Opponent edit completed'},
      {...unstartedFixture('opponent-edit-unstarted','Prepared opponent','Opponent edit prepared','event:opponent-prepared',sam.format,'endings','2026-11-09'),
        matchNotes:'Prepared match note remains'},
    ];
    const regressionBackup={...backup,players:[regressionPlayer],matches:[...inheritanceFixtures,...editFixtures]};
    await button('Settings').click();const importRegression=page.waitForEvent('filechooser');await button('Restore backup').click();
    await(await importRegression).setFiles({name:'setup-opponent-regression.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(regressionBackup))});
    await expect(page.getByText('1 new players and 9 new matches.',{exact:true})).toBeVisible();await button('Import new records').click();
    for(const [index,item]of inheritanceCases.entries()){
      await button('Add match to event').click();await button(`${item.group} · 2026-11-08 to 2026-11-09`).click();
      await expect(page.getByTestId(item.preset)).toHaveAttribute('aria-pressed','true');
      await expect(page.getByTestId(`recording-depth-${item.mode}`)).toHaveAttribute('aria-pressed','true');
      await expect(page.getByTestId('opponent-name')).toHaveValue('');
      await page.getByTestId('opponent-name').fill(`Inherited new opponent ${index}`);await page.getByTestId('save-match').click();
      await expect(page.getByRole('button',{name:`Alex vs Inherited new opponent ${index}, Not started`,exact:true})).toBeVisible();
    }
    await button('Settings').click();const inheritedBackup=await settingsBackup();
    for(const [index,item]of inheritanceCases.entries()){
      const saved=inheritedBackup.matches.find(match=>match.players[1].name===`Inherited new opponent ${index}`);
      assert.deepEqual(saved.format,item.format);assert.equal(saved.mode,item.mode);assert.equal(saved.eventId,item.eventId);
      assert.equal(saved.firstServer,null);assert.deepEqual(saved.events,[]);
    }
    await page.getByTestId('new-match').click();await setupSectionOrder();
    await expect(page.getByTestId('fast4-single')).toHaveAttribute('aria-pressed','true');
    await expect(page.getByTestId('recording-depth-endings')).toHaveAttribute('aria-pressed','true');
    await expect(page.getByRole('textbox',{name:'Tournament or group',exact:true})).toHaveValue('');
    await page.setViewportSize({width:320,height:915});
    const eventInput=page.getByRole('textbox',{name:'Tournament or group',exact:true});await eventInput.focus();
    await expect(eventInput).toBeFocused();await expect(eventInput).toBeInViewport({ratio:1});
    await button('Date, event and conditions').click();
    for(const label of ['Venue','Conditions']){
      const input=page.getByRole('textbox',{name:label,exact:true});await input.focus();
      await expect(input).toBeFocused();await expect(input).toBeInViewport({ratio:1});
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(output,'tennis-setup-context-focused-320.png'),fullPage:true});
    await page.getByTestId('back-to-matches').click();await page.setViewportSize({width:390,height:915});
    console.log('PASS Same-event setup inherits latest rules and recording depth for all three presets; fresh defaults, section order and focused fields remain usable');

    const editedNames=new Map();
    for(const fixture of editFixtures){
      const oldName=fixture.players[1].name,newName=`New ${oldName}`;
      await page.getByRole('button',{name:new RegExp(`^Alex vs ${oldName},`)}).click();
      await button('Match details').click();
      const opponent=page.getByTestId('edit-opponent-name');await expect(opponent).toHaveValue(oldName);
      for(const empty of['','   ']){
        await opponent.fill(empty);await expect(page.getByRole('alert')).toHaveCount(0);
        await button('Save match details').click();
        await expect(page.getByRole('alert')).toHaveText('Enter an opponent’s name of up to 80 characters.');
        await expect(opponent).toBeVisible();
      }
      await opponent.fill(`  ${newName}  `);await expect(page.getByRole('alert')).toHaveCount(0);
      await button('Save match details').click();await expect(button('Save match details')).toHaveCount(0);
      if(fixture.id==='opponent-edit-started'){
        await points('15','0');await expect(page.getByText('Winner · Forehand',{exact:true})).toBeVisible();
        await button('Edit notes').click();await expect(page.getByRole('textbox',{name:'Notes',exact:true})).toHaveValue('Started rally note remains');await button('Cancel').click();
        await button('Match notes').click();await expect(page.getByRole('textbox',{name:'Notes about the match',exact:true})).toHaveValue('Started match note remains');await button('Cancel').click();
      }else if(fixture.id==='opponent-edit-completed'){
        await points('11','9');await expect(shotStat(newName,'Serve','Winners',3)).toBeVisible();
        await expect(page.getByText(matchNotes,{exact:true})).toBeVisible();
      }
      if(fixture.firstServer!==null)await page.getByTestId('back-to-matches').click();
      await page.reload({waitUntil:'domcontentloaded'});
      const status=fixture.firstServer===null?'Not started':fixture.id==='opponent-edit-completed'?'Completed':'In progress';
      await expect(page.getByRole('button',{name:new RegExp(`^Alex vs ${newName}, ${status}`)})).toBeVisible();
      await expect(page.getByRole('button',{name:new RegExp(`^Alex vs ${oldName},`)})).toHaveCount(0);
      await page.getByRole('button',{name:new RegExp(`^Alex vs ${newName},`)}).click();await button('Match details').click();
      await expect(page.getByTestId('edit-opponent-name')).toHaveValue(newName);await button('Cancel').click();
      if(fixture.firstServer!==null){await points(...(fixture.id==='opponent-edit-completed'?['11','9']:['15','0']));await page.getByTestId('back-to-matches').click();}
      editedNames.set(fixture.id,newName);
    }
    await button('Settings').click();const editedBackup=await settingsBackup();
    for(const fixture of editFixtures){
      const edited=editedBackup.matches.find(match=>match.id===fixture.id);
      assert.equal(edited.players[1].name,editedNames.get(fixture.id));assert.ok(edited.revision>fixture.revision);
      assert.deepEqual(edited.players,[fixture.players[0],{...fixture.players[1],name:editedNames.get(fixture.id)}]);
      assert.deepEqual({...edited,players:fixture.players,revision:fixture.revision,updatedAt:fixture.updatedAt},fixture);
    }
    console.log('PASS Opponent edits trim names, reject empty input, survive reload in every match state and preserve all scoring, point, stroke, draft and note data');
    assert.deepEqual(errors,[]);console.log('PASS Restore into an empty installation, duplicate import, narrow layout, and no runtime errors');
  }catch(error){console.error((await page.locator('body').innerText()).slice(-6000));await page.screenshot({path:path.join(output,'tennis-app-failure.png'),fullPage:true});throw error;}
  finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
