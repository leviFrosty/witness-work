import i18n from '@/lib/locales'
import { toast } from '@/stores/toasts'
import type {
  SharedCarEnded,
  SharedCarShareFailed,
} from '@/app/sharedCars/engine'

export function announceCarEnding({ spaceId, name, reason }: SharedCarEnded) {
  const car = name || i18n.t('buddies_aSharedCar')
  const key = `shared-car-ended:${spaceId}`
  if (reason === 'gone')
    toast.news(i18n.t('mileage.sharedCarGone', { car }), {
      key,
      message: i18n.t('mileage.copyKept'),
    })
  else if (reason === 'last_member')
    toast.news(i18n.t('mileage.sharedCarLastMember', { car }), {
      key,
      message: i18n.t('mileage.sharedCarLastMember_message'),
    })
}

export function announceShareFailed({
  vehicleId,
  name,
  reason,
}: SharedCarShareFailed) {
  const title = name
    ? i18n.t('mileage.shareFailed', { car: name })
    : i18n.t('mileage.shareFailed_unnamed')
  toast.news(title, {
    key: `shared-car-share-failed:${vehicleId}`,
    message:
      reason === 'too_large'
        ? i18n.t('mileage.shareFailed_tooLarge')
        : reason === 'limit'
          ? i18n.t('mileage.shareFailed_limit')
          : i18n.t('mileage.shareFailed_message'),
  })
}
