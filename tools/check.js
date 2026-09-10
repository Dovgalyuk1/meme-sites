// Проверка сайта перед деплоем.
//   cd <имя> && (nohup python3 -m http.server 8901 >/dev/null 2>&1 &)
//   node tools/check.js <имя> [порт]
// Ловит ошибки страницы, снимает десктоп и мобилку, меряет горизонтальный скролл.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');

const site = process.argv[2];
const port = process.argv[3] || 8901;
if (!site) { console.error('usage: node tools/check.js <имя> [порт]'); process.exit(1); }

const url = `http://127.0.0.1:${port}/`;
const out = `shots/${site}`;
fs.mkdirSync(out, { recursive: true });

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errs = [];
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => {
    if (m.type() !== 'error') return;
    // favicon.ico на локальном сервере всегда 404 — это не ошибка сайта
    const src = (m.location() && m.location().url) || '';
    if (/favicon\.ico/.test(src)) return;
    errs.push('console: ' + m.text() + (src ? '  <- ' + src : ''));
  });

  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);

  // гейт CLICK TO ENTER, если он есть
  const gate = await p.$('#gate, .gate, [data-gate]');
  if (gate) { await gate.click({ force: true }).catch(() => {}); await p.waitForTimeout(900); }

  await p.screenshot({ path: `${out}/01-hero.png` });
  const full = await p.evaluate(() => document.body.scrollHeight);
  for (let i = 1, n = Math.min(8, Math.ceil(full / 1000)); i < n; i++) {
    await p.evaluate(y => scrollTo(0, y), i * 1000);
    await p.waitForTimeout(650);
    await p.screenshot({ path: `${out}/${String(i + 1).padStart(2, '0')}-scroll.png` });
  }

  const m = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  m.on('pageerror', e => errs.push('mobile pageerror: ' + e.message));
  await m.goto(url, { waitUntil: 'networkidle' });
  await m.waitForTimeout(1200);
  const g2 = await m.$('#gate, .gate, [data-gate]');
  if (g2) { await g2.click({ force: true }).catch(() => {}); await m.waitForTimeout(900); }
  await m.screenshot({ path: `${out}/90-mobile.png` });
  const over = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  await b.close();

  console.log(`высота страницы: ${full}px`);
  console.log(`горизонтальный вылет на 390px: ${over}px${over === 0 ? '' : '  <-- чинить'}`);
  console.log(errs.length ? 'ОШИБКИ:\n  ' + errs.join('\n  ') : 'ошибок страницы нет');
  console.log(`скриншоты: ${out}/`);
  process.exit(errs.length || over !== 0 ? 1 : 0);
})();
