import { vi } from 'vitest'

export const configureLogger = vi.fn()
export const logger = {
  isEnabled: vi.fn(() => false),
  debug: vi.fn(),
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
}
