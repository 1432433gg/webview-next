#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
npm ci
npx playwright install --with-deps chromium --only-shell
npm test
npm run build
