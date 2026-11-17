import 'dotenv/config';
import { buildApp } from './app.js';

const port = Number(process.env.PORT ?? 3001);
const app = buildApp();

try {
  await app.listen({ host: '127.0.0.1', port });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to start server on 127.0.0.1:${port}: ${message}`);
  process.exitCode = 1;
}
