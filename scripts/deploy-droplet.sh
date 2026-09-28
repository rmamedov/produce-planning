#!/bin/bash
# Deploy produce-planning to a droplet.
#
# Environments:
#   scripts/deploy-droplet.sh          -> PROD (165.245.253.31)
#   scripts/deploy-droplet.sh dev      -> DEV  (164.90.190.115)
#
# Test gates (both must pass, otherwise the deploy aborts):
#   1. the full test suite runs locally before anything is uploaded;
#   2. `npm run build` on the droplet runs the suite again via the
#      `prebuild` hook before `next build`.
#
# Overrides: HOST, SSH_KEY (default ~/.ssh/id_droplet)
set -euo pipefail

ENV_NAME="${1:-prod}"
case "$ENV_NAME" in
  prod) DEFAULT_HOST="165.245.253.31" ;;
  dev)  DEFAULT_HOST="164.90.190.115" ;;
  *) echo "Unknown environment '$ENV_NAME' (expected: prod | dev)"; exit 1 ;;
esac

HOST="${HOST:-$DEFAULT_HOST}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_droplet}"
REMOTE_DIR="/opt/produce-planning"

cd "$(dirname "$0")/.."

echo "==> Deploying to $ENV_NAME ($HOST)"

echo "==> [1/5] Tests (local deploy gate)"
npm run test

echo "==> [2/5] Syncing project files to $HOST"
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

echo "==> [3/5] Install deps + tests + build on the droplet"
ssh -i "$SSH_KEY" "root@$HOST" "
  set -eu
  cd '$REMOTE_DIR'
  npm install --no-audit --no-fund
  npx prisma generate
  npm run build
"

echo "==> [4/5] Sync DB schema"
ssh -i "$SSH_KEY" "root@$HOST" "cd '$REMOTE_DIR' && npx prisma db push --skip-generate"

echo "==> [5/5] Restarting service"
ssh -i "$SSH_KEY" "root@$HOST" "systemctl restart produce-planning && sleep 3 && systemctl is-active produce-planning"

echo "==> Deployed [$ENV_NAME]: http://$HOST/kitchen"
