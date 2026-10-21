import { defineConfig, mergeConfig } from 'vitest/config';
import frontend from './packages/blog/vitest.config';

// The repository gate covers the frontend and shared content/build tools.
export default mergeConfig(
  frontend,
  defineConfig({
    test: {
      include: ['packages/blog/src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
      coverage: { include: ['packages/blog/src/**/*.{ts,tsx}', 'scripts/lib/**/*.mjs'] },
    },
  }),
);
