import i18n from '@/lib/locales'
import { useOnline } from '@/lib/http/online'
import { useUpdateRequired } from '@/lib/appUpdate/updateRequired'
import { sharedCarsNotice } from '@/lib/mileage/sharedCarsNotice'
import { useSharedCarsSession } from '@/stores/sharedCarsSession'
import InlineNotice from '@/components/ui/InlineNotice'
import useMileageSharing from '@/features/mileage/hooks/useMileageSharing'

const MESSAGES = {
  updateRequired: 'mileage.sharedCarsUpdateRequired',
  suspended: 'mileage.sharedCarsSuspended',
  disabled: 'mileage.sharedCarsUnavailable',
  offline: 'mileage.sharedCarsOffline',
  waiting: 'mileage.sharedCarsWaiting',
  held: 'mileage.sharedCarsHeld',
  tooLarge: 'mileage.sharedCarsTooLarge',
} as const

export default function SharedCarsNotice({
  hasSharedCars,
  spaceId,
}: {
  hasSharedCars: boolean
  spaceId?: string
}) {
  const { enabled } = useMileageSharing()
  const online = useOnline()
  const updateRequired = useUpdateRequired((state) => state.required !== null)
  const suspended = useSharedCarsSession((state) => state.suspended)
  const disabled = useSharedCarsSession((state) => state.disabled)
  const cars = useSharedCarsSession((state) => state.cars)
  const notice = sharedCarsNotice({
    hasSharedCars,
    sharing: enabled,
    online,
    session: { suspended, disabled, cars },
    updateRequired,
    spaceId,
  })
  if (!notice) return null
  return (
    <InlineNotice
      tone={notice === 'offline' ? 'offline' : 'info'}
      message={i18n.t(MESSAGES[notice])}
    />
  )
}
