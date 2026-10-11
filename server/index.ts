import { startServer } from './app.js';
import { readConfig, createMail } from './config.js';

const config = readConfig();
const running = await startServer(config, createMail());
console.log(`MobilityRelay: ${running.url}\nMCP: ${running.url}/mcp\nAgent: ${config.agentMode}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void running.close().then(() => process.exit(0)); });
