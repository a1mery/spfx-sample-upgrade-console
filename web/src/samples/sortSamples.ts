import type { SampleRow } from '@spfx-console/shared';
import type { SampleSort } from './filterSamples.js';

type ParsedVersion = {
  major: bigint;
  minor: bigint;
  patch: bigint;
  prerelease: string[] | null;
};

function parseVersion(version: string | null): ParsedVersion | null {
  if (version === null) {
    return null;
  }
  const match =
    /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
      version,
    );
  if (match === null) {
    return null;
  }
  const prerelease =
    match[4] === undefined
      ? null
      : match[4].split('.').every((part) => part !== '')
        ? match[4].split('.')
        : null;
  if (match[4] !== undefined && prerelease === null) {
    return null;
  }
  return {
    major: BigInt(match[1]),
    minor: BigInt(match[2]),
    patch: BigInt(match[3]),
    prerelease,
  };
}

function comparePrerelease(
  left: string[] | null,
  right: string[] | null,
): number {
  if (left === null || right === null) {
    return left === right ? 0 : left === null ? 1 : -1;
  }
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index] ?? '';
    const rightPart = right[index] ?? '';
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) {
      const difference = BigInt(leftPart) - BigInt(rightPart);
      if (difference !== 0n) {
        return difference < 0n ? -1 : 1;
      }
    } else if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1;
    } else if (leftPart !== rightPart) {
      return leftPart < rightPart ? -1 : 1;
    }
  }
  return left.length - right.length;
}

function compareVersions(left: string | null, right: string | null): number {
  const parsedLeft = parseVersion(left);
  const parsedRight = parseVersion(right);
  if (parsedLeft === null || parsedRight === null) {
    return parsedLeft === parsedRight ? 0 : parsedLeft === null ? 1 : -1;
  }
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (parsedLeft[key] !== parsedRight[key]) {
      return parsedLeft[key] < parsedRight[key] ? -1 : 1;
    }
  }
  return comparePrerelease(parsedLeft.prerelease, parsedRight.prerelease);
}

function sampleName(sample: SampleRow): string {
  return (sample.title ?? sample.folder).toLocaleLowerCase();
}

export function sortSamples(
  samples: SampleRow[],
  sortBy: SampleSort,
): SampleRow[] {
  return [...samples].sort((left, right) => {
    const comparison =
      sortBy === 'version'
        ? compareVersions(left.spfxVersion, right.spfxVersion)
        : sampleName(left).localeCompare(sampleName(right));
    return comparison || left.folder.localeCompare(right.folder);
  });
}
