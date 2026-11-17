import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { App } from './App.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('renders the title and server health response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok' }),
      }),
    );

    render(<App />);

    expect(
      screen.getByRole('heading', { name: 'SPFx Sample Upgrade Console' }),
    ).toBeTruthy();
    expect(await screen.findByText('Server: ok')).toBeTruthy();
  });
});
