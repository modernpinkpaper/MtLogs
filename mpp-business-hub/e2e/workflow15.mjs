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
await p.getByRole('button', { name: /Erika/ }).first().click(); await p.waitForSelector('text=Your projects');

console.log('\n[3/4] A stale tracker plus detected activity becomes a confirmation task');
ok(await p.locator('text=Activity seen — status differs').count() === 1 && await p.locator('text=P-012').count() > 0, 'Home shows a notification: the tracker and the activity disagree on P-012 step 3');
ok(await p.locator('text=Confirm').count() >= 1, 'it has a clear Confirm action');
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

console.log('\n[1] Choosing the version of a file');
await go('/projects/prj-012/steps/s-012-3'); await p.waitForSelector('.frow');
const rowA = p.locator('.frow:has(strong:has-text("(copy A)"))');
const rowB = p.locator('.frow:has(strong:has-text("(copy B"))');
ok(await rowA.locator('text=/Last modified .*(Oct|Sep)/').count() === 1, 'copy A shows its last-modified date and time');
ok(await rowB.locator('text=/Last modified .*(Oct|Sep)/').count() === 1, 'copy B shows its own last-modified date and time (so the copies cannot be mixed up)');
ok(await rowA.locator('text=/Version rev 41/').count() === 1, 'the version is shown next to the file name');
ok(await rowA.locator('button:has-text("Use this version for the project")').count() === 1, 'Erika can choose a version for the project herself');
ok(await p.locator('button:has-text("Submit for approval")').count() === 0 && await p.locator('button:has-text("Approve version for team use")').count() === 0, 'there is no approval step to wait for');
await rowA.locator('button:has-text("Use this version for the project")').click(); await p.getByRole('button', { name: 'Yes, use this one' }).click(); await p.waitForTimeout(400);
ok(await rowA.locator('text=Chosen version — Use this one').count() === 1, 'it is marked as the chosen version');
ok(await rowA.locator('text=/Chosen by Erika/').count() === 1, 'it shows who chose it and when');
ok(await hub((h) => h.state.resources.find((r) => r.id === 'r-seo-a').approval.byUid) === 'u-erika', 'the choice is recorded as Erika’s');
ok(await rowB.locator('text=No version chosen yet').count() === 1, 'the other copy (named FINAL) is still unchosen');
await shot('w2-erika-files');

console.log('\n[2] A step Erika says is done is done');
await p.getByRole('button', { name: 'Completed' }).first().click(); await p.waitForTimeout(400);
await go('/projects/prj-012');
ok(await p.locator('text=3 of 4 steps done').count() > 0, 'the project page says “3 of 4 steps done”');
await go('/projects'); await p.waitForSelector('.prow');
ok(await p.locator('.prow:has-text("P-012") >> text=3 of 4 steps done').count() > 0, 'the project list says the same');
ok(await hub((h) => h.state.steps.find((s) => s.id === 's-012-3').verifications.length) === 0, 'the app does not claim any outside check');

console.log('\n[7 owner mobile] Dalia on a phone');
await as('Dalia (owner)'); await p.setViewportSize({ width: 390, height: 820 }); await go('/home'); await p.waitForSelector('text=New AI opportunities');
const mob = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, heads: [...document.querySelectorAll('h2.group-title')].map((e) => e.textContent.replace(/\d+$/, '').trim()) }));
ok(mob.sw <= 392, 'no sideways scrolling on the phone');
ok(mob.heads.includes('New AI opportunities'), 'phone sections: ' + mob.heads.join(' · '));
ok(await p.locator('text=Verify result').count() === 0, 'Dalia is not given a checking chore for Erika’s finished step');
ok(await p.locator('button:has-text("Review opportunities")').isVisible(), 'the AI decision on the first screen has its button (nothing hidden)');
await shot('w3-owner-mobile');
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
