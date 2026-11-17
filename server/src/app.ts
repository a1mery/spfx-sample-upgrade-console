import Fastify from 'fastify';
import type { HealthResponse } from '@spfx-console/shared';

export function buildApp(options: { logger?: false } = {}) {
  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            level: process.env.LOG_LEVEL ?? 'info',
            redact: ['req.headers.authorization'],
          },
  });

  app.get<{ Reply: HealthResponse }>('/api/health', async () => ({
    status: 'ok',
  }));

  return app;
}
