import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSkipList } from './loadSkipList.js';

const temporaryDirectories: string[] = [];

async function createDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'spfx-skip-list-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('loadSkipList', () => {
  it('returns an empty list and warns when the file is missing', async () => {
    const repoRoot = await createDirectory();
    const warn = vi.fn();

    await expect(
      loadSkipList('config/skip-list.json', repoRoot, warn),
    ).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('continuing with an empty list'),
    );
  });

  it('loads valid entries', async () => {
    const repoRoot = await createDirectory();
    await writeFile(
      join(repoRoot, 'skip-list.json'),
      JSON.stringify([{ folder: 'react-sample', reason: 'Third-party API' }]),
    );

    await expect(loadSkipList('skip-list.json', repoRoot)).resolves.toEqual([
      { folder: 'react-sample', reason: 'Third-party API' },
    ]);
  });

  it('fails on invalid JSON and invalid entries', async () => {
    const repoRoot = await createDirectory();
    await writeFile(join(repoRoot, 'skip-list.json'), '{');
    await expect(loadSkipList('skip-list.json', repoRoot)).rejects.toThrow(
      'contains invalid JSON',
    );

    await writeFile(join(repoRoot, 'skip-list.json'), JSON.stringify([{}]));
    await expect(loadSkipList('skip-list.json', repoRoot)).rejects.toThrow(
      'Invalid skip list',
    );
  });
});
