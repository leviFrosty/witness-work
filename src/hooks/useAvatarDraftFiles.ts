import { useEffect, useRef } from 'react'
import * as FileSystem from 'expo-file-system/legacy'
import { isManagedAvatarPath } from '@/lib/avatarFilePolicy'
import { logger } from '@/lib/logger'

/** Own immutable editor files until commit; cancellation also rejects late IO. */
export function useAvatarDraftFiles() {
  const files = useRef(new Set<string>())
  const committed = useRef(new Set<string>())
  const mounted = useRef(true)
  const erase = async (paths: string[]) => {
    for (const path of paths) {
      // A second completion or delayed close can arrive after the first commit.
      if (committed.current.has(path)) continue
      if (
        !FileSystem.documentDirectory ||
        !isManagedAvatarPath(path, FileSystem.documentDirectory)
      )
        continue
      try {
        await FileSystem.deleteAsync(path, { idempotent: true })
      } catch (error) {
        logger.warn('Failed to delete uncommitted avatar file', error)
      }
    }
  }
  useEffect(() => {
    mounted.current = true
    const owned = files.current
    return () => {
      mounted.current = false
      const paths = [...owned]
      owned.clear()
      void erase(paths)
    }
  }, [])
  return {
    claim(paths: string[]) {
      if (!mounted.current) return false
      paths.forEach((path) => files.current.add(path))
      return true
    },
    owns(paths: string[]) {
      return mounted.current && paths.every((path) => files.current.has(path))
    },
    commit(paths: string[]) {
      const owned =
        mounted.current && paths.every((path) => files.current.has(path))
      paths.forEach((path) => files.current.delete(path))
      if (owned) paths.forEach((path) => committed.current.add(path))
      else void erase(paths)
      return owned
    },
    release(paths: string[]) {
      paths.forEach((path) => files.current.delete(path))
      void erase(paths)
    },
  }
}
