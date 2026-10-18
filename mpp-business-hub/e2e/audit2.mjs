import { chromium } from 'playwright';
const OUT = process.env.OUT || '/tmp/shots/';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const URL = 'http://localhost:4173/#';
const go = async (h) => { await p.goto(URL + h); await p.waitForTimeout(350); };
const as = async (name) => { await p.selectOption('select[aria-label="Switch demo user"]', { label: name }); await p.waitForTimeout(250); };
const shot = (n) => p.screenshot({ path: OUT + n + '.png', fullPage: true });
await go('/login'); await p.getByRole('button', { name: /Dalia/ }).first().click(); await p.waitForTimeout(500);
for (const [n,h] of [['home','/home'],['projects','/projects'],['prj','/projects/prj-012'],['finding','/owner/ai/af-1'],['team','/owner/team'],['print','/owner/team?tab=print'],['other','/owner/other-work'],['insights','/owner/insights'],['journal','/journal'],['files','/resources'],['settings','/settings'],['intake','/owner/data-intake'],['demo','/demo/operations'],['notif','/notifications'],['ai','/owner/ai']]) { await go(h); await shot('2o-'+n); }
await as('Erika');
for (const [n,h] of [['home','/home'],['prj','/projects/prj-012'],['review','/review'],['clock','/clock'],['notif','/notifications'],['projects','/projects'],['files','/resources']]) { await go(h); await shot('2e-'+n); }
await b.close();
