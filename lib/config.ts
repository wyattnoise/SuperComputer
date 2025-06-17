// SuperCompute — Core Configuration
// All tunable parameters live here, sourced from environment with sensible defaults.

// ── Token & Chain ──

// The token token mint address. Set at launch. pump.fun mints use 6 decimals.
export const TOKEN_DECIMALS = 6;
export function getTokenMint(): string | null {
  const m = process.env.TOKEN_MINT?.trim();
  return m && m.length > 0 ? m : null;
}
export function isTokenLaunched(): boolean {
  return getTokenMint() !== null;
}

// ── Revenue Split ──

function pct(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

// Of the 30% compute margin, how much goes into the buyback pool (rest = ops)
export const COMPUTE_MARGIN_TO_POOL = pct('SC_COMPUTE_MARGIN_POOL', 1.0);
// Of trading fees, how much goes to buyback pool (rest = team)
export const TRADING_FEE_TO_POOL = pct('SC_TRADING_FEE_POOL', 0.35);
// Of the pool, how much buys+burns token (rest = staker USDC rewards)
export const POOL_BURN_SPLIT = pct('SC_POOL_BURN_SPLIT', 0.5);

// ── Worker Economics ──

export const WORKER_BASE_SHARE = 0.7;  // 70% to worker
export const WORKER_STAKED_SHARE = pct('SC_WORKER_STAKED_SHARE', 0.8); // 80% with stake
export const WORKER_STAKE_THRESHOLD = Number(process.env.SC_WORKER_STAKE_MIN || 500_000);
export const REFERRAL_SHARE = pct('SC_REFERRAL_SHARE', 0.05);

// ── Staking ──

export const STAKE_MIN_AGE_MS = 24 * 60 * 60 * 1000; // 24h to mature
export const MIN_UNSTAKE = Number(process.env.SC_MIN_UNSTAKE || 1000);
export const KEEPER_UTC_HOUR = Number(process.env.SC_KEEPER_HOUR || 15); // 15:00 UTC daily

// ── Free Tier ──

export const FREE_PROMPT_LIMIT = Number(process.env.SC_FREE_PROMPTS || 5);
export const FREE_IMAGE_LIMIT = Number(process.env.SC_FREE_IMAGES || 3);
export const FREE_SUBSIDY_DAILY_CAP = Number(process.env.SC_SUBSIDY_DAILY || 50);
export const FREE_SUBSIDY_HOURLY_CAP = Number(process.env.SC_SUBSIDY_HOURLY || 3);
export const ANON_FREE_PROMPTS = Number(process.env.SC_ANON_PROMPTS || 5);
export const ANON_IP_DAILY_CAP = Number(process.env.SC_ANON_IP_CAP || 8);
export const ACCOUNT_CREATE_IP_DAILY = Number(process.env.SC_ACCOUNT_IP_LIMIT || 5);

// ── Image Generation ──

export const IMAGE_CREDITS = Number(process.env.SC_IMAGE_CREDITS || 20);
export const COMFY_URL = (process.env.SC_COMFY_URL || 'http://127.0.0.1:8188').replace(/\/$/, '');
export const IMAGE_TIMEOUT_MS = Number(process.env.SC_IMAGE_TIMEOUT || 120_000);

// ── Inference ──

export const CHAT_CREDITS_PER_TOKEN = Number(process.env.SC_CHAT_CREDIT_PER_TOKEN || 0.001);
export const MAX_CONTEXT_TOKENS = Number(process.env.SC_MAX_CONTEXT || 8192);

// ── Orchestrator ──

export const WS_PORT = Number(process.env.SC_WS_PORT || 3002);
export const JOB_TIMEOUT_MS = Number(process.env.SC_JOB_TIMEOUT || 300_000);
export const MAX_QUEUE_DEPTH = Number(process.env.SC_QUEUE_DEPTH || 100);

// ── Anti-Abuse ──

export const ANTI_CHEAT_CANARY_INTERVAL = Number(process.env.SC_CANARY_INTERVAL_MS || 60_000);
export const ANTI_CHEAT_COHERENCE_SAMPLE = Number(process.env.SC_COHERENCE_SAMPLE || 0.05);
export const ANTI_CHEAT_SPEED_DEVIATION = Number(process.env.SC_SPEED_DEV || 0.3);

// ── DB ──

export const DB_PATH = process.env.SC_DB_PATH || './data/supercompute.db';


