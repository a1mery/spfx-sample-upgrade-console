import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import semver from 'semver';
import type {
  SampleInfo,
  Toolchain,
  VersionSource,
} from '@spfx-console/shared';

const MAX_CONCURRENT_SAMPLES = 16;

type JsonResult = {
  value: unknown | null;
  error: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getDependencies(packageJson: unknown): Record<string, unknown> {
  if (!isRecord(packageJson)) {
    return {};
  }

  const dependencies = isRecord(packageJson.dependencies)
    ? packageJson.dependencies
    : {};
  const devDependencies = isRecord(packageJson.devDependencies)
    ? packageJson.devDependencies
    : {};
  return { ...dependencies, ...devDependencies };
}

async function readJson(
  filePath: string,
  fileName: string,
): Promise<JsonResult> {
  try {
    const contents = await readFile(filePath, 'utf8');
    try {
      return { value: JSON.parse(contents) as unknown, error: null };
    } catch (error) {
      return { value: null, error: `${fileName}: ${errorMessage(error)}` };
    }
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') {
      return { value: null, error: null };
    }
    return { value: null, error: `${fileName}: ${errorMessage(error)}` };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeVersion(version: unknown): string | null {
  if (typeof version !== 'string') {
    return null;
  }

  return semver.minVersion(version)?.version ?? null;
}

function getPackageVersion(packageJson: unknown): string | null {
  const dependencies = getDependencies(packageJson);
  return normalizeVersion(dependencies['@microsoft/sp-core-library']);
}

function getYoVersion(yoRc: unknown): string | null {
  if (!isRecord(yoRc) || !isRecord(yoRc['@microsoft/generator-sharepoint'])) {
    return null;
  }

  return normalizeVersion(yoRc['@microsoft/generator-sharepoint'].version);
}

function getTitle(sampleJson: unknown): string | null {
  if (!Array.isArray(sampleJson) || !isRecord(sampleJson[0])) {
    return null;
  }

  return typeof sampleJson[0].title === 'string' ? sampleJson[0].title : null;
}

function usesGraph(packageJson: unknown, solution: unknown): boolean {
  const dependencies = getDependencies(packageJson);
  const hasGraphDependency =
    '@microsoft/microsoft-graph-client' in dependencies ||
    '@pnp/graph' in dependencies;
  const permissionRequests =
    isRecord(solution) &&
    isRecord(solution.solution) &&
    Array.isArray(solution.solution.webApiPermissionRequests)
      ? solution.solution.webApiPermissionRequests
      : [];
  return (
    hasGraphDependency ||
    permissionRequests.some(
      (request) => isRecord(request) && request.resource === 'Microsoft Graph',
    )
  );
}

async function hasGulpfile(samplePath: string): Promise<boolean> {
  try {
    await access(join(samplePath, 'gulpfile.js'));
    return true;
  } catch {
    return false;
  }
}

async function scanSample(
  samplesRoot: string,
  folder: string,
): Promise<SampleInfo> {
  try {
    const samplePath = join(samplesRoot, folder);
    const [
      packageResult,
      yoResult,
      sampleResult,
      solutionResult,
      gulpfileExists,
    ] = await Promise.all([
      readJson(join(samplePath, 'package.json'), 'package.json'),
      readJson(join(samplePath, '.yo-rc.json'), '.yo-rc.json'),
      readJson(join(samplePath, 'assets', 'sample.json'), 'assets/sample.json'),
      readJson(
        join(samplePath, 'config', 'package-solution.json'),
        'config/package-solution.json',
      ),
      hasGulpfile(samplePath),
    ]);

    const packageVersion = getPackageVersion(packageResult.value);
    const yoVersion = getYoVersion(yoResult.value);
    const spfxVersion = packageVersion ?? yoVersion;
    const versionSource: VersionSource = packageVersion
      ? 'package.json'
      : yoVersion
        ? '.yo-rc.json'
        : null;
    const dependencies = getDependencies(packageResult.value);
    const dependencyNames = Object.keys(dependencies);
    const toolchain: Toolchain = dependencyNames.some((name) =>
      name.startsWith('@rushstack/heft'),
    )
      ? 'heft'
      : gulpfileExists || 'gulp' in dependencies
        ? 'gulp'
        : 'unknown';
    const errors = [packageResult.error, yoResult.error].filter(
      (error): error is string => error !== null,
    );

    return {
      folder,
      title: getTitle(sampleResult.value),
      spfxVersion,
      versionSource,
      toolchain,
      usesGraph: usesGraph(packageResult.value, solutionResult.value),
      error: errors.length > 0 ? errors.join('; ') : null,
    };
  } catch (error) {
    return {
      folder,
      title: null,
      spfxVersion: null,
      versionSource: null,
      toolchain: 'unknown',
      usesGraph: false,
      error: errorMessage(error),
    };
  }
}

async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++;
        const item = items[index];
        if (item !== undefined) {
          results[index] = await mapper(item);
        }
      }
    }),
  );
  return results;
}

export async function discoverSamples(
  samplesRoot: string,
): Promise<SampleInfo[]> {
  let entries;
  try {
    entries = await readdir(samplesRoot, { withFileTypes: true });
  } catch (error) {
    throw new Error(
      `Unable to read samples root "${samplesRoot}": ${errorMessage(error)}`,
      {
        cause: error,
      },
    );
  }

  const folders = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  return mapConcurrent(folders, MAX_CONCURRENT_SAMPLES, (folder) =>
    scanSample(samplesRoot, folder),
  );
}
