#!/bin/bash
set -e

PROFILE="${AWS_PROFILE:-hawkeye}"
STACK="${1:-SocialLeadGen-Api}"

echo "📦 Installing Lambda dependencies..."

# Install stripe in Lambda directories that need it
for dir in lambdas/dist/subscription-handler lambdas/dist/stripe-webhook; do
  if [ -f "$dir/package.json" ]; then
    echo "  → $dir"
    (cd "$dir" && npm install --omit=dev --quiet)
  fi
done

echo ""
echo "🚀 Deploying $STACK with profile $PROFILE..."
echo ""

cd packages/cdk
npx cdk deploy "$STACK" --profile "$PROFILE" --require-approval never --method=direct
