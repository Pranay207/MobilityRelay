import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { localModelEndpoint, localModelName } from './ollama.js';
export { createMail } from './mail.js';

export interface Config { host: string; port: number; dataDir: string; password: string; mcpToken: string; publicOrigin: string; production: boolean; seed: boolean; agentMode: 'local' | 'bedrock' | 'ollama'; modelId: string; region: string; ollamaBaseUrl: string; ollamaModel: string }
export function readConfig(): Config {
  const mode = process.env.AGENT_MODE || 'local';
  if (!['local', 'bedrock', 'ollama'].includes(mode)) throw new Error('AGENT_MODE must be local, bedrock, or ollama.');
  const config: Config = { host: process.env.HOST || '127.0.0.1', port: Number(process.env.PORT || 4317), dataDir: resolve(process.env.DATA_DIR || '.data'), password: process.env.APP_PASSWORD || '', mcpToken: process.env.MCP_TOKEN || randomBytes(32).toString('hex'), publicOrigin: process.env.PUBLIC_ORIGIN || '', production: process.env.NODE_ENV === 'production', seed: process.env.SEED_EXAMPLES !== 'false', agentMode: mode as Config['agentMode'], modelId: process.env.BEDROCK_MODEL_ID || '', region: process.env.AWS_REGION || 'us-east-1', ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434', ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5:1.5b' };
  if (!Number.isInteger(config.port) || config.port < 0 || config.port > 65535) throw new Error('PORT must be a valid port.');
  if (config.publicOrigin) {
    try {
      const origin = new URL(config.publicOrigin);
      if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Invalid origin.');
      config.publicOrigin = origin.origin;
    } catch { throw new Error('PUBLIC_ORIGIN must be an HTTPS origin without credentials, a path, query, or fragment.'); }
  }
  const publicStorage = ['dist', 'public', 'node_modules'].some(directory => {
    const child = relative(resolve(directory), config.dataDir);
    return !child || (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`));
  });
  if (!relative(process.cwd(), config.dataDir) || publicStorage) throw new Error('DATA_DIR must be a private directory outside the app root, dist, public and node_modules.');
  const external = !['127.0.0.1', 'localhost', '::1'].includes(config.host);
  if ((config.production || external) && (config.password.length < 16 || !process.env.MCP_TOKEN || config.mcpToken.length < 32 || !config.publicOrigin.startsWith('https://'))) throw new Error('Public/production mode requires APP_PASSWORD (16+ characters), MCP_TOKEN (32+ characters) and an HTTPS PUBLIC_ORIGIN.');
  if (config.agentMode === 'bedrock' && !config.modelId) throw new Error('Set BEDROCK_MODEL_ID for Bedrock mode.');
  if (config.agentMode === 'ollama') { localModelEndpoint(config.ollamaBaseUrl); localModelName(config.ollamaModel); }
  return config;
}
