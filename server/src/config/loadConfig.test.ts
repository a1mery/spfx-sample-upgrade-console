import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from './loadConfig.js';

const temporaryDirectories: string[] = [];

async function createRepo(): Promise<string> {
  const repoRoot = await mkdtemp(join(tmpdir(), 'spfx-config-'));
  temporaryDirectories.push(repoRoot);
  await mkdir(join(repoRoot, 'fork', 'samples'), { recursive: true });
  return repoRoot;
}

async function writeConfig(repoRoot: string, value: unknown): Promise<void> {
  await writeFile(join(repoRoot, 'config.json'), JSON.stringify(value));
}

function validConfig(forkLocalPath = 'fork') {
  return {
    forkLocalPath,
    forkOwner: 'owner',
    forkRepo: 'repo',
    targetSpfxVersion: 'latest',
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('loadConfig', () => {
  it('loads required values and applies defaults', async () => {
    const repoRoot = await createRepo();
    await writeConfig(repoRoot, validConfig());

    const config = await loadConfig({}, repoRoot);

    expect(config).toMatchObject({
      forkLocalPath: join(repoRoot, 'fork'),
      baseBranch: 'main',
      skipList: 'config/skip-list.json',
      targetSpfxVersion: 'latest',
    });
  });

  it('accepts a valid semver version', async () => {
    const repoRoot = await createRepo();
    await writeConfig(repoRoot, {
      ...validConfig(),
      targetSpfxVersion: '1.22.1',
    });

    await expect(loadConfig({}, repoRoot)).resolves.toMatchObject({
      targetSpfxVersion: '1.22.1',
    });
  });

  it('normalizes an explicit semver version', async () => {
    const repoRoot = await createRepo();
    await writeConfig(repoRoot, {
      ...validConfig(),
      targetSpfxVersion: 'v1.22.1',
    });

    await expect(loadConfig({}, repoRoot)).resolves.toMatchObject({
      targetSpfxVersion: '1.22.1',
    });
  });

  it('uses the trimmed fork path when validating it', async () => {
    const repoRoot = await createRepo();
    await writeConfig(repoRoot, validConfig(' fork '));

    await expect(loadConfig({}, repoRoot)).resolves.toMatchObject({
      forkLocalPath: join(repoRoot, 'fork'),
    });
  });

  it.each([
    ['forkLocalPath', { forkLocalPath: '' }, 'forkLocalPath:'],
    [
      'forkLocalPath samples directory',
      { forkLocalPath: 'missing' },
      'forkLocalPath:',
    ],
    ['forkOwner', { forkOwner: '' }, 'forkOwner:'],
    ['forkRepo', { forkRepo: '' }, 'forkRepo:'],
    ['baseBranch', { baseBranch: '' }, 'baseBranch:'],
    ['targetSpfxVersion', { targetSpfxVersion: '1.x' }, 'targetSpfxVersion:'],
    ['customAgent', { customAgent: '' }, 'customAgent:'],
    ['skipList', { skipList: '' }, 'skipList:'],
  ])(
    'reports an actionable error for invalid %s',
    async (_field, override, message) => {
      const repoRoot = await createRepo();
      await writeConfig(repoRoot, { ...validConfig(), ...override });

      await expect(loadConfig({}, repoRoot)).rejects.toThrow(message);
    },
  );

  it('uses CONFIG_PATH relative to the repository root', async () => {
    const repoRoot = await createRepo();
    await writeFile(
      join(repoRoot, 'custom-config.json'),
      JSON.stringify(validConfig()),
    );

    await expect(
      loadConfig({ CONFIG_PATH: 'custom-config.json' }, repoRoot),
    ).resolves.toMatchObject({ forkOwner: 'owner' });
  });

  it('fails clearly when config.json is missing', async () => {
    const repoRoot = await createRepo();

    await expect(loadConfig({}, repoRoot)).rejects.toThrow(
      'Copy config.example.json to config.json',
    );
  });

  it('lists all invalid config fields without exposing unknown token values', async () => {
    const repoRoot = await createRepo();
    await writeConfig(repoRoot, {
      ...validConfig(),
      forkOwner: '',
      forkRepo: '',
      targetSpfxVersion: '1.x',
      GITHUB_TOKEN: 'must-not-be-shown',
    });

    let message = '';
    try {
      await loadConfig({}, repoRoot);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('forkOwner:');
    expect(message).toContain('forkRepo:');
    expect(message).toContain('targetSpfxVersion:');
    expect(message).not.toContain('must-not-be-shown');
  });
});
