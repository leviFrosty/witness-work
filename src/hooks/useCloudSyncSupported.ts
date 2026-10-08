import { useEffect, useState } from 'react'
import { hasSyncTransport, usesGoogleDriveSync } from '@/lib/syncTransport'
import { googleDriveSupported } from '@/lib/syncTransport/googleDrive/googleDriveAuth'

/**
 * Whether this device can use cloud sync at all: iOS has iCloud; Android needs
 * Google Play services to connect Google Drive. Assumes yes on Android until
 * the native check answers, since nearly every device has them.
 */
export default function useCloudSyncSupported(): boolean {
  const [supported, setSupported] = useState(hasSyncTransport)
  useEffect(() => {
    if (!usesGoogleDriveSync()) return
    let active = true
    void googleDriveSupported().then((result) => {
      if (active) setSupported(result)
    })
    return () => {
      active = false
    }
  }, [])
  return supported
}
