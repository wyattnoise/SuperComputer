# SuperCompute — Decentralized AI Inference Network

> **Compute by the people, for the people.**  
> SuperCompute is a decentralized network that connects GPU providers with AI inference consumers — no data centers, no gatekeeping, no censorship.

| | |
|---|---|
| 🌐 **Network** | Decentralized GPU compute for AI inference |
| ⚡ **Protocol** | Solana + WebSocket real-time streaming |
| 💰 **Incentive** | Earn USDC / token by sharing your GPU |
| 🔐 **Privacy** | Self-custodial wallet auth via Privy |
| 🧩 **Stack** | Next.js 16 · Python 3.10+ · Rust (Anchor) · WebGPU |

---

## ✨ Features

### 🖥️ For Users (AI Inference)
- **Private AI Chat** — Run LLMs, image gen, and audio models without account gates
- **Real‑time Streaming** — Server‑sent events & WebSocket for low‑latency inference
- **Censorship‑Resistant** — No prompt filters, no content moderation, no data logging
- **Pay‑per‑Use** — Pay in SOL, USDC, or token tokens with micro‑transactions

### ⛏️ For Miners (GPU Providers)
- **One‑Click Node** — Run a SuperCompute worker and start earning immediately
- **Auto‑Scaling** — Workers automatically accept tasks based on GPU capacity
- **Fault‑Tolerant** — Task rescheduling on node failure with exactly‑once semantics
- **Performance Dashboard** — Real‑time earnings, uptime, and utilization metrics

### 🏛️ Protocol Layer
- **Solana Smart Contracts** — On‑chain task escrow, staking, and reward distribution
- **token Token** — Governance, staking, and fee discount token with deflationary mechanics
- **Priority Queue** — Stake more token to skip the line during peak demand
- **Decentralized Treasury** — Community‑governed protocol fees and miner subsidies

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Web Application                       │
│  Next.js (React 19) · Tailwind CSS · Socket.IO Client   │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP / WSS
┌──────────────────────▼──────────────────────────────────┐
│                    API Server                            │
│  Node.js (Express) · Socket.IO · Better‑SQLite3          │
│  Privy Auth · Solana Web3.js                            │
├──────────────────────┬──────────────────────────────────┤
│     Python Backend   │        Rust Workers              │
│  FastAPI · Uvicorn   │  Anchor (Solana) · WebGPU        │
│  Task Scheduler      │  GPU Inference Engine           │
└──────────────────────┴──────────────────────────────────┘
```

### Directory Structure

```
supercompute/
├── app/                    # Next.js web application
│   ├── api/v1/             # REST API routes
│   ├── chat/               # AI chat interface
│   ├── earn/               # Miner dashboard
│   ├── staking/            # token staking UI
│   └── treasury/           # Protocol treasury
├── server/                 # Node.js API server
│   ├── index.ts            # HTTP + WebSocket server
│   └── load-env.ts         # Environment loader
├── supercompute/           # Python core library
│   ├── core/               # Task scheduler & node manager
│   ├── network/            # P2P networking & RPC
│   ├── queue/              # Priority task queue
│   ├── runtime/            # Cluster & worker management
│   ├── cli/                # Command‑line interface
│   ├── api/                # FastAPI REST endpoints
│   └── observability/      # Logging & metrics
├── worker/                 # GPU worker agent (TypeScript)
│   ├── src/                # Worker source code
│   └── dist/               # Compiled output
├── config/                 # Configuration files
├── deploy/                 # Systemd service files
├── scripts/                # Build & maintenance scripts
├── tests/                  # Python test suite
├── docs/                   # Documentation
└── history/                # Development changelog
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js ≥ 20.0.0 & npm
- Python ≥ 3.10 & pip
- Solana CLI (for on‑chain operations)

### Quick Start (Web App)

```bash
# Install dependencies
npm install

# Set up environment
cp .env.local.example .env.local
# Edit .env.local with your Privy App ID and Solana RPC URL

# Start development servers
npm run dev:all
# → Web app at http://localhost:3000
# → API server at http://localhost:3001
```

### Quick Start (Python CLI)

```bash
# Install the Python package
pip install -e .

# Run a compute node
supercompute node start --rpc-url https://api.mainnet-beta.solana.com

# List available tasks
supercompute task list

# Monitor cluster health
supercompute status
```

### Run a GPU Worker

```bash
# Build the worker
cd worker && npm install && npm run build

# Start mining
npm run start:worker
```

### Deploy with Docker

```bash
docker build -t supercompute .
docker run -d \
  --name supercompute-node \
  -p 3000:3000 \
  -p 3001:3001 \
  -v $(pwd)/data:/app/data \
  supercompute
```

---

## ⚙️ Configuration

All configuration is managed through `.env.local` (see [`.env.local.example`](.env.local.example)):

| Variable | Description | Default |
|---|---|---|
| `SC_DB_PATH` | SQLite database path | `./data/supercompute.db` |
| `SC_HTTP_PORT` | HTTP API server port | `3001` |
| `SC_WS_PORT` | WebSocket server port | `8080` |
| `SC_HOST` | Bind address | `0.0.0.0` |
| `SOLANA_RPC_URL` | Solana JSON‑RPC endpoint | `https://api.mainnet‑beta.solana.com` |
| `SOLANA_RPC_WS_URL` | Solana WebSocket endpoint | `wss://api.mainnet‑beta.solana.com` |
| `TOKEN_MINT` | token SPL token mint address | — |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy authentication App ID | — |
| `PRIVY_APP_SECRET` | Privy application secret | — |

---

## 🧪 Testing

```bash
# Python tests
pytest tests/ -v

# TypeScript tests
npm test

# End‑to‑end workflow
python examples/hello_world.py
```

---

## 📦 Deployment

### Systemd Services

```bash
# Install systemd services
sudo cp deploy/*.service /etc/systemd/system/
sudo cp deploy/*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now supercompute-keeper
```

### Production Build

```bash
npm run build
npm run start          # Web app
npm run start:server   # API + WebSocket
```

---

## 🪙 Tokenomics

| Metric | Value |
|---|---|
| **Token** | token (SPL) |
| **Total Supply** | 1,000,000,000 token |
| **Mining Reward** | 40% of supply emitted over 5 years |
| **Staking Yield** | ~15% APY (dynamic) |
| **Fee Discount** | 50% discount when paying with token |

---

## 🤝 Contributing

See [CONTRIBUTORS.md](CONTRIBUTORS.md) for guidelines.  
Join the conversation — issues, PRs, and protocol proposals are all welcome.

### Development Roadmap

| Phase | Milestone | Status |
|---|---|---|
| v0.1 | Core task scheduler + queue | ✅ Complete |
| v0.2 | P2P networking & RPC layer | ✅ Complete |
| v0.3 | Web app & API server | ✅ Complete |
| v0.4 | token token & staking | 🚧 In Progress |
| v0.5 | GPU worker agent | 🚧 In Progress |
| v1.0 | Mainnet launch | ⏳ Planned |

---

## 📄 License

MIT © SuperCompute Team — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <sub>Built with ❤️ by the SuperCompute community.</sub>
  <br>
  <sub>Decentralize the future of AI inference.</sub>
</p>
