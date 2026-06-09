#!/usr/bin/env tsx

// SuperCompute Database Seed
// Seeds the database with the initial schema and optional demo data.
// Safe to run multiple times (CREATE IF NOT EXISTS).

import { randomUUID, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

// ── Schema — mirroring lib/db.ts ──

const SCHEMA_SQL = `
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
`;

// ── Demo Data ──

function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

const DEMO_DATA = {
  admins: [
    {
      id: 'admin-001',
      privyId: 'privy-did:1234567890abcdef',
      displayName: 'SuperCompute Admin',
      email: 'admin@supercompute.ai',
      credits: 10000,
      totalPrompts: 0,
      totalImages: 0,
      referralCode: 'ADMIN',
      isWorker: false,
      nsfwEnabled: true,
    },
  ],
  workers: [
    {
      id: 'worker-demo-gpu-01',
      name: 'Demo GPU Worker 01',
      ownerId: 'admin-001',
      type: 'native' as const,
      model: 'llama3.1:8b',
      hardware: 'nvidia-linux',
      gpuName: 'NVIDIA GeForce RTX 4090',
      vramMb: 24576,
      maxBatchSize: 4,
    },
    {
      id: 'worker-demo-gpu-02',
      name: 'Demo GPU Worker 02',
      ownerId: 'admin-001',
      type: 'native' as const,
      model: 'llama3.1:8b',
      hardware: 'nvidia-linux',
      gpuName: 'NVIDIA A100 80GB',
      vramMb: 81920,
      maxBatchSize: 8,
    },
  ],
};

// ── Main ──

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════');
  console.log('  SuperCompute Database Seed');
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════\n');

  const dbPath = process.env.SC_DB_PATH || resolve(process.cwd(), 'data/supercompute.db');
  const shouldSeed = process.env.SC_SEED_DEMO !== 'false';

  console.log(`  Database: ${dbPath}`);
  console.log(`  Demo data: ${shouldSeed ? 'YES' : 'NO (SC_SEED_DEMO=false)'}\n`);

  // Dynamically import better-sqlite3
  let Database: typeof import('better-sqlite3').default;
  try {
    Database = (await import('better-sqlite3')).default;
  } catch {
    console.error('  ❌ better-sqlite3 is not installed. Run: npm install better-sqlite3');
    process.exit(1);
  }

  const { mkdirSync, existsSync } = await import('node:fs');
  const { dirname } = await import('node:path');

  // Ensure directory exists
  mkdirSync(dirname(dbPath), { recursive: true });

  // Open database
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  try {
    // Step 1: Create schema
    console.log('  Step 1/3: Creating schema...');
    db.exec(SCHEMA_SQL);
    console.log('  ✅ Schema created\n');

    // Step 2: Seed demo data
    if (shouldSeed) {
      console.log('  Step 2/3: Seeding demo data...');

      // Insert admin profile
      const insertProfile = db.prepare(`
        INSERT OR IGNORE INTO profiles
          (id, privy_id, display_name, email, credits, total_prompts, total_images,
           referral_code, is_worker, nsfw_enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const admin of DEMO_DATA.admins) {
        insertProfile.run(
          admin.id, admin.privyId, admin.displayName, admin.email,
          admin.credits, admin.totalPrompts, admin.totalImages,
          admin.referralCode, admin.isWorker ? 1 : 0,
          admin.nsfwEnabled ? 1 : 0,
          Date.now(), Date.now(),
        );
        console.log(`  ✅ Profile: ${admin.displayName} (${admin.id})`);
      }

      // Insert demo workers
      const insertWorker = db.prepare(`
        INSERT OR IGNORE INTO workers
          (id, name, owner_id, type, status, model, hardware, gpu_name,
           vram_mb, max_batch_size, current_load, total_jobs, total_earnings,
           stake_amount, reliability, last_seen, registered_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const w of DEMO_DATA.workers) {
        insertWorker.run(
          w.id, w.name, w.ownerId, w.type, 'offline', w.model, w.hardware,
          w.gpuName, w.vramMb, w.maxBatchSize,
          0, 0, 0, 0, 1.0, Date.now(), Date.now(),
        );
        console.log(`  ✅ Worker: ${w.name} (${w.id}) — ${w.gpuName}, ${w.vramMb}MB VRAM`);
      }

      // Insert a sample completed job
      const insertJob = db.prepare(`
        INSERT OR IGNORE INTO jobs
          (id, type, model, prompt, params, status, worker_id, user_id,
           credits_cost, tokens_generated, created_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertJob.run(
        randomUUID(), 'chat', 'llama3.1:8b',
        'What is the meaning of life?',
        JSON.stringify({ temperature: 0.7 }),
        'completed', 'worker-demo-gpu-01', 'admin-001',
        0.01, 42, Date.now() - 3600000, Date.now() - 3540000,
      );
      console.log('  ✅ Demo job created');

      // Insert a sample staking position
      const insertStaking = db.prepare(`
        INSERT OR IGNORE INTO staking_positions
          (id, user_id, amount, token_mint, status, locked_at, matured_at, rewards_earned)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertStaking.run(
        randomUUID(), 'admin-001', 1000000,
        process.env.TOKEN_MINT || 'So11111111111111111111111111111111111111112',
        'matured', Date.now() - 7 * 24 * 3600000, Date.now() - 3600000, 12.50,
      );
      console.log('  ✅ Demo staking position created');

      console.log('');
    }

    // Step 3: Verify
    console.log('  Step 3/3: Verifying...');

    const profileCount = (db.prepare('SELECT COUNT(*) as count FROM profiles').get() as { count: number }).count;
    const workerCount = (db.prepare('SELECT COUNT(*) as count FROM workers').get() as { count: number }).count;
    const jobCount = (db.prepare('SELECT COUNT(*) as count FROM jobs').get() as { count: number }).count;
    const tableCount = (db.prepare(`
      SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).get() as { count: number }).count;

    console.log(`  📊 Profiles:     ${profileCount}`);
    console.log(`  📊 Workers:      ${workerCount}`);
    console.log(`  📊 Jobs:         ${jobCount}`);
    console.log(`  📊 Tables:       ${tableCount}\n`);

    console.log('═══════════════════════════════════════════════');
    console.log('  ✅ Seed complete');
    console.log('═══════════════════════════════════════════════\n');
  } catch (err) {
    console.error('\n  ❌ Seed failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error('[Seed] Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});


