import { chromium } from 'playwright';
const OUT = process.env.OUT || '/tmp/shots/';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const URL = 'http://localhost:4173/#';
const go = async (h) => { await p.goto(URL + h); await p.waitForTimeout(350); };
const as = async (name) => { await p.selectOption('select[aria-label="Switch demo user"]', { label: name }); await p.waitForTimeout(250); };
const shot = (n) => p.screenshot({ path: OUT + n + '.png', fullPage: true });
await go('/login'); await shot('a00-login');
await p.getByRole('button', { name: /Dalia/ }).first().click(); await p.waitForTimeout(500);
const pages = [['home','/home'],['projects','/projects'],['prj012','/projects/prj-012'],['review','/review'],['teamprint','/team-print'],['ai','/owner/ai'],['notif','/notifications'],['settings','/settings'],['demo','/demo/operations']];
for (const [n,h] of pages) { await go(h); await shot('o-'+n); }
await as('Erika');
const ep = [['home','/home'],['mywork','/my-work'],['projects','/projects'],['prj012','/projects/prj-012'],['review','/review'],['notif','/notifications'],['clock','/clock']];
for (const [n,h] of ep) { await go(h); await shot('e-'+n); }
await p.setViewportSize({ width: 390, height: 820 });
for (const [n,h] of [['home','/home'],['projects','/projects'],['prj012','/projects/prj-012'],['review','/review']]) { await go(h); await shot('m-e-'+n); }
await as('Dalia (owner)');
for (const [n,h] of [['home','/home'],['ai','/owner/ai']]) { await go(h); await shot('m-o-'+n); }
await b.close();
