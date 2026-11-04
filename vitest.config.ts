import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Deduplicate React so component tests that use react-dom/server resolve a SINGLE copy of
  // react + react-dom (also pinned via the pnpm override in pnpm-workspace.yaml). Prevents
  // the dual-runtime error "Cannot read properties of null (reading 'useState')".
  resolve: {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'apps/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
