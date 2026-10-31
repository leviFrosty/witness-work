import type { MytimeRawTables } from '@/features/mytime-import/lib/mytimeSchema'

export * from '@/features/mytime-import/lib/readMytimeTables'

export const canReadMytimeDb = false

/**
 * The web build has no SQLite yet: expo-sqlite's web worker needs cross-origin
 * isolation, which the web app doesn't turn on (ADR 0037 §5). MyTime import
 * stays hidden there until it reads the backup in memory.
 */
export async function readMytimeDb(_uri: string): Promise<MytimeRawTables> {
  throw new Error('MyTime import is not available on the web yet')
}
