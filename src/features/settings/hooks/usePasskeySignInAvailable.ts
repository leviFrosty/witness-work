import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { accountKeyReplaceable } from '@/app/account/accountKey'
import { accountPasskeySupport } from '@/app/account/passkeys'

export default function usePasskeySignInAvailable(): boolean {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    if (Platform.OS === 'web' || !accountKeyReplaceable()) return
    let live = true
    void accountPasskeySupport().then((support) => {
      if (live) setAvailable(support.passkeys)
    })
    return () => {
      live = false
    }
  }, [])
  return available
}
