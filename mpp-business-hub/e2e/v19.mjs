import { chromium } from 'playwright';
const U = 'http://localhost:4173/#';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
let bad = 0; const ok = (c, m) => { console.log((c ? '  ok  ' : 'CHECK FAILED: ') + m); if (!c) bad++; };
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const as = async (name) => { await p.goto(U + '/login'); await p.waitForTimeout(150); await p.getByRole('button', { name: new RegExp(name) }).first().click(); await p.waitForTimeout(500); };
await p.goto(U + '/login'); await p.evaluate(() => localStorage.clear()); await p.reload();

// ---- Dalia Home
await as('Dalia');
await p.waitForSelector('h1:has-text("Home")');
const nav = await p.locator('aside.side nav > a').allInnerTexts();
ok(!nav.some((t) => /AI Recommendations|Notifications/.test(t)), 'AI recommendations and Notifications are not in the main menu: ' + nav.join('|').replace(/\n/g, ' '));
ok(await p.locator('details.hgroup > summary:has-text("AI project recommendations")').count() === 1, 'Home has an AI project recommendations group');
await p.locator('details.hgroup > summary:has-text("AI project recommendations")').click();
ok(await p.locator('details.hgroup.sub').count() >= 1, 'the AI group has sub groups');
await p.locator('details.hgroup.sub > summary').first().click();
// dismiss with feedback
const before = await p.getByRole('button', { name: 'Dismiss…' }).count();
await p.getByRole('button', { name: 'Dismiss…' }).first().click();
await p.getByLabel('Why?').selectOption('Too small to matter');
await p.getByLabel(/Don’t send me this kind again/).check();
await p.getByRole('button', { name: 'Dismiss', exact: true }).click(); await p.waitForTimeout(500);
ok(await p.getByRole('button', { name: 'Dismiss…' }).count() === before - 1, 'dismissed item leaves Home');
await p.goto(U + '/owner/ai?tab=priorities'); await p.waitForSelector('text=What you told the AI');
ok(await p.locator('text=Too small to matter').count() > 0 && await p.locator('text=Never send this kind').count() > 0, 'the reason shows under Priorities and sources');
// team page
await p.goto(U + '/owner/team'); await p.waitForSelector('th:has-text("Customer service")');
ok(await p.locator('text=Job today').count() === 0, 'no "Job today" on the team page');
await p.getByLabel('Arantza can log errors').check(); await p.waitForTimeout(300);

// ---- CS logs an error
await as('Arantza'); await p.goto(U + '/errors'); await p.waitForSelector('text=Log an error');
await p.getByLabel('Person').selectOption({ label: 'Print Employee A' });
await p.getByLabel('Order link 1').fill('https://example.com/order/55');
await p.getByRole('button', { name: 'Add another link' }).click(); await p.getByLabel('Order link 2').fill('https://example.com/order/56');
await p.getByRole('button', { name: /Bullets/ }).click();
await p.getByLabel('Description of the error').fill('- Wrong size shipped\n- Customer wrote Oct 15');
await p.getByRole('button', { name: 'Log the error' }).click(); await p.waitForSelector('text=Dalia was told');
ok(await p.locator('text=Waiting for Dalia').count() === 1, 'history shows it is waiting for Dalia');

// ---- the person cannot see it yet
await as('Print Employee A'); await p.goto(U + '/home'); await p.waitForSelector('h1');
ok(await p.locator('.errcard').count() === 0, 'the person cannot see the error before Dalia acknowledges');
ok(await p.locator('h2:has-text("Your projects")').count() === 0, 'employee Home has no project list');

// ---- Dalia acknowledges
await as('Dalia'); await p.locator('summary:has-text("Errors logged by customer service")').click();
await p.getByLabel(/Note for Print Employee A/).fill('Please double check sizes.');
await p.getByRole('button', { name: 'Acknowledge', exact: true }).first().click(); await p.waitForTimeout(500);
ok(await p.locator('summary:has-text("Errors logged by customer service")').count() === 0, 'acknowledged error leaves Home');

// ---- person sees it, snoozes it, then acknowledges after clocking in
await as('Print Employee A'); await p.goto(U + '/clock'); await p.waitForSelector('text=Before you leave');
ok(await p.locator('.errcard').count() === 1, 'the error shows at clock out');
ok(await p.getByRole('button', { name: 'Clock out now' }).count() === 0, 'clock out waits for acknowledge or snooze');
await p.getByRole('button', { name: /Snooze until my next clock in/ }).click(); await p.waitForTimeout(400);
ok(await p.getByRole('button', { name: /Clock out now/ }).count() > 0, 'after snooze the person can clock out');
await p.getByRole('button', { name: /Clock out now/ }).first().click(); await p.waitForSelector('text=You clocked out');
await p.getByRole('button', { name: 'Clock in' }).click(); await p.waitForTimeout(500);
await p.goto(U + '/home'); await p.locator('summary:has-text("Errors in your log")').click(); await p.waitForSelector('.errcard');
ok(await p.locator('text=Please double check sizes.').count() > 0, 'Dalia’s note is shown');
await p.getByLabel('Your note (needed)').fill('Wrong size went out. I will compare the size on the order to the box before I seal it.');
await p.getByRole('button', { name: /Acknowledge/ }).click(); await p.waitForTimeout(500);
ok(await p.locator('.errcard').count() === 0, 'acknowledged, it is gone from Home');

// ---- printing numbers
await p.goto(U + '/print/my-stats'); await p.waitForSelector('text=Your recent days');
ok(await p.locator('text=Revenue per hour').count() > 0 && await p.locator('text=Error rate').count() > 0, 'My printing shows revenue per hour and error rate');
ok(await p.locator('tr:has-text("30 days")').count() === 1 && await p.locator('tr:has-text("90 days")').count() === 1 && await p.locator('tr:has-text("180 days")').count() === 1, '30, 90 and 180 day rows');
await p.locator('summary:has-text("Longer view")').click();
ok(await p.locator('tr:has-text("30 days") td:nth-child(3)').first().innerText() === '1', 'the error shows in the 30 day numbers');

// ---- Dalia sees the answer
await as('Dalia'); await p.waitForSelector('summary:has-text("Errors logged by customer service")');
ok(true, 'Dalia is alerted when the person acknowledges');
console.log(errs.length ? 'ERRORS ' + errs.join('\n') : 'No page errors.'); console.log(bad ? bad + ' FAILED' : 'ALL CHECKS PASSED'); await b.close();
