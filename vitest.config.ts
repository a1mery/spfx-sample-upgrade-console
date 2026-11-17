import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'server',
          include: ['server/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'shared',
          include: ['shared/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'web',
          include: ['web/**/*.test.ts', 'web/**/*.test.tsx'],
          environment: 'jsdom',
        },
      },
    ],
  },
});
