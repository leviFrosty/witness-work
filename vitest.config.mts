import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  // Android drawables (`*.xml`) and sounds import as their paths, as Metro
  // assets do.
  assetsInclude: ['**/*.xml', '**/*.mp3', '**/*.wav'],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    setupFiles: ['./vitest.setup.ts'],
    // A few suites do real CPU and file work: they gzip 200 MB compression
    // bombs, transform every app file with Babel, or run whole sync rounds.
    // They take 1–3 s on an idle machine, and the default 5 s limit then fails
    // pushes whenever the pre-push hook shares the machine with other work.
    testTimeout: 20_000,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/.claude/**',
      // Its own workspace and tests (services/README.md).
      'services/**',
    ],
  },
})
