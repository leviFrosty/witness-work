let developerToolsEnabled = () => false

export function configureLogger(isDeveloperToolsEnabled: () => boolean): void {
  developerToolsEnabled = isDeveloperToolsEnabled
}

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
    } catch {}
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
