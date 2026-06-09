#!/bin/bash
# Push SuperCompute-Network to GitHub
set -euo pipefail
cd /Users/hermes/supercompute
git push origin main 2>&1
echo "PUSH_DONE: $(date -u)"



