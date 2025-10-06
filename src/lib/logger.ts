import { usePreferences } from '../stores/preferences'

/**
 * Simple logger utility that logs only when:
 *
 * - DeveloperTools is enabled in preferences, OR
 * - Running in development mode (**DEV**)
 */
const shouldLog = (): boolean => {
  const developerTools = usePreferences.getState().developerTools
  return developerTools || __DEV__
}

export const logger = {
  log: (...args: unknown[]) => {
    if (shouldLog()) {
      console.log(...args)
    }
  },
  error: (...args: unknown[]) => {
    if (shouldLog()) {
      console.error(...args)
    }
  },
  warn: (...args: unknown[]) => {
    if (shouldLog()) {
      console.warn(...args)
    }
  },
  info: (...args: unknown[]) => {
    if (shouldLog()) {
      console.info(...args)
    }
  },
}
