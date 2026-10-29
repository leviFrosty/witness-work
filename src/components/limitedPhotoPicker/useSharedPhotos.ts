import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import {
  type AssetMetadata,
  AssetField,
  MediaType,
  Query,
  addListener,
} from 'expo-media-library'
import { logger } from '@/lib/logger'

/**
 * The photos the User shared with the app, newest first, or null while they
 * load. Reloads when the selection changes: from Manage, or in Settings while
 * the app was in the background.
 */
export default function useSharedPhotos(): AssetMetadata[] | null {
  const [photos, setPhotos] = useState<AssetMetadata[] | null>(null)

  useEffect(() => {
    let live = true
    let generation = 0
    const load = async () => {
      const mine = ++generation
      try {
        const next = await new Query()
          .eq(AssetField.MEDIA_TYPE, MediaType.IMAGE)
          .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
          .exeForMetadata()
        if (live && mine === generation) setPhotos(next)
      } catch (error) {
        logger.warn('[photoPicker] Failed to list shared photos', error)
        if (live && mine === generation) setPhotos([])
      }
    }
    void load()
    const changes = addListener(() => void load())
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load()
    })
    return () => {
      live = false
      changes.remove()
      appState.remove()
    }
  }, [])

  return photos
}
