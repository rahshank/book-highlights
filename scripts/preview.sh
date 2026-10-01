#!/bin/sh
set -eu
export WRANGLER_WRITE_LOGS=false WRANGLER_SEND_METRICS=false
export WRANGLER_REGISTRY_PATH="$PWD/.wrangler/registry" CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false
node node_modules/wrangler/bin/wrangler.js d1 migrations apply book-highlights-preview --local --config wrangler.preview.toml
exec node node_modules/wrangler/bin/wrangler.js dev --local --config wrangler.preview.toml --ip 127.0.0.1 --port 8770
