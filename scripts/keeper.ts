#!/usr/bin/env tsx

// SuperCompute Keeper Runner
// Imports runKeeper from the keeper library and executes it,
// logging the results to stdout in human-readable and JSON formats.

import { runKeeper } from '../lib/keeper/index.js';
import type { KeeperRun } from '../lib/types.js';

async function main(): Promise<void> {
  const startedAt = Date.now();

  console.log('═══════════════════════════════════════════════');
  console.log('  SuperCompute Keeper');
  console.log(`  Started: ${new Date(startedAt).toISOString()}`);
  console.log(`  Dry Run: ${process.env.SC_DRY_RUN !== 'false' ? 'YES' : 'NO'}`);
  console.log('═══════════════════════════════════════════════\n');

  const run: KeeperRun = await runKeeper();

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(2);

  console.log('\n───────────────────────────────────────────────');
  console.log('  Keeper Run Results');
  console.log('───────────────────────────────────────────────\n');
  console.log(`  Status:         ${run.status === 'success' ? '✅ Success' : '❌ Failed'}`);
  console.log(`  Duration:       ${elapsed}s`);
  console.log(`  Dry Run:        ${run.dryRun ? 'Yes' : 'No'}`);
  console.log(`  Fees Claimed:   ${run.feesClaimed.toFixed(4)} USDC`);
  console.log(`  Buyback:        ${run.buybackAmount.toFixed(4)} tokens`);
  console.log(`  Burn:           ${run.burnAmount.toFixed(4)} tokens`);
  console.log(`  Staker Rewards: ${run.stakerRewards.toFixed(4)} USDC`);

  if (run.txClaim) console.log(`  Tx (Claim):     ${run.txClaim}`);
  if (run.txBuyback) console.log(`  Tx (Buyback):   ${run.txBuyback}`);
  if (run.txBurn) console.log(`  Tx (Burn):      ${run.txBurn}`);
  if (run.txRewards) console.log(`  Tx (Rewards):   ${run.txRewards}`);
  if (run.error) console.log(`  Error:          ${run.error}`);

  console.log('\n───────────────────────────────────────────────');
  console.log(`  Completed: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════\n');

  // Also output structured JSON for programmatic consumption
  console.log('--- JSON ---');
  console.log(JSON.stringify(run, null, 2));

  process.exit(run.status === 'success' ? 0 : 1);
}

main().catch((err) => {
  console.error('[Keeper] Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});


