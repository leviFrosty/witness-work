import { configDefaults, defineConfig } from 'vitest/config'

// Unit tests only. The live-worker suites under src/e2e run via
// `pnpm test:e2e` (vitest.e2e.config.ts) against `scripts/verify/dev.mjs up`.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'src/e2e/**', '.verify/**'],
  },
})
