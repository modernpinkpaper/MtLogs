import { chromium } from 'playwright';
const U = 'http://localhost:4173/#';
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 820 }, hasTouch: true, isMobile: true }); const p = await ctx.newPage();
let bad = 0; const ok = (c, m) => { console.log((c ? '  ok  ' : 'CHECK FAILED: ') + m); if (!c) bad++; };
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const as = async (name) => { await p.goto(U + '/login'); await p.waitForTimeout(150); await p.getByRole('button', { name: new RegExp(name) }).first().click(); await p.waitForTimeout(500); };
const noSide = async (m) => ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), 'no sideways scroll: ' + m);
const modalFits = async (m) => { const r = await p.evaluate(() => { const e = document.querySelector('.modal'); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth }; }); ok(!!r && r.l >= -1 && r.r <= r.w + 1, 'dialog fits the phone: ' + m); };
const tap = async (loc) => { await loc.scrollIntoViewIfNeeded(); await loc.tap(); await p.waitForTimeout(250); };
await p.goto(U + '/login'); await p.evaluate(() => localStorage.clear()); await p.reload();

// ---------------- Erika on a phone
await as('Erika'); await p.waitForSelector('h1:has-text("Hi ")'); await noSide('Erika Home');
const labels = await p.locator('nav.bottomnav .lb').allInnerTexts();
ok(['Home', 'Projects', 'Clock'].every((x) => labels.includes(x)) && labels.includes('More'), 'bottom bar has Home, Projects, Clock, More: ' + labels.join('|'));
await tap(p.locator('nav.bottomnav button:has-text("More")'));
const sheet = await p.locator('.sheet').innerText(); ok(/History/.test(sheet) && /Files/.test(sheet) && !/Notifications|Review my work/.test(sheet), 'More sheet has History and Files, and no second inbox');
await tap(p.locator('nav.bottomnav button:has-text("More")'));
await p.goto(U + '/projects/prj-070/steps/s-070-2'); await p.waitForSelector('text=What to do'); await noSide('step page');
await tap(p.getByRole('button', { name: 'Update status' }).first());
const names = ['Not started', 'In progress', 'Completed', 'Archive', 'Blocked'];
for (const n of names) ok(await p.getByRole('button', { name: n, exact: true }).first().isVisible(), 'status choice visible on a phone: ' + n);
ok(await p.getByRole('button', { name: 'In progress', exact: true }).first().isDisabled(), 'current status is greyed out');
await tap(p.getByRole('button', { name: 'Completed', exact: true }).first()); await p.waitForSelector('text=/Marked done/');
await tap(p.getByRole('button', { name: 'Update status' }).first());
ok(await p.getByRole('button', { name: 'Completed', exact: true }).first().isDisabled(), 'after Completed it is greyed out');
await tap(p.getByRole('button', { name: 'Not started', exact: true }).first());
ok(await p.locator('.state:has-text("Not started")').count() > 0, 'back to Not started works');
await tap(p.getByRole('button', { name: 'Update status' }).first()); await tap(p.getByRole('button', { name: 'Blocked', exact: true }).first());
await p.getByLabel('Reason').fill('Waiting for access'); await tap(p.getByRole('button', { name: 'Save', exact: true })); ok(await p.locator('.state:has-text("Blocked")').count() > 0, 'Blocked with a reason works');
await tap(p.getByRole('button', { name: 'Update status' }).first()); await tap(p.getByRole('button', { name: 'In progress', exact: true }).first()); ok(await p.locator('.state:has-text("In progress")').count() > 0, 'back to In progress');
// add steps, file menu
await tap(p.getByText('Add steps').first()); await modalFits('Add steps'); await tap(p.getByRole('button', { name: 'Cancel' }));
await tap(p.getByRole('button', { name: /Add file/ })); await tap(p.getByRole('menuitem', { name: 'New Google Sheet' })); await modalFits('New Google Sheet'); await tap(p.getByRole('button', { name: 'Cancel' }));
await tap(p.getByRole('button', { name: /Add file/ })); await tap(p.getByRole('menuitem', { name: 'Link a file I already have' })); await modalFits('Link a file'); await tap(p.getByRole('button', { name: 'Cancel' }));
// reorder arrows work by touch (on the project overview)
await p.goto(U + '/projects/prj-070'); await p.waitForSelector('text=Steps');
const first = await p.locator('.steprow .step .num').first().innerText();
await tap(p.getByRole('button', { name: /Move 2 down/ }).first()); await p.waitForTimeout(300);
ok((await p.locator('.steprow .step .num').first().innerText()) === first, 'reorder arrows can be tapped');
await p.goto(U + '/print/my-stats'); await p.waitForSelector('text=Your recent days'); await noSide('My printing');
await p.goto(U + '/clock'); await noSide('Clock');

// ---------------- Dalia on a phone
await as('Dalia'); await p.waitForSelector('h1:has-text("Home")'); await noSide('Dalia Home');
ok(await p.locator('nav.bottomnav .lb').count() === 4, 'bottom bar: Home, Projects, Team & Print, More');
await tap(p.locator('nav.bottomnav button:has-text("More")'));
const ds = await p.locator('.sheet').innerText(); ok(/My printing/.test(ds) && /History/.test(ds) && /Files/.test(ds) && /Settings/.test(ds) && !/AI recommendations|Priorities and sources|Customer service errors|Computer activity/.test(ds), 'owner More sheet is short: My printing, History, Files, Settings');
await tap(p.locator('nav.bottomnav button:has-text("More")'));
await tap(p.locator('summary:has-text("AI project recommendations")')); await tap(p.locator('details.hgroup.sub > summary').first());
await tap(p.getByRole('button', { name: 'Dismiss…' }).first()); await modalFits('Dismiss'); ok(await p.getByRole('button', { name: 'Dismiss', exact: true }).isVisible(), 'Dismiss button reachable'); await tap(p.getByRole('button', { name: 'Cancel' }));
await tap(p.getByRole('button', { name: 'Send to team…' }).first()); await modalFits('Send to team'); await tap(p.getByRole('button', { name: 'Cancel' }));
await p.goto(U + '/owner/team'); await noSide('Team'); await p.goto(U + '/owner/team?tab=print'); await noSide('Weekly printing');
await p.goto(U + '/projects/prj-070'); await tap(p.getByRole('button', { name: /More/ }).first()); await tap(p.getByRole('menuitem', { name: 'Give this project to someone else' })); await modalFits('Give project'); await tap(p.getByRole('button', { name: 'Cancel' }));
await p.goto(U + '/journal'); await noSide('History');
await p.goto(U + '/owner/ai/af-1'); await noSide('finding detail');
// ---------------- an error log on a phone (CS logs, Dalia acknowledges, the person replies)
await as('Dalia');
await p.evaluate(() => { const h = window.__hub; const e = h.logError('u-dalia', { uid: h.state.users.find((u) => u.name === 'Print Employee A').id, occurredOn: '2026-10-15', links: ['https://example.com/o/1'], description: '**Wrong** size\n- one\n- two' }); h.ownerAcknowledgeError('u-dalia', e.id, 'Please double check.'); });
await as('Print Employee A'); await p.waitForSelector('h1:has-text("Hi ")');
await tap(p.locator('summary:has-text("Errors in your log")'));
await noSide('error card');
const box = await p.locator('.errcard').first().boundingBox(); ok(!!box && box.x >= 0 && box.x + box.width <= 391, 'error card fits the phone');
await p.getByLabel('Your note (needed)').fill('Wrong size went out. I will compare size to the box first.');
ok(await p.getByRole('button', { name: /Acknowledge/ }).isVisible() && await p.getByRole('button', { name: /Snooze/ }).isVisible(), 'Acknowledge and Snooze are both visible');
await tap(p.getByRole('button', { name: /Acknowledge/ })); ok(await p.locator('.errcard').count() === 0, 'acknowledged on a phone');
await as('Arantza'); await p.evaluate(() => window.__hub.setCustomerService('u-dalia', window.__hub.state.users.find((u) => u.name === 'Arantza').id, true)); await p.goto(U + '/errors'); await p.waitForSelector('text=Log an error'); await noSide('Errors page');
await tap(p.getByRole('button', { name: /Bullets/ })); ok(await p.getByLabel('Description of the error').isVisible(), 'rich editor works on a phone');
console.log(errs.length ? 'ERRORS ' + errs.join('\n') : 'No page errors.'); console.log(bad ? bad + ' FAILED' : 'ALL CHECKS PASSED'); await b.close();
