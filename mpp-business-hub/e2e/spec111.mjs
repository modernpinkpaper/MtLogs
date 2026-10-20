import { chromium } from 'playwright';
// Print Team, My Print Stats, Print Verification and Projects → Steps → Step Details. Needs the demo build on port 4173.
const U = 'http://localhost:4173/#';
const OUT = './e2e/out/spec/';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
let bad = 0; const ok = (c, m) => { console.log((c ? '  ok  ' : 'CHECK FAILED: ') + m); if (!c) bad++; };
const shot = (n, full = true) => p.screenshot({ path: `${OUT}${n}.png`, fullPage: full });
const login = async (name) => { await p.goto(U + '/login'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.getByRole('button', { name: new RegExp(name) }).first().click(); await p.waitForSelector('h1'); };

console.log('[Owner Print Team]');
await login('Dalia');
await p.goto(U + '/owner/team?tab=printteam'); await p.waitForSelector('text=Print Team');
ok(await p.locator('text=Daily revenue and order activity').count() > 0, 'owner Print Team page opens');
ok(await p.locator('table.ptable tbody tr').count() >= 2, 'employee table lists several people');
await shot('01-owner-print-team-desktop');
const row = p.locator('table.ptable tbody tr').first(); await row.click(); await p.waitForTimeout(300);
ok(await p.locator('[role="dialog"], .drawer').count() > 0, 'clicking a person opens the drill-down drawer');
await shot('02-owner-print-team-drawer');
await p.keyboard.press('Escape');
await p.setViewportSize({ width: 390, height: 844 }); await p.goto(U + '/owner/team?tab=printteam'); await p.waitForSelector('text=Print Team');
ok(await p.evaluate(() => document.documentElement.scrollWidth <= 392), 'owner Print Team: no sideways scroll on a phone');
await shot('03-owner-print-team-phone');
await p.setViewportSize({ width: 1440, height: 900 });

console.log('[Verification]');
await p.goto(U + '/print-verification'); await p.waitForSelector('#pv-q');
await shot('04-verification-empty');
await p.locator('#pv-q').fill('3005'); await p.getByRole('button', { name: 'Search' }).click(); await p.waitForTimeout(500);
ok(await p.locator('text=Order record').count() > 0, 'a claimed order shows its record');
ok(await p.locator('text=Print file matches').count() > 0, 'and a print file matches section with an honest match level');
await shot('05-verification-result');
await p.locator('#pv-q').fill('9999999'); await p.getByRole('button', { name: 'Search' }).click(); await p.waitForTimeout(300);
ok(await p.locator('text=No active claim found').count() > 0, 'an unknown order says no active claim');

console.log('[Employee My Print Stats]');
await login('Erika');
await p.goto(U + '/print/my-stats'); await p.waitForSelector('text=Your recent days');
ok(await p.locator('text=Revenue per hour').count() > 0, 'employee sees revenue per hour');
await shot('06-employee-my-print-stats');
await p.goto(U + '/owner/team'); await p.waitForTimeout(400);
ok(await p.locator('text=Daily revenue and order activity').count() === 0, 'employee cannot open the owner Print Team');

console.log('[Projects → Steps → Step details]');
await p.goto(U + '/projects/prj-070'); await p.waitForSelector('text=Steps');
ok(await p.locator('text=What to do').count() === 0, 'overview has no step workspace');
await shot('07-project-overview-employee');
await p.locator('.step').first().click(); await p.waitForSelector('text=What to do');
ok(await p.locator('nav[aria-label="Steps in this project"]').count() === 1, 'step page has the compact step list on the left');
ok(await p.locator('text=/STEP \\d+ OF \\d+/').count() === 1, 'step page says STEP n OF m');
await p.getByLabel('Add a note to this step').fill('Checked the sizes.'); await p.getByRole('button', { name: 'Add note' }).click(); await p.waitForSelector('text=Checked the sizes.');
ok(true, 'step note added and shown');
await shot('08-step-details-employee');
await login('Dalia');
await p.goto(U + '/projects/prj-070'); await p.waitForSelector('text=Steps'); await shot('09-project-overview-owner');
await p.locator('.step').first().click(); await p.waitForSelector('text=What to do'); await shot('10-step-details-owner');
await p.setViewportSize({ width: 390, height: 844 }); await shot('11-step-details-phone');
ok(await p.evaluate(() => document.documentElement.scrollWidth <= 392), 'step page: no sideways scroll on a phone');

console.log(errs.length ? errs.join('\n') : 'No page errors.'); console.log(bad ? bad + ' FAILED' : 'ALL CHECKS PASSED');
await b.close(); process.exit(bad || errs.length ? 1 : 0);
