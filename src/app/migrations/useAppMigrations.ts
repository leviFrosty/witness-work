import { useEffect, useState } from 'react'
import { reloadApp } from '@/lib/hotUpdater'
import {
  hasMigratedFromAsyncStorage,
  migrateFromAsyncStorage,
} from '@/stores/mmkv'
import { runCustomFieldsMigration } from '@/features/contacts/lib/runCustomFieldsMigration'
import {
  runTagsToCategoriesMigration,
  runLdcCategoryMigration,
} from '@/stores/migrations/categories'
import { runProfileMigration } from '@/stores/migrations/profile'
import { migrateLegacyLocale } from '@/features/settings/lib/migrateLegacyLocale'

export function useAppMigrations() {
  const [hasMigrated, setHasMigrated] = useState(hasMigratedFromAsyncStorage())

  useEffect(() => {
    if (!hasMigratedFromAsyncStorage()) {
      requestIdleCallback(async () => {
        try {
          if (await migrateFromAsyncStorage()) await reloadApp()
        } catch {}
        setHasMigrated(true)
      })
    }
  }, [])

  useEffect(() => {
    if (hasMigrated) runCustomFieldsMigration()
  }, [hasMigrated])

  useEffect(() => {
    if (hasMigrated) runTagsToCategoriesMigration()
  }, [hasMigrated])

  useEffect(() => {
    if (hasMigrated) runProfileMigration()
  }, [hasMigrated])

  useEffect(() => {
    if (hasMigrated) runLdcCategoryMigration()
  }, [hasMigrated])

  useEffect(() => {
    if (hasMigrated) migrateLegacyLocale()
  }, [hasMigrated])

  return hasMigrated
}
