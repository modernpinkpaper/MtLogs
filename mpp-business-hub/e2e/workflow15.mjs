import { chromium } from 'playwright';
// Final workflow pass: runs from a fresh demo state (storage cleared) and checks what a person actually sees.
// App must be running on port 4173:  npm run build && npx vite preview --port 4173
const OUT = process.env.OUT || './e2e/out/';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
const ok = (c, m) => { if (!c) errs.push('CHECK FAILED: ' + m); else console.log('  ok  ' + m); };
const U = 'http://localhost:4173/#';
const go = async (h) => { await p.goto(U + h); await p.waitForTimeout(350); };
const as = async (name) => { await p.selectOption('select[aria-label="Switch demo user"]', { label: name }); await p.waitForTimeout(300); };
const shot = (n, full = true) => p.screenshot({ path: OUT + n + '.png', fullPage: full });
const hub = (fn, ...a) => p.evaluate(([f, args]) => { const h = window.__hub; return eval('(' + f + ')')(h, ...args); }, [fn.toString(), a]);

await p.goto(U + '/login'); await p.evaluate(() => localStorage.clear()); await p.reload();
await p.getByRole('button', { name: /Erika/ }).first().click(); await p.waitForSelector('text=Do this next');

console.log('\n[3/4] A stale tracker plus detected activity becomes a confirmation task');
ok(await p.locator('text=Confirm where “Use Shopify Lister Tampermonkey script to list the new SKUs” stands').count() === 1, 'the hero asks Erika to confirm where the step stands');
ok(await p.locator('text=Tracker status:').count() > 0 && await p.locator('text=Activity detected:').count() > 0, 'tracker status and detected activity are labelled separately');
ok(await p.locator('text=Why this is next:').count() > 0 && await p.locator('text=/before you start over/').count() > 0, 'it says why this is next');
ok(await p.locator('button:has-text("Confirm progress")').count() === 1 && await p.locator('button:has-text("Open this step")').count() === 0, 'one clear action: Confirm progress (not “open this step” again)');
await shot('w1-mywork-confirm');

console.log('\n[10] Employee desktop layout');
for (const w of [1280, 1024]) {
  await p.setViewportSize({ width: w, height: 900 }); await go('/projects/prj-012/steps/s-012-3'); await p.waitForSelector('.frow');
  const g = await p.evaluate(() => { const a = document.querySelector('.split .plan')?.getBoundingClientRect(); const c = document.querySelector('section[aria-label^="Step"]')?.getBoundingClientRect(); return { sideBySide: !!a && !!c && a.right <= c.left + 2 && Math.abs(a.top - c.top) < 120, rows: document.querySelectorAll('.frow').length, sw: document.documentElement.scrollWidth, w: innerWidth, font: parseFloat(getComputedStyle(document.body).fontSize) }; });
  ok(g.sideBySide, `${w}px: steps on the left, selected step on the right`);
  ok(g.rows >= 4, `${w}px: ${g.rows} files are visible for the step, none hidden behind a click`);
  ok(g.sw <= g.w + 2, `${w}px: no sideways scrolling`);
  ok(g.font >= 14.5, `${w}px: text is readable (${g.font}px)`);
}
await p.setViewportSize({ width: 1280, height: 900 });

console.log('\n[1] Choosing, submitting and approving a file version');
await go('/projects/prj-012/steps/s-012-3'); await p.waitForSelector('.frow');
const rowA = p.locator('.frow:has(strong:has-text("(copy A)"))');
ok(await rowA.locator('button:has-text("Use for my work")').count() === 1, 'Erika can “Use for my work”');
ok(await rowA.locator('button:has-text("Submit for approval")').count() === 1, 'Erika can “Submit for approval”');
ok(await p.locator('button:has-text("Approve version for team use")').count() === 0, 'Erika is not offered “Approve version for team use”');
ok(await p.locator('button:has-text("Use this version")').count() === 0, 'the old ambiguous “Use this version” button is gone');
await rowA.locator('button:has-text("Use for my work")').click(); await p.waitForTimeout(300);
ok(await hub((h) => h.state.resources.find((r) => r.id === 'r-seo-a').approvedVersion) === null, 'choosing a version approved nothing');
ok(await rowA.locator('text=You are using this one').count() === 1, 'it shows “You are using this one”');
await rowA.locator('button:has-text("Submit for approval")').click(); await p.fill('textarea', 'All 154 rows checked.');
await p.getByRole('button', { name: 'Send to Dalia' }).click(); await p.waitForTimeout(400);
ok(await p.locator('.frow:has(strong:has-text("(copy A)")) >> text=Pending approval — Waiting for Dalia').count() === 1, 'submitting shows “Pending approval — Waiting for Dalia”');
ok(await hub((h) => h.state.resources.find((r) => r.id === 'r-seo-a').approvedVersion) === null, 'submitting approved nothing');
await shot('w2-erika-files');

console.log('\n[2] Reported complete is not verified complete');
await p.getByRole('button', { name: 'I finished this step' }).first().click(); await p.waitForTimeout(400);
await go('/projects/prj-012');
ok(await p.locator('text=2 of 4 verified complete · 1 reported complete (awaiting check)').count() > 0, 'the project page says “2 of 4 verified complete · 1 reported complete (awaiting check)”');
await go('/projects'); await p.waitForSelector('.prow');
ok(await p.locator('.prow:has-text("P-012") >> text=2 of 4 verified complete · 1 reported complete (awaiting check)').count() > 0, 'the project list uses the same wording');
ok(await hub((h) => h.state.steps.filter((s) => s.projectId === 'prj-012' && s.status === 'VERIFIED_COMPLETE').length) === 2, 'the verified count is still 2');

console.log('\n[7 owner mobile] Dalia on a phone');
await as('Dalia (owner)'); await p.setViewportSize({ width: 390, height: 820 }); await go('/home'); await p.waitForSelector('text=Needs your decision');
const mob = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, heads: [...document.querySelectorAll('h2.group-title')].map((e) => e.textContent.replace(/\d+$/, '').trim()) }));
ok(mob.sw <= 392, 'no sideways scrolling on the phone');
ok(['Needs your decision'].every((t) => mob.heads.includes(t)), 'sections: ' + mob.heads.join(' · '));
ok(await p.locator('button:has-text("Approve for the team")').isVisible(), 'the file approval request is on the first screen with its button (nothing hidden)');
ok(await p.locator('text=asked you to approve').count() > 0, 'it says who asked and what for');
await shot('w3-owner-mobile');
await p.locator('button:has-text("Approve for the team")').first().click();
ok(await p.locator('text=Please confirm').count() === 1, 'approving asks for a deliberate confirmation');
await p.getByRole('button', { name: 'Not now' }).click(); await p.waitForTimeout(200);
ok(await hub((h) => h.state.resources.find((r) => r.id === 'r-seo-a').approvedVersion) === null, 'cancelling the confirmation approved nothing');
await p.locator('button:has-text("Approve for the team")').first().click(); await p.getByRole('button', { name: 'Yes, approve' }).click(); await p.waitForTimeout(500);
ok(await hub((h) => h.state.resources.find((r) => r.id === 'r-seo-a').approval && h.state.resources.find((r) => r.id === 'r-seo-a').approval.byUid) === 'u-dalia', 'after she confirms, the approval is recorded as Dalia’s');
ok(await hub((h) => h.getJournal('u-dalia', { projectId: 'prj-012', types: ['RESOURCE'] }).some((e) => /approved for team use/i.test(e.title))) === true, 'the journal has an entry');
ok(await p.locator('text=Approve version?').count() === 0, 'the approval request left her list');
await p.setViewportSize({ width: 1280, height: 900 });

console.log('\n[6] A request survives navigation and reaches Dalia once');
await go('/projects/prj-070/steps/s-070-2'); await p.getByRole('button', { name: 'Ask for an update' }).first().click();
await p.getByLabel('Your question (if you want)').fill('Where does the Amazon helper stand?'); await p.getByRole('button', { name: 'Send request' }).click(); await p.waitForSelector('text=They now have a notification');
await p.getByRole('button', { name: 'Done', exact: true }).click();
ok(await p.locator('text=Requested').count() > 0, 'Dalia sees the request stage: Requested');
await as('Erika'); await go('/home'); await go('/projects'); await go('/home');
ok(await p.locator('text=Dalia asked you for an update').count() === 1, 'the request is still on Erika’s My Work after she navigated away');
await go('/review'); await p.waitForSelector('text=Dalia asked for an update');
ok(await p.locator('label:has-text("I need clarification")').count() === 1, 'the answers include “I need clarification”');
await p.locator('label:has-text("Still working on it")').first().click(); await p.locator('textarea').first().fill('Half done.');
await p.getByRole('button', { name: 'Send update to Dalia' }).click(); await p.waitForSelector('text=Update sent to Dalia');
await as('Dalia (owner)'); await go('/notifications');
ok(await p.locator('h3:has-text("answered your request")').count() === 1, 'Dalia has exactly one reply notification');
await go('/projects/prj-070'); ok(await p.locator('text=Answered').count() > 0, 'the request stage now says Answered');

console.log('\n[9] Private data stays private');
await as('Erika');
await go('/projects/prj-priv'); await p.waitForSelector('text=Permission denied'); ok(true, 'a direct link to the private project says “Permission denied”');
await p.locator('input[aria-label="Search"]').fill('private planning'); await p.waitForTimeout(400);
ok(await p.locator('.results .hit').count() === 0, 'searching for it finds nothing');
await go('/projects'); ok(await p.locator('text=Owner Private Planning').count() === 0, 'it is not in her project list');

console.log(errs.length ? '\n' + errs.join('\n') : '\nNO ERRORS, ALL CHECKS PASSED');
await b.close();
