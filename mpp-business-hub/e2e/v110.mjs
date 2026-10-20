import { chromium } from 'playwright';
const U = 'http://localhost:4173/#';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
let bad = 0; const ok = (c, m) => { console.log((c ? '  ok  ' : 'CHECK FAILED: ') + m); if (!c) bad++; };
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const as = async (name) => { await p.goto(U + '/login'); await p.waitForTimeout(150); await p.getByRole('button', { name: new RegExp(name) }).first().click(); await p.waitForTimeout(500); };
await p.goto(U + '/login'); await p.evaluate(() => localStorage.clear()); await p.reload();
const hub = (fn, ...a) => p.evaluate(([f, args]) => { const h = window.__hub; return eval('(' + f + ')')(h, ...args); }, [fn.toString(), a]);

// ---- Only one place for alerts
await as('Dalia');
const nav = (await p.locator('aside.side').innerText());
ok(!/Review my work/.test(nav) && !/Notifications/.test(nav), 'no Notifications or Review my work in the menu');
await p.goto(U + '/notifications'); await p.waitForTimeout(400);
ok(p.url().endsWith('/home'), 'the old Notifications page sends you to Home');
await hub((h) => h.createUpdateRequest('u-dalia', { projectId: 'prj-012', stepId: 's-012-3', question: 'Did it work?', idempotencyKey: 'k-v110' }));
await as('Erika'); await p.goto(U + '/home');
await p.locator('summary:has-text("Dalia asked you")').click();
await p.getByRole('button', { name: 'Answer', exact: true }).first().click(); await p.waitForSelector('text=What happened?');
await p.locator('label:has-text("In progress")').first().click(); await p.locator('textarea').first().fill('Half done.');
await p.getByRole('button', { name: 'Send update to Dalia' }).click(); await p.waitForSelector('text=Update sent to Dalia');
await p.goto(U + '/home'); await p.waitForTimeout(400);
ok(await p.locator('summary:has-text("Dalia asked you")').count() === 0, 'after she answered, nothing about the request is left on Erika’s Home');
await as('Dalia'); await p.locator('summary:has-text("Team members")').click();
ok(await p.locator('.mrow:has-text("answered your request")').count() === 1, 'Dalia sees Erika’s answer on Home');
await p.getByRole('button', { name: 'I saw this' }).first().click(); await p.waitForTimeout(400);
ok(await p.locator('summary:has-text("Team members")').count() === 0, 'cleared from Home');
await p.goto(U + '/journal'); await p.getByRole('button', { name: 'Alerts' }).click();
ok(await p.locator('text=answered your request').count() > 0, 'but it is still in History');

// ---- Status menu
await as('Erika'); await p.goto(U + '/projects/prj-070/steps/s-070-2'); await p.waitForSelector('text=What to do');
ok(await p.getByRole('button', { name: 'Update progress' }).count() === 0 && await p.getByRole('button', { name: 'Ask for help' }).count() === 0, 'only Update status is on a step');
await p.getByRole('button', { name: 'Update status' }).first().click();
for (const n of ['In progress', 'Completed', 'Archive', 'Blocked']) ok(await p.getByRole('button', { name: n, exact: true }).count() >= 1, `status choice: ${n}`);
await p.getByRole('button', { name: 'Blocked', exact: true }).click();
await p.getByLabel('Reason').fill('Need Amazon access');
await p.getByLabel('Look at it again on').fill('2026-10-19');
await p.getByRole('button', { name: 'Save', exact: true }).click(); await p.waitForTimeout(400);
ok(await p.locator('text=Blocked').count() > 0, 'step is blocked with a reason and a date');
await hub((h) => { h.state.now = '2026-10-19T15:00:00.000Z'; h.commit?.(() => {}); });
await p.goto(U + '/home'); await p.reload(); await p.waitForTimeout(500);
await p.locator('summary:has-text("Reminders")').click();
ok(await p.locator('text=Need Amazon access').count() > 0, 'on the day, the blocked step comes back as a reminder on Home');

// ---- Steps belong to the person they are assigned to
await as('Dalia'); await p.goto(U + '/projects/prj-070/steps/s-070-3'); await p.waitForSelector('text=What to do');
await p.locator('section[aria-label^="Step"] summary:has-text("More")').click(); await p.getByRole('button', { name: 'Give this step to someone else' }).click();
await p.getByLabel('Carolina').check(); await p.getByRole('button', { name: 'Give it' }).click(); await p.waitForTimeout(500);
await as('Erika'); await p.goto(U + '/projects/prj-070/steps/s-070-3'); await p.waitForSelector('text=What to do');
ok(await p.locator('text=This step belongs to Carolina').count() === 1, 'Erika can read it and is told whose it is');
ok(await p.getByRole('button', { name: 'Update status' }).count() === 0, 'but she cannot change it');
await as('Carolina'); await p.goto(U + '/projects/prj-070/steps/s-070-3'); await p.waitForSelector('text=What to do');
ok(await p.getByRole('button', { name: 'Update status' }).count() === 1, 'Carolina can');

// ---- Whole project, note from Dalia
await as('Dalia'); await p.goto(U + '/projects/prj-070');
await p.getByRole('button', { name: /More/ }).first().click(); await p.getByRole('menuitem', { name: /Write a note/ }).click();
await p.getByRole('textbox', { name: 'Note to the team' }).fill('Hey! Please finish by next week.'); await p.getByRole('button', { name: 'Save', exact: true }).click(); await p.waitForTimeout(400);
await p.getByRole('button', { name: /More/ }).first().click(); await p.getByRole('menuitem', { name: 'Give this project to someone else' }).click();
await p.getByLabel('Arantza').check(); await p.getByRole('button', { name: 'Give it' }).click(); await p.waitForTimeout(500);
await as('Arantza'); await p.goto(U + '/projects/prj-070'); await p.waitForSelector('[aria-label="Note from Dalia"]');
ok(await p.locator('text=Hey! Please finish by next week.').count() === 1, 'Arantza sees Dalia’s note at the top');
ok(await p.locator('text=Compile all requested changes').count() > 0, 'and the finished step is there, already done');

// ---- AI recommendation: send to team
await as('Dalia'); await p.locator('summary:has-text("AI project recommendations")').click(); await p.locator('details.hgroup.sub > summary').first().click();
await p.getByRole('button', { name: 'Send to team…' }).first().click();
await p.getByLabel('Erika').check(); await p.getByLabel('Your note').fill('Could you look into this?'); await p.getByRole('button', { name: 'Send', exact: true }).click(); await p.waitForTimeout(500);
await as('Erika'); await p.goto(U + '/home'); await p.locator('summary:has-text("Other alerts")').click();
ok(await p.locator('text=Could you look into this?').count() > 0, 'Erika got the idea with Dalia’s note on Home');
ok(await p.locator('text=/Insufficient data|\\$|revenue/').count() === 0, 'and none of the data behind it');
console.log(errs.length ? 'ERRORS ' + errs.join('\n') : 'No page errors.'); console.log(bad ? bad + ' FAILED' : 'ALL CHECKS PASSED'); await b.close();
