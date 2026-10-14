import 'dotenv/config';

process.env.AGENT_MODE = 'ollama';
process.env.PORT = process.env.OLLAMA_APP_PORT || '4318';
process.env.DATA_DIR = process.env.OLLAMA_DATA_DIR || '.data/ollama-demo';
process.env.MAIL_MODE = 'capture';

await import('./index.js');
