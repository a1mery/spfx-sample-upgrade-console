import type { SampleRow } from '@spfx-console/shared';
import { describe, expect, it } from 'vitest';
import {
  filterSamples,
  parseSampleFilters,
  serializeSampleFilters,
} from './filterSamples.js';

const samples: SampleRow[] = [
  {
    folder: 'alpha',
    title: 'Alpha Web Part',
    spfxVersion: '1.22.0',
    versionSource: 'package.json',
    toolchain: 'gulp',
    usesGraph: true,
    error: null,
    skipped: false,
    skipReason: null,
    needsUpgrade: true,
  },
  {
    folder: 'beta',
    title: null,
    spfxVersion: null,
    versionSource: null,
    toolchain: 'unknown',
    usesGraph: false,
    error: null,
    skipped: false,
    skipReason: null,
    needsUpgrade: null,
  },
];

describe('filterSamples', () => {
  it('searches title and folder without case sensitivity', () => {
    expect(
      filterSamples(samples, {
        query: 'ALPHA WEB',
        statuses: ['Needs upgrade'],
        graphOnly: false,
      }),
    ).toEqual([samples[0]]);
    expect(
      filterSamples(samples, {
        query: 'BETA',
        statuses: ['Unknown'],
        graphOnly: false,
      }),
    ).toEqual([samples[1]]);
  });

  it('combines status and Graph-only filters', () => {
    expect(
      filterSamples(samples, {
        query: '',
        statuses: ['Needs upgrade', 'Unknown'],
        graphOnly: true,
      }),
    ).toEqual([samples[0]]);
    expect(
      filterSamples(samples, {
        query: '',
        statuses: [],
        graphOnly: false,
      }),
    ).toEqual([]);
  });
});

describe('sample filter URL state', () => {
  it('parses and serializes non-default filters', () => {
    const filters = {
      query: 'graph sample',
      statuses: ['Needs upgrade', 'Skipped'] as const,
      graphOnly: true,
      sortBy: 'version' as const,
    };
    const serialized = serializeSampleFilters({
      ...filters,
      statuses: [...filters.statuses],
    });
    expect(parseSampleFilters(serialized)).toEqual({
      ...filters,
      statuses: ['Skipped', 'Needs upgrade'],
    });
  });

  it('defaults to all statuses and preserves an empty selection', () => {
    expect(parseSampleFilters('')).toMatchObject({
      statuses: ['Skipped', 'Unknown', 'Needs upgrade', 'Up to date'],
      sortBy: 'name',
    });
    expect(
      parseSampleFilters(
        serializeSampleFilters({
          query: '',
          statuses: [],
          graphOnly: false,
          sortBy: 'name',
        }),
      ).statuses,
    ).toEqual([]);
  });
});
