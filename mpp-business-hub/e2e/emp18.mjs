import { chromium } from 'playwright';
const U = 'http://localhost:4173/#';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
let bad = 0; const ok = (c, m) => { console.log((c ? '  ok  ' : 'CHECK FAILED: ') + m); if (!c) bad++; };
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(U + '/login'); await p.evaluate(() => localStorage.clear()); await p.reload();
await p.getByRole('button', { name: /Erika/ }).first().click(); await p.waitForSelector('h2:has-text("Notifications")');
ok(await p.locator('nav >> text=Home').count() > 0, 'first page is called Home');
await p.goto(U + '/projects/prj-070/steps/s-070-2'); await p.waitForSelector('text=What to do');
ok(await p.locator('text=Who can see it').count() === 0 && await p.locator('text=How we count progress').count() === 0, 'removed "Who can see it" and "How we count progress"');
ok(await p.locator('text=AI last checked your activity').count() + await p.locator('text=has not checked').count() > 0, 'AI last checked line is shown');
ok(await p.getByRole('button', { name: 'Check my activity now' }).count() === 1, 'Check my activity now button');
ok(await p.getByRole('button', { name: 'Begin' }).count() === 0, 'there is no Begin button any more');
ok(await p.getByRole('button', { name: 'Update status' }).count() >= 1, 'one Update status button');
// add 2 steps
await p.getByRole('button', { name: 'Add steps' }).or(p.getByText('Add steps').first()).first().click();
await p.getByLabel('How many steps?').fill('2'); await p.getByRole('button', { name: 'Add', exact: true }).click(); await p.waitForTimeout(500);
ok(await p.locator('.step:has-text("New step")').count() >= 2, 'two blank steps were added');
// sub steps
await p.getByText('Add sub steps').first().click(); await p.getByLabel('How many sub steps?').fill('2'); await p.getByRole('button', { name: 'Add', exact: true }).click(); await p.waitForTimeout(500);
ok(await p.locator('.subrow .num:has-text("2A")').count() === 1 && await p.locator('.subrow .num:has-text("2B")').count() === 1, 'sub steps are labeled 2A and 2B');
// new sheet
await p.getByRole('button', { name: /Add file/ }).click(); await p.getByRole('menuitem', { name: 'New Google Doc' }).click();
await p.getByRole('button', { name: 'Make it' }).click(); await p.waitForSelector('text=File made');
ok(await p.locator('text=/P-070 - .* - 2 Build Amazon listing automation - .* - File 1/').count() > 0, 'file got the standard name');
await p.getByRole('button', { name: 'Done', exact: true }).click();
// reorder
await p.getByRole('button', { name: 'Move 2 up' }).click(); await p.waitForTimeout(400);
ok(await p.locator('.step:has-text("Build Amazon listing automation") .num').first().innerText() === '1', 'moving a step up renumbers it');
// Update status on a blank step
await p.locator('.step:has-text("New step")').first().click(); await p.waitForTimeout(300);
await p.getByRole('button', { name: 'Update status' }).first().click();
ok(await p.getByRole('button', { name: 'In progress', exact: true }).count() >= 1, 'In progress is the name for starting a step');
await p.getByRole('button', { name: 'In progress', exact: true }).first().click(); await p.waitForTimeout(300);
await p.getByRole('button', { name: 'Update status' }).first().click();
ok(await p.getByRole('button', { name: 'In progress', exact: true }).first().isDisabled(), 'the current status is greyed out');
await p.getByRole('button', { name: 'Completed', exact: true }).first().click(); await p.waitForSelector('text=/Marked done/');
await p.getByRole('button', { name: 'Update status' }).first().click();
ok(await p.getByRole('button', { name: 'Completed', exact: true }).first().isDisabled(), 'once completed, the Completed button is greyed out');
ok(await p.locator('section[aria-label^="Step"] .row:not(.journal-item *) >> text=Employee confirmed').count() === 0, '"Employee confirmed" is gone from the step header');
// All files grouped by step
await p.goto(U + '/projects/prj-070?tab=files'); await p.waitForSelector('text=All files');
ok(await p.locator('h2.group-title:has-text("Step ")').count() > 0, 'All files is grouped by step');
console.log(errs.length ? 'ERRORS ' + errs.join('\n') : 'No page errors.'); console.log(bad ? bad + ' FAILED' : 'ALL CHECKS PASSED'); await b.close();
