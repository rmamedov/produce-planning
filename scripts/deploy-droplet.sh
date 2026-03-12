#!/bin/sh
set -eu

if [ -z "${HOST:-}" ] || [ -z "${USER:-}" ] || [ -z "${PASSWORD:-}" ] || [ -z "${REMOTE_DIR:-}" ]; then
  echo "Required env vars: HOST USER PASSWORD REMOTE_DIR"
  exit 1
fi

if [ ! -f ".env.production" ]; then
  echo ".env.production is required in the project root"
  exit 1
fi

if ! command -v sshpass >/dev/null 2>&1; then
  echo "sshpass is required"
  exit 1
fi

SSH_OPTS="-o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=$HOME/.ssh/known_hosts -o PubkeyAuthentication=no -o PreferredAuthentications=password"

echo "Preparing remote server..."
sshpass -p "$PASSWORD" ssh $SSH_OPTS "$USER@$HOST" "
  set -eu
  mkdir -p '$REMOTE_DIR'
  if ! command -v docker >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    . /etc/os-release
    echo \"deb [arch=\$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable\" > /etc/apt/sources.list.d/docker.list
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable docker
    systemctl start docker
  fi
"

echo "Uploading project files..."
tar \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='public/uploads/*' \
  -czf /tmp/produce-planning-deploy.tgz .

sshpass -p "$PASSWORD" scp $SSH_OPTS /tmp/produce-planning-deploy.tgz "$USER@$HOST:$REMOTE_DIR/produce-planning-deploy.tgz"
sshpass -p "$PASSWORD" scp $SSH_OPTS .env.production "$USER@$HOST:$REMOTE_DIR/.env.production"

echo "Extracting and starting containers..."
sshpass -p "$PASSWORD" ssh $SSH_OPTS "$USER@$HOST" "
  set -eu
  cd '$REMOTE_DIR'
  tar -xzf produce-planning-deploy.tgz
  rm -f produce-planning-deploy.tgz
  docker compose -f docker-compose.prod.yml up -d --build
"

rm -f /tmp/produce-planning-deploy.tgz

echo "Deployment finished. Check: http://$HOST/healthz"
