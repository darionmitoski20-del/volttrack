// Screenshots of every page on phone sizes + a list of things wider than the screen.
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';

const BASE = process.env.BASE ?? 'https://darionmitoski20-del.github.io/volttrack';
const SITE = process.env.SITE ?? '55e79c06-d59f-4118-a1cc-c5851b47c91f';
const sizes = [
  { name: 'iphone14', ...devices['iPhone 14'] },
  { name: 'android360', viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['Pixel 5'].userAgent },
];
const OWNER = ['/app', '/app/employees', '/app/live-hours', '/app/job-sites', `/app/job-sites/${SITE}`, '/app/time-entries', '/app/timesheets',
  '/app/inspections', '/app/materials', '/app/reports', '/app/analysis', '/app/chat', '/app/settings', '/app/profile'];
const EMP = ['/me', '/me/time-entries', '/me/timesheets', '/me/calendar', '/me/job-sites', '/me/chat', '/me/materials', '/me/stats', '/me/profile', '/me/inspections'];
const PLAN_TABS = ['Plan', 'Overview', 'By room', 'Daily report', 'Revisions', 'Review'];

mkdirSync('shots', { recursive: true });
const report = [];
const browser = await chromium.launch();

async function overflow(page) {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth, out = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > W + 1 || r.left < -1) {
        let p = el.parentElement, clipped = false;
        while (p) { const s = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(s.overflowX)) { clipped = true; break; } p = p.parentElement; }
        if (!clipped) out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 80)} [${Math.round(r.left)}..${Math.round(r.right)}] "${(el.textContent || '').trim().slice(0, 40)}"`);
      }
    }
    return { scrollW: document.documentElement.scrollWidth, W, items: out.slice(0, 12) };
  });
}

async function shot(page, tag) {
  await page.waitForTimeout(2500);
  const o = await overflow(page);
  report.push({ tag, ...o });
  await page.screenshot({ path: `shots/${tag}.jpg`, fullPage: true, type: 'jpeg', quality: 60 });
}

for (const dev of sizes) {
  for (const role of ['owner', 'employee']) {
    const ctx = await browser.newContext({ ...dev });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/signin`);
    await page.getByRole('button', { name: role === 'owner' ? 'Owner' : 'Employee' }).click();
    await page.waitForURL(role === 'owner' ? /\/app/ : /\/me/, { timeout: 30000 });
    for (const p of role === 'owner' ? OWNER : EMP) {
      await page.goto(BASE + p);
      await shot(page, `${dev.name}-${role}${p.replace(/\//g, '_').replace(SITE, 'site')}`);
    }
    // the menu
    const menu = page.getByRole('button', { name: 'Menu' });
    if (await menu.isVisible().catch(() => false)) { await menu.click(); await shot(page, `${dev.name}-${role}-menu`); await page.keyboard.press('Escape'); }
    // add hours modal (employee)
    if (role === 'employee') {
      await page.goto(BASE + '/me');
      await page.waitForTimeout(2000);
      const add = page.getByRole('button', { name: 'Add work hours' });
      if (await add.isVisible().catch(() => false)) { await add.click(); await shot(page, `${dev.name}-employee-addhours`); }
    }
    // plan reader tabs
    const pr = role === 'owner' ? `/app/job-sites/${SITE}/plans` : `/me/job-sites/${SITE}/plans`;
    await page.goto(BASE + pr);
    await page.waitForTimeout(6000);
    for (const t of PLAN_TABS) {
      const b = page.getByRole('button', { name: t, exact: true });
      if (!(await b.isVisible().catch(() => false))) continue;
      await b.click();
      await shot(page, `${dev.name}-${role}-plan-${t.replace(/ /g, '')}`);
    }
    await ctx.close();
  }
}
await browser.close();
writeFileSync('shots/report.json', JSON.stringify(report, null, 1));
console.log(report.filter((r) => r.scrollW > r.W || r.items.length).map((r) => `${r.tag}: scrollW ${r.scrollW} > ${r.W}\n  ${r.items.join('\n  ')}`).join('\n'));
