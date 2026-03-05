# SuperCompute Worker

Run inference jobs for the SuperCompute decentralized AI network. Connect your GPU, earn USDC for every inference you serve.

## Prerequisites

- **Node.js** >= 18.0.0
- **Ollama** (for native mode) — [Install from ollama.com](https://ollama.com)
- At least one model pulled: `ollama pull llama3.1:8b`

## Quick Start

```bash
# Install dependencies
cd worker && npm install

# Build the worker
npm run build

# Run with defaults (connects to ws://localhost:3002)
npm start

# Or run directly in dev mode
npm run dev -- --model llama3.1:8b
```

## CLI Options

```bash
supercompute-worker [options]

Options:
  -m, --model <model>    Model to advertise and run (default: llama3.1:8b)
  -n, --name <name>      Worker display name (default: supercompute-worker-<hostname>)
  -s, --server <url>     Orchestrator WebSocket URL (default: ws://localhost:3002)
  -t, --type <type>       Worker type: native (Ollama) or browser (default: native)
  -o, --owner <id>       Owner user ID for earnings attribution
  --dry-run              Validate configuration and exit without connecting
  -V, --version          Output version number
  -h, --help             Display help
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SC_ORCHESTRATOR_URL` | `ws://localhost:3002` | Orchestrator WebSocket URL |
| `SC_WORKER_MODEL` | `llama3.1:8b` | Model to run |
| `SC_WORKER_NAME` | auto | Worker display name |
| `SC_WORKER_TYPE` | `native` | `native` (Ollama) or `browser` (WebGPU) |
| `SC_WORKER_OWNER` | `anonymous` | Owner ID for earnings attribution |
| `SC_HEARTBEAT_MS` | `30000` | Heartbeat interval in ms |
| `SC_INFERENCE_TIMEOUT` | `300000` | Max inference time in ms |
| `SC_MAX_TOKENS` | `2048` | Max tokens per response |
| `SC_OLLAMA_BIN` | `ollama` | Path to Ollama binary |
| `SC_CANARY_CHECK_MS` | `60000` | Canary check interval |

## Architecture

```
┌─────────────────┐     WebSocket      ┌──────────────────┐
│  SuperCompute    │ ◄──────────────►  │  Worker           │
│  Orchestrator    │     socket.io      │  (this process)   │
│  (server)        │                    │                   │
│                  │                    │  ┌─────────────┐  │
│  ┌────────────┐  │    job:submit      │  │  Ollama      │  │
│  │ Job Queue   │──┼──────────────────►│  │  (native)    │  │
│  └────────────┘  │                    │  └─────────────┘  │
│         │         │    job:complete   │                   │
│         ▼         │◄──────────────────│  ┌─────────────┐  │
│  ┌────────────┐  │                    │  │  Browser     │  │
│  │ Billing     │  │    canary probe   │  │  (WebGPU)    │  │
│  │ & Anti-Cheat│──┼──────────────────►│  └─────────────┘  │
│  └────────────┘  │                    └──────────────────┘
└─────────────────┘
```

## Native Mode (Default)

Uses Ollama to run models locally. Each job spawns `ollama run <model>` with the prompt piped via stdin, parses the output, and sends results back.

## Browser Mode

Set `-t browser` to delegate inference to a WebGPU-capable browser. The worker process acts as a relay, forwarding jobs to a connected browser runtime via the orchestrator.

## Anti-Cheat

The orchestrator periodically sends **canary probes** — simple factual questions with known answers. The worker always runs these through the actual model and returns both the response and its hash. The orchestrator verifies that:
1. The response is coherent with the prompt
2. The response timing matches the worker's hardware profile
3. The worker didn't just send a canned/random answer

Workers that fail canary checks receive lower reliability scores and get fewer jobs.

