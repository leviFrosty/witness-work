import 'expo/build/Expo.fx'
import { isGuestPagePath } from '@/features/territories/guest/launch'

export function start() {
  if (isGuestPagePath(window.location.pathname))
    void import('@/app/territory-guest/startGuest').then((guest) =>
      guest.startGuest()
    )
  else void import('@/app/launch/startApp').then((app) => app.startApp())
}
