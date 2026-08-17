#!/usr/bin/env bash
# Deploys this directory to S3 and invalidates the CloudFront cache.
# See README-DEPLOY.txt for one-time AWS setup.
set -euo pipefail

BUCKET="${BOARDSIGHT_BUCKET:-boardsightchess.com}"
DISTRIBUTION_ID="${BOARDSIGHT_DISTRIBUTION_ID:-}"

if [[ -z "$DISTRIBUTION_ID" ]]; then
  echo "Error: set BOARDSIGHT_DISTRIBUTION_ID to your CloudFront distribution ID." >&2
  exit 1
fi

cd "$(dirname "$0")"

aws s3 sync . "s3://$BUCKET" \
  --exclude ".git/*" \
  --exclude "README-DEPLOY.txt" \
  --exclude "CLAUDE.md" \
  --exclude "prompts/*" \
  --exclude "deploy.sh" \
  --delete

aws s3 cp site.webmanifest "s3://$BUCKET/site.webmanifest" \
  --content-type "application/manifest+json"

aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" --paths "/*"

echo "Deployed to s3://$BUCKET and invalidated distribution $DISTRIBUTION_ID"
