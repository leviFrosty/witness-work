import i18n from '@/lib/locales'
import { toast } from '@/stores/toasts'
import type {
  SharedCarEnded,
  SharedCarShareFailed,
} from '@/app/sharedCars/engine'

/**
 * Tells the User when one of their Shared Cars ended without them doing it
 * here: they were removed or its owner stopped sharing (`gone`), or everyone
 * else left (`last_member`). It's news, not the result of their action, so it
 * shows at the top. Their own Leave and Stop Sharing say so where they did it;
 * leaving on another of their devices says nothing here.
 */
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

/**
 * Tells the User a share that stopped part-way gave up in the background (a
 * trip too large to share, a car past a shared car's caps, or a clock the
 * server keeps refusing): the car is still one of their own. Their own Share
 * Car shows its own error instead.
 */
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
