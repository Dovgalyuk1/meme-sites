#!/usr/bin/env node
/* Разбор референса: качает страницу, кладёт снапшот и печатает структуру.
   node tools/ref.js https://example.fun/ [имя]
   node tools/ref.js claude/референсы/snapshots/example.html          */
const fs = require('fs'), path = require('path'), cp = require('child_process');

const arg = process.argv[2];
if (!arg) { console.error('usage: node tools/ref.js <url|файл> [имя]'); process.exit(1); }

const ROOT = path.resolve(__dirname, '..');
const SNAP = path.join(ROOT, 'claude', 'референсы', 'snapshots');

let html, name, src;
if (/^https?:\/\//.test(arg)) {
  name = process.argv[3] || new URL(arg).hostname.replace(/^www\./, '');
  src = arg;
  const out = cp.spawnSync('curl', ['-sS', '-L', '--max-time', '60', arg], { maxBuffer: 64 << 20 });
  if (out.status !== 0) { console.error(String(out.stderr)); process.exit(1); }
  html = out.stdout.toString('utf8');
  if (!html.trim()) { console.error('пустой ответ от ' + arg); process.exit(1); }
  fs.mkdirSync(SNAP, { recursive: true });
  fs.writeFileSync(path.join(SNAP, name + '.html'), html);
} else {
  src = arg; name = path.basename(arg, '.html');
  html = fs.readFileSync(arg, 'utf8');
}

const head = html.slice(0, html.indexOf('</head>') + 1 || 4000);
const body = html.slice(html.indexOf('<body'));
const js = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
const uniq = a => [...new Set(a)];
const grab = (re, s) => [...(s || html).matchAll(re)].map(m => m[1]);
const line = (k, v) => console.log(k.padEnd(18) + (Array.isArray(v) ? v.join(' ') : v));

console.log('=== ' + name + '   ' + src + '   ' + html.length + ' байт');
line('title', (html.match(/<title>([^<]*)<\/title>/) || [, '—'])[1]);
line('description', (html.match(/name="description" content="([^"]*)"/) || [, '—'])[1]);
line('og', /og:/.test(head) ? 'есть' : 'НЕТ');
line('шрифты', uniq(grab(/family=([^"&]+)/g, head)));
line('внешние', uniq(grab(/src="(https?:\/\/[^"]+)"/g)));
line('SETTINGS', /window\.CONTRACT/.test(js) ? 'есть' : 'нет');
line('контракт', (js.match(/window\.CONTRACT\s*=\s*"([^"]*)"/) || [, ''])[1] || 'пусто');

console.log('\n--- палитра');
console.log(uniq(grab(/(--[\w-]+\s*:\s*[^;]+);/g, css)).slice(0, 40).join('  '));

console.log('\n--- разметка');
console.log([...body.matchAll(/<(section|header|footer|main|nav|div|canvas|video|img|button|h1|h2)\b([^>]*)>/g)]
  .map(m => {
    const id = (m[2].match(/id="([^"]+)"/) || [])[1], cl = (m[2].match(/class="([^"]+)"/) || [])[1];
    if (!id && !cl && !['section', 'canvas', 'video', 'h1', 'h2'].includes(m[1])) return null;
    return m[1] + (id ? '#' + id : '') + (cl ? '.' + cl.trim().split(/\s+/).join('.') : '');
  }).filter(Boolean).join('\n'));

console.log('\n--- ассеты');
console.log(uniq(grab(/(?:src|poster|href)="((?!https?:|data:|#)[^"]+\.(?:png|jpe?g|webp|gif|mp4|webm|svg|mp3|ogg))"/g)).join(' '));

console.log('\n--- css');
line('брейкпоинты', uniq(grab(/@media([^{]*)/g, css)).map(s => s.trim()));
line('keyframes', uniq(grab(/@keyframes\s+([\w-]+)/g, css)));
line('reduced-motion', /prefers-reduced-motion/.test(css) ? 'есть' : 'НЕТ');
line('lazy / aria', (html.match(/loading="lazy"/g) || []).length + ' / ' + (html.match(/aria-label/g) || []).length);

console.log('\n--- js');
line('сигналы', ['requestAnimationFrame', 'getContext', 'IntersectionObserver', 'localStorage',
  'AudioContext', 'fetch(', 'pointerdown', 'addEventListener']
  .map(s => s + '=' + (js.split(s).length - 1)).join('  '));
line('функции', uniq(grab(/function\s+(\w+)\s*\(/g, js)));

console.log('\n--- тексты');
console.log(html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, '\n').split('\n').map(s => s.trim()).filter(s => s.length > 1).join(' | '));
