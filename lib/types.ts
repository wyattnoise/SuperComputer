export interface Profile {
  id: string;
  privyId: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  credits: number;
  totalPrompts: number;
  totalImages: number;
  workerId?: string;
  stakedAmount: number;
  stakedAt?: number;
  referralCode: string;
  referredBy?: string;
  isWorker: boolean;
  nsfwEnabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Job {
  id: string;
  type: 'chat' | 'image' | 'embedding';
  model: string;
  prompt: string;
  params?: Record<string, unknown>;
  status: 'queued' | 'running' | 'completed' | 'failed';
  workerId?: string;
  userId?: string;
  creditsCost: number;
  tokensGenerated?: number;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export interface Worker {
  id: string;
  name: string;
  ownerId: string;
  type: 'browser' | 'native';
  status: 'idle' | 'busy' | 'offline';
  model: string;
  hardware: string;
  gpuName?: string;
  vramMb?: number;
  maxBatchSize: number;
  currentLoad: number;
  totalJobs: number;
  totalEarnings: number;
  stakeAmount: number;
  reliability: number;
  lastSeen: number;
  registeredAt: number;
}

export interface StakingPosition {
  id: string;
  userId: string;
  amount: number;
  tokenMint: string;
  status: 'locking' | 'matured' | 'unstaking';
  lockedAt: number;
  maturedAt: number;
  rewardsEarned: number;
}

export interface TreasuryEntry {
  id: string;
  source: 'compute_margin' | 'trading_fees' | 'referral';
  amountUsdc: number;
  timestamp: number;
  txSignature?: string;
}

export interface KeeperRun {
  id: string;
  timestamp: number;
  dryRun: boolean;
  feesClaimed: number;
  buybackAmount: number;
  burnAmount: number;
  stakerRewards: number;
  txClaim?: string;
  txBuyback?: string;
  txBurn?: string;
  txRewards?: string;
  status: 'success' | 'failed';
  error?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model: string;
  timestamp: number;
  tokens?: number;
}

export interface ApiKey {
  id: string;
  userId: string;
  keyPrefix: string;
  name: string;
  createdAt: number;
  lastUsed?: number;
  revoked: boolean;
}


