import { chromium } from 'playwright';
const U = 'http://localhost:4173/#';
const b = await chromium.launch();
let bad = 0; const ok = (c, m) => { console.log((c ? '  ok  ' : 'CHECK FAILED: ') + m); if (!c) bad++; };
for (const [w, h, label] of [[1280, 900, 'desktop'], [390, 820, 'phone']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: w < 500 }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const as = async (n) => { await p.goto(U + '/login'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.getByRole('button', { name: new RegExp(n) }).first().click(); await p.waitForTimeout(500); };
  const crumbs = async () => (await p.locator('nav.crumbs').count()) ? (await p.locator('nav.crumbs ol').innerText()).replace(/\s+/g, ' ').trim() : '';
  await as('Dalia');
  await p.goto(U + '/settings'); ok((await crumbs()) === '', `${label}: Settings is top level, no path bar`);
  await p.getByRole('link', { name: /Open/ }).first().click(); await p.waitForTimeout(400);
  ok(/Settings › Priorities and sources/.test(await crumbs()), `${label}: Settings › Priorities and sources`);
  await p.locator('nav.crumbs .crumb-back').click(); await p.waitForTimeout(300);
  ok(p.url().endsWith('/settings'), `${label}: Back returns to Settings`);
  await p.goto(U + '/owner/ai'); ok(/Home › AI recommendations/.test(await crumbs()), `${label}: Home › AI recommendations`);
  const id = await p.evaluate(() => window.__hub.state.ownerFindings[0].id);
  await p.goto(U + '/owner/ai/' + id); ok(/Home › AI recommendations › AF-/.test(await crumbs()), `${label}: finding path`);
  await p.locator('nav.crumbs .crumb-back').click(); await p.waitForTimeout(300); ok(p.url().includes('/owner/ai') && !p.url().includes(id), `${label}: Back goes up one level`);
  await p.goto(U + '/projects/prj-070/steps/s-070-2'); ok(/Projects › P-070 › Step 2/.test(await crumbs()), `${label}: project step path`);
  await p.locator('nav.crumbs a:has-text("P-070")').click(); await p.waitForTimeout(300); ok(/\/projects\/prj-070$/.test(p.url()), `${label}: tap a crumb to jump there`);
  await p.goto(U + '/projects/prj-070?tab=files'); ok(/All files/.test(await crumbs()), `${label}: tab shows in path`);
  await p.goto(U + '/owner/team?tab=errors'); ok(/Team & Print › Customer service errors/.test(await crumbs()), `${label}: Team tab path`);
  ok(await p.locator('nav.crumbs').first().isVisible(), `${label}: path bar visible`);
  await as('Erika'); await p.goto(U + '/review'); ok(/Home › Answer and confirm/.test(await crumbs()), `${label}: employee review path`);
  console.log(errs.length ? errs.join('\n') : 'no page errors'); await ctx.close();
}
console.log(bad ? bad + ' FAILED' : 'ALL CHECKS PASSED'); await b.close();
