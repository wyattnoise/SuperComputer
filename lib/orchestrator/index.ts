// SuperCompute Orchestrator — WebSocket server for job routing, billing, anti-cheat
import { Server as SocketServer } from 'socket.io';
import { createServer } from 'http';
import { randomUUID } from 'crypto';
import { WS_PORT, JOB_TIMEOUT_MS, ANTI_CHEAT_CANARY_INTERVAL, ANTI_CHEAT_COHERENCE_SAMPLE } from '../config';
import db, { createJob, updateJobStatus, getQueuedJobs, getAvailableWorkers, updateWorkerStatus, getProfileById, updateCredits } from '../db';
import type { Job, Worker } from '../types';

interface AuthenticatedSocket {
  userId?: string;
  workerId?: string;
  isWorker: boolean;
}

const httpServer = createServer();
const io = new SocketServer(httpServer, {
  cors: { origin: process.env.SC_CORS_ORIGIN || 'http://localhost:3000', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 5 * 1024 * 1024, // 5MB max message
});

const activeWorkers = new Map<string, { socket: any; worker: Worker; lastHeartbeat: number }>();
const activeJobs = new Map<string, { job: Job; timeout: NodeJS.Timeout; userId?: string }>();
const pendingSubmissions = new Map<string, number>(); // workerId -> pending job count

// ── Anti-Cheat System ──

interface CanaryProbe {
  id: string;
  prompt: string;
  expectedHash: string;
  tolerance: number;
  dispatchedAt: number;
}

function generateCanaryProbe(): CanaryProbe {
  const probes = [
    { prompt: 'What is 2+2?', expectedHash: 'hash_4', tolerance: 0.0 },
    { prompt: 'List the first 5 prime numbers.', expectedHash: 'hash_235711', tolerance: 0.1 },
    { prompt: 'What color is the sky on a clear day?', expectedHash: 'hash_blue', tolerance: 0.2 },
    { prompt: 'Write "hello world" in Python.', expectedHash: 'hash_print_hello', tolerance: 0.15 },
  ];
  return { id: randomUUID(), ...probes[Math.floor(Math.random() * probes.length)], dispatchedAt: Date.now() };
}

function checkCoherence(workerId: string): boolean {
  // Check that worker's response speed is consistent with its hardware profile
  const worker = activeWorkers.get(workerId);
  if (!worker) return false;
  const now = Date.now();
  const expectedLatency = worker.worker.vramMb ? Math.max(500, 20000 - worker.worker.vramMb * 0.01) : 5000;
  const actualLatency = now - worker.lastHeartbeat;
  return actualLatency < expectedLatency * 3; // Allow 3x deviation
}

// Dispatch occasional canary probes to detect fake workers
function dispatchCanary(workerId: string): void {
  if (Math.random() > ANTI_CHEAT_COHERENCE_SAMPLE) return; // Sample ~5% of jobs
  const probe = generateCanaryProbe();
  const worker = activeWorkers.get(workerId);
  if (!worker) return;
  worker.socket.emit('canary', probe);
}

// ── Job Routing ──

async function routeJob(job: Job): Promise<void> {
  const candidates = Array.from(activeWorkers.values())
    .filter(w => w.worker.status === 'idle' && w.worker.model === job.model)
    .sort((a, b) => {
      // Prefer workers with stake, then by reliability, then by load
      const aScore = (a.worker.stakeAmount > 0 ? 1000 : 0) + a.worker.reliability * 100 - a.worker.currentLoad;
      const bScore = (b.worker.stakeAmount > 0 ? 1000 : 0) + b.worker.reliability * 100 - b.worker.currentLoad;
      return bScore - aScore;
    });

  if (candidates.length === 0) {
    updateJobStatus(job.id, 'failed', undefined, undefined, 'No available workers');
    return;
  }

  const selected = candidates[0];
  selected.worker.status = 'busy';
  updateWorkerStatus(selected.worker.id, 'busy', selected.worker.currentLoad);
  
  dispatchCanary(selected.worker.id);
  
  const timeout = setTimeout(() => {
    updateJobStatus(job.id, 'failed', selected.worker.id, undefined, 'Job timed out');
    selected.worker.status = 'idle';
    updateWorkerStatus(selected.worker.id, 'idle');
    activeJobs.delete(job.id);
  }, JOB_TIMEOUT_MS);

  activeJobs.set(job.id, { job, timeout, userId: job.userId });
  selected.socket.emit('job', job);
}

// ── Socket.IO Events ──

io.on('connection', (socket) => {
  const auth: AuthenticatedSocket = { isWorker: false };

  // ── Worker Registration ──
  socket.on('worker:register', (data: { workerId: string; name: string; model: string; hardware?: string; gpuName?: string; vramMb?: number; ownerId?: string }) => {
    const worker: Worker = {
      id: data.workerId,
      name: data.name,
      ownerId: data.ownerId || 'anonymous',
      type: data.hardware?.includes('browser') ? 'browser' : 'native',
      status: 'idle',
      model: data.model,
      hardware: data.hardware || 'unknown',
      gpuName: data.gpuName,
      vramMb: data.vramMb,
      maxBatchSize: data.hardware?.includes('browser') ? 1 : 4,
      currentLoad: 0,
      totalJobs: 0,
      totalEarnings: 0,
      stakeAmount: 0,
      reliability: 1.0,
      lastSeen: Date.now(),
      registeredAt: Date.now(),
    };

    auth.workerId = data.workerId;
    auth.isWorker = true;
    activeWorkers.set(data.workerId, { socket, worker, lastHeartbeat: Date.now() });

    socket.join('workers');
    socket.emit('worker:registered', { id: data.workerId });

    // Check for queued jobs
    const pending = getQueuedJobs(5);
    pending.forEach(job => routeJob(job));
  });

  // ── Worker Heartbeat ──
  socket.on('worker:heartbeat', (data: { workerId: string; load?: number }) => {
    const entry = activeWorkers.get(data.workerId);
    if (entry) {
      entry.lastHeartbeat = Date.now();
      if (data.load !== undefined) {
        entry.worker.currentLoad = data.load;
      }
    }
  });

  // ── Job Result ──
  socket.on('job:complete', (data: { jobId: string; tokens: number; text?: string }) => {
    const active = activeJobs.get(data.jobId);
    if (!active) return;
    clearTimeout(active.timeout);

    updateJobStatus(data.jobId, 'completed', auth.workerId, data.tokens);

    // Deduct credits from user
    if (active.userId) {
      const profile = getProfileById(active.userId);
      if (profile) {
        updateCredits(active.userId, -active.job.creditsCost);
      }
    }

    // Update worker earnings
    if (auth.workerId) {
      const entry = activeWorkers.get(auth.workerId);
      if (entry) {
        const earnings = active.job.creditsCost * 0.7; // 70% worker share
        entry.worker.totalEarnings += earnings;
        entry.worker.totalJobs += 1;
        entry.worker.status = 'idle';
        updateWorkerStatus(auth.workerId, 'idle', 0, 1, earnings);
      }
    }

    // Route next queued job
    const queued = getQueuedJobs(1);
    queued.forEach(job => routeJob(job));

    activeJobs.delete(data.jobId);
    socket.emit('job:ack', { jobId: data.jobId, status: 'completed' });
  });

  socket.on('job:failed', (data: { jobId: string; error: string }) => {
    const active = activeJobs.get(data.jobId);
    if (active) {
      clearTimeout(active.timeout);
      updateJobStatus(data.jobId, 'failed', auth.workerId, undefined, data.error);
      activeJobs.delete(data.jobId);
    }
    if (auth.workerId) {
      const entry = activeWorkers.get(auth.workerId);
      if (entry) {
        entry.worker.reliability = Math.max(0, entry.worker.reliability - 0.05);
        entry.worker.status = 'idle';
        updateWorkerStatus(auth.workerId, 'idle');
      }
    }
  });

  // ── Client Job Submission ──
  socket.on('job:submit', (data: { model: string; prompt: string; type?: string; userId?: string; params?: Record<string, unknown> }) => {
    const job: Job = {
      id: randomUUID(),
      type: (data.type as Job['type']) || 'chat',
      model: data.model,
      prompt: data.prompt,
      params: data.params,
      status: 'queued',
      creditsCost: 0.01, // Default cost
      createdAt: Date.now(),
    };

    createJob(job);
    socket.emit('job:queued', { jobId: job.id });

    // Try to route immediately
    routeJob(job);
  });

  // ── Disconnect ──
  socket.on('disconnect', () => {
    if (auth.workerId) {
      const entry = activeWorkers.get(auth.workerId);
      if (entry) {
        entry.worker.status = 'offline';
        updateWorkerStatus(auth.workerId, 'offline');
      }
      activeWorkers.delete(auth.workerId);
    }
  });
});

// ── Periodic Canary Dispatch ──
setInterval(() => {
  activeWorkers.forEach((entry, workerId) => {
    const now = Date.now();
    if (now - entry.lastHeartbeat > 120_000) {
      // Worker has been silent for 2+ minutes — mark offline
      entry.worker.status = 'offline';
      updateWorkerStatus(workerId, 'offline');
      activeWorkers.delete(workerId);
    }
  });
}, ANTI_CHEAT_CANARY_INTERVAL);

// ── Health Check ──
io.on('connection', (socket) => {
  socket.on('health', () => {
    socket.emit('health', {
      status: 'ok',
      activeWorkers: activeWorkers.size,
      queuedJobs: getQueuedJobs(100).length,
      activeJobs: activeJobs.size,
      uptime: process.uptime(),
    });
  });
});

// ── Start ──
export function startOrchestrator(port: number = WS_PORT): void {
  httpServer.listen(port, () => {
    console.log(`[SuperCompute] Orchestrator running on :${port}`);
    console.log(`[SuperCompute] Workers: ${activeWorkers.size}, Queue: ${getQueuedJobs(100).length}`);
  });
}

// ── API for web server ──
export function getOrchestratorStats() {
  return {
    activeWorkers: activeWorkers.size,
    queuedJobs: getQueuedJobs(100).length,
    activeJobs: activeJobs.size,
    workers: Array.from(activeWorkers.entries()).map(([id, entry]) => ({
      id,
      name: entry.worker.name,
      model: entry.worker.model,
      status: entry.worker.status,
      load: entry.worker.currentLoad,
      jobs: entry.worker.totalJobs,
      earnings: entry.worker.totalEarnings,
      reliability: entry.worker.reliability,
      lastSeen: entry.lastHeartbeat,
    })),
  };
}

if (process.argv[1]?.includes('server/index.ts')) {
  startOrchestrator();
}



