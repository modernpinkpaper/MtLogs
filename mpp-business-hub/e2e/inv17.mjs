import { chromium } from 'playwright';
// Investigation priorities and sources. App must be running on port 4173 (demo build).
const OUT = process.env.OUT || './e2e/out/';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message)); p.on('console', (m) => m.type() === 'error' && errs.push('CONSOLE ' + m.text()));
const ok = (c, m) => { if (!c) errs.push('CHECK FAILED: ' + m); else console.log('  ok  ' + m); };
const U = 'http://localhost:4173/#';
await p.goto(U + '/login'); await p.evaluate(() => localStorage.clear()); await p.reload();
await p.getByRole('button', { name: /Dalia/ }).first().click(); await p.waitForTimeout(500);
await p.goto(U + '/owner/ai?tab=priorities'); await p.waitForSelector('text=What the AI investigates');
ok(await p.locator('text=Data the AI may use').count() > 0, 'one screen shows priorities and sources');
ok(await p.locator('[data-source]').count() >= 17, 'all catalog sources are listed');
ok(await p.locator('text=Not connected').count() > 0 && await p.locator('text=Demo only').count() > 0 && await p.locator('text=Pending permission').count() > 0, 'Not connected, Demo only and Pending permission states are shown');
ok(await p.locator('text=Cannot run yet').count() > 0, 'a goal with an unapproved source says it cannot run yet');
await p.screenshot({ path: OUT + 'inv-priorities.png', fullPage: true });
// approve a source with no data: it must not become connected
await p.locator('[data-source="src-B6"] input[type=checkbox]').check(); await p.waitForTimeout(300);
ok(await p.locator('[data-source="src-B6"]').locator('text=Pending permission').count() > 0, 'approving an unconnected source only records permission');
// add a custom goal in plain words
await p.getByRole('button', { name: 'Add a goal' }).click();
await p.fill('#ng-t', 'Which seasonal bundles could raise profit?');
await p.getByRole('button', { name: 'Add goal', exact: true }).click(); await p.waitForTimeout(300);
ok(await p.locator('text=Which seasonal bundles could raise profit?').count() > 0, 'a new goal can be added without code');
// approve the first-wave sources and run
for (const id of ['src-A1', 'src-A3', 'src-B1']) await p.locator(`[data-source="${id}"] input[type=checkbox]`).check();
for (const id of ['ig-A3a', 'ig-A1b']) await p.locator(`[data-goal="${id}"] input[type=checkbox]`).first().check();
await p.getByRole('tab', { name: /Recommendations/ }).click().catch(() => {});
await p.goto(U + '/owner/ai'); await p.waitForTimeout(300);
await p.getByRole('button', { name: 'Investigate now' }).click(); await p.waitForTimeout(500);
ok(await p.locator('text=Sample finding').count() > 0, 'findings from made-up data say “Sample finding”');
await p.getByRole('button', { name: 'Everything' }).click(); await p.waitForTimeout(200);
await p.locator('a.lrow', { hasText: /no checked result/ }).first().click(); await p.waitForSelector('text=At a glance');
for (const t of ['What the AI found', 'Data it used', 'Project it recommends', 'Possible business impact', 'Insufficient data to estimate']) ok(await p.locator(`text=${t}`).count() > 0, 'detail shows: ' + t);
await p.screenshot({ path: OUT + 'inv-finding.png', fullPage: true });
// phone width
await p.setViewportSize({ width: 390, height: 800 }); await p.goto(U + '/owner/ai?tab=priorities'); await p.waitForTimeout(400);
ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll on a phone');
// employees cannot reach it (the denial itself is logged as an error, which is expected)
const before = errs.length;
await p.goto(U + '/login'); await p.getByRole('button', { name: /Erika/ }).first().click(); await p.waitForTimeout(400);
await p.goto(U + '/owner/ai?tab=priorities'); await p.waitForTimeout(400);
ok(await p.locator('text=Data the AI may use').count() === 0, 'an employee does not see the sources screen');
errs.length = before + errs.slice(before).filter((e) => !/permission denied/i.test(e)).length === 0 ? before : errs.length;
console.log(errs.length ? errs.join('\n') : '\nNo errors.');
await b.close(); process.exit(errs.length ? 1 : 0);
