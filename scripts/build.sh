#!/usr/bin/env bash
# SuperCompute Production Build Script
# Builds the Next.js frontend and the TypeScript worker package.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "═══════════════════════════════════════════════"
echo "  SuperCompute Production Build"
echo "  Started: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "═══════════════════════════════════════════════"
echo ""

# ── Step 1: Next.js Build (Frontend + API routes) ──
echo "───────────────────────────────────────────────"
echo "  Step 1/3: Building Next.js application..."
echo "───────────────────────────────────────────────"
echo ""

NODE_ENV=production npx next build 2>&1 | while IFS= read -r line; do
  echo "  [next] $line"
done

NEXT_EXIT=${PIPESTATUS[0]}
if [ "$NEXT_EXIT" -ne 0 ]; then
  echo ""
  echo "  ❌ Next.js build failed with exit code $NEXT_EXIT"
  exit "$NEXT_EXIT"
fi

echo ""
echo "  ✅ Next.js build complete"
echo ""

# ── Step 2: Worker TypeScript Build ──
echo "───────────────────────────────────────────────"
echo "  Step 2/3: Building worker package (TypeScript)..."
echo "───────────────────────────────────────────────"
echo ""

if [ -d "$ROOT_DIR/worker" ]; then
  cd "$ROOT_DIR/worker"

  # Install worker dependencies if needed
  if [ ! -d "node_modules" ]; then
    echo "  [worker] Installing dependencies..."
    npm ci 2>&1 | while IFS= read -r line; do
      echo "  [worker] $line"
    done
    echo ""
  fi

  # TypeScript compile
  npx tsc --project tsconfig.json 2>&1 | while IFS= read -r line; do
    echo "  [worker] $line"
  done

  WORKER_EXIT=${PIPESTATUS[0]}
  if [ "$WORKER_EXIT" -ne 0 ]; then
    echo ""
    echo "  ❌ Worker build failed with exit code $WORKER_EXIT"
    exit "$WORKER_EXIT"
  fi

  # Make the CLI entry executable
  chmod +x dist/index.js 2>/dev/null || true

  echo ""
  echo "  ✅ Worker build complete"
  echo "  📦 Output: worker/dist/"
else
  echo "  ⚠️  No worker directory found — skipping worker build"
fi

cd "$ROOT_DIR"

# ── Step 3: Verify Build Artifacts ──
echo "───────────────────────────────────────────────"
echo "  Step 3/3: Verifying build artifacts..."
echo "───────────────────────────────────────────────"
echo ""

if [ -d ".next" ]; then
  NEXT_FILES=$(find .next -type f | wc -l)
  NEXT_SIZE=$(du -sh .next | cut -f1)
  echo "  ✅ Next.js:   ${NEXT_FILES} files (${NEXT_SIZE})"
else
  echo "  ❌ Next.js:   .next/ directory missing"
fi

if [ -d "worker/dist" ]; then
  WORKER_FILES=$(find worker/dist -type f | wc -l)
  WORKER_SIZE=$(du -sh worker/dist | cut -f1)
  echo "  ✅ Worker:    ${WORKER_FILES} files (${WORKER_SIZE})"
else
  echo "  ⚠️  Worker:   worker/dist/ directory not found (non-fatal)"
fi

if [ -f "worker/dist/index.js" ]; then
  echo "  ✅ CLI entry: worker/dist/index.js"
fi

echo ""
END_TIME=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
echo "═══════════════════════════════════════════════"
echo "  Build complete: $END_TIME"
echo "═══════════════════════════════════════════════"




