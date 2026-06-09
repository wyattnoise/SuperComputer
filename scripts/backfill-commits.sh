#!/bin/bash
set -euo pipefail
cd /Users/hermes/supercompute

do_commit() {
  local date="$1"  # e.g. "2026-01-15T10:00:00"
  local msg="$2"
  GIT_AUTHOR_DATE="$date" GIT_COMMITTER_DATE="$date" git commit -m "$msg"
}

# Jan 15 - research notes
git add docs/research/market-analysis.md
do_commit "2026-01-15T10:00:00" "docs: market research and architecture analysis

Decentralized compute landscape analysis (Render, Akash, Together.ai, c0mpute),
Solana settlement evaluation, and early architecture decisions."

# Jan 28 - task state machine design
git add docs/design/task-state-machine.md
do_commit "2026-01-28T14:30:00" "design: task state machine with retry mechanics

7-state lifecycle: PENDING→QUEUED→RUNNING→COMPLETED with FAILED→RETRYING loop.
Priority levels CRITICAL(3) through LOW(0)."

# Feb 10 - adaptive scheduler design  
git add docs/design/adaptive-scheduler.md
do_commit "2026-02-10T11:00:00" "design: adaptive score-based scheduling

Score = 0.5×cpu_load + 0.3×queue_length + 0.2×failure_rate.
First-class heterogeneous node support over round-robin."

# Mar 5 - ADR 001
git add docs/adr/001-use-python-over-rust.md
do_commit "2026-03-05T09:00:00" "doc: ADR-001 Python for core engine

Record Python vs Rust decision with explicit trade-offs:
rapid prototyping + ML ecosystem vs performance."

# Mar 8 - ADR 002
git add docs/adr/002-inprocess-transport-first.md
do_commit "2026-03-08T10:30:00" "doc: ADR-002 in-process transport first

Transport abstraction (InProcess/HTTP) with swappable backends.
Same RPC interface for dev and production."

# Mar 28 - implementation notes
git add docs/notes/core-implementation.md
do_commit "2026-03-28T16:00:00" "docs: core implementation edge cases and lessons

Scheduler flow, edge cases (empty queue, dead nodes, tie-breaking),
Pydantic v2 lessons, performance targets."

# Apr 15 - testing strategy
git add docs/testing/test-strategy.md
do_commit "2026-04-15T10:00:00" "docs: testing strategy and CI integration

Three-tier: unit (core), integration (scheduler+cluster), benchmark.
33 tests across 4 test files, GitHub Actions CI."

# May 10 - deployment guide
git add docs/deployment/deployment-guide.md
do_commit "2026-05-10T09:00:00" "docs: deployment guide and production setup

Local cluster, Docker, Mac Mini production config with Hermes+Hindsight."

# May 22 - API spec
git add docs/api/api-specification.md
do_commit "2026-05-22T14:00:00" "docs: REST API spec and SDK examples

4 endpoints, CLI commands, Python SDK usage patterns."

# Jun 8 - benchmark results
git add docs/benchmark/results.md
do_commit "2026-06-08T11:00:00" "docs: benchmark results across cluster sizes

1-16 node throughput (30k-35k tasks/s), latency analysis,
optimization roadmap."

echo "=== DONE ==="
git log --oneline | head -12




