#!/bin/bash
# HawkEye-Cue - First-time setup script
# Run this once after cloning the repo: bash scripts/setup.sh

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=========================================="
echo "  HawkEye-Cue - Project Setup"
echo "=========================================="
echo ""

# --- Check Node.js ---
echo "🔍 Checking prerequisites..."

if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found."
  echo "   Install Node.js 20+ from: https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node -e "process.exit(parseInt(process.version.slice(1)) < 20 ? 1 : 0)" 2>/dev/null && echo "ok" || echo "old")
if [ "$NODE_VERSION" = "old" ]; then
  echo "⚠️  Node.js 20+ is required. Current: $(node --version)"
  echo "   Upgrade from: https://nodejs.org"
  exit 1
fi
echo "  ✓ Node.js $(node --version)"

# --- Check / install pnpm ---
if ! command -v pnpm &> /dev/null; then
  echo "  Installing pnpm..."
  npm install -g pnpm
  echo "  ✓ pnpm installed"
else
  echo "  ✓ pnpm $(pnpm --version)"
fi

# --- Check AWS CLI ---
if ! command -v aws &> /dev/null; then
  echo ""
  echo "⚠️  AWS CLI not found. You need it to deploy."
  echo "   Install from: https://aws.amazon.com/cli/"
  echo "   Continuing setup without it — install before deploying."
  echo ""
else
  echo "  ✓ AWS CLI $(aws --version 2>&1 | cut -d' ' -f1)"
fi

echo ""

# --- Install dependencies ---
echo "📦 Installing dependencies..."
pnpm install
echo "  ✓ Dependencies installed"
echo ""

# --- Build shared package ---
echo "🔨 Building shared package..."
cd packages/shared
npx tsc --build
cd "$ROOT_DIR"
echo "  ✓ Shared package built"
echo ""

# --- Create lambda dist stubs ---
# The lambdas package is not yet implemented. These stubs let CDK synthesize
# without errors. They will be replaced by real builds when lambdas are built.
echo "🔨 Creating Lambda dist stubs..."
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

for handler in "${LAMBDA_HANDLERS[@]}"; do
  HANDLER_DIR="lambdas/dist/$handler"
  if [ ! -f "$HANDLER_DIR/index.js" ]; then
    mkdir -p "$HANDLER_DIR"
    echo 'exports.handler = async () => ({ statusCode: 501, body: "Not implemented" });' > "$HANDLER_DIR/index.js"
    echo "  ✓ stub: $handler"
  else
    echo "  - skip (exists): $handler"
  fi
done
echo ""

# --- AWS profile check ---
echo "🔑 AWS Setup"
if command -v aws &> /dev/null; then
  if aws sts get-caller-identity &> /dev/null; then
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    echo "  ✓ AWS credentials active (account: $ACCOUNT_ID)"
  else
    echo "  ⚠️  No active AWS credentials found."
    echo "     To configure: aws configure --profile hawkeye"
    echo "     Or for SSO:   aws sso login --profile hawkeye"
  fi
fi
echo ""

# --- Done ---
echo "=========================================="
echo "  ✅ Setup Complete!"
echo "=========================================="
echo ""
echo "  Next steps:"
echo ""
echo "  1. Configure AWS credentials (if not already done):"
echo "     aws configure --profile hawkeye"
echo ""
echo "  2. Deploy infrastructure:"
echo "     pnpm run deploy:dev --profile hawkeye"
echo ""
echo "  3. Run the web app locally:"
echo "     pnpm run dev"
echo ""
echo "  See README.md for full documentation."
echo ""
