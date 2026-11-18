import type { SampleRow } from '@spfx-console/shared';
import {
  deriveStatus,
  SAMPLE_STATUSES,
  type SampleStatus,
} from './deriveStatus.js';

export type SampleSort = 'name' | 'version';

export interface SampleFilters {
  query: string;
  statuses: SampleStatus[];
  graphOnly: boolean;
  sortBy: SampleSort;
}

export const DEFAULT_SAMPLE_FILTERS: SampleFilters = {
  query: '',
  statuses: [...SAMPLE_STATUSES],
  graphOnly: false,
  sortBy: 'name',
};

export function filterSamples(
  samples: SampleRow[],
  filters: Pick<SampleFilters, 'query' | 'statuses' | 'graphOnly'>,
): SampleRow[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return samples.filter((sample) => {
    const matchesQuery =
      query === '' ||
      `${sample.title ?? ''} ${sample.folder}`
        .toLocaleLowerCase()
        .includes(query);
    return (
      matchesQuery &&
      filters.statuses.includes(deriveStatus(sample)) &&
      (!filters.graphOnly || sample.usesGraph)
    );
  });
}

export function parseSampleFilters(search: string): SampleFilters {
  const params = new URLSearchParams(search);
  const requestedStatuses = params.getAll('status');
  const statuses =
    requestedStatuses.length === 0
      ? [...SAMPLE_STATUSES]
      : requestedStatuses.includes('none')
        ? []
        : SAMPLE_STATUSES.filter((status) =>
            requestedStatuses.includes(status),
          );
  return {
    query: params.get('q') ?? '',
    statuses,
    graphOnly: params.get('graphOnly') === '1',
    sortBy: params.get('sort') === 'version' ? 'version' : 'name',
  };
}

export function serializeSampleFilters(filters: SampleFilters): string {
  const params = new URLSearchParams();
  if (filters.query !== '') {
    params.set('q', filters.query);
  }
  if (filters.statuses.length !== SAMPLE_STATUSES.length) {
    if (filters.statuses.length === 0) {
      params.append('status', 'none');
    } else {
      filters.statuses.forEach((status) => params.append('status', status));
    }
  }
  if (filters.graphOnly) {
    params.set('graphOnly', '1');
  }
  if (filters.sortBy !== 'name') {
    params.set('sort', filters.sortBy);
  }
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}
