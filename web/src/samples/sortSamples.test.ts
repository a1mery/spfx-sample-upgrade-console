import type { SampleRow } from '@spfx-console/shared';
import { describe, expect, it } from 'vitest';
import { sortSamples } from './sortSamples.js';

function sample(folder: string, version: string | null): SampleRow {
  return {
    folder,
    title: folder,
    spfxVersion: version,
    versionSource: version === null ? null : 'package.json',
    toolchain: 'gulp',
    usesGraph: false,
    error: null,
    skipped: false,
    skipReason: null,
    needsUpgrade: false,
  };
}

describe('sortSamples', () => {
  it('sorts by sample title/name by default', () => {
    expect(
      sortSamples(
        [sample('zulu', '1.0.0'), sample('alpha', '2.0.0')],
        'name',
      ).map(({ folder }) => folder),
    ).toEqual(['alpha', 'zulu']);
  });

  it('sorts versions semantically with unknown versions last', () => {
    expect(
      sortSamples(
        [
          sample('unknown', null),
          sample('ten', '1.10.0'),
          sample('beta', '1.2.0-beta.2'),
          sample('stable', '1.2.0'),
          sample('two', '1.2.0'),
        ],
        'version',
      ).map(({ folder }) => folder),
    ).toEqual(['beta', 'stable', 'two', 'ten', 'unknown']);
  });
});
