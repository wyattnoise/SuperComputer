// SuperCompute Server Entry Point — Starts the orchestrator WebSocket alongside Next.js
// Run with: tsx server/index.ts (or npm run dev:all for concurrent mode)

import { startOrchestrator } from '../lib/orchestrator';
import { loadEnv } from './load-env';

// Load environment before anything else
loadEnv();

const PORT = Number(process.env.SC_WS_PORT || 3002);
const NODE_ENV = process.env.NODE_ENV || 'development';

console.log(`
╔══════════════════════════════════════════╗
║     SuperCompute Orchestrator v1.0      ║
║     Decentralized AI Inference Network   ║
╚══════════════════════════════════════════╝
  Environment: ${NODE_ENV}
  WebSocket : :${PORT}
  Started at: ${new Date().toISOString()}
`);

startOrchestrator(PORT);



