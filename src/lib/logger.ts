let developerToolsEnabled = () => false

// App startup supplies the preference reader so logging never initializes stores
// (and their analytics dependencies) while the logger itself is being imported.
export function configureLogger(isDeveloperToolsEnabled: () => boolean): void {
  developerToolsEnabled = isDeveloperToolsEnabled
}

/**
 * Simple logger utility that logs only when:
 *
 * - DeveloperTools is enabled in preferences, OR
 * - Running in development mode (**DEV**)
 */
const shouldLog = (): boolean => {
  if (
    process.env.EXPO_PUBLIC_SILENT === 'true' ||
    process.env.EXPO_PUBLIC_SILENT === '1'
  ) {
    return false
  }
  return (typeof __DEV__ !== 'undefined' && __DEV__) || developerToolsEnabled()
}

export const logger = {
  isEnabled: shouldLog,
  debug: (...args: unknown[]) => {
    try {
      if (shouldLog()) {
        console.debug(...args)
      }
    } catch {
      // Diagnostic logging must never interrupt startup or a user's action.
    }
  },
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
