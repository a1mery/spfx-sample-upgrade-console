import type { SampleRow } from '@spfx-console/shared';

export const SAMPLE_STATUSES = [
  'Skipped',
  'Unknown',
  'Needs upgrade',
  'Up to date',
] as const;

export type SampleStatus = (typeof SAMPLE_STATUSES)[number];

export function deriveStatus(
  sample: Pick<SampleRow, 'skipped' | 'spfxVersion' | 'needsUpgrade'>,
): SampleStatus {
  if (sample.skipped) {
    return 'Skipped';
  }
  if (sample.spfxVersion === null || sample.needsUpgrade === null) {
    return 'Unknown';
  }
  return sample.needsUpgrade ? 'Needs upgrade' : 'Up to date';
}
