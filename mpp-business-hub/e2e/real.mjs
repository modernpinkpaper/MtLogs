import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type()==='error' && errs.push(m.text()));
const U = 'http://localhost:4180/#';
await p.goto(U + '/login'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(500);
console.log(await p.locator('button').allInnerTexts());
await p.getByRole('button', { name: /Dalia/ }).first().click(); await p.waitForTimeout(800);
await p.screenshot({ path: '/tmp/claude-0/-home-user-MtLogs/fd514dff-6e3b-5654-9705-d351e84762ad/scratchpad/home.png', fullPage: true });
for (const [n, h] of [['projects','/projects'],['p74','/projects/prj-074'],['team','/owner/team'],['print','/owner/team?tab=print']]) { await p.goto(U + h); await p.waitForTimeout(500); await p.screenshot({ path: `/tmp/claude-0/-home-user-MtLogs/fd514dff-6e3b-5654-9705-d351e84762ad/scratchpad/${n}.png`, fullPage: true }); }
await p.goto(U + '/login'); await p.getByRole('button', { name: /Arantza/ }).first().click(); await p.waitForTimeout(800);
await p.screenshot({ path: '/tmp/claude-0/-home-user-MtLogs/fd514dff-6e3b-5654-9705-d351e84762ad/scratchpad/arantza.png', fullPage: true });
console.log('errors', errs);
await b.close();
