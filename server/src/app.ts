import Fastify from 'fastify';
import type {
  HealthResponse,
  SampleInfo,
  SamplesResponse,
} from '@spfx-console/shared';
import { join } from 'node:path';
import { discoverSamples } from './samples/discoverSamples.js';
import type { SkipListEntry } from './config/loadSkipList.js';
import type { ServerConfig } from './config/loadConfig.js';

type BuildAppOptions = {
  config: ServerConfig;
  skipList: SkipListEntry[];
  logger?: false;
  discover?: (samplesRoot: string) => Promise<SampleInfo[]>;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function buildApp(options: BuildAppOptions) {
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

  const discover = options.discover ?? discoverSamples;
  const samplesRoot = join(options.config.forkLocalPath, 'samples');
  const skipEntries = new Map(
    options.skipList.map((entry) => [entry.folder, entry.reason]),
  );
  let cachedResponse: SamplesResponse | null = null;
  let inFlightScan: Promise<SamplesResponse> | null = null;

  function refreshSamples(): Promise<SamplesResponse> {
    if (inFlightScan) {
      return inFlightScan;
    }

    const scan = (async () => {
      const discovered = await discover(samplesRoot);
      const discoveredFolders = new Set(discovered.map(({ folder }) => folder));
      for (const folder of skipEntries.keys()) {
        if (!discoveredFolders.has(folder)) {
          app.log.warn(
            { folder },
            'Skip-list folder does not exist in samples/',
          );
        }
      }

      const samples = discovered.map((sample) => {
        const skipReason = skipEntries.get(sample.folder) ?? null;
        return {
          ...sample,
          skipped: skipReason !== null,
          skipReason,
        };
      });
      const response: SamplesResponse = {
        samples,
        scannedAt: new Date().toISOString(),
        total: samples.length,
      };
      cachedResponse = response;
      return response;
    })();

    inFlightScan = scan;
    void scan.then(
      () => {
        if (inFlightScan === scan) {
          inFlightScan = null;
        }
      },
      () => {
        if (inFlightScan === scan) {
          inFlightScan = null;
        }
      },
    );
    return scan;
  }

  app.get<{ Reply: SamplesResponse | { error: string } }>(
    '/api/samples',
    async (_request, reply) => {
      try {
        return cachedResponse ?? (await refreshSamples());
      } catch (error) {
        return reply.code(500).send({ error: errorMessage(error) });
      }
    },
  );

  app.post<{ Reply: SamplesResponse | { error: string } }>(
    '/api/samples/refresh',
    async (_request, reply) => {
      try {
        return await refreshSamples();
      } catch (error) {
        return reply.code(500).send({ error: errorMessage(error) });
      }
    },
  );

  return app;
}
