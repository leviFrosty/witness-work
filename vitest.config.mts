import { defineConfig } from 'vitest/config'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const smallMachine = os.totalmem() / 2 ** 30 <= 16

export default defineConfig({
  assetsInclude: ['**/*.xml', '**/*.mp3', '**/*.wav'],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    setupFiles: ['./vitest.setup.ts'],

    testTimeout: 20_000,
    maxWorkers:
      Number(process.env.WW_VITEST_WORKERS) ||
      (process.env.CI ? undefined : smallMachine ? 3 : undefined),
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/.claude/**',

      'services/**',

      'e2e/web/**',

      ...(process.env.WW_VERIFY_TESTS ? [] : ['.verify/**']),
    ],
  },
})
