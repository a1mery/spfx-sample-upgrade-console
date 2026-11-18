import { describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import type { SampleInfo } from '@spfx-console/shared';
import { buildApp } from './app.js';
import type { ServerConfig } from './config/loadConfig.js';

const config: ServerConfig = {
  forkLocalPath: '/tmp/fork',
  forkOwner: 'owner',
  forkRepo: 'repo',
  baseBranch: 'main',
  targetSpfxVersion: '1.22.1',
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
    expect(cached.json()).toMatchObject({
      samples: initial.json().samples,
      scannedAt: initial.json().scannedAt,
      total: initial.json().total,
      target: { version: initial.json().target.version },
    });
    await app.close();
  });

  it('returns the target version and flags samples relative to it', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ 'dist-tags': { latest: '1.23.0' } }), {
        status: 200,
      }),
    );
    const sample = (
      folder: string,
      spfxVersion: string | null,
    ): SampleInfo => ({
      folder,
      title: null,
      spfxVersion,
      versionSource: spfxVersion === null ? null : 'package.json',
      toolchain: 'gulp',
      usesGraph: false,
      error: null,
    });
    const app = buildApp({
      config: { ...config, targetSpfxVersion: 'latest' },
      skipList: [],
      logger: false,
      fetch,
      discover: async () => [
        sample('older', '1.22.0'),
        sample('equal', '1.23.0'),
        sample('newer', '1.24.0'),
        sample('unknown', null),
      ],
    });

    const target = await app.inject({
      method: 'GET',
      url: '/api/target-version',
    });
    const samples = await app.inject({ method: 'GET', url: '/api/samples' });

    expect(target.statusCode).toBe(200);
    expect(target.json()).toMatchObject({
      version: '1.23.0',
      source: 'npm',
      stale: false,
    });
    expect(
      samples
        .json()
        .samples.map(
          (row: { folder: string; needsUpgrade: boolean | null }) => [
            row.folder,
            row.needsUpgrade,
          ],
        ),
    ).toEqual([
      ['older', true],
      ['equal', false],
      ['newer', false],
      ['unknown', null],
    ]);
    expect(samples.json().target).toMatchObject({
      version: '1.23.0',
      source: 'npm',
      stale: false,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('returns samples with null upgrade flags when the target cannot be resolved', async () => {
    const app = buildApp({
      config: { ...config, targetSpfxVersion: 'latest' },
      skipList: [],
      logger: false,
      fetch: vi
        .fn<typeof globalThis.fetch>()
        .mockRejectedValue(new Error('network unavailable')),
      discover: async () => [
        {
          folder: 'sample',
          title: null,
          spfxVersion: '1.22.0',
          versionSource: 'package.json',
          toolchain: 'gulp',
          usesGraph: false,
          error: null,
        },
      ],
    });

    const target = await app.inject({
      method: 'GET',
      url: '/api/target-version',
    });
    const samples = await app.inject({ method: 'GET', url: '/api/samples' });

    expect(target.statusCode).toBe(502);
    expect(target.json().error).toContain(
      'Unable to resolve latest SPFx version',
    );
    expect(samples.statusCode).toBe(200);
    expect(samples.json().target).toBeNull();
    expect(samples.json().samples[0].needsUpgrade).toBeNull();
    await app.close();
  });

  it('retries a failed target lookup on the next samples request without rescanning', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ 'dist-tags': { latest: '1.23.0' } }), {
          status: 200,
        }),
      );
    let scanCount = 0;
    const app = buildApp({
      config: { ...config, targetSpfxVersion: 'latest' },
      skipList: [],
      logger: false,
      fetch,
      discover: async () => {
        scanCount += 1;
        return [
          {
            folder: 'older',
            title: null,
            spfxVersion: '1.22.0',
            versionSource: 'package.json',
            toolchain: 'gulp',
            usesGraph: false,
            error: null,
          },
        ];
      },
    });

    const first = await app.inject({ method: 'GET', url: '/api/samples' });
    const second = await app.inject({ method: 'GET', url: '/api/samples' });

    expect(first.json().target).toBeNull();
    expect(first.json().samples[0].needsUpgrade).toBeNull();
    expect(second.json().target).toMatchObject({ version: '1.23.0' });
    expect(second.json().samples[0].needsUpgrade).toBe(true);
    expect(scanCount).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    await app.close();
  });

  it('forces a target-version refresh when refreshing samples', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ 'dist-tags': { latest: '1.23.0' } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ 'dist-tags': { latest: '1.24.0' } }), {
          status: 200,
        }),
      );
    const app = buildApp({
      config: { ...config, targetSpfxVersion: 'latest' },
      skipList: [],
      logger: false,
      fetch,
      discover: async () => [
        {
          folder: 'sample',
          title: null,
          spfxVersion: '1.23.0',
          versionSource: 'package.json',
          toolchain: 'gulp',
          usesGraph: false,
          error: null,
        },
      ],
    });

    const initial = await app.inject({ method: 'GET', url: '/api/samples' });
    const refreshed = await app.inject({
      method: 'POST',
      url: '/api/samples/refresh',
    });

    expect(initial.json().samples[0].needsUpgrade).toBe(false);
    expect(refreshed.json().samples[0].needsUpgrade).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    await app.close();
  });
});
