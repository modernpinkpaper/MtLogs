import { chromium } from 'playwright'; // optional: npm i -D playwright (not installed by default)
// The original round trip, through the real screens: Dalia asks, Erika answers, Dalia is notified, the journal has it.
// Run with the app on port 4173:  npm run build && npx vite preview --port 4173
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
const errors = [];
p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
const OUT = process.env.OUT || './e2e/out/';
const shot = (n) => p.screenshot({ path: `${OUT}${n}.png` });
const ok = (c, m) => { if (!c) errors.push('CHECK FAILED: ' + m); };
const U = 'http://localhost:4173/#';
await p.goto(U + '/login');
await p.getByRole('button', { name: /Dalia/ }).first().click();
await p.waitForSelector('h1:has-text("Home")');
await shot('s1-owner');
// 1. Dalia asks for an update on a step
await p.goto(U + '/projects/prj-012/steps/s-012-3');
await p.getByRole('button', { name: 'Ask for an update' }).first().click();
await p.getByLabel('Your question (if you want)').fill('Did the test product get created?');
await p.getByRole('button', { name: 'Send request' }).click();
await p.waitForSelector('text=They now have a notification');
await shot('s2-sent');
await p.getByRole('button', { name: 'Done', exact: true }).click();
// 2. Erika sees a prominently labelled request and answers
await p.selectOption('select[aria-label="Switch demo user"]', { label: 'Erika' });
await p.goto(U + '/review');
await p.waitForSelector('text=Dalia asked for an update');
await p.locator('label:has-text("In progress")').first().click();
await p.locator('textarea').first().fill('Test attempted; investigating permissions');
await shot('s3-erika-card');
await p.getByRole('button', { name: 'Send update to Dalia' }).click();
await p.waitForSelector('text=Update sent to Dalia');
// 3. Dalia gets an in-app notification that links to the exact step and answer
await p.selectOption('select[aria-label="Switch demo user"]', { label: 'Dalia (owner)' });
await p.goto(U + '/home');
await p.locator('summary:has-text("Team members")').click();
await p.waitForSelector('text=answered your request');
await shot('s4-dalia-notif');
await p.getByRole('button', { name: /Open|Read/ }).first().click();
await p.waitForSelector('text=Test attempted; investigating permissions');
ok(p.url().includes('/projects/prj-012/steps/s-012-3'), 'the notification opens the exact step: ' + p.url());
await shot('s5-response');
// 4. It is in the step journal
const inJournal = await p.evaluate(() => window.__hub.getJournal('u-dalia', { stepId: 's-012-3', types: ['UPDATE_REQUESTED', 'UPDATE_RESPONSE'] }).length);
ok(inJournal >= 2, 'the request and the answer are both in the journal (' + inJournal + ')');
// 5. Every old screen still opens
for (const r of ['/owner/print-weekly', '/owner/data-intake', '/owner/insights', '/owner/team', '/owner/other-work', '/owner/ai', '/resources', '/journal', '/settings', '/status', '/demo/operations', '/projects', '/notifications', '/review', '/projects/prj-priv']) {
  await p.goto(U + r); await p.waitForTimeout(150);
  ok((await p.locator('main').innerText()).length > 20, 'screen opens: ' + r);
}
await shot('s6-last');
// 6. Erika must not see the private project
await p.selectOption('select[aria-label="Switch demo user"]', { label: 'Erika' });
await p.goto(U + '/projects/prj-priv'); await p.waitForSelector('text=Permission denied');
await shot('s7-denied');
await p.setViewportSize({ width: 390, height: 800 }); await p.goto(U + '/clock'); await p.waitForTimeout(200); await shot('s8-mobile');
console.log(errors.length ? errors.join('\n') : 'NO ERRORS, ALL CHECKS PASSED');
await b.close();
