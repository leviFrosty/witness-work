import { useEffect, useState } from 'react'
import * as Updates from 'expo-updates'
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
      // Deferred to idle so the migration doesn't jank the launch animation
      // (InteractionManager is deprecated as of RN 0.86).
      requestIdleCallback(async () => {
        try {
          // Legacy data was copied: reload so hydrated stores re-read MMKV.
          // Fresh installs skip this; reloading mid-launch strands dev clients
          // on the splash screen ("app context has been lost").
          if (await migrateFromAsyncStorage()) await Updates.reloadAsync()
        } catch {
          // Falls back to async storage
        }
        setHasMigrated(true) // Allows app to continue regardless
      })
    }
  }, [])

  // Keep separate, ordered effects: LDC needs the migrated categories, and
  // every store migration must precede widget/iCloud subscription installation.
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
