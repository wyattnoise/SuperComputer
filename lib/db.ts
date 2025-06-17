// SuperCompute Database Layer — Local SQLite via better-sqlite3
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { DB_PATH } from './config';
import type { Profile, Job, Worker, ApiKey, StakingPosition, TreasuryEntry, KeeperRun } from './types';

const dbPath = path.resolve(DB_PATH);

// Ensure data directory exists
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

// Enable WAL mode for concurrent reads
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ──

db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    privy_id TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    email TEXT,
    avatar_url TEXT,
    credits REAL NOT NULL DEFAULT 0,
    total_prompts INTEGER NOT NULL DEFAULT 0,
    total_images INTEGER NOT NULL DEFAULT 0,
    worker_id TEXT,
    staked_amount INTEGER NOT NULL DEFAULT 0,
    staked_at INTEGER,
    referral_code TEXT UNIQUE NOT NULL,
    referred_by TEXT,
    is_worker INTEGER NOT NULL DEFAULT 0,
    nsfw_enabled INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('chat','image','embedding')),
    model TEXT NOT NULL,
    prompt TEXT NOT NULL,
    params TEXT,
    status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed')),
    worker_id TEXT,
    user_id TEXT,
    credits_cost REAL NOT NULL DEFAULT 0,
    tokens_generated INTEGER,
    error TEXT,
    created_at INTEGER NOT NULL,
    completed_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS workers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('browser','native')),
    status TEXT NOT NULL DEFAULT 'offline' CHECK(status IN ('idle','busy','offline')),
    model TEXT NOT NULL,
    hardware TEXT,
    gpu_name TEXT,
    vram_mb INTEGER,
    max_batch_size INTEGER NOT NULL DEFAULT 1,
    current_load REAL NOT NULL DEFAULT 0,
    total_jobs INTEGER NOT NULL DEFAULT 0,
    total_earnings REAL NOT NULL DEFAULT 0,
    stake_amount INTEGER NOT NULL DEFAULT 0,
    reliability REAL NOT NULL DEFAULT 1.0,
    last_seen INTEGER NOT NULL,
    registered_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_used INTEGER,
    revoked INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS staking_positions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    token_mint TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'locking' CHECK(status IN ('locking','matured','unstaking')),
    locked_at INTEGER NOT NULL,
    matured_at INTEGER NOT NULL,
    rewards_earned REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS treasury (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL CHECK(source IN ('compute_margin','trading_fees','referral')),
    amount_usdc REAL NOT NULL,
    timestamp INTEGER NOT NULL,
    tx_signature TEXT
  );

  CREATE TABLE IF NOT EXISTS keeper_runs (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    dry_run INTEGER NOT NULL DEFAULT 1,
    fees_claimed REAL NOT NULL DEFAULT 0,
    buyback_amount REAL NOT NULL DEFAULT 0,
    burn_amount REAL NOT NULL DEFAULT 0,
    staker_rewards REAL NOT NULL DEFAULT 0,
    tx_claim TEXT,
    tx_buyback TEXT,
    tx_burn TEXT,
    tx_rewards TEXT,
    status TEXT NOT NULL DEFAULT 'failed' CHECK(status IN ('success','failed')),
    error TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id);
  CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
  CREATE INDEX IF NOT EXISTS idx_workers_owner ON workers(owner_id);
  CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
  CREATE INDEX IF NOT EXISTS idx_staking_user ON staking_positions(user_id);
  CREATE INDEX IF NOT EXISTS idx_treasury_source ON treasury(source);
  CREATE INDEX IF NOT EXISTS idx_keeper_status ON keeper_runs(status);
`);

// ── Profile Queries ──

export function getProfileByPrivyId(privyId: string): Profile | null {
  const row = db.prepare('SELECT * FROM profiles WHERE privy_id = ?').get(privyId) as Record<string, unknown> | undefined;
  return row ? rowToProfile(row) : null;
}

export function getProfileById(id: string): Profile | null {
  const row = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToProfile(row) : null;
}

export function getProfileByReferralCode(code: string): Profile | null {
  const row = db.prepare('SELECT * FROM profiles WHERE referral_code = ?').get(code) as Record<string, unknown> | undefined;
  return row ? rowToProfile(row) : null;
}

export function upsertProfile(profile: Partial<Profile> & { id: string; privyId: string; displayName: string }): void {
  const existing = getProfileById(profile.id);
  if (existing) {
    db.prepare(`
      UPDATE profiles SET
        display_name = ?, email = COALESCE(?, email), avatar_url = COALESCE(?, avatar_url),
        credits = ?, is_worker = ?, nsfw_enabled = ?, updated_at = ?
      WHERE id = ?
    `).run(
      profile.displayName, profile.email ?? null, profile.avatarUrl ?? null,
      profile.credits ?? existing.credits, profile.isWorker ?? existing.isWorker ? 1 : 0,
      profile.nsfwEnabled ?? existing.nsfwEnabled ? 1 : 0,
      Date.now(), profile.id
    );
  } else {
    db.prepare(`
      INSERT INTO profiles (id, privy_id, display_name, email, avatar_url, credits, referral_code, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      profile.id, profile.privyId, profile.displayName, profile.email ?? null,
      profile.avatarUrl ?? null, profile.credits ?? 0,
      profile.referralCode ?? generateReferralCode(),
      Date.now(), Date.now()
    );
  }
}

export function updateCredits(userId: string, delta: number): void {
  db.prepare('UPDATE profiles SET credits = credits + ?, updated_at = ? WHERE id = ?').run(delta, Date.now(), userId);
}

export function incrementPrompts(userId: string): void {
  db.prepare('UPDATE profiles SET total_prompts = total_prompts + 1, updated_at = ? WHERE id = ?').run(Date.now(), userId);
}

// ── Job Queries ──

export function createJob(job: Job): void {
  db.prepare(`
    INSERT INTO jobs (id, type, model, prompt, params, status, worker_id, user_id, credits_cost, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(job.id, job.type, job.model, job.prompt, JSON.stringify(job.params ?? {}), job.status, job.workerId ?? null, job.userId ?? null, job.creditsCost, Date.now());
}

export function updateJobStatus(id: string, status: Job['status'], workerId?: string, tokens?: number, error?: string): void {
  db.prepare(`
    UPDATE jobs SET status = ?, worker_id = COALESCE(?, worker_id), tokens_generated = COALESCE(?, tokens_generated),
    error = ?, completed_at = CASE WHEN ? IN ('completed','failed') THEN ? ELSE NULL END
    WHERE id = ?
  `).run(status, workerId ?? null, tokens ?? null, error ?? null, status, Date.now(), id);
}

export function getQueuedJobs(limit: number = 10): Job[] {
  return (db.prepare('SELECT * FROM jobs WHERE status = ? ORDER BY created_at ASC LIMIT ?').all('queued', limit) as Record<string, unknown>[]).map(rowToJob);
}

// ── Worker Queries ──

export function registerWorker(worker: Worker): void {
  db.prepare(`
    INSERT INTO workers (id, name, owner_id, type, status, model, hardware, gpu_name, vram_mb, max_batch_size, last_seen, registered_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(worker.id, worker.name, worker.ownerId, worker.type, 'idle', worker.model, worker.hardware, worker.gpuName ?? null, worker.vramMb ?? null, worker.maxBatchSize, Date.now(), Date.now());
}

export function updateWorkerStatus(id: string, status: Worker['status'], load?: number, jobs?: number, earnings?: number): void {
  db.prepare(`
    UPDATE workers SET status = ?, current_load = ?, total_jobs = total_jobs + COALESCE(?, 0),
    total_earnings = total_earnings + COALESCE(?, 0), last_seen = ? WHERE id = ?
  `).run(status, load ?? 0, jobs ?? 0, earnings ?? 0, Date.now(), id);
}

export function getAvailableWorkers(model: string): Worker[] {
  return (db.prepare('SELECT * FROM workers WHERE status = ? AND model = ? ORDER BY reliability DESC, current_load ASC').all('idle', model) as Record<string, unknown>[]).map(rowToWorker);
}

// ── API Key Queries ──

export function createApiKey(key: ApiKey): void {
  db.prepare('INSERT INTO api_keys (id, user_id, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)').run(key.id, key.userId, key.keyPrefix, key.name, Date.now());
}

export function getUserApiKeys(userId: string): ApiKey[] {
  return (db.prepare('SELECT * FROM api_keys WHERE user_id = ? AND revoked = 0 ORDER BY created_at DESC').all(userId) as Record<string, unknown>[]).map(rowToApiKey);
}

// ── Staking ──

export function createStakingPosition(pos: StakingPosition): void {
  db.prepare('INSERT INTO staking_positions (id, user_id, amount, token_mint, status, locked_at, matured_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(pos.id, pos.userId, pos.amount, pos.tokenMint, pos.status, pos.lockedAt, pos.maturedAt);
}

export function getMaturedStakes(): StakingPosition[] {
  return (db.prepare('SELECT * FROM staking_positions WHERE status = ? AND matured_at <= ?').all('matured', Date.now()) as Record<string, unknown>[]).map(rowToStaking);
}

// ── Treasury & Keeper ──

export function addTreasuryEntry(entry: TreasuryEntry): void {
  db.prepare('INSERT INTO treasury (id, source, amount_usdc, timestamp, tx_signature) VALUES (?, ?, ?, ?, ?)').run(entry.id, entry.source, entry.amountUsdc, Date.now(), entry.txSignature ?? null);
}

export function recordKeeperRun(run: KeeperRun): void {
  db.prepare(`
    INSERT INTO keeper_runs (id, timestamp, dry_run, fees_claimed, buyback_amount, burn_amount, staker_rewards, tx_claim, tx_buyback, tx_burn, tx_rewards, status, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(run.id, Date.now(), run.dryRun ? 1 : 0, run.feesClaimed, run.buybackAmount, run.burnAmount, run.stakerRewards, run.txClaim ?? null, run.txBuyback ?? null, run.txBurn ?? null, run.txRewards ?? null, run.status, run.error ?? null);
}

// ── Helpers ──

function rowToProfile(r: Record<string, unknown>): Profile {
  return {
    id: r.id as string,
    privyId: r.privy_id as string,
    displayName: r.display_name as string,
    email: r.email as string | undefined,
    avatarUrl: r.avatar_url as string | undefined,
    credits: r.credits as number,
    totalPrompts: r.total_prompts as number,
    totalImages: r.total_images as number,
    workerId: r.worker_id as string | undefined,
    stakedAmount: r.staked_amount as number,
    stakedAt: r.staked_at as number | undefined,
    referralCode: r.referral_code as string,
    referredBy: r.referred_by as string | undefined,
    isWorker: Boolean(r.is_worker),
    nsfwEnabled: Boolean(r.nsfw_enabled),
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
  };
}

function rowToJob(r: Record<string, unknown>): Job {
  return {
    id: r.id as string,
    type: r.type as Job['type'],
    model: r.model as string,
    prompt: r.prompt as string,
    params: r.params ? JSON.parse(r.params as string) : undefined,
    status: r.status as Job['status'],
    workerId: r.worker_id as string | undefined,
    userId: r.user_id as string | undefined,
    creditsCost: r.credits_cost as number,
    tokensGenerated: r.tokens_generated as number | undefined,
    error: r.error as string | undefined,
    createdAt: r.created_at as number,
    completedAt: r.completed_at as number | undefined,
  };
}

function rowToWorker(r: Record<string, unknown>): Worker {
  return {
    id: r.id as string,
    name: r.name as string,
    ownerId: r.owner_id as string,
    type: r.type as Worker['type'],
    status: r.status as Worker['status'],
    model: r.model as string,
    hardware: r.hardware as string,
    gpuName: r.gpu_name as string | undefined,
    vramMb: r.vram_mb as number | undefined,
    maxBatchSize: r.max_batch_size as number,
    currentLoad: r.current_load as number,
    totalJobs: r.total_jobs as number,
    totalEarnings: r.total_earnings as number,
    stakeAmount: r.stake_amount as number,
    reliability: r.reliability as number,
    lastSeen: r.last_seen as number,
    registeredAt: r.registered_at as number,
  };
}

function rowToApiKey(r: Record<string, unknown>): ApiKey {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    keyPrefix: r.key_prefix as string,
    name: r.name as string,
    createdAt: r.created_at as number,
    lastUsed: r.last_used as number | undefined,
    revoked: Boolean(r.revoked),
  };
}

function rowToStaking(r: Record<string, unknown>): StakingPosition {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    amount: r.amount as number,
    tokenMint: r.token_mint as string,
    status: r.status as StakingPosition['status'],
    lockedAt: r.locked_at as number,
    maturedAt: r.matured_at as number,
    rewardsEarned: r.rewards_earned as number,
  };
}

function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export default db;



