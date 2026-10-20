import { chromium } from 'playwright';
const U = 'http://localhost:4173/#';
const b = await chromium.launch();
const roles = ['Dalia', 'Erika', 'Carolina', 'Print Employee A', 'Arantza'];
const routes = ['/home', '/projects', '/projects/prj-012', '/projects/prj-012/steps/s-012-3', '/projects/prj-070/steps/s-070-2?tab=files', '/projects/prj-070?tab=files', '/projects/prj-070?tab=history', '/clock', '/print/my-stats', '/journal', '/resources', '/settings', '/status', '/demo/operations', '/errors', '/review', '/notifications', '/owner/ai', '/owner/ai/af-1', '/owner/ai?tab=priorities', '/owner/ai?tab=results', '/owner/team', '/owner/team?tab=print', '/owner/team?tab=other', '/owner/team?tab=ideas', '/owner/data-intake'];
let problems = 0;
for (const [w, h, label] of [[1280, 900, 'desktop'], [390, 820, 'phone']]) {
  for (const role of roles) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: w < 500 });
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 140)); });
    await p.goto(U + '/login'); await p.evaluate(() => localStorage.clear()); await p.reload();
    await p.getByRole('button', { name: new RegExp(role) }).first().click(); await p.waitForTimeout(500);
    if (role === 'Dalia') { await p.evaluate(() => { window.__hub.setCustomerService('u-dalia', window.__hub.state.users.find((u) => u.name === 'Arantza').id, true); }); }
    for (const r of routes) {
      errs.length = 0;
      await p.goto(U + r); await p.waitForTimeout(350);
      const info = await p.evaluate(() => {
        const sw = document.documentElement.scrollWidth, iw = window.innerWidth;
        const text = (document.querySelector('main')?.innerText ?? '').trim();
        const tiny = [...document.querySelectorAll('main button:not(.pinfo-btn), main a.button, main select, main input:not([type=checkbox]):not([type=radio])')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 28; }).length;
        return { overflow: sw > iw + 2 ? sw - iw : 0, empty: text.length < 15, tiny, url: location.hash, denied: /Permission denied/.test(text) };
      });
      const issues = [];
      if (info.overflow) issues.push('sideways scroll by ' + info.overflow + 'px');
      if (info.empty) issues.push('page is empty');
      if (label === 'phone' && info.tiny > 0) issues.push(info.tiny + ' tiny tap targets');
      if (errs.length) issues.push(...errs);
      if (issues.length) { problems++; console.log(`[${label}] ${role} ${r} -> ${info.url}${info.denied ? ' (denied)' : ''}: ${issues.join(' | ')}`); }
    }
    await ctx.close();
  }
}
console.log(problems ? problems + ' pages with issues' : 'NO ISSUES'); await b.close();
