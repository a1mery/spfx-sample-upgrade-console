import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import type { ServerConfig } from './config/loadConfig.js';

const config: ServerConfig = {
  forkLocalPath: '/tmp/fork',
  forkOwner: 'owner',
  forkRepo: 'repo',
  baseBranch: 'main',
  targetSpfxVersion: 'latest',
  skipList: 'config/skip-list.json',
};

describe('GET /api/health', () => {
  it('returns an ok status', async () => {
    const app = buildApp({ config, skipList: [], logger: false });

    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    await app.close();
  });
});

describe('samples API', () => {
  const fixturesPath = fileURLToPath(
    new URL('../test/fixtures/', import.meta.url),
  );

  it('returns every fixture sample and applies skip-list metadata', async () => {
    const app = buildApp({
      config: { ...config, forkLocalPath: fixturesPath },
      skipList: [
        {
          folder: 'react-gulp-old',
          reason: 'Calls a third-party API',
        },
      ],
      logger: false,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/samples',
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.total).toBeGreaterThan(0);
    expect(body.samples).toHaveLength(body.total);
    expect(
      body.samples.find(
        (sample: { folder: string }) => sample.folder === 'react-gulp-old',
      ),
    ).toMatchObject({
      skipped: true,
      skipReason: 'Calls a third-party API',
    });
    expect(body.scannedAt).toEqual(expect.any(String));
    await app.close();
  });

  it('refreshes the cache and shares concurrent scans', async () => {
    let scanCount = 0;
    const app = buildApp({
      config,
      skipList: [],
      logger: false,
      discover: async () => {
        scanCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return [];
      },
    });

    const initial = await app.inject({ method: 'GET', url: '/api/samples' });
    const initialScannedAt = initial.json().scannedAt;
    const [first, second] = await Promise.all([
      app.inject({ method: 'POST', url: '/api/samples/refresh' }),
      app.inject({ method: 'POST', url: '/api/samples/refresh' }),
    ]);

    expect(scanCount).toBe(2);
    expect(first.statusCode).toBe(200);
    expect(first.json().scannedAt).not.toBe(initialScannedAt);
    expect(second.json()).toEqual(first.json());
    await app.close();
  });

  it('returns a scan error without discarding the previous cache', async () => {
    let shouldFail = false;
    const app = buildApp({
      config,
      skipList: [],
      logger: false,
      discover: async () => {
        if (shouldFail) {
          throw new Error('sample scan failed');
        }
        return [];
      },
    });

    const initial = await app.inject({ method: 'GET', url: '/api/samples' });
    shouldFail = true;
    const failedRefresh = await app.inject({
      method: 'POST',
      url: '/api/samples/refresh',
    });
    const cached = await app.inject({ method: 'GET', url: '/api/samples' });

    expect(failedRefresh.statusCode).toBe(500);
    expect(failedRefresh.json()).toEqual({ error: 'sample scan failed' });
    expect(cached.json()).toEqual(initial.json());
    await app.close();
  });
});
