import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

    const configDirectory = await mkdtemp(join(tmpdir(), 'spfx-startup-'));
    const configPath = join(configDirectory, 'config.json');
    const forkLocalPath = fileURLToPath(
      new URL('../test/fixtures/', import.meta.url),
    );
    await writeFile(
      configPath,
      JSON.stringify({
        forkLocalPath,
        forkOwner: 'owner',
        forkRepo: 'repo',
        targetSpfxVersion: 'latest',
      }),
    );

    const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: {
        ...process.env,
        CONFIG_PATH: configPath,
        PORT: String(address.port),
      },
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
    await rm(configDirectory, { recursive: true, force: true });

    expect(result.code).toBe(1);
    expect(stderr).toContain('Failed to start server');
    expect(stderr).toContain('EADDRINUSE');
  }, 10_000);
});
