import { describe, expect, it } from 'vitest';
import { deriveStatus } from './deriveStatus.js';

describe('deriveStatus', () => {
  it('prioritizes skipped samples', () => {
    expect(
      deriveStatus({ skipped: true, spfxVersion: null, needsUpgrade: true }),
    ).toBe('Skipped');
  });

  it('returns unknown for missing versions or upgrade status', () => {
    expect(
      deriveStatus({ skipped: false, spfxVersion: null, needsUpgrade: null }),
    ).toBe('Unknown');
    expect(
      deriveStatus({
        skipped: false,
        spfxVersion: '1.22.0',
        needsUpgrade: null,
      }),
    ).toBe('Unknown');
  });

  it('distinguishes needs-upgrade and current samples', () => {
    expect(
      deriveStatus({
        skipped: false,
        spfxVersion: '1.22.0',
        needsUpgrade: true,
      }),
    ).toBe('Needs upgrade');
    expect(
      deriveStatus({
        skipped: false,
        spfxVersion: '1.23.0',
        needsUpgrade: false,
      }),
    ).toBe('Up to date');
  });
});
