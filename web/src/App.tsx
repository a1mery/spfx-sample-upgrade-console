import { useEffect, useState } from 'react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import type { HealthResponse } from '@spfx-console/shared';

export function App() {
  const [serverStatus, setServerStatus] = useState('Connecting...');

  useEffect(() => {
    void fetch('/api/health')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }

        return response.json() as Promise<HealthResponse>;
      })
      .then(({ status }) => setServerStatus(`Server: ${status}`))
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        setServerStatus(`Server: error (${message})`);
      });
  }, []);

  return (
    <FluentProvider theme={webLightTheme}>
      <main>
        <h1>SPFx Sample Upgrade Console</h1>
        <p aria-live="polite">{serverStatus}</p>
      </main>
    </FluentProvider>
  );
}
