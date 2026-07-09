#!/bin/bash
# Deploy produce-planning to the production droplet.
#
# Test gates (both must pass, otherwise the deploy aborts):
#   1. the full test suite runs locally before anything is uploaded;
#   2. `npm run build` on the droplet runs the suite again via the
#      `prebuild` hook before `next build`.
#
# Usage: scripts/deploy-droplet.sh
#   HOST     (default 165.245.253.31)
#   SSH_KEY  (default ~/.ssh/id_droplet)
set -euo pipefail

HOST="${HOST:-165.245.253.31}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_droplet}"
REMOTE_DIR="/opt/produce-planning"

cd "$(dirname "$0")/.."

echo "==> [1/4] Tests (local deploy gate)"
npm run test

echo "==> [2/4] Syncing project files to $HOST"
rsync -az \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.env' \
  --exclude='.env.production' \
  --exclude='public/uploads/*' \
  --exclude='tsconfig.tsbuildinfo' \
  --exclude='/archive' \
  -e "ssh -i $SSH_KEY" ./ "root@$HOST:$REMOTE_DIR/"

echo "==> [3/4] Install deps + tests + build on the droplet"
ssh -i "$SSH_KEY" "root@$HOST" "
  set -eu
  cd '$REMOTE_DIR'
  npm install --no-audit --no-fund
  npx prisma generate
  npm run build
"

echo "==> [4/4] Restarting service"
ssh -i "$SSH_KEY" "root@$HOST" "systemctl restart produce-planning && sleep 3 && systemctl is-active produce-planning"

echo "==> Deployed: http://$HOST/kitchen"
