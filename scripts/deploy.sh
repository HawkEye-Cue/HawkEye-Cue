#!/bin/bash
# Social Lead Gen - Full Deployment Script
# Usage: ./scripts/deploy.sh [stage]
# Stages: dev, staging, prod (default: dev)

set -e

STAGE=${1:-dev}
REGION=${AWS_REGION:-us-east-1}

echo "=========================================="
echo "  Social Lead Gen - Deploy ($STAGE)"
echo "=========================================="
echo ""

# --- Pre-flight checks ---
echo "🔍 Pre-flight checks..."

if ! command -v aws &> /dev/null; then
  echo "❌ AWS CLI not found. Install: https://aws.amazon.com/cli/"
  exit 1
fi

if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Install Node.js 20+"
  exit 1
fi

if ! command -v npx &> /dev/null; then
  echo "❌ npx not found. Install Node.js 20+"
  exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
  echo "❌ AWS credentials not configured. Run: aws configure"
  exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "  ✓ AWS Account: $ACCOUNT_ID"
echo "  ✓ Region: $REGION"
echo "  ✓ Stage: $STAGE"
echo ""

# --- Install dependencies ---
echo "📦 Installing dependencies..."
npm install
echo ""

# --- Build shared package ---
echo "🔨 Building shared package..."
cd packages/shared
npx tsc --build
cd ../..
echo "  ✓ Shared package built"
echo ""

# --- Build Lambda functions ---
echo "🔨 Building Lambda functions..."
cd packages/lambdas
npx tsc --build

# Bundle each Lambda for deployment
LAMBDA_HANDLERS=(
  "auth-post-confirmation"
  "trade-handler"
  "content-handler"
  "posts-handler"
  "post-publisher"
  "keywords-handler"
  "opportunities-handler"
  "subscription-handler"
  "stripe-webhook"
  "daily-cues-handler"
  "devices-handler"
  "notification-sender"
)

mkdir -p dist
for handler in "${LAMBDA_HANDLERS[@]}"; do
  if [ -d "src/$handler" ]; then
    mkdir -p "dist/$handler"
    cp "src/$handler/index.ts" "dist/$handler/"
    echo "  ✓ $handler"
  fi
done

cd ../..
echo ""

# --- Deploy CDK Infrastructure ---
echo "☁️  Deploying AWS infrastructure..."
cd packages/cdk

# Bootstrap CDK (first time only)
npx cdk bootstrap aws://$ACCOUNT_ID/$REGION --quiet 2>/dev/null || true

# Deploy all stacks
npx cdk deploy --all \
  --require-approval never \
  --context stage=$STAGE \
  --outputs-file ../../cdk-outputs.json

cd ../..
echo "  ✓ Infrastructure deployed"
echo ""

# --- Extract outputs ---
echo "📋 Extracting deployment outputs..."
if [ -f cdk-outputs.json ]; then
  API_URL=$(cat cdk-outputs.json | node -e "const d=require('./cdk-outputs.json'); const k=Object.keys(d).find(k=>k.includes('Api')); if(k) console.log(d[k].ApiUrl||'')")
  SITE_BUCKET=$(cat cdk-outputs.json | node -e "const d=require('./cdk-outputs.json'); const k=Object.keys(d).find(k=>k.includes('Frontend')); if(k) console.log(d[k].SiteBucketName||'')")
  CF_DIST_ID=$(cat cdk-outputs.json | node -e "const d=require('./cdk-outputs.json'); const k=Object.keys(d).find(k=>k.includes('Frontend')); if(k) console.log(d[k].DistributionId||'')")
  CF_DOMAIN=$(cat cdk-outputs.json | node -e "const d=require('./cdk-outputs.json'); const k=Object.keys(d).find(k=>k.includes('Frontend')); if(k) console.log(d[k].DistributionDomainName||'')")

  echo "  API URL: $API_URL"
  echo "  Site Bucket: $SITE_BUCKET"
  echo "  CloudFront: $CF_DOMAIN"
fi
echo ""

# --- Build and deploy web frontend ---
echo "🌐 Building web frontend..."
cd apps/web

# Write environment config
cat > .env.production <<EOF
VITE_API_URL=$API_URL
VITE_COGNITO_USER_POOL_ID=CONFIGURE_ME
VITE_COGNITO_CLIENT_ID=CONFIGURE_ME
VITE_COGNITO_REGION=$REGION
EOF

npm run build
echo "  ✓ Web frontend built"

# Upload to S3
if [ -n "$SITE_BUCKET" ]; then
  echo "  Uploading to S3..."
  aws s3 sync dist/ s3://$SITE_BUCKET/ --delete --quiet
  echo "  ✓ Uploaded to S3"

  # Invalidate CloudFront cache
  if [ -n "$CF_DIST_ID" ]; then
    echo "  Invalidating CloudFront cache..."
    aws cloudfront create-invalidation \
      --distribution-id $CF_DIST_ID \
      --paths "/*" \
      --query 'Invalidation.Id' \
      --output text > /dev/null
    echo "  ✓ Cache invalidated"
  fi
fi

cd ../..
echo ""

# --- Seed database ---
echo "🌱 Seeding database..."
TABLE_NAME="SocialLeadGen" npx ts-node packages/lambdas/src/seed/index.ts 2>/dev/null || echo "  ⚠️  Seed script requires ts-node. Run manually: TABLE_NAME=SocialLeadGen npx ts-node packages/lambdas/src/seed/index.ts"
echo ""

# --- Done ---
echo "=========================================="
echo "  ✅ Deployment Complete!"
echo "=========================================="
echo ""
echo "  🌐 Website: https://$CF_DOMAIN"
echo "  🔌 API: $API_URL"
echo ""
echo "  Next steps:"
echo "  1. Set Cognito IDs in apps/web/.env.production"
echo "  2. Configure API keys in AWS Secrets Manager:"
echo "     - OPENAI_API_KEY"
echo "     - STRIPE_SECRET_KEY"
echo "     - STRIPE_WEBHOOK_SECRET"
echo "     - AYRSHARE_API_KEY"
echo "  3. Set up Stripe webhook endpoint: $API_URL/subscription/webhook"
echo "  4. Configure SNS platform apps with real APNs/FCM keys"
echo ""
