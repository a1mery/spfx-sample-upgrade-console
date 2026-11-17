import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('server startup', () => {
  it('reports a clear error and exits when the port is already in use', async () => {
    const blocker = createServer();
    await new Promise<void>((resolve, reject) => {
      blocker.once('error', reject);
      blocker.listen(0, '127.0.0.1', resolve);
    });

    const address = blocker.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected the blocker server to have a TCP address');
    }

    const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: { ...process.env, PORT: String(address.port) },
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    const result = await new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
    }>((resolve) => {
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    await new Promise<void>((resolve, reject) => {
      blocker.close((error) => (error ? reject(error) : resolve()));
    });

    expect(result.code).toBe(1);
    expect(stderr).toContain('Failed to start server');
    expect(stderr).toContain('EADDRINUSE');
  }, 10_000);
});
