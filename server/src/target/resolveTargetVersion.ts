import semver from 'semver';
import type { TargetVersion } from '@spfx-console/shared';

const REGISTRY_URL =
  'https://registry.npmjs.org/@microsoft/generator-sharepoint';
const CACHE_DURATION_MS = 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createTargetVersionResolver(
  configuredVersion: string,
  fetchImpl: typeof fetch = fetch,
): (forceRefresh?: boolean) => Promise<TargetVersion> {
  const explicitVersion =
    configuredVersion === 'latest' ? null : semver.valid(configuredVersion);
  if (configuredVersion !== 'latest' && explicitVersion === null) {
    throw new Error(
      `Invalid configured target SPFx version: ${configuredVersion}`,
    );
  }

  let cached: TargetVersion | null = null;
  let cachedAt = 0;
  let inFlight: Promise<TargetVersion> | null = null;

  return (forceRefresh = false): Promise<TargetVersion> => {
    if (explicitVersion !== null) {
      return Promise.resolve({
        version: explicitVersion,
        source: 'config',
        resolvedAt: new Date().toISOString(),
        stale: false,
      });
    }

    if (
      !forceRefresh &&
      cached !== null &&
      Date.now() - cachedAt < CACHE_DURATION_MS
    ) {
      return Promise.resolve(cached);
    }

    if (inFlight !== null) {
      return inFlight;
    }

    const request = (async (): Promise<TargetVersion> => {
      try {
        const response = await fetchImpl(REGISTRY_URL, {
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
          throw new Error(`npm registry returned HTTP ${response.status}`);
        }

        const body: unknown = await response.json();
        const distTags =
          isRecord(body) && isRecord(body['dist-tags'])
            ? body['dist-tags']
            : null;
        const version =
          distTags !== null && typeof distTags.latest === 'string'
            ? semver.valid(distTags.latest)
            : null;
        if (version === null) {
          throw new Error(
            'npm registry response did not contain a valid dist-tags.latest version',
          );
        }

        cached = {
          version,
          source: 'npm',
          resolvedAt: new Date().toISOString(),
          stale: false,
        };
        cachedAt = Date.now();
        return cached;
      } catch (error) {
        if (cached !== null) {
          cached = { ...cached, stale: true };
          return cached;
        }
        throw new Error(
          `Unable to resolve latest SPFx version from npm registry: ${errorMessage(error)}`,
          { cause: error },
        );
      }
    })();

    inFlight = request;
    const clearInFlight = () => {
      if (inFlight === request) {
        inFlight = null;
      }
    };
    void request.then(clearInFlight, clearInFlight);
    return request;
  };
}
