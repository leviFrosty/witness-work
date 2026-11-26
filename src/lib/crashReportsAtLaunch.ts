import { MMKV } from 'react-native-mmkv'

const PREFERENCES_KEY = 'preferences'

export function crashReportsEnabledAtLaunch(): boolean {
  try {
    const raw = new MMKV().getString(PREFERENCES_KEY)
    if (!raw) return true
    const saved = JSON.parse(raw) as {
      state?: { crashReportsEnabled?: unknown }
    } | null
    return saved?.state?.crashReportsEnabled !== false
  } catch {
    return true
  }
}
