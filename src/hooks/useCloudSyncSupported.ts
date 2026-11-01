import { useEffect, useState } from 'react'
import { hasSyncTransport, usesGoogleDriveSync } from '@/lib/syncTransport'
import { googleDriveSupported } from '@/lib/syncTransport/googleDrive/googleDriveAuth'

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
