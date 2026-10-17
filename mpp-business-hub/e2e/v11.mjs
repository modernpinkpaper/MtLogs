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

await go('/login'); await p.getByRole('button', { name: /Dalia/ }).first().click(); await p.waitForSelector('text=Needs your decision');
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
await go('/home'); await p.waitForSelector('text=Paused projects'); await shot('v6-erika-home');
await as('Dalia (owner)'); await go('/projects/prj-070'); await p.getByRole('button', { name: 'Resume project' }).first().click(); await p.getByRole('button', { name: 'Resume project' }).last().click();
await p.waitForSelector('text=Resumed by Dalia');
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
console.log(errs.length ? errs.join('\n') : 'NO ERRORS, ALL CHECKS PASSED'); await b.close();
