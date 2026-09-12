#!/usr/bin/env bash
# Vercel через API. Авторизация одним из двух способов:
#   1) API credential на окружении (Pro/Max): прокси сам подставляет заголовок,
#      VERCEL_TOKEN не нужен и токен в сессию не попадает. Предпочтительно.
#   2) VERCEL_TOKEN в переменных окружения, плюс api.vercel.com в сетевом allowlist.
# Необязательно: VERCEL_TEAM_ID, если проекты живут в команде, а не в личном аккаунте.
#
#   tools/vercel.sh free   <имя>            свободен ли <имя>.vercel.app
#   tools/vercel.sh new    <имя>            создать проект на папку <имя> и задеплоить
#   tools/vercel.sh status <имя>            состояние последнего деплоя
#   tools/vercel.sh domain <имя> <домен>    привязать домен и показать DNS-записи
#   tools/vercel.sh list                    все проекты и их папки
#   tools/vercel.sh rm     <имя>            удалить проект (папку в репозитории не трогает)
#
# Правки существующего сайта деплоятся сами на git push — вызывать ничего не надо.
set -euo pipefail

REPO="Dovgalyuk1/meme-sites"
API="https://api.vercel.com"
# Заголовок ставим только если токен лежит в окружении. Иначе его добавит прокси,
# и свой заголовок слать нельзя — получится два Authorization.
AUTH=(); [ -n "${VERCEL_TOKEN:-}" ] && AUTH=(-H "Authorization: Bearer $VERCEL_TOKEN")

api() { # method path [body]
  local m=$1 p=$2 b=${3:-}
  local sep="?"; [[ "$p" == *"?"* ]] && sep="&"
  local q=""; [ -n "${VERCEL_TEAM_ID:-}" ] && q="${sep}teamId=$VERCEL_TEAM_ID"
  if [ -n "$b" ]; then
    curl -sS -X "$m" "${AUTH[@]}" -H "Content-Type: application/json" -d "$b" "$API$p$q"
  else
    curl -sS -X "$m" "${AUTH[@]}" "$API$p$q"
  fi
}

jqp() { python3 -c "import sys,json;d=json.load(sys.stdin);$1"; }

die() { echo "ОШИБКА: $*" >&2; exit 1; }

# Требует *.vercel.app в Allowed domains окружения. API этого не покажет:
# поддомен может занимать чужой проект, а Vercel молча выдаст суффикс вроде имя-nu.
cmd_free() {
  local n=$1 code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://$n.vercel.app" || echo 000)
  case "$code" in
    404) echo "$n.vercel.app свободен" ;;
    000) die "не достучался до $n.vercel.app — добавь *.vercel.app в Allowed domains" ;;
    *)   echo "$n.vercel.app ЗАНЯТ (HTTP $code) — выбери другое имя папки" ;;
  esac
}

cmd_new() {
  local n=$1
  [ -d "$n" ] || die "нет папки $n в корне репозитория"
  local body resp id
  body=$(python3 -c "
import json,sys
print(json.dumps({'name':sys.argv[1],'framework':None,'rootDirectory':sys.argv[1],
 'gitRepository':{'type':'github','repo':sys.argv[2]}}))" "$n" "$REPO")
  resp=$(api POST /v11/projects "$body")
  id=$(printf '%s' "$resp" | jqp "print(d.get('id',''))" 2>/dev/null || true)
  [ -n "$id" ] || { echo "$resp"; die "проект не создался — смотри ответ выше"; }
  echo "проект создан: $id (rootDirectory=$n)"
  cmd_deploy "$n" "$id"
}

cmd_deploy() {
  local n=$1 id=${2:-}
  [ -n "$id" ] || id=$(api GET "/v9/projects/$n" | jqp "print(d.get('id',''))")
  local repoid body resp url
  repoid=$(api GET "/v9/projects/$n" | jqp "
l=d.get('link') or {}; print(l.get('repoId',''))")
  body=$(python3 -c "
import json,sys
g={'type':'github','ref':'main'}
if sys.argv[3]: g['repoId']=int(sys.argv[3])
else: g['repo']=sys.argv[4].split('/')[1]; g['org']=sys.argv[4].split('/')[0]
print(json.dumps({'name':sys.argv[1],'project':sys.argv[2],'target':'production','gitSource':g}))
" "$n" "$id" "$repoid" "$REPO")
  resp=$(api POST /v13/deployments "$body")
  url=$(printf '%s' "$resp" | jqp "print(d.get('url',''))" 2>/dev/null || true)
  [ -n "$url" ] || { echo "$resp"; die "деплой не запустился — смотри ответ выше"; }
  echo "деплой пошёл: https://$url"
  cmd_status "$n"
}

cmd_status() {
  local n=$1 i state
  for i in $(seq 1 40); do
    state=$(api GET "/v6/deployments?app=$n&limit=1" | jqp "
x=(d.get('deployments') or [{}])[0]; print(x.get('state') or x.get('readyState') or '?')")
    case "$state" in
      READY)  echo "готово: https://$n.vercel.app"; return 0 ;;
      ERROR|CANCELED) die "сборка упала со статусом $state" ;;
      *) printf '  %s...\n' "$state"; sleep 6 ;;
    esac
  done
  die "сборка не завершилась за 4 минуты"
}

cmd_domain() {
  local n=$1 dom=$2 resp
  resp=$(api POST "/v10/projects/$n/domains" "$(python3 -c "
import json,sys; print(json.dumps({'name':sys.argv[1]}))" "$dom")")
  printf '%s\n' "$resp" | jqp "
print('домен:', d.get('name','?'), '| verified:', d.get('verified'))
for v in (d.get('verification') or []): print('  запись', v.get('type'), v.get('domain'), '->', v.get('value'))
if d.get('error'): print('  ОШИБКА:', d['error'].get('message'))"
  echo "--- что прописать в DNS ---"
  api GET "/v6/domains/$dom/config" | jqp "
print(json.dumps(d, ensure_ascii=False, indent=2))"
}

cmd_list() {
  api GET "/v9/projects?limit=100" | jqp "
for x in d.get('projects', []):
    print('%-22s root=%-22s repo=%s' % (x['name'], x.get('rootDirectory') or '-', (x.get('link') or {}).get('repo') or '-'))"
}

cmd_rm() {
  local n=$1 code
  code=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "${AUTH[@]}" "$API/v9/projects/$n")
  case "$code" in
    204) echo "проект $n удалён (папка $n в репозитории осталась)" ;;
    404) die "проекта $n в Vercel нет" ;;
    *)   die "не удалил проект $n, HTTP $code" ;;
  esac
}

case "${1:-}" in
  free)   shift; cmd_free   "$@" ;;
  new)    shift; cmd_new    "$@" ;;
  deploy) shift; cmd_deploy "$@" ;;
  status) shift; cmd_status "$@" ;;
  domain) shift; cmd_domain "$@" ;;
  list)   shift; cmd_list   "$@" ;;
  rm)     shift; cmd_rm     "$@" ;;
  *) sed -n '2,14p' "$0"; exit 1 ;;
esac
