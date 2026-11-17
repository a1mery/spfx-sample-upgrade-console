import Fastify from 'fastify';
import type { HealthResponse } from '@spfx-console/shared';

export function buildApp() {
  const app = Fastify();

  app.get<{ Reply: HealthResponse }>('/api/health', async () => ({
    status: 'ok',
  }));

  return app;
}
