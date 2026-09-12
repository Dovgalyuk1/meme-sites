#!/usr/bin/env node
/* Разбор референсных сайтов серии — берёт копию и снимает с неё всё, что нужно.
 *
 *   node tools/refs.js                 — всё из claude/inbox/ и из tools/refs.txt
 *   node tools/refs.js sulky.fun       — конкретный домен
 *   node tools/refs.js kapy.html       — сохранённая страница с диска
 *
 * Два источника, оба равноправны. Домен качается целиком через curl. Файл,
 * сохранённый Олегом из браузера (Cmd+S, «только HTML»), просто кладётся в
 * claude/inbox/ — картинок в нём нет, всё остальное есть.
 *
 * Кладёт в claude/refs/<имя>/: index.html и assets/ (локальная копия сайта),
 * desk.png (1440) и mob.png (390), facts.json — машинный разбор структуры.
 * Печатает сводку: вес, заголовки, кнопки, приёмы серии, следы мини-игры.
 *
 * Почему так, а не Playwright прямо по адресу: в этом контейнере браузер не
 * проходит TLS-рукопожатие через агент-прокси, а curl проходит. Поэтому сайт
 * зеркалим curl-ом, а Chromium рендерит уже локальную копию с локального
 * сервера. Сайты серии — один HTML с инлайновыми стилями и скриптами, так что
 * копия ведёт себя как оригинал; наружу из неё ходят только живые данные
 * DEXScreener, их всё равно не видно из контейнера.
 *
 * Домен должен быть в Allowed domains окружения. Иначе прокси отвечает 403 на
 * CONNECT, и скрипт прямо скажет, какой хост закрыт.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'claude', 'refs');
const PORT = 8913;

const INBOX = path.join(ROOT, 'claude', 'inbox');

function sites() {
  const args = process.argv.slice(2).filter(Boolean);
  if (args.length) return args;
  const out = [];
  if (fs.existsSync(INBOX)) {
    out.push(...fs.readdirSync(INBOX).filter(f => /\.html?$/i.test(f))
      .map(f => path.join(INBOX, f)));
  }
  const list = path.join(__dirname, 'refs.txt');
  if (fs.existsSync(list)) {
    out.push(...fs.readFileSync(list, 'utf8').split('\n').map(s => s.trim())
      .filter(s => s && !s.startsWith('#')));
  }
  if (!out.length) throw new Error('пусто: ни файлов в claude/inbox/, ни доменов в tools/refs.txt');
  return out;
}

const isFile = s => !/^https?:/.test(s) && /\.html?$/i.test(s) && fs.existsSync(s);

const norm = u => (/^https?:/.test(u) ? u : 'https://' + u);
/* Имя папки — только латиница: файл может прийти с кириллицей в названии. */
const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'ref';
const nameOf = s => isFile(s)
  ? slug(path.basename(s).replace(/\.html?$/i, ''))
  : slug(norm(s).replace(/^https?:\/\//, '').replace(/\/.*$/, '').split('.')[0]);

function curl(url, outFile) {
  const args = ['-sSL', '--max-time', '60', '-A', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36'];
  if (outFile) args.push('-o', outFile, '-w', '%{http_code}');
  args.push(url);
  return execFileSync('curl', args, { encoding: outFile ? 'utf8' : 'buffer', maxBuffer: 64 * 1024 * 1024 });
}

/* Ссылки на ассеты живут и в атрибутах, и в url() внутри <style>, и просто
   строками в инлайновом JS (персонажа часто подставляют скриптом). */
function assetUrls(html) {
  const found = new Set();
  const add = u => {
    u = (u || '').trim().replace(/^['"]|['"]$/g, '');
    if (!u || /^(data:|#|javascript:|mailto:)/i.test(u)) return;
    found.add(u);
  };
  for (const m of html.matchAll(/<(?:img|source|video|audio)[^>]+src=["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/srcset=["']([^"']+)["']/gi)) m[1].split(',').forEach(p => add(p.trim().split(/\s+/)[0]));
  for (const m of html.matchAll(/<link[^>]+href=["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi)) add(m[2]);
  for (const m of html.matchAll(/["']([^"']+\.(?:webp|png|jpe?g|gif|svg|avif|mp3|ogg|wav|woff2?|ttf))["']/gi)) add(m[1]);
  return [...found];
}

function mirror(src, dir) {
  fs.mkdirSync(path.join(dir, 'mirror'), { recursive: true });
  const htmlFile = path.join(dir, 'mirror', 'index.html');

  /* Сохранённая страница: копируем как есть, ассеты подтягивать неоткуда. */
  if (isFile(src)) {
    fs.copyFileSync(src, htmlFile);
    return { source: path.relative(ROOT, src), assets: 0, assetsMissed: 0,
             bytes: fs.statSync(htmlFile).size };
  }

  const page = norm(src);
  const code = curl(page, htmlFile);
  if (!/^2/.test(String(code).trim())) throw new Error('сайт ответил HTTP ' + code);
  let html = fs.readFileSync(htmlFile, 'utf8');

  const base = new URL(page);
  let ok = 0, miss = 0;
  for (const raw of assetUrls(html)) {
    let abs;
    try { abs = new URL(raw, base); } catch { continue; }
    if (!/^https?:$/.test(abs.protocol)) continue;
    /* Внешние CDN оставляем как есть: из контейнера они всё равно закрыты,
       а локальная копия должна честно показывать, что сайт их тянет. */
    if (abs.host !== base.host) continue;
    const local = path.posix.join('a', abs.pathname.replace(/^\/+/, '').replace(/[^\w./-]/g, '_') || 'index');
    const dest = path.join(dir, 'mirror', local);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    try { curl(abs.href, dest); ok++; } catch { miss++; continue; }
    html = html.split(raw).join(local);
  }
  fs.writeFileSync(htmlFile, html);
  return { source: page, assets: ok, assetsMissed: miss, bytes: Buffer.byteLength(html) };
}

/* Всё, что интересно знать о чужом сайте серии, снимаем внутри страницы. */
function probe() {
  const txt = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const vis = el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  const html = document.documentElement.outerHTML;
  const js = [...document.querySelectorAll('script:not([src])')].map(s => s.textContent).join('\n');
  const css = [...document.querySelectorAll('style')].map(s => s.textContent).join('\n');
  const has = re => re.test(js) || re.test(css) || re.test(html);
  const body = document.body.innerText;

  return {
    title: document.title,
    meta: {
      description: (document.querySelector('meta[name=description]') || {}).content || null,
      ogImage: (document.querySelector('meta[property="og:image"]') || {}).content || null,
    },
    size: { html: html.length, inlineJs: js.length, inlineCss: css.length },
    fonts: [...new Set((css.match(/font-family:[^;}]+/gi) || []).map(s => s.slice(12).trim()))].slice(0, 12),
    palette: [...new Set((css.match(/#[0-9a-f]{3,8}\b/gi) || []))].slice(0, 24),
    external: {
      scripts: [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src')),
      styles: [...document.querySelectorAll('link[rel=stylesheet]')].map(l => l.getAttribute('href')),
    },
    images: [...document.images].map(i => ({ src: i.getAttribute('src'), alt: i.alt || null })),
    headings: [...document.querySelectorAll('h1,h2,h3')].filter(vis).map(h => ({ tag: h.tagName, text: txt(h) })),
    buttons: [...new Set([...document.querySelectorAll('button,a[href],[role=button]')]
      .filter(vis).map(b => txt(b).slice(0, 60)).filter(Boolean))],
    copy: [...document.querySelectorAll('p,li')].filter(vis).map(txt).filter(t => t.length > 40).slice(0, 60),
    /* Приёмы из библиотеки скилла: что именно здесь использовано. */
    tricks: {
      gate: has(/click to enter|enter site|#gate\b|\.gate\b/i),
      canvas: !!document.querySelector('canvas'),
      threejs: has(/three(\.min)?\.js|THREE\./),
      css3d: has(/preserve-3d/),
      webAudio: has(/AudioContext|webkitAudioContext/),
      musicToggle: /\bmusic\b/i.test(body),
      soundToggle: /\bsound\b|\bsfx\b|\bmute\b/i.test(body),
      scrollStory: has(/position:\s*sticky/) && has(/getBoundingClientRect/),
      coinRain: /coin|rain|confetti/i.test(js) && has(/requestAnimationFrame/),
      marquee: has(/marquee|translateX\(-100%\)/i),
      scanlines: has(/repeating-linear-gradient/),
      grain: has(/mix-blend-mode/),
      textStroke: has(/-webkit-text-stroke/),
      gradientText: has(/background-clip:\s*text/),
      retroBevel: has(/inset 1px 1px 0 #fff/i),
      dexscreener: has(/dexscreener/i),
      clipboardCA: has(/clipboard/i),
      pumpfun: has(/pump\.fun/i),
      wallet: /wallet|phantom|solflare/i.test(body),
      roadmapOrTokenomics: /roadmap|tokenomics/i.test(body),
      disclaimer: /no utility|not financial advice|no roadmap/i.test(body),
    },
    game: {
      progressLike: [...new Set(body.match(/\b\d{1,2}\s*\/\s*\d{1,2}\b/g) || [])].slice(0, 10),
      keywords: ['play', 'start', 'score', 'level', 'round', 'win', 'shoot', 'catch', 'dig', 'claim']
        .filter(k => new RegExp('\\b' + k + '\\b', 'i').test(body)),
    },
    socials: [...new Set([...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href') || '')
      .filter(h => /x\.com|twitter|t\.me|telegram|dexscreener|dextools|birdeye/i.test(h)))],
    contractLike: [...new Set(body.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g) || [])].slice(0, 3),
    fullText: body.replace(/\n{3,}/g, '\n\n'),
  };
}

async function shoot(browser, url, dir, facts) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2500);

  /* Гейт «click to enter» прячет сайт целиком — без клика снимем пустой экран. */
  const gate = page.locator('text=/click to enter|tap to enter|enter/i').first();
  if (await gate.count()) { await gate.click({ timeout: 2500 }).catch(() => {}); await page.waitForTimeout(1500); }

  Object.assign(facts, await page.evaluate(probe));
  facts.pageErrors = errs;
  facts.scrollHeight = await page.evaluate(() => document.body.scrollHeight);
  await page.screenshot({ path: path.join(dir, 'desk.png'), fullPage: true });

  const mob = await ctx.newPage();
  await mob.setViewportSize({ width: 390, height: 844 });
  await mob.goto(url, { waitUntil: 'load', timeout: 30000 });
  await mob.waitForTimeout(2000);
  const g2 = mob.locator('text=/click to enter|tap to enter|enter/i').first();
  if (await g2.count()) { await g2.click({ timeout: 2500 }).catch(() => {}); await mob.waitForTimeout(1200); }
  facts.mobileOverflow = await mob.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await mob.screenshot({ path: path.join(dir, 'mob.png'), fullPage: true });
  await ctx.close();
}

/* Болванка разбора: машинная часть заполнена, человеческая — пустая.
   Дальше её дописывает Claude, посмотрев на скриншоты глазами. Готовый
   разбор не перезаписываем никогда. */
function skeleton(f, dir) {
  const file = path.join(dir, 'разбор.md');
  if (fs.existsSync(file)) return false;
  const on = Object.keys(f.tricks).filter(k => f.tricks[k]);
  const off = Object.keys(f.tricks).filter(k => !f.tricks[k]);
  const L = [];
  L.push('# ' + f.name + ' — ' + (f.title || 'без title'));
  L.push('');
  L.push('Источник: ' + (f.url || f.source) + '  ');
  L.push('Снято: ' + new Date().toISOString().slice(0, 10));
  L.push('');
  L.push('## Что это');
  L.push('');
  L.push('<!-- Персонаж, в чём суть монеты, понятно ли это с первого экрана. -->');
  L.push('');
  L.push('## Архетип');
  L.push('');
  L.push('<!-- A постер / B фейковая ОС / C картридж / D скролл-стори / E 3D.');
  L.push('     Если ни один не подходит — описать новый. -->');
  L.push('');
  L.push('## Мини-игра');
  L.push('');
  L.push('<!-- Механика, сколько шагов, видно ли её с первого экрана, что за награда. -->');
  L.push('');
  L.push('Следы в тексте: ' + (f.game.progressLike.join(' ') || 'счётчика не видно') +
         ' · ' + (f.game.keywords.join(' ') || '—'));
  L.push('');
  L.push('## Оформление');
  L.push('');
  L.push('<!-- Палитра, шрифты, чем держится настроение, что украсть. -->');
  L.push('');
  L.push('Шрифты: ' + (f.fonts.slice(0, 5).join(' · ') || '—'));
  L.push('');
  L.push('Палитра: ' + (f.palette.slice(0, 12).join(' ') || '—'));
  L.push('');
  L.push('## Копирайтинг');
  L.push('');
  L.push('<!-- Голос персонажа, длина реплик, микро-статусы. Выписать 2-3 лучшие строки. -->');
  L.push('');
  L.push('## Что забрать в свои сайты');
  L.push('');
  L.push('<!-- Конкретные приёмы. Это главная часть файла. -->');
  L.push('');
  L.push('## Что не повторять');
  L.push('');
  L.push('<!-- Занятая механика, занятая тема музыки, слабые места. -->');
  L.push('');
  L.push('## Машинная часть');
  L.push('');
  L.push('| | |');
  L.push('|---|---|');
  L.push('| вес | html ' + (f.size.html / 1024).toFixed(1) + ' KB · js ' +
         (f.size.inlineJs / 1024).toFixed(1) + ' KB · css ' + (f.size.inlineCss / 1024).toFixed(1) + ' KB |');
  L.push('| высота страницы | ' + f.scrollHeight + ' px |');
  L.push('| мобильный оверфлоу | ' + f.mobileOverflow + ' |');
  L.push('| внешние скрипты | ' + (f.external.scripts.join(', ') || 'нет') + ' |');
  L.push('| есть | ' + on.join(', ') + ' |');
  L.push('| нет | ' + off.join(', ') + ' |');
  L.push('| соцсети | ' + (f.socials.join(' ') || 'нет') + ' |');
  L.push('');
  L.push('Заголовки: ' + (f.headings.map(h => h.text).join(' · ') || '—'));
  L.push('');
  L.push('Кнопки: ' + (f.buttons.join(' · ') || '—'));
  L.push('');
  L.push('Скриншоты рядом: `desk.png` (1440), `mob.png` (390). Полный дамп — `facts.json`.');
  L.push('');
  fs.writeFileSync(file, L.join('\n'));
  return true;
}

function report(f) {
  const on = Object.keys(f.tricks).filter(k => f.tricks[k]);
  console.log('\n=== ' + f.url + ' — ' + f.title);
  console.log('  вес: html ' + (f.size.html / 1024).toFixed(1) + ' KB, js ' +
    (f.size.inlineJs / 1024).toFixed(1) + ' KB, css ' + (f.size.inlineCss / 1024).toFixed(1) +
    ' KB, ассетов ' + f.assets + (f.assetsMissed ? ' (не скачалось ' + f.assetsMissed + ')' : ''));
  console.log('  высота ' + f.scrollHeight + ' px, мобильный оверфлоу ' + f.mobileOverflow +
    ', внешних скриптов ' + f.external.scripts.length);
  console.log('  заголовки: ' + f.headings.map(h => h.text).join(' · ').slice(0, 280));
  console.log('  кнопки: ' + f.buttons.join(' · ').slice(0, 280));
  console.log('  приёмы: ' + on.join(', '));
  console.log('  игра: ' + (f.game.progressLike.join(' ') || 'счётчик не найден') +
    ' | ' + f.game.keywords.join(' '));
  console.log('  соцсети: ' + (f.socials.join(' ') || 'нет'));
  if (f.pageErrors.length) console.log('  ОШИБКИ В КОНСОЛИ: ' + f.pageErrors.join(' | '));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', OUT],
    { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 900));

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const done = [], failed = [];
  for (const s of sites()) {
    const n = nameOf(s), dir = path.join(OUT, n);
    try {
      fs.mkdirSync(dir, { recursive: true });
      const m = mirror(s, dir);
      const facts = { name: n, url: isFile(s) ? null : norm(s), ...m };
      await shoot(browser, 'http://127.0.0.1:' + PORT + '/' + n + '/mirror/index.html', dir, facts);
      fs.writeFileSync(path.join(dir, 'facts.json'), JSON.stringify(facts, null, 2));
      const fresh = skeleton(facts, dir);
      report(facts);
      console.log('  разбор: claude/refs/' + n + '/разбор.md' + (fresh ? ' (болванка, дописать глазами)' : ' (уже есть, не трогал)'));
      done.push(facts);
    } catch (e) {
      const msg = String(e.message || e).split('\n')[0];
      const blocked = /403|CONNECT|tunnel|curl: \(56\)|curl: \(35\)/i.test(msg);
      failed.push(n);
      console.log('\n=== ' + s + ' — НЕ ОТКРЫЛСЯ' +
        (blocked ? ': хост закрыт egress-политикой, добавь его в Allowed domains окружения' : ''));
      console.log('  ' + msg.slice(0, 160));
    }
  }
  await browser.close();
  srv.kill();
  console.log('\nразобрано ' + done.length + ', не открылось ' + failed.length +
    (failed.length ? ' (' + failed.join(', ') + ')' : '') +
    '. Файлы в claude/refs/<имя>/: index.html, assets, desk.png, mob.png, facts.json');
  if (!done.length) process.exitCode = 1;
})();
