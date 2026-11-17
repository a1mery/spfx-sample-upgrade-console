import 'dotenv/config';
import { buildApp } from './app.js';

const port = Number(process.env.PORT ?? 3001);
const app = buildApp();

try {
  await app.listen({ host: '127.0.0.1', port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
