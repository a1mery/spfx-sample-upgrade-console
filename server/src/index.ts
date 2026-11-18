import { config as loadDotEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { loadConfig } from './config/loadConfig.js';
import { loadSkipList } from './config/loadSkipList.js';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
loadDotEnv({
  path: fileURLToPath(new URL('../../.env', import.meta.url)),
  quiet: true,
});
const port = Number(process.env.PORT ?? 3001);

try {
  const config = await loadConfig(process.env, repoRoot);
  const skipList = await loadSkipList(config.skipList);
  const app = buildApp({ config, skipList });
  await app.listen({ host: '127.0.0.1', port });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to start server on 127.0.0.1:${port}: ${message}`);
  process.exitCode = 1;
}
