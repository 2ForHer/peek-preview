#!/bin/sh
# Debounced auto-commit + push to origin/main whenever builder files change.
set -eu
cd /workspace

LOCK=/tmp/auto-push-github.lock
LOG=/tmp/auto-push-github.log
if [ -f "$LOCK" ] && kill -0 "$(cat "$LOCK")" 2>/dev/null; then
  exit 0
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT INT TERM

git config user.name "2ForHer"
git config user.email "229440011+2ForHer@users.noreply.github.com"

WATCH_PATHS="
src
public
scripts
server
migrations
mobile
android
signing
.github
package.json
package-lock.json
vite.config.ts
vite.mobile.config.ts
capacitor.config.ts
tsconfig.json
eslint.config.mjs
README.md
.gitignore
startup.sh
"

sync_once() {
  git add -A
  if git diff --cached --quiet; then
    return 0
  fi
  git commit -m "Auto-sync from Grok builder"
  if ! git push origin main; then
    git pull --rebase origin main || true
    git push origin main || true
  fi
}

sync_once || true

# Block on the first change, then wait for 10s of quiet before pushing.
while true; do
  # shellcheck disable=SC2086
  inotifywait -r -e modify,create,delete,move,close_write \
    --exclude '(/\.git/|/node_modules/)' \
    $WATCH_PATHS >/dev/null 2>&1 || true
  while inotifywait -r -t 10 -e modify,create,delete,move,close_write \
    --exclude '(/\.git/|/node_modules/)' \
    $WATCH_PATHS >/dev/null 2>&1; do
    :
  done
  sync_once || true
done
