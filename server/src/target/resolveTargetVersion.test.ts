import { describe, expect, it, vi } from 'vitest';
import { createTargetVersionResolver } from './resolveTargetVersion.js';

const registryUrl =
  'https://registry.npmjs.org/@microsoft/generator-sharepoint';

function registryResponse(version: string): Response {
  return new Response(JSON.stringify({ 'dist-tags': { latest: version } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createTargetVersionResolver', () => {
  it('uses an explicit version without fetching', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const resolve = createTargetVersionResolver('v1.22.1', fetchImpl);

    await expect(resolve()).resolves.toMatchObject({
      version: '1.22.1',
      source: 'config',
      stale: false,
      resolvedAt: expect.any(String),
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('resolves latest from the npm dist-tag', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(registryResponse('1.23.4'));
    const resolve = createTargetVersionResolver('latest', fetchImpl);

    await expect(resolve()).resolves.toMatchObject({
      version: '1.23.4',
      source: 'npm',
      stale: false,
      resolvedAt: expect.any(String),
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      registryUrl,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('caches the npm result until forced to refresh', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(registryResponse('1.23.4'))
      .mockResolvedValueOnce(registryResponse('1.24.0'));
    const resolve = createTargetVersionResolver('latest', fetchImpl);

    await resolve();
    await resolve();
    const refreshed = await resolve(true);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(refreshed.version).toBe('1.24.0');
  });

  it('shares one in-flight npm lookup between concurrent callers', async () => {
    let finishRequest: ((response: Response) => void) | undefined;
    const fetchImpl = vi.fn<typeof fetch>(
      () =>
        new Promise((resolve) => {
          finishRequest = resolve;
        }),
    );
    const resolve = createTargetVersionResolver('latest', fetchImpl);

    const first = resolve();
    const second = resolve(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    finishRequest?.(registryResponse('1.23.4'));
    await expect(Promise.all([first, second])).resolves.toMatchObject([
      { version: '1.23.4' },
      { version: '1.23.4' },
    ]);
  });

  it('returns a stale cached value when refreshing fails', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(registryResponse('1.23.4'))
      .mockRejectedValueOnce(new Error('network unavailable'));
    const resolve = createTargetVersionResolver('latest', fetchImpl);

    await resolve();
    await expect(resolve(true)).resolves.toMatchObject({
      version: '1.23.4',
      source: 'npm',
      stale: true,
    });
    await expect(resolve()).resolves.toMatchObject({ stale: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('rejects an invalid registry latest version', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(registryResponse('not-a-version'));
    const resolve = createTargetVersionResolver('latest', fetchImpl);

    await expect(resolve()).rejects.toThrow(
      'npm registry response did not contain a valid dist-tags.latest version',
    );
  });

  it('throws a clear error when no cached value exists', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('network unavailable'));
    const resolve = createTargetVersionResolver('latest', fetchImpl);

    await expect(resolve()).rejects.toThrow(
      'Unable to resolve latest SPFx version from npm registry: network unavailable',
    );
  });
});
