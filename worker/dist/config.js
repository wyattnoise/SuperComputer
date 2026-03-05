// SuperCompute Worker Configuration
// Loads env vars with sensible defaults for both 'native' (Ollama) and 'browser' (WebGPU) modes.
import os from 'node:os';
function str(key, fallback) {
    return process.env[key]?.trim() || fallback;
}
function num(key, fallback) {
    const v = process.env[key];
    if (!v)
        return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}
function workerType(val) {
    const v = val.toLowerCase();
    if (v === 'browser')
        return 'browser';
    return 'native';
}
export function loadConfig(overrides) {
    const config = {
        orchestratorUrl: str('SC_ORCHESTRATOR_URL', 'ws://localhost:3002'),
        model: str('SC_WORKER_MODEL', 'llama3.1:8b'),
        name: str('SC_WORKER_NAME', `supercompute-worker-${os.hostname()}`),
        type: workerType(str('SC_WORKER_TYPE', 'native')),
        heartbeatIntervalMs: num('SC_HEARTBEAT_MS', 30_000),
        canaryCheckIntervalMs: num('SC_CANARY_CHECK_MS', 60_000),
        ollamaBin: str('SC_OLLAMA_BIN', 'ollama'),
        inferenceTimeoutMs: num('SC_INFERENCE_TIMEOUT', 300_000),
        maxTokens: num('SC_MAX_TOKENS', 2048),
        ownerId: str('SC_WORKER_OWNER', 'anonymous'),
    };
    if (overrides) {
        return { ...config, ...overrides };
    }
    return config;
}
export default loadConfig;
//# sourceMappingURL=config.js.map
