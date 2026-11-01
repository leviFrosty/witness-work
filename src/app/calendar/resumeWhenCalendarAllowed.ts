import { PermissionsAndroid, Platform } from 'react-native'
import { calendarBridge } from '../../../modules/calendar-bridge'
import { useCalendarPublishing } from '@/stores/calendarSync'
import { addForegroundListener } from '@/lib/appLifecycle'
import { calendarRecovery } from '@/app/calendar/calendarRecovery'

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

export function resumeWhenCalendarAllowed(resume: () => void) {
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
