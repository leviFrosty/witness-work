import { createBackupFile } from '@/lib/backupFile'
import { localTerritorySnapshot } from '@/app/sync/territoryStoreSync'

export const backupFileContents = () => ({
  ...createBackupFile(),
  territoryStore: localTerritorySnapshot(),
})
