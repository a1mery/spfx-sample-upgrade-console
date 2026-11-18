import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  FluentProvider,
  Input,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  webLightTheme,
} from '@fluentui/react-components';
import type { SampleRow, SamplesResponse } from '@spfx-console/shared';
import {
  filterSamples,
  parseSampleFilters,
  serializeSampleFilters,
  type SampleFilters,
} from './samples/filterSamples.js';
import {
  deriveStatus,
  SAMPLE_STATUSES,
  type SampleStatus,
} from './samples/deriveStatus.js';
import { sortSamples } from './samples/sortSamples.js';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function responseErrorMessage(body: unknown, status: number): string {
  if (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof body.error === 'string'
  ) {
    return body.error;
  }
  return `Request failed (${status})`;
}

function statusTitle(sample: SampleRow): string | undefined {
  return sample.skipped ? (sample.skipReason ?? undefined) : undefined;
}

export function App() {
  const [samplesResponse, setSamplesResponse] =
    useState<SamplesResponse | null>(null);
  const [filters, setFilters] = useState<SampleFilters>(() =>
    parseSampleFilters(window.location.search),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSamples = useCallback(async (refresh = false) => {
    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);
    try {
      const response = await fetch(
        refresh ? '/api/samples/refresh' : '/api/samples',
        { method: refresh ? 'POST' : 'GET' },
      );
      const body: unknown = await response.json();
      if (!response.ok) {
        throw new Error(responseErrorMessage(body, response.status));
      }
      setSamplesResponse(body as SamplesResponse);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) {
        void loadSamples();
      }
    });
    return () => {
      active = false;
    };
  }, [loadSamples]);

  useEffect(() => {
    const url = `${window.location.pathname}${serializeSampleFilters(filters)}${window.location.hash}`;
    window.history.replaceState(null, '', url);
  }, [filters]);

  useEffect(() => {
    const onPopState = () =>
      setFilters(parseSampleFilters(window.location.search));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const visibleSamples = useMemo(() => {
    if (samplesResponse === null) {
      return [];
    }
    return sortSamples(
      filterSamples(samplesResponse.samples, filters),
      filters.sortBy,
    );
  }, [filters, samplesResponse]);

  const summary = useMemo(() => {
    const samples = samplesResponse?.samples ?? [];
    return {
      total: samplesResponse?.total ?? 0,
      needsUpgrade: samples.filter(
        (sample) => !sample.skipped && sample.needsUpgrade === true,
      ).length,
      upToDate: samples.filter(
        (sample) => !sample.skipped && sample.needsUpgrade === false,
      ).length,
      skipped: samples.filter((sample) => sample.skipped).length,
      unknownVersion: samples.filter(
        (sample) => !sample.skipped && sample.spfxVersion === null,
      ).length,
    };
  }, [samplesResponse]);

  function updateFilters(update: Partial<SampleFilters>) {
    setFilters((current) => ({ ...current, ...update }));
  }

  function toggleStatus(status: SampleStatus, checked: boolean) {
    const statuses = checked
      ? [...filters.statuses, status]
      : filters.statuses.filter((current) => current !== status);
    updateFilters({ statuses });
  }

  return (
    <FluentProvider theme={webLightTheme}>
      <main>
        <header>
          <h1>SPFx Sample Upgrade Console</h1>
          <p>
            Target SPFx version:{' '}
            {samplesResponse?.target ? (
              <>
                <strong>{samplesResponse.target.version}</strong> (from{' '}
                {samplesResponse.target.source})
                {samplesResponse.target.stale && (
                  <span
                    role="status"
                    title="Using a previously resolved target"
                  >
                    {' '}
                    Stale
                  </span>
                )}
              </>
            ) : (
              'Unavailable'
            )}
          </p>
          <p>
            Last scan:{' '}
            {samplesResponse
              ? new Date(samplesResponse.scannedAt).toLocaleString()
              : '—'}
          </p>
          <Button
            appearance="primary"
            disabled={isLoading || isRefreshing}
            onClick={() => void loadSamples(true)}
          >
            {isRefreshing ? (
              <Spinner size="tiny" label="Refreshing samples" />
            ) : (
              'Refresh'
            )}
          </Button>
          {samplesResponse && (
            <p aria-label="Sample summary">
              Total: {summary.total} · Needs upgrade: {summary.needsUpgrade} ·
              Up to date: {summary.upToDate} · Skipped: {summary.skipped} ·
              Unknown version: {summary.unknownVersion}
            </p>
          )}
        </header>

        {error !== null && (
          <div role="alert">
            <p>{error}</p>
            {samplesResponse === null && (
              <Button onClick={() => void loadSamples()}>Retry</Button>
            )}
          </div>
        )}

        {isLoading && samplesResponse === null ? (
          <Spinner label="Loading samples" />
        ) : (
          samplesResponse && (
            <>
              <section aria-label="Sample filters">
                <Input
                  aria-label="Search samples"
                  placeholder="Search title or folder"
                  value={filters.query}
                  onChange={(_event, data) =>
                    updateFilters({ query: data.value })
                  }
                />
                <fieldset>
                  <legend>Status</legend>
                  {SAMPLE_STATUSES.map((status) => (
                    <Checkbox
                      key={status}
                      label={status}
                      checked={filters.statuses.includes(status)}
                      onChange={(_event, data) =>
                        toggleStatus(status, data.checked === true)
                      }
                    />
                  ))}
                </fieldset>
                <Checkbox
                  label="Graph only"
                  checked={filters.graphOnly}
                  onChange={(_event, data) =>
                    updateFilters({ graphOnly: data.checked === true })
                  }
                />
                <label>
                  Sort by{' '}
                  <select
                    aria-label="Sort by"
                    value={filters.sortBy}
                    onChange={(event) =>
                      updateFilters({
                        sortBy: event.currentTarget
                          .value as SampleFilters['sortBy'],
                      })
                    }
                  >
                    <option value="name">Sample name</option>
                    <option value="version">SPFx version</option>
                  </select>
                </label>
              </section>

              {visibleSamples.length === 0 ? (
                <p>No sample matches the filters</p>
              ) : (
                <Table aria-label="Samples">
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell>Sample</TableHeaderCell>
                      <TableHeaderCell>SPFx version</TableHeaderCell>
                      <TableHeaderCell>Toolchain</TableHeaderCell>
                      <TableHeaderCell>Graph</TableHeaderCell>
                      <TableHeaderCell>Status</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleSamples.map((sample) => (
                      <TableRow key={sample.folder}>
                        <TableCell>
                          <div>{sample.title ?? sample.folder}</div>
                          <small>{sample.folder}</small>
                        </TableCell>
                        <TableCell title={sample.error ?? undefined}>
                          {sample.spfxVersion ?? 'Unknown'}
                        </TableCell>
                        <TableCell>
                          <Badge appearance="tint">{sample.toolchain}</Badge>
                        </TableCell>
                        <TableCell>
                          {sample.usesGraph ? (
                            <Badge appearance="tint">Graph</Badge>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell title={statusTitle(sample)}>
                          <Badge>{deriveStatus(sample)}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )
        )}
      </main>
    </FluentProvider>
  );
}
