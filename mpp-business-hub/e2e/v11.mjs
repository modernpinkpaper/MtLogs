import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs = []; p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
const D = process.env.OUT || './e2e/out/';
const URL = 'http://localhost:4173/#';
const go = async (h) => { await p.goto(URL + h); await p.waitForTimeout(300); };
const as = async (name) => { await p.selectOption('select[aria-label="Switch demo user"]', { label: name }); await p.waitForTimeout(250); };
const shot = (n, full = false) => p.screenshot({ path: D + n + '.png', fullPage: full });
const ok = (c, m) => { if (!c) { errs.push('CHECK FAILED: ' + m); } };

await go('/login'); await p.getByRole('button', { name: /Dalia/ }).first().click(); await p.waitForSelector('text=Start here');
await shot('v1-owner-home');
const nav = await p.locator('aside.side nav > a').allInnerTexts();
ok(nav.length === 5, 'owner has 5 primary links: ' + nav.join('|'));
// Projects page
await go('/projects'); await p.waitForSelector('h2.group-title'); await shot('v2-projects');
// Pause P-070 through the UI
await p.getByRole('link', { name: /P-070 — Update Listing/ }).first().click();
await p.waitForSelector('text=Next step');
await p.getByRole('button', { name: 'Pause project' }).first().click();
await p.getByLabel('Why? (if you want)').selectOption({ label: 'Higher-priority work came up' });
await p.getByRole('button', { name: 'Pause project' }).last().click();
await p.waitForSelector('text=Paused by Dalia'); await shot('v3-paused-owner');
await go('/projects'); await p.waitForSelector('h2.group-title:has-text("Paused")'); ok(await p.locator('text=Paused · Until you resume').count() > 0, 'card line shows until you resume');
await shot('v4-projects-paused');
await as('Erika'); await go('/projects/prj-070'); await p.waitForSelector('text=Paused by Dalia'); await shot('v5-paused-erika');
await go('/projects'); await p.waitForSelector('text=Paused'); await shot('v6-erika-home');
await as('Dalia (owner)'); await go('/projects/prj-070'); await p.getByRole('button', { name: 'Resume project' }).first().click(); await p.getByRole('button', { name: 'Resume project' }).last().click();
await p.waitForTimeout(500); await p.locator('summary:has-text("Recent project activity")').click(); await p.waitForSelector('text=Resumed by Dalia >> visible=true');
// AI recommendations
await go('/owner/ai'); await p.waitForSelector('text=Needs a decision'); await shot('v7-ai-inbox');
await go('/owner/ai/af-1'); await p.waitForSelector('text=The numbers'); await shot('v8-finding', true);
await p.getByRole('button', { name: 'Approve as project' }).click();
await p.getByRole('tab', { name: '2. Who and where' }).click(); await shot('v9-approve-who');
await p.getByRole('tab', { name: '3. What the worker sees' }).click(); await shot('v10-approve-preview');
await p.getByRole('button', { name: 'Create project (unassigned)' }).click();
await p.waitForSelector('text=Approved, but nobody is assigned'); await shot('v11-unassigned');
await as('Erika'); await go('/projects'); ok(await p.locator('text=P-095').count() === 0, 'Erika cannot see unassigned P-095');
await as('Dalia (owner)'); await go('/projects/' + (await p.evaluate(() => window.__hub.state.projects.find((x) => x.key === 'P-095').id)));
await p.getByRole('button', { name: 'Choose who works on it' }).first().click(); await p.getByLabel('Erika').check(); await p.getByRole('button', { name: 'Assign' }).click();
await p.waitForTimeout(300);
await as('Erika'); await go('/projects'); ok(await p.locator('text=P-095').count() > 0, 'Erika sees P-095 after assignment');
const body = await p.locator('body').innerText();
ok(!/profit|ROI|margin|OWNER-ONLY/i.test(body), 'no owner-only words on Erika projects page');
await p.getByRole('link', { name: /P-095/ }).first().click(); await p.waitForSelector('text=Next step'); await shot('v12-erika-new-project', true);
await p.getByRole('tab', { name: 'All files' }).click(); await p.waitForSelector('text=Project folder'); await shot('v13-files');
// Review with select multiple
await go('/review'); await p.waitForSelector('text=Review my work'); await shot('v14-review', true);
// Demo controls pilot
await as('Dalia (owner)'); await go('/demo/operations');
await p.getByRole('button', { name: /1. Set up the 20-listing test/ }).click(); await p.getByRole('button', { name: /2. Show 19 of 20/ }).click();
await go('/projects/prj-012'); await p.waitForSelector('text=Limited test: 19 of 20'); await shot('v15-pilot-19');
await go('/demo/operations'); await p.getByRole('button', { name: /3. Check the 20th/ }).click();
await go('/projects/prj-012'); await p.waitForSelector('text=Waiting for your review'); await shot('v16-pilot-20', true);
// mobile
await p.setViewportSize({ width: 390, height: 820 }); await go('/home'); await p.waitForTimeout(300); await shot('v17-mobile-home');
ok(await p.locator('nav.bottomnav').isVisible(), 'bottom nav visible on phone');
await go('/projects'); await shot('v18-mobile-projects');
await p.setViewportSize({ width: 1280, height: 900 });
// search with reasons
await p.locator('input[aria-label="Search"]').fill('FBA_TY001'); await p.waitForSelector('.results .hit'); await shot('v19-search');
// ---- v1.2 design checks (calm screens, one clear action) ----
await p.fill('input[aria-label="Search"]', '');
await as('Erika'); await go('/home');
await p.waitForSelector('text=Your projects');
ok(await p.locator('text=Notifications').count() >= 1, 'Home shows a Notifications section first');
ok(await p.locator('text=Last confirmed activity').count() >= 1, 'Home shows where each project was left off');
await go('/review'); await p.waitForSelector('text=What happened?');
const yes = p.getByRole('button', { name: 'Send answer' }).first();
ok(await yes.isVisible(), 'the answer choices and Send answer are visible without opening anything');
const yBox = await yes.boundingBox(); ok(yBox && yBox.y < 900, 'answer buttons are on the first screen of a review card (y=' + (yBox && yBox.y) + ')');
ok(await p.locator('text=View activity details').first().isVisible(), 'evidence is one link: View activity details');
await go('/projects/prj-012'); await p.waitForSelector('text=Next step');
ok(await p.locator('.nextstep').count() === 0, 'no duplicate "Next step" card');
ok(await p.locator('text=Latest in this project').count() === 0, 'no duplicate latest-activity block');
await p.setViewportSize({ width: 390, height: 820 }); await go('/projects/prj-012'); await p.waitForSelector('text=Next step');
const sw = await p.evaluate(() => document.documentElement.scrollWidth); ok(sw <= 392, 'project page has no sideways scrolling on a phone (' + sw + ')');
ok(await p.locator('summary:has-text("All steps")').count() === 1, 'step list folds away on a phone');
await shot('v20-mobile-project');
await p.setViewportSize({ width: 1280, height: 900 });
await as('Dalia (owner)'); await go('/owner/ai'); await p.waitForSelector('.lrow');
ok(await p.locator('.lrow button').count() === 0, 'AI list has no repeated Open buttons');
await go('/projects'); await p.waitForSelector('.prow');
ok(await p.locator('.prow button:has-text("Open")').count() === 0, 'project rows have no repeated Open buttons');
// ---- v1.3: one obvious primary action per screen ----
const prim = async () => p.locator('main button.primary:visible').count();
await as('Dalia (owner)'); await go('/home'); await p.waitForSelector('text=Start here');
ok(await prim() === 1, 'owner Home has exactly one primary button (' + await prim() + ')');
await go('/owner/ai/af-3'); await p.waitForSelector('text=Why we think so');
ok(await prim() === 1, 'AI finding has exactly one primary button (' + await prim() + ')');
await go('/owner/ai'); await p.waitForSelector('.lrow');
ok(await prim() === 0, 'AI list has no primary buttons (rows are links) (' + await prim() + ')');
await as('Erika'); await go('/home'); await p.waitForSelector('text=Your projects');
ok(await prim() <= 1, 'Home has at most one primary button (' + await prim() + ')');
await go('/review'); await p.waitForSelector('text=What happened?');
ok(await prim() === 1, 'Review shows one primary button, on the first card (' + await prim() + ')');
await go('/projects/prj-012'); await p.waitForSelector('text=Next step');
ok(await prim() === 1, 'step page has exactly one primary button (' + await prim() + ')');
const h1 = await p.evaluate(() => { const e = document.querySelector('main h1'); const f = (x) => parseFloat(getComputedStyle(x).fontSize); const h2 = document.querySelector('main h2'); return [f(e), h2 ? f(h2) : 0]; });
ok(h1[0] > h1[1], 'page title is larger than section headings (' + h1.join(' vs ') + ')');
// ---- v1.4: outcome answers, actionable files, project info, mobile order, counts, small tasks ----
await as('Erika'); await go('/review');
await p.waitForSelector('text=Did you test the Shopify Lister today?');
for (const t of ['Completed the test successfully', 'Tested it, but something went wrong', 'In progress', 'I didn’t work on this', 'The AI misunderstood what I was doing', 'I’m not sure / Answer later']) ok(await p.locator('label:has-text("' + t + '")').count() > 0, 'test card offers: ' + t);
ok(await p.locator('text=Anything else we should know? (Optional)').count() > 0, 'optional note is offered');
await p.getByRole('button', { name: 'View activity details' }).first().click();
ok(await p.locator('.timeline li').count() >= 1, 'activity details show times and actions');
ok(await p.locator('text=Why we matched it here').count() > 0, 'a plain reason for the match is shown');
await shot('v21-review-outcome', true);
await p.locator('label:has-text("Completed the test successfully")').click();
await p.getByRole('button', { name: 'Send answer' }).first().click(); await p.waitForTimeout(500);
let st = await p.evaluate(() => { const s = window.__hub.state.steps.find((x) => x.id === 's-012-3'); return [s.status, s.verifications.length, s.humanReported && s.humanReported.outcome]; });
ok(st[0] === 'IN_PROGRESS' && st[1] === 0 && st[2] === 'DONE', 'a passed test is in progress, unverified, and recorded as her report: ' + st.join('/'));
// Amazon upload: misunderstanding panel appears; partial progress stays unverified
await p.evaluate(() => window.__hub.demoReleaseFbaHour()); await go('/review'); await p.waitForSelector('text=variation change go through successfully');
await p.locator('label:has-text("The AI misunderstood what I was doing")').first().click();
ok(await p.locator('text=It matched the wrong project or step').count() > 0, 'correction choices appear (wrong step / wrong person / other)');
ok(await p.locator('text=Someone else was using this computer').count() > 0, 'wrong-person choice appears');
await p.locator('label:has-text("I uploaded it, but I haven’t seen the result yet")').click();
await p.getByRole('button', { name: 'Send answer' }).first().click(); await p.waitForTimeout(500);
st = await p.evaluate(() => { const s = window.__hub.state.steps.find((x) => x.id === 's-081-2'); return [s.status, s.verifications.length]; });
ok(st[0] === 'IN_PROGRESS' && st[1] === 0, 'an Amazon upload attempt stays unverified: ' + st.join('/'));
// step files
await go('/projects/prj-012/steps/s-012-3'); await p.waitForSelector('.frow');
ok(await p.locator('.frow').count() >= 4, 'files for the step are listed with actions');
ok(await p.locator('text=opens from All files').count() === 0, 'no "opens from All files" detours');
ok(await p.locator('text=Draft — Still being edited').count() > 0 && await p.locator('text=No version chosen yet').count() > 0, 'draft and unapproved copies are labelled');
ok(await p.locator('text=none is chosen yet').count() > 0, 'says plainly that no copy is approved');
await p.locator('.frow:has(strong:has-text("(copy B")) button:has-text("Use this version for the project")').click(); await p.getByRole('button', { name: 'Yes, use this one' }).click(); await p.waitForTimeout(400);
ok(await p.locator('.frow:has(strong:has-text("(copy B")) >> text=Chosen version — Use this one').count() > 0, 'the chosen copy is marked, with who chose it');
await p.locator('.frow:has(strong:has-text("(copy B")) button:has-text("Open file")').click();
ok(await p.locator('text=SIMULATED PREVIEW').count() > 0 && await p.locator('text=not a real Google Drive file').count() > 0, 'Open file opens a clearly simulated preview');
await p.keyboard.press('Escape'); await p.getByRole('button', { name: 'Close' }).first().click().catch(() => {});
ok(await p.locator('.frow:has-text("product images") button:has-text("Copy folder path")').count() === 1, 'a Windows/network folder gets Copy folder path, not a fake link');
await p.locator('.frow:has-text("Shopify Lister") button:has-text("View installation details")').click();
ok(await p.locator('text=Do not move it').count() > 0, 'installed script shows installation details and is never moved');
await shot('v22-step-files', true);
// project info card
await p.locator('button[aria-label="About P-012"]').first().click();
ok(await p.locator('.pinfo-card:has-text("fall and Halloween")').count() > 0, 'the project info card shows the description');
await p.getByRole('button', { name: 'Edit description' }).click(); await p.fill('.pinfo-card textarea', 'Put the new seasonal products on Shopify.'); await p.getByRole('button', { name: 'Save', exact: true }).last().click(); await p.waitForTimeout(300);
ok(await p.evaluate(() => window.__hub.state.projects.find((x) => x.id === 'prj-012').description) === 'Put the new seasonal products on Shopify.', 'a person on the project can edit the description');
// log something I did
await go('/home'); await p.getByRole('button', { name: 'Log something I did' }).click();
await p.fill('#lt-title', 'Updated the listing for MS066'); await p.selectOption('#lt-who', { label: 'Dalia' }); await p.getByRole('button', { name: 'Save', exact: true }).click(); await p.waitForTimeout(400);
ok(await p.evaluate(() => window.__hub.state.workLog.some((w) => w.title === 'Updated the listing for MS066' && w.origin === 'MANUAL')), 'a small task logged by hand is saved');
await as('Dalia (owner)'); await go('/owner/other-work'); await p.getByRole('tab', { name: /Logged by hand/ }).click();
ok(await p.locator('text=Updated the listing for MS066').count() > 0 && await p.locator('text=asked by Dalia').count() > 0, 'Dalia sees the small task and who asked');
// counts
await go('/home'); await p.waitForSelector('text=Start here');
const pcs = await p.evaluate(() => window.__hub.projectCounts('u-dalia'));
ok(await p.locator('text=/' + pcs.team + ' team projects? active/').count() > 0 && await p.locator('text=' + pcs.private + ' private').count() > 0, 'Home names team and private counts (' + JSON.stringify(pcs) + ')');
await go('/projects'); await p.waitForSelector('.prow');
ok(await p.locator('text=/' + pcs.team + ' team projects? active · ' + pcs.private + ' private/').count() > 0, 'Projects uses the same counts');
// Home alert wording
await go('/home'); await p.waitForSelector('text=Start here');
const ttl = await p.locator('#decide .focus-title').innerText(); ok(ttl.length < 70 && !/Tampermonkey|tracker still says|sequence/.test(ttl), 'Home shows a short, plain alert title: ' + ttl);
ok(await p.locator('text=Other items needing attention').count() > 0, '"Other items needing attention (n)"');
ok(await p.locator('text=/w-pc04|missing sequence/').count() === 0, 'no raw diagnostics on Home');
// mobile: next step first, files near, plan after
await as('Erika'); await p.setViewportSize({ width: 390, height: 820 }); await go('/projects/prj-070/steps/s-070-2'); await p.waitForSelector('.frow');
const pos = await p.evaluate(() => { const top = (e) => e ? Math.round(e.getBoundingClientRect().top + scrollY) : 99999; return { panel: top(document.querySelector('section[aria-label^="Step"]')), btn: top([...document.querySelectorAll('button')].find((b) => /^Update status$/.test(b.textContent))), file: top(document.querySelector('.frow')), plan: top([...document.querySelectorAll('summary')].find((e) => /All steps/.test(e.textContent))), sw: document.documentElement.scrollWidth }; });
ok(pos.btn < 900, 'mobile: the main action is within one screen (the AI check line and description added a little height) (' + pos.btn + ')');
ok(pos.panel < pos.plan, 'mobile: the current step comes before the full plan (' + pos.panel + ' < ' + pos.plan + ')');
ok(pos.file < pos.plan, 'mobile: files come before the full plan');
ok(pos.sw <= 392, 'mobile: no sideways scroll (' + pos.sw + ')');
await shot('v23-mobile-step', true);
await p.setViewportSize({ width: 1280, height: 900 });
console.log(errs.length ? errs.join('\n') : 'NO ERRORS, ALL CHECKS PASSED'); await b.close();
