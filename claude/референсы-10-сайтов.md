# Референсы: 10 сайтов серии Pons

Разбор сделан 12.09.2026 по живым страницам. Все десять — одна студия, один
каркас, десять разных механик. Это база, от которой отталкиваемся в новых сайтах.

| Сайт | Персонаж | Главный приём |
|---|---|---|
| [sulky.fun](https://sulky.fun/) | котёнок под дождём | three.js-сцена, камера едет по скроллу |
| [penh.fun](https://penh.fun/) | пингвин с гранатой | 121 JPEG-кадр на canvas, скраб скроллом |
| [kapy.wtf](https://kapy.wtf/) | капибара на острове | 4 экрана как уровни игры + coverflow |
| [urexscoin.fun](https://urexscoin.fun/) | «бывшая» с палкой | симулятор переписки в Win95-мессенджере |
| [behr.wtf](https://behr.wtf/) | медведь в комнате | комната на чистом CSS 3D, параллакс от мыши |
| [menacecat.fun](https://menacecat.fun/) | кот на холме | один кадр, ноль скролла, HUD по краям |
| [pigin.wtf](https://pigin.wtf/) | голубь в джинсах | Win95-десктоп с окнами, PIG-TV, таскбар |
| [morrt.fun](https://morrt.fun/) | морж на дороге | видео на фоне, текст главами по скроллу |
| [battlegroundcat.fun](https://battlegroundcat.fun/) | кот с ложкой в окопе | экраны + мини-игра «держи кнопку и копай» |
| [copercat.wtf](https://copercat.wtf/) | кот-оправдание | ретро-десктоп + EXCUSE.EXE, звук на WebAudio |

---

## 1. Общий каркас — есть во всех десяти

### Блок SETTINGS первым в `<head>`

Самое ценное из всего набора. Контракт и твиттер задаются в одном месте, скрипт
сам переписывает все ссылки и подставляет CA. Сайт можно выкатывать до листинга
и включать контракт одной строкой.

```html
<script>
  /* SETTINGS - everything is changed here, at the top, in ONE place */
  window.CONTRACT = "";                        /* пусто = "soon" */
  window.TWITTER  = "https://x.com/Handle";
  document.addEventListener('DOMContentLoaded', function(){
    var CA = (window.CONTRACT || "").trim(), TW = (window.TWITTER || "").trim();
    document.querySelectorAll('a[href]').forEach(function(a){
      var h = a.getAttribute('href')||"";
      if(h.indexOf('ponsfamily.com')>-1){ if(CA) a.href='https://www.ponsfamily.com/launchpad/'+CA; }
      else if(h.indexOf('dexscreener')>-1){ if(CA) a.href='https://dexscreener.com/robinhood/'+CA; }
      else if(h.indexOf('x.com')>-1 || h.indexOf('twitter.com')>-1){ if(TW) a.href=TW; }
    });
    if(CA){
      document.querySelectorAll('.ca b, .ca-val').forEach(function(b){ b.textContent=CA; });
      document.querySelectorAll('.ca, .ca-row').forEach(function(el){
        el.title=CA; el.style.cursor='pointer';
        el.addEventListener('click', function(){ if(navigator.clipboard) navigator.clipboard.writeText(CA); });
      });
    }
  });
</script>
```

Контракт живой сейчас только у behr.wtf. У остальных девяти пусто и в CA стоит
`soon` — это нормальное состояние сайта на старте.

### Три ссылки, всегда одни и те же

`ponsfamily.com/launchpad` (Buy) · `x.com` (X) · `dexscreener.com/robinhood/` (Chart).
Иконки лежат локально: `assets/ic-pons.png`, `assets/ic-x.png`, `assets/ic-dex.png`.
Никаких других разделов, меню и футера с копирайтом нет ни на одном сайте.

### Остальное из общего

- `<title>` — только имя персонажа, `<meta name="description">` — его реплика от первого лица.
- `assets/favicon.png` + `apple-touch-icon`, одна картинка на оба.
- Preconnect к Google Fonts, ровно две гарнитуры.
- Лайтбокс с подписью и стрелками, Escape и ArrowLeft/Right.
- Слой зерна или скан-линий поверх всего: `position:fixed; inset:0; pointer-events:none; z-index` под сотню.
- Все `video`: `muted loop playsinline`, каждый `play()` с `.catch(function(){})`.
- Кроме sulky (Lenis + three.js с unpkg) — ноль внешних библиотек.

---

## 2. Голос текстов

Один автор на все десять. Правила, которые видно в каждом:

- Первое лицо, строчные буквы, короткие предложения без запятых-подчинений.
- Персонаж объясняет абсурд как бытовую норму и ничего не собирается менять.
- Никакого маркетинга: ни «community», ни «roadmap», ни «to the moon».
- Дескрипшн = одна реплика, она же главный слоган на первом экране.

Эталоны:

> they issued me a spoon and forgot about me
> i found these jeans behind a bakery. they were already my size.
> It rained. I stayed. That is the whole arrangement.
> the sun has been about to set for eleven weeks. i am not going to be the one who says something.
> She is still typing. She has been typing since 2019.

Лор разбивают на 3-4 карточки по одной мысли: «RULE 01 / stay in the level. the
level is fine.» — так у kapy и battlegroundcat. Для бегущей строки берут те же
фразы капсом через `///`.

---

## 3. Дизайн

**Палитра.** 8-11 переменных в `:root`, всегда именованных по смыслу, не по
номеру: `--sand`, `--olive`, `--honey`, `--ember`, `--grass`. Дальше по коду
голых хексов почти нет.

**Шрифты.** Всегда пара: тяжёлый дисплейный на имя и заголовки + моно на всё
остальное. Что уже занято: Bowlby One, Anton, Bungee, Rubik Mono One, Fredoka,
Pixelify Sans, Big Shoulders, Press Start 2P (дважды), Silkscreen. Моно: Space
Mono, IBM Plex Mono, VT323, DM Mono, Sora.

**Кнопки.** Плоская заливка, чёрная рамка 2px, жёсткая тень `4px 4px 0`, на
hover сдвиг `translate(-2px,-2px)` и тень крупнее, на active — внутрь. Ни одного
градиентного «красивого» бордер-радиуса.

**Имя персонажа.** Крупно, `min(22vw, 31vh)`, с обводкой через
`-webkit-text-stroke` на псевдоэлементе под текстом и ступенчатой тенью
`drop-shadow(0 9px 0 …) drop-shadow(0 17px 0 …)`. Заливка — градиент по
`background-clip:text`.

**Чем добивают картинку.** Зерно `repeating-linear-gradient` с
`mix-blend-mode:multiply`, виньетка радиальным градиентом, скан-линии 1px через
3px, «прокатывающийся» блик по CRT — `linear-gradient` высотой 30%, анимация
5 секунд линейно.

---

## 4. Механики, которые можно брать

### Гейт «ENTER» — на пяти сайтах из десяти
Оверлей поверх всего, одна кнопка. До клика фон размыт
(`filter:blur(16px) saturate(.7) brightness(.72)`), после — `filter:none` за
1.1s. Даёт право на autoplay видео и звука и снимает вопрос «почему ничего не
играет». Самая дешёвая механика в наборе, эффект — максимальный.
Есть у menacecat, morrt, pigin, copercat, urexscoin. Ещё на трёх (kapy,
battlegroundcat, penh) вместо гейта лоадер со шкалой, и только behr и sulky
открываются сразу.

### Честный лоадер — kapy, battlegroundcat, penh
Список реальных файлов, `new Image()` на каждый, `onload=onerror=step`, шкала из
16-18 клеток. Обязательно кнопка SKIP и таймаут-страховка (`setTimeout(enter, 9000)`
у kapy), иначе один битый файл вешает сайт навсегда.

### Экраны вместо скролла — kapy, battlegroundcat
`section.screen` с классом `is-on`, стрелки по краям, точки внизу, номер `01 / 04`,
стрелки клавиатуры. Читается как уровни игры и на мобиле не требует ничего
переделывать.

### Две «телеканала» в окне — penh, pigin, kapy, copercat
Два `<video>`, у активного класс `on`, кнопка `CH +` переключает и меняет
подпись. Три строки кода, а ощущение живого эфира.

```js
chv[chAt].classList.remove('on'); chv[chAt].pause();
chAt=(chAt+1)%chv.length;
chv[chAt].classList.add('on'); chv[chAt].play().catch(function(){});
```

### Лайтбокс с массивом подписей — behr, penh, morrt, pigin, kapy
Массив `[src, alt]`, `show(i)` по кругу через `(i+len)%len`, подпись под
картинкой, клик по фону и по `.frame` закрывает. Один и тот же код во всех
пяти — копируется как есть.

### Мини-игра «держи кнопку» — battlegroundcat
`pointerdown` запускает, `pointerup/cancel/leave` и `window blur` останавливают,
глубина растёт по `dt*RATE`, видео играет только пока копают, результат лежит в
`localStorage`. Лучший баланс «интерактив / строк кода» во всём наборе.

### Coverflow — kapy
Карточки в `perspective`, каждая получает
`translateX(d*38%) translateZ(-|d|*190px) rotateY(-d*36deg)`, дальние гаснут по
`opacity` и глушатся `brightness(.6)`. Полноценная 3D-карусель без библиотек.

### Скраб кадров по скроллу — penh
121 JPEG в `assets/frames/f0001.jpg`, отрисовка на canvas, индекс кадра берётся
из `getBoundingClientRect()` секции-«липучки», перерисовка только при смене
индекса, скролл обёрнут в `requestAnimationFrame`. Даёт кино на статике, но
стоит ~3 МБ трафика.

### three.js-сцена — sulky
Единственный сайт с WebGL. Пять ключевых кадров камеры, скролл гонит один скаляр,
позиция и fov интерполируются, персонаж — билборд, который всегда повёрнут к
камере. Дождь — 2600 `LineSegments` с ручным сдвигом позиций. Отражение сделано
копией группы с `scale.y = -1`. Весь блок в `try/catch`, по ошибке включается
`body.no-webgl` и CSS-фолбэк.

### Симулятор переписки — urexscoin
Массив реплик `['her'|'you', текст]`, «она печатает» с рандомной задержкой
700-1500 мс, в конце скрипт оставляет индикатор печати навсегда. Точное попадание
в тему монеты.

### Комната на CSS 3D — behr
Шесть граней куба на `transform`, `perspective-origin` ездит за курсором, два
плоских плана двигаются с разной амплитудой. Дверь реально открывается и
показывает реплику. Единица измерения `--u:min(1vw,1.66vh)` — вся сцена
масштабируется одной переменной.

### Ретро-десктоп — pigin, copercat, urexscoin
Рамки Win95 двумя тенями (`inset 2px 2px 0 #fff, inset -2px -2px 0 #7c8494` —
и те же наоборот для вдавленных), таскбар с часами и бегущей строкой, окна
открываются и сворачиваются. У copercat к этому синтезированный «блип» на
WebAudio — ни одного аудиофайла, чистый осциллятор.

---

## 5. Мобилка

Один брейкпоинт: `max-width` 820-900px, редко 860. Внутри — не «спрятать
лишнее», а переставить сцену:

```css
@media (max-width:860px){
  /* на портретном экране кадр 16:9 шире вьюпорта,
     поэтому все слои переезжают в узкую видимую полосу */
  .name{font-size:min(15.5vw,13vh); top:41%}
  .cat{width:11.5%; bottom:2%}
  .links{left:12px; bottom:92px; flex-direction:row; flex-wrap:wrap}
  .wingrid{grid-template-columns:repeat(2,1fr)}
}
```

Проценты для персонажа и пропов пересчитываются отдельно — на широком кадре 25%
это нормально, на узком тот же кот занял бы весь экран. Сетки мемов 4 колонки →
2. `dvh` используют только sulky и morrt, остальные живут на `vh` и фиксированных
слоях.

---

## 6. Бюджет ассетов (померено на живых сайтах)

| Тип | Размер |
|---|---|
| Аватар-вырезка `ava.webp` | 50-65 КБ |
| Фон экрана `*-bg.webp` | 60-125 КБ |
| Видео-луп `loop.mp4` | 200-430 КБ |
| Кадр секвенции JPEG | ~25 КБ (у penh их 121 ≈ 3 МБ) |
| HTML целиком | 12-27 КБ |

Правило из набора: всё статичное — webp, всё движущееся — короткий mp4 под
полмегабайта, тяжёлые секвенции только под лоадер со шкалой.

---

## 7. Чего в этих сайтах нет — и что стоит добавить

- **Ни одного `og:`/`twitter:card` тега на всех десяти.** Ссылку на мем-коин
  репостят в X десятками раз, а превью нет ни у кого. В новых сайтах ставим
  `og:title`, `og:description`, `og:image` (1200×630) и `twitter:card=summary_large_image` — это дешёвая победа над всем референсным набором.
- **Живых данных о токене нет нигде**, `fetch` не вызывается ни разу. У kapy под
  график отведён блок с честной надписью «CHART GOES LIVE ON LAUNCH». Если
  подключаем dexscreener — это уже плюс к референсам, но блок обязан выглядеть
  нормально и без данных.
- **Нет `prefers-reduced-motion`** у шести сайтов из десяти. Есть только у sulky,
  behr, battlegroundcat и urexscoin. Для тяжёлых сцен ставим обязательно.
- **`loading="lazy"` нет в разметке ни у кого.** Sulky вешает его из JS при
  создании превью, остальные грузят все мемы сразу.
- **`aria-label` от случая к случаю**: три у battlegroundcat, два у kapy, по
  одному у behr, copercat и menacecat, у остальных пяти нет вовсе. Крестики,
  стрелки и кнопки-иконки подписываем всегда.

---

## 8. Чеклист нового сайта серии

1. Одна реплика персонажа → она же `description`, слоган и текст в шапке.
2. Пара шрифтов, которой ещё не было в списке выше.
3. 8-11 переменных палитры по смыслу.
4. Блок SETTINGS первым в `<head>`, CA = `soon`, три ссылки на месте.
5. Гейт ENTER, если на сайте есть видео или звук.
6. Одна главная механика из раздела 4 — не две. У всех референсов она ровно одна.
7. Лайтбокс с подписями, Escape и стрелки.
8. Зерно или скан-линии поверх сцены.
9. Один брейкпоинт, сцена переставлена, а не спрятана.
10. og-теги и `prefers-reduced-motion` — то, чего у референсов нет.
11. `node tools/check.js <имя>`, скриншоты глазами, потом деплой.
