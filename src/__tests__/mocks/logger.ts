import { vi } from 'vitest'

// Shared stub for tests that need to silence or inspect logger calls.
//
// Usage:
//   vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
export const configureLogger = vi.fn()
export const logger = {
  isEnabled: vi.fn(() => false),
  debug: vi.fn(),
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
}
