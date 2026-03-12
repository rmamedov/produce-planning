#!/bin/sh
set -eu

echo "Synchronizing Prisma schema..."
./node_modules/.bin/prisma db push

if [ "${SEED_ON_DEPLOY:-false}" = "true" ]; then
  echo "SEED_ON_DEPLOY=true, running seed script..."
  ./node_modules/.bin/tsx prisma/seed.ts
fi

echo "Starting Next.js server..."
exec ./node_modules/.bin/next start -H "${HOSTNAME:-0.0.0.0}" -p "${PORT:-3000}"
