import { defineConfig } from 'vitest/config'

// Unit tests only; the Playwright suite in tests/e2e runs against a build.
export default defineConfig({
  test: { include: ['tests/unit/**/*.test.ts'] },
})
