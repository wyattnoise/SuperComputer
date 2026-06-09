#!/usr/bin/env tsx

// SuperCompute Database Backup
// Creates a timestamped backup of the SQLite database.
// Usage: tsx scripts/backup-db.ts [--output-dir <path>]

import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';

function getDbPath(): string {
  return process.env.SC_DB_PATH || resolve(process.cwd(), 'data/supercompute.db');
}

function getOutputDir(): string {
  const idx = process.argv.indexOf('--output-dir');
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return resolve(process.cwd(), process.argv[idx + 1]);
  }
  return resolve(process.cwd(), 'data/backups');
}

function formatTimestamp(date: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function cleanupOldBackups(backupDir: string, maxBackups: number = 50): void {
  if (!existsSync(backupDir)) return;

  const files = readdirSync(backupDir)
    .filter(f => f.startsWith('supercompute-backup-') && f.endsWith('.db'))
    .sort()
    .reverse(); // newest first

  if (files.length > maxBackups) {
    const toDelete = files.slice(maxBackups);
    for (const file of toDelete) {
      const filePath = resolve(backupDir, file);
      try {
        // Use unlinkSync via import
        const { unlinkSync } = require('node:fs');
        unlinkSync(filePath);
        console.log(`  🗑️  Removed old backup: ${file}`);
      } catch {
        console.error(`  ⚠️  Could not remove ${file}`);
      }
    }
    console.log(`  Cleaned up ${toDelete.length} old backup(s)\n`);
  }
}

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════');
  console.log('  SuperCompute Database Backup');
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════\n');

  const dbPath = getDbPath();
  const backupDir = getOutputDir();
  const timestamp = formatTimestamp(new Date());
  const backupName = `supercompute-backup-${timestamp}.db`;
  const backupPath = resolve(backupDir, backupName);

  // Validate source exists
  if (!existsSync(dbPath)) {
    console.error(`  ❌ Database not found at: ${dbPath}`);
    console.error('     Check SC_DB_PATH env var or ensure data/supercompute.db exists.');
    process.exit(1);
  }

  // Determine database size
  const { statSync } = await import('node:fs');
  const sourceSize = statSync(dbPath).size;
  const sourceSizeMB = (sourceSize / (1024 * 1024)).toFixed(2);

  console.log(`  Source:   ${dbPath}`);
  console.log(`  Size:     ${sourceSizeMB} MB`);
  console.log(`  Backup:   ${backupPath}\n`);

  // Create backup directory
  mkdirSync(backupDir, { recursive: true });

  // WAL checkpoint before copying (best effort)
  try {
    // Attempt to run WAL checkpoint via a quick SQLite command
    const { execSync } = await import('node:child_process');
    execSync(`sqlite3 "${dbPath}" "PRAGMA wal_checkpoint(TRUNCATE);"`, {
      timeout: 10_000,
      stdio: 'pipe',
    });
    console.log('  ✅ WAL checkpoint completed');
  } catch {
    // sqlite3 CLI might not be installed — that's okay
    console.log('  ⚠️  Could not run WAL checkpoint (sqlite3 CLI not available)');
  }

  // Also backup WAL and SHM files if they exist
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;

  // Copy the main database file
  copyFileSync(dbPath, backupPath);
  console.log(`  ✅ Database copied to: ${backupName}`);

  // Copy WAL and SHM if present
  if (existsSync(walPath)) {
    const walBackup = resolve(backupDir, `${basename(backupPath)}-wal`);
    copyFileSync(walPath, walBackup);
    console.log(`  ✅ WAL file backed up`);
  }

  if (existsSync(shmPath)) {
    const shmBackup = resolve(backupDir, `${basename(backupPath)}-shm`);
    copyFileSync(shmPath, shmBackup);
    console.log(`  ✅ SHM file backed up`);
  }

  // Verify backup integrity
  const backupStat = statSync(backupPath);
  const backupSizeMB = (backupStat.size / (1024 * 1024)).toFixed(2);

  if (backupStat.size === 0) {
    console.error('  ❌ Backup file is empty — backup failed!');
    process.exit(1);
  }

  console.log(`\n  ✅ Backup verified: ${backupSizeMB} MB`);

  // Cleanup old backups (keep last 50)
  cleanupOldBackups(backupDir);

  console.log('───────────────────────────────────────────────');
  console.log(`  Backup:   ${backupPath}`);
  console.log(`  Size:     ${backupSizeMB} MB`);
  console.log(`  Done:     ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('[Backup] Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});


