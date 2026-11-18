import Fastify from 'fastify';
import type {
  HealthResponse,
  SampleInfo,
  SampleRow,
  TargetVersion,
  SamplesResponse,
} from '@spfx-console/shared';
import semver from 'semver';
import { join } from 'node:path';
import { discoverSamples } from './samples/discoverSamples.js';
import type { SkipListEntry } from './config/loadSkipList.js';
import type { ServerConfig } from './config/loadConfig.js';
import { createTargetVersionResolver } from './target/resolveTargetVersion.js';

type BuildAppOptions = {
  config: ServerConfig;
  skipList: SkipListEntry[];
  logger?: false;
  discover?: (samplesRoot: string) => Promise<SampleInfo[]>;
  fetch?: typeof fetch;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type CachedSamples = {
  samples: Omit<SampleRow, 'needsUpgrade'>[];
  scannedAt: string;
  total: number;
};

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
  const resolveTargetVersion = createTargetVersionResolver(
    options.config.targetSpfxVersion,
    options.fetch,
  );
  const samplesRoot = join(options.config.forkLocalPath, 'samples');
  const skipEntries = new Map(
    options.skipList.map((entry) => [entry.folder, entry.reason]),
  );
  let cachedScan: CachedSamples | null = null;
  let inFlightScan: Promise<CachedSamples> | null = null;

  function scanSamples(forceScan: boolean): Promise<CachedSamples> {
    if (!forceScan && cachedScan !== null) {
      return Promise.resolve(cachedScan);
    }
    if (inFlightScan !== null) {
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
      const result: CachedSamples = {
        samples,
        scannedAt: new Date().toISOString(),
        total: samples.length,
      };
      cachedScan = result;
      return result;
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

  async function getSamples(refresh: boolean): Promise<SamplesResponse> {
    const [scan, target] = await Promise.all([
      scanSamples(refresh),
      resolveTargetVersion(refresh).catch((error: unknown) => {
        app.log.warn(
          { error: errorMessage(error) },
          'Unable to resolve target SPFx version',
        );
        return null;
      }),
    ]);

    return {
      samples: scan.samples.map((sample) => {
        const sampleVersion =
          sample.spfxVersion === null ? null : semver.valid(sample.spfxVersion);
        return {
          ...sample,
          needsUpgrade:
            sampleVersion === null || target === null
              ? null
              : semver.lt(sampleVersion, target.version),
        };
      }),
      scannedAt: scan.scannedAt,
      total: scan.total,
      target,
    };
  }

  app.get<{ Reply: SamplesResponse | { error: string } }>(
    '/api/samples',
    async (_request, reply) => {
      try {
        return await getSamples(false);
      } catch (error) {
        return reply.code(500).send({ error: errorMessage(error) });
      }
    },
  );

  app.get<{ Reply: TargetVersion | { error: string } }>(
    '/api/target-version',
    async (_request, reply) => {
      try {
        return await resolveTargetVersion();
      } catch (error) {
        return reply.code(502).send({ error: errorMessage(error) });
      }
    },
  );

  app.post<{ Reply: SamplesResponse | { error: string } }>(
    '/api/samples/refresh',
    async (_request, reply) => {
      try {
        return await getSamples(true);
      } catch (error) {
        return reply.code(500).send({ error: errorMessage(error) });
      }
    },
  );

  return app;
}
