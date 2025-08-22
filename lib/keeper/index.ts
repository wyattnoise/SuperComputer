// SuperCompute Tokenomics — token buyback, burn, staking, and revenue distribution
//
// Money Flow:
//   compute margin → 100% buyback pool
//   trading fees   → 35% buyback pool, 65% team
//   buyback pool   → 50/50: half buys+burns token, half pays stakers USDC
//
// All accounting is done in USDC (6 decimals on Solana).

import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { 
  getAssociatedTokenAddress, createBurnCheckedInstruction, createTransferInstruction, TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import * as anchor from '@coral-xyz/anchor';
import { OnlinePumpAmmSdk } from '@pump-fun/pump-swap-sdk';
import bs58 from 'bs58';
import { getTokenMint, TOKEN_DECIMALS, COMPUTE_MARGIN_TO_POOL, TRADING_FEE_TO_POOL, POOL_BURN_SPLIT } from '../config';
import db, { addTreasuryEntry, recordKeeperRun } from '../db';
import type { KeeperRun } from '../types';

const { BN } = anchor;
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qNx1zybapC8G4wEGGkZwyTDt1v');
const USDC_DECIMALS = 6;
const RPC_SETTLE_MS = Number(process.env.SC_RPC_SETTLE_MS || 60000);
const BUYBACK_SLIPPAGE = Number(process.env.SC_BUYBACK_SLIPPAGE || 5);

export function isDryRun(): boolean {
  return process.env.SC_DRY_RUN !== 'false';
}

// ── On-chain Primitives ──

function getConnection(): Connection {
  return new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
}

function getTreasuryWallet(): Keypair {
  const key = process.env.TREASURY_WALLET_KEY;
  if (!key) throw new Error('TREASURY_WALLET_KEY not set');
  return Keypair.fromSecretKey(bs58.decode(key));
}

// ── Creator Fee Claiming ──

export async function claimCreatorFees(): Promise<{ amount: number; tx?: string }> {
  const mint = getTokenMint();
  if (!mint) return { amount: 0 };
  
  if (isDryRun()) {
    console.log('[Keeper:dry-run] Would claim creator fees');
    return { amount: 0 };
  }

  try {
    const connection = getConnection();
    const wallet = getTreasuryWallet();
    const mintPubkey = new PublicKey(mint);
    
    // Use PumpSwap SDK to claim fees
    const sdk = new OnlinePumpAmmSdk(connection);
    const { tx, amount } = await sdk.claimCreatorFees({
      wallet,
      mint: mintPubkey,
      feeAccount: USDC_MINT,
    });

    // Wait for RPC to settle
    await new Promise(r => setTimeout(r, RPC_SETTLE_MS));
    
    return { amount: Number(amount) / 10 ** USDC_DECIMALS, tx: tx.toString() };
  } catch (err) {
    console.error('[Keeper] Claim fees failed:', err);
    return { amount: 0 };
  }
}

// ── Buyback token ──

export async function buyTokenWithUsdc(usdcAmount: number): Promise<{ amount: number; tx?: string }> {
  if (isDryRun()) {
    console.log(`[Keeper:dry-run] Would buy ${usdcAmount} USDC worth of token`);
    return { amount: 0 };
  }

  try {
    const connection = getConnection();
    const wallet = getTreasuryWallet();
    const mintPubkey = new PublicKey(getTokenMint()!);
    
    const sdk = new OnlinePumpAmmSdk(connection);
    const quote = await sdk.getQuote({ 
      inputMint: USDC_MINT, 
      outputMint: mintPubkey, 
      amount: usdcAmount * 10 ** USDC_DECIMALS,
      slippage: BUYBACK_SLIPPAGE,
    });
    
    const { tx, outputAmount } = await sdk.swap({
      wallet,
      inputMint: USDC_MINT,
      outputMint: mintPubkey,
      amount: usdcAmount * 10 ** USDC_DECIMALS,
      minOutputAmount: quote.minOutputAmount,
    });
    
    return { amount: Number(outputAmount) / 10 ** TOKEN_DECIMALS, tx: tx.toString() };
  } catch (err) {
    console.error('[Keeper] Buyback failed:', err);
    return { amount: 0 };
  }
}

// ── Burn token ──

export async function burnSuper(amount: number): Promise<{ tx?: string }> {
  if (isDryRun()) {
    console.log(`[Keeper:dry-run] Would burn ${amount} token`);
    return {};
  }

  try {
    const connection = getConnection();
    const wallet = getTreasuryWallet();
    const mintPubkey = new PublicKey(getTokenMint()!);
    
    const ata = await getAssociatedTokenAddress(mintPubkey, wallet.publicKey);
    const tx = new Transaction().add(
      createBurnCheckedInstruction(
        ata, mintPubkey, wallet.publicKey,
        BigInt(amount * 10 ** TOKEN_DECIMALS),
        TOKEN_DECIMALS
      )
    );
    
    const sig = await connection.sendTransaction(tx, [wallet]);
    await connection.confirmTransaction(sig);
    
    return { tx: sig.toString() };
  } catch (err) {
    console.error('[Keeper] Burn failed:', err);
    return {};
  }
}

// ── Distribute Staker Rewards ──

export async function distributeStakerRewards(totalUsdc: number): Promise<{ recipients: number; tx?: string }> {
  if (totalUsdc <= 0.01) return { recipients: 0 };

  if (isDryRun()) {
    console.log(`[Keeper:dry-run] Would distribute ${totalUsdc} USDC to stakers`);
    return { recipients: 0 };
  }

  try {
    // In production, this queries all matured stakes and distributes pro-rata
    const connection = getConnection();
    const wallet = getTreasuryWallet();
    
    // Fetch all matured staking positions
    const stakes = db.prepare(`
      SELECT user_id, amount FROM staking_positions 
      WHERE status = 'matured' AND matured_at <= ?
    `).all(Date.now()) as { user_id: string; amount: number }[];
    
    if (stakes.length === 0) return { recipients: 0 };
    
    const totalStaked = stakes.reduce((s, st) => s + st.amount, 0);
    let distributed = 0;
    
    for (const stake of stakes) {
      const share = stake.amount / totalStaked;
      const reward = totalUsdc * share;
      if (reward < 0.01) continue; // Skip dust
      
      // TODO: Transfer reward to staker's wallet via ATA
      // For now, just record the accounting
      db.prepare('UPDATE staking_positions SET rewards_earned = rewards_earned + ? WHERE user_id = ?').run(reward, stake.user_id);
      distributed++;
    }
    
    return { recipients: distributed };
  } catch (err) {
    console.error('[Keeper] Distribute rewards failed:', err);
    return { recipients: 0 };
  }
}

// ── Main Keeper Run ──

export async function runKeeper(): Promise<KeeperRun> {
  const mint = getTokenMint();
  const launched = mint !== null;
  
  const run: KeeperRun = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    dryRun: isDryRun() ? 1 : 0,
    feesClaimed: 0,
    buybackAmount: 0,
    burnAmount: 0,
    stakerRewards: 0,
    status: 'success',
  };

  try {
    if (launched) {
      // Step 1: Claim creator fees from pump.fun
      const claim = await claimCreatorFees();
      run.feesClaimed = claim.amount;
      run.txClaim = claim.tx;
      
      if (claim.amount > 0) {
        addTreasuryEntry({
          id: crypto.randomUUID(),
          source: 'trading_fees',
          amountUsdc: claim.amount,
          timestamp: Date.now(),
          txSignature: claim.tx,
        });
        
        // Step 2: Split the pool
        const buybackUsdc = claim.amount * COMPUTE_MARGIN_TO_POOL * POOL_BURN_SPLIT;
        const rewardsUsdc = claim.amount * COMPUTE_MARGIN_TO_POOL * (1 - POOL_BURN_SPLIT);
        
        // Step 3: Buyback
        if (buybackUsdc > 0.01) {
          const buy = await buyTokenWithUsdc(buybackUsdc);
          run.buybackAmount = buy.amount;
          run.txBuyback = buy.tx;
          
          // Step 4: Burn
          if (buy.amount > 0) {
            const burn = await burnSuper(buy.amount);
            run.burnAmount = buy.amount;
            run.txBurn = burn.tx;
          }
        }
        
        // Step 5: Distribute to stakers
        if (rewardsUsdc > 0.01) {
          const dist = await distributeStakerRewards(rewardsUsdc);
          run.stakerRewards = rewardsUsdc;
          run.txRewards = dist.tx;
        }
      }
    }
    
    recordKeeperRun(run);
    return run;
  } catch (err) {
    run.status = 'failed';
    run.error = err instanceof Error ? err.message : String(err);
    recordKeeperRun(run);
    return run;
  }
}






