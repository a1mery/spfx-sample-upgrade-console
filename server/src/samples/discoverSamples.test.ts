import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { SampleInfo } from '@spfx-console/shared';
import { discoverSamples } from './discoverSamples.js';

const samplesRoot = fileURLToPath(
  new URL('../../test/fixtures/samples/', import.meta.url),
);
let samples: SampleInfo[];

function sample(folder: string): SampleInfo {
  const result = samples.find((entry) => entry.folder === folder);
  if (!result) {
    throw new Error(`Missing sample result for "${folder}"`);
  }
  return result;
}

describe('discoverSamples', () => {
  beforeAll(async () => {
    samples = await discoverSamples(samplesRoot);
  });

  it('detects an older gulp sample and its package version', () => {
    expect(sample('react-gulp-old')).toMatchObject({
      spfxVersion: '1.4.1',
      versionSource: 'package.json',
      toolchain: 'gulp',
    });
  });

  it('detects a recent Heft sample and reads its title', () => {
    expect(sample('react-heft-recent')).toMatchObject({
      spfxVersion: '1.22.1',
      versionSource: 'package.json',
      toolchain: 'heft',
      title: 'Recent Heft sample',
    });
  });

  it('falls back to the generator version in .yo-rc.json', () => {
    expect(sample('react-yo-only')).toMatchObject({
      spfxVersion: '1.18.0',
      versionSource: '.yo-rc.json',
    });
  });

  it('detects Graph permission requests', () => {
    expect(sample('react-graph').usesGraph).toBe(true);
  });

  it('detects the PnP Graph dependency', () => {
    expect(sample('react-pnp-graph').usesGraph).toBe(true);
  });

  it('reports invalid package JSON without stopping discovery', () => {
    expect(sample('react-broken-json')).toMatchObject({
      spfxVersion: null,
      versionSource: null,
    });
    expect(sample('react-broken-json').error).toContain('package.json');
  });

  it('keeps samples without a known version error-free', () => {
    expect(sample('react-no-version')).toMatchObject({
      spfxVersion: null,
      versionSource: null,
      error: null,
    });
  });

  it('ignores hidden directories and files and sorts the results', () => {
    const folders = samples.map(({ folder }) => folder);
    expect(folders).toEqual(
      [...folders].sort((left, right) => left.localeCompare(right)),
    );
    expect(folders).not.toContain('.hidden-folder');
    expect(folders).not.toContain('README.md');
  });

  it('throws a clear error when the samples root is missing', async () => {
    await expect(discoverSamples(join(samplesRoot, 'missing'))).rejects.toThrow(
      'Unable to read samples root',
    );
  });
});
