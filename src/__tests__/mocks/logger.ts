import { vi } from 'vitest'

// Mocks `src/lib/logger`. The real module pulls in the preferences store,
// which transitively requires the MMKV native module — not available in the
// vitest (node) env. Tests that import any module touching the logger need
// this stub.
//
// Usage:
//   vi.mock('@/__tests__/lib/logger', () => import('@/__tests__/mocks/mocks/logger'))
export const logger = {
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
}
