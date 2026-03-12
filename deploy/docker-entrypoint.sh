#!/bin/sh
set -eu

echo "Running Prisma migrations..."
./node_modules/.bin/prisma migrate deploy

if [ "${SEED_ON_DEPLOY:-false}" = "true" ]; then
  echo "SEED_ON_DEPLOY=true, running seed script..."
  ./node_modules/.bin/tsx prisma/seed.ts
fi

echo "Starting Next.js server..."
exec node server.js
