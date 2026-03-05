export interface WorkerConfig {
    /** Orchestrator WebSocket URL */
    orchestratorUrl: string;
    /** Model the worker advertises and runs */
    model: string;
    /** Human-readable worker name */
    name: string;
    /** Worker type: 'native' (Ollama) or 'browser' (WebGPU) */
    type: 'native' | 'browser';
    /** Interval in ms between heartbeats sent to orchestrator */
    heartbeatIntervalMs: number;
    /** Interval in ms between canary response checks */
    canaryCheckIntervalMs: number;
    /** Path or command for Ollama binary */
    ollamaBin: string;
    /** Timeout in ms for a single Ollama run */
    inferenceTimeoutMs: number;
    /** Maximum tokens to generate per inference */
    maxTokens: number;
    /** Owner ID — ties worker earnings to a specific user */
    ownerId: string;
}
export declare function loadConfig(overrides?: Partial<WorkerConfig>): WorkerConfig;
export default loadConfig;
//# sourceMappingURL=config.d.ts.map


