import { randomUUID } from 'expo-crypto'
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

const MAX_LOG_LEN = 1000
export type Log = {
  id: string
  message: string
  timestamp: Date
  level: 'log' | 'error' | 'warn' | 'info'
}

export let history: Log[] = []
function writeToLogHistory(log: Log): void {
  if (history.length >= MAX_LOG_LEN) return
  const newHistory = [log, ...history.slice(0, MAX_LOG_LEN - 1)]
  history = newHistory
}

export const logger = {
  log: (...args: unknown[]) => {
    if (shouldLog()) {
      writeToLogHistory({
        id: randomUUID(),
        message: args.join(' '),
        timestamp: new Date(),
        level: 'log',
      })
      console.log(...args)
    }
  },
  error: (...args: unknown[]) => {
    if (shouldLog()) {
      writeToLogHistory({
        id: randomUUID(),
        message: args.join(' '),
        timestamp: new Date(),
        level: 'error',
      })
      console.error(...args)
    }
  },
  warn: (...args: unknown[]) => {
    if (shouldLog()) {
      writeToLogHistory({
        id: randomUUID(),
        message: args.join(' '),
        timestamp: new Date(),
        level: 'warn',
      })
      console.warn(...args)
    }
  },
  info: (...args: unknown[]) => {
    if (shouldLog()) {
      writeToLogHistory({
        id: randomUUID(),
        message: args.join(' '),
        timestamp: new Date(),
        level: 'info',
      })
      console.info(...args)
    }
  },
}
