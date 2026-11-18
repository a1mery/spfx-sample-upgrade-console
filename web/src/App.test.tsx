import type { SampleRow, SamplesResponse } from '@spfx-console/shared';
import {
  fireEvent,
  cleanup,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';

function sample(folder: string, title: string): SampleRow {
  return {
    folder,
    title,
    spfxVersion: '1.22.0',
    versionSource: 'package.json',
    toolchain: 'heft',
    usesGraph: folder === 'alpha',
    error: null,
    skipped: false,
    skipReason: null,
    needsUpgrade: folder === 'alpha',
  };
}

function response(scannedAt: string): SamplesResponse {
  const samples = [
    sample('alpha', 'Alpha sample'),
    sample('beta', 'Beta sample'),
  ];
  return {
    samples,
    scannedAt,
    total: samples.length,
    target: {
      version: '1.23.0',
      source: 'npm',
      resolvedAt: scannedAt,
      stale: false,
    },
  };
}

function fetchResponse(body: SamplesResponse) {
  return {
    ok: true,
    json: async () => body,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('App', () => {
  it('renders samples and filters the rows by title or folder', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(fetchResponse(response('2026-11-18T18:00:00.000Z'))),
    );

    render(<App />);

    expect(await screen.findByRole('table', { name: 'Samples' })).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getByText('1.23.0')).toBeTruthy();
    expect(screen.getByText('Alpha sample')).toBeTruthy();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search samples' }), {
      target: { value: 'BETA' },
    });

    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText('Beta sample')).toBeTruthy();
    expect(screen.queryByText('Alpha sample')).toBeNull();
  });

  it('refreshes samples and updates the displayed scan time', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        fetchResponse(response('2026-11-18T18:00:00.000Z')),
      )
      .mockResolvedValueOnce(
        fetchResponse(response('2026-11-18T18:30:00.000Z')),
      );
    vi.stubGlobal('fetch', fetch);

    render(<App />);
    await screen.findByRole('table', { name: 'Samples' });
    expect(screen.getByText(/Last scan:/).textContent).toContain(
      new Date('2026-11-18T18:00:00.000Z').toLocaleString(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => {
      expect(fetch).toHaveBeenLastCalledWith('/api/samples/refresh', {
        method: 'POST',
      });
    });
    await waitFor(() => {
      expect(screen.getByText(/Last scan:/).textContent).toContain(
        new Date('2026-11-18T18:30:00.000Z').toLocaleString(),
      );
    });
  });

  it('shows the server error and retries the initial request', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(
        fetchResponse(response('2026-11-18T18:00:00.000Z')),
      );
    vi.stubGlobal('fetch', fetch);

    render(<App />);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'network unavailable',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('table', { name: 'Samples' })).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
