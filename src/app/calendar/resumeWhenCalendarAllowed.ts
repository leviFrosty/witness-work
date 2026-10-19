import { PermissionsAndroid, Platform } from 'react-native'
import { calendarBridge } from '../../../modules/calendar-bridge'
import { useCalendarPublishing } from '@/stores/calendarSync'
import { addForegroundListener } from '@/lib/appLifecycle'
import { calendarRecovery } from '@/app/calendar/calendarRecovery'

/**
 * Doesn't prompt. Only checked after a denial: iOS then answers without asking
 * (from write-only access it may offer the upgrade to Full Access once, which
 * is the fix anyway), and Android's check never asks.
 */
export async function calendarAccessAllowed() {
  try {
    if (Platform.OS === 'android') {
      const granted = await Promise.all([
        PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_CALENDAR),
        PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.WRITE_CALENDAR),
      ])
      return granted.every(Boolean)
    }
    return await calendarBridge().requestAccess()
  } catch {
    return false
  }
}

/**
 * After a permission error, checks access again whenever the user comes back to
 * the app (from Settings, usually) and runs `resume` once it's allowed, so they
 * don't have to start over.
 */
export function resumeWhenCalendarAllowed(resume: () => void) {
  // Not while an action is running: it asks for access itself, and Android's
  // permission dialog counts as leaving the app and coming back.
  const permissionError = () => {
    const { error, working } = useCalendarPublishing.getState()
    return !working && calendarRecovery(error) === 'open_settings'
  }
  return addForegroundListener(() => {
    if (!permissionError()) return
    void calendarAccessAllowed().then((allowed) => {
      if (allowed && permissionError()) resume()
    })
  })
}
