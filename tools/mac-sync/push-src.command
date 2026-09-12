#!/bin/bash
# Отправить исходники в GitHub. Двойной клик по файлу в Finder — и всё.
#
# Лежит внутри клона репозитория на маке. Смотрит, что нового появилось
# в <имя-сайта>/assets/src/, коммитит и пушит в main.
#
# Трогает ТОЛЬКО пути */assets/src/*. Остальное в папке не коммитит и не удаляет.
# Ничего не ставит в автозапуск: запускается, делает дело и закрывается.

set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
PAT='*/assets/src/*'

cd "$REPO" 2>/dev/null || { echo "не нашёл папку репозитория"; exit 1; }
git rev-parse --git-dir >/dev/null 2>&1 || { echo "$REPO не репозиторий"; exit 1; }

echo "папка: $REPO"

br=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
if [ "$br" != "main" ]; then
  echo "сейчас ветка $br. переключись на main в GitHub Desktop и запусти снова."
  read -n 1 -s -r -p "нажми любую клавишу"; exit 1
fi

if [ -z "$(git status --porcelain -- "$PAT" 2>/dev/null)" ]; then
  echo "в assets/src ничего нового."
  read -n 1 -s -r -p "нажми любую клавишу"; exit 0
fi

git add -- "$PAT"
n=$(git diff --cached --name-only | wc -l | tr -d ' ')
sites=$(git diff --cached --name-only | sed 's|/assets/src/.*||' | sort -u | tr '\n' ' ')
git commit -qm "исходники: $n файл(ов) — $sites"

git pull -q --rebase origin main 2>/dev/null || true
if git push -q origin main; then
  echo
  echo "отправлено: $n файл(ов) — $sites"
  echo "можно писать в чат, что картинки на месте."
else
  echo
  echo "пуш не прошёл. открой GitHub Desktop и нажми Push там — коммит уже готов."
fi

echo
read -n 1 -s -r -p "нажми любую клавишу, чтобы закрыть окно"
