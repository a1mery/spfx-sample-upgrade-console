import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import semver from 'semver';
import { z } from 'zod';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const configSchema = z.object({
  forkLocalPath: z.string().trim().min(1, 'must be a non-empty path'),
  forkOwner: z.string().trim().min(1, 'must not be empty'),
  forkRepo: z.string().trim().min(1, 'must not be empty'),
  baseBranch: z.string().trim().min(1, 'must not be empty').default('main'),
  targetSpfxVersion: z
    .string()
    .trim()
    .refine(
      (version) => version === 'latest' || semver.valid(version) !== null,
      'must be "latest" or a valid semver version',
    )
    .transform((version) =>
      version === 'latest' ? version : (semver.valid(version) ?? version),
    ),
  customAgent: z.string().trim().min(1, 'must not be empty').optional(),
  skipList: z
    .string()
    .trim()
    .min(1, 'must be a non-empty path')
    .default('config/skip-list.json'),
});

export type ServerConfig = z.infer<typeof configSchema>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

export async function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  repoRoot = REPO_ROOT,
): Promise<ServerConfig> {
  const configPath = resolve(repoRoot, env.CONFIG_PATH ?? 'config.json');
  let contents: string;
  try {
    contents = await readFile(configPath, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) {
      throw new Error(
        `Config file "${configPath}" was not found. Copy config.example.json to config.json and update its values.`,
        { cause: error },
      );
    }
    throw new Error(
      `Unable to read config file "${configPath}": ${errorMessage(error)}`,
      { cause: error },
    );
  }

  let rawConfig: unknown;
  try {
    rawConfig = JSON.parse(contents) as unknown;
  } catch (error) {
    throw new Error(`Config file "${configPath}" contains invalid JSON.`, {
      cause: error,
    });
  }

  const result = configSchema.safeParse(rawConfig);
  const problems = result.success
    ? []
    : result.error.issues.map((issue) => {
        const field = issue.path.length > 0 ? issue.path.join('.') : 'config';
        return `${field}: ${issue.message}`;
      });

  let forkLocalPath: string | null = null;
  const rawForkPath =
    typeof rawConfig === 'object' &&
    rawConfig !== null &&
    'forkLocalPath' in rawConfig
      ? rawConfig.forkLocalPath
      : null;
  const configuredForkPath = result.success
    ? result.data.forkLocalPath
    : rawForkPath;
  if (
    typeof configuredForkPath === 'string' &&
    configuredForkPath.trim() !== ''
  ) {
    forkLocalPath = resolve(repoRoot, configuredForkPath);
    try {
      const forkStats = await stat(forkLocalPath);
      if (!forkStats.isDirectory()) {
        problems.push('forkLocalPath: must point to a directory');
      } else {
        const samplesPath = resolve(forkLocalPath, 'samples');
        try {
          const samplesStats = await stat(samplesPath);
          if (!samplesStats.isDirectory()) {
            problems.push('forkLocalPath: must contain a samples/ directory');
          }
        } catch {
          problems.push(
            'forkLocalPath: must contain an existing samples/ directory',
          );
        }
      }
    } catch {
      problems.push(
        'forkLocalPath: directory does not exist or cannot be accessed',
      );
    }
  }

  if (!result.success || problems.length > 0) {
    throw new Error(
      `Invalid config:\n${problems.map((problem) => `- ${problem}`).join('\n')}`,
    );
  }

  return {
    ...result.data,
    forkLocalPath: forkLocalPath ?? result.data.forkLocalPath,
  };
}
