#!/bin/sh
set -eu
cd /workspace
LOCK=/tmp/auto-push-github.lock
if [ ! -f "$LOCK" ] || ! kill -0 "$(cat "$LOCK")" 2>/dev/null; then
  nohup /bin/sh /workspace/scripts/auto-push-github.sh >>/tmp/auto-push-github.log 2>&1 &
fi
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  exit 0
fi
npm run dev >>/tmp/app-startup.log 2>&1 &
