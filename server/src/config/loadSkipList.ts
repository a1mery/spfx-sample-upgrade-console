import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { z } from 'zod';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const skipListSchema = z.array(
  z.object({
    folder: z.string().trim().min(1, 'must not be empty'),
    reason: z.string().trim().min(1, 'must not be empty'),
  }),
);

export type SkipListEntry = z.infer<typeof skipListSchema>[number];

export async function loadSkipList(
  skipListPath: string,
  repoRoot = REPO_ROOT,
  warn: (message: string) => void = (message) => console.warn(message),
): Promise<SkipListEntry[]> {
  const resolvedPath = resolve(repoRoot, skipListPath);
  let contents: string;
  try {
    contents = await readFile(resolvedPath, 'utf8');
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      warn(
        `Skip list "${resolvedPath}" was not found; continuing with an empty list.`,
      );
      return [];
    }
    throw new Error(`Unable to read skip list "${resolvedPath}".`, {
      cause: error,
    });
  }

  let value: unknown;
  try {
    value = JSON.parse(contents) as unknown;
  } catch (error) {
    throw new Error(`Skip list "${resolvedPath}" contains invalid JSON.`, {
      cause: error,
    });
  }

  const result = skipListSchema.safeParse(value);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const field = issue.path.length > 0 ? issue.path.join('.') : 'skipList';
      return `${field}: ${issue.message}`;
    });
    throw new Error(
      `Invalid skip list "${resolvedPath}":\n${problems.map((problem) => `- ${problem}`).join('\n')}`,
    );
  }

  return result.data;
}
