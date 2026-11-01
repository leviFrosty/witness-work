import type { RoomChoicePart, RoomTab } from '@/features/pet/lib/roomOptions'
import {
  roomOptionLabel,
  roomSectionLabel,
  roomTabLabel,
} from '@/features/pet/lib/roomLabels'
import { isSecretItem } from '@/features/pet/lib/secretUnlocks'
import i18n from '@/lib/locales'
import type { RoomItemId } from '@/types/pet'

export const petUnlockKey = (item: RoomItemId | string) => `pet-item:${item}`

export function unlockedPart(item: RoomItemId): {
  part: RoomChoicePart
  option: string
} {
  const split = item.indexOf(':')
  return {
    part: item.slice(0, split) as RoomChoicePart,
    option: item.slice(split + 1),
  }
}

export const unlockTab = (part: RoomChoicePart): RoomTab =>
  part === 'wallColor' || part === 'wallPattern'
    ? 'wall'
    : part === 'windowTime' || part === 'windowSeason'
      ? 'window'
      : part

export function unlockText(item: RoomItemId, petName: string) {
  const { part, option } = unlockedPart(item)
  const name = roomOptionLabel(part, option)
  const hat = part === 'hat'
  const where = roomSectionLabel(part) ?? roomTabLabel(unlockTab(part))
  return {
    eyebrow: hat
      ? i18n.t('pet.unlock.newHat')
      : i18n.t('pet.unlock.newRoomItem', { name: petName }),
    title: hat
      ? name
      : i18n.t('pet.unlock.roomItemTitle', { part: where, option: name }),
    message: isSecretItem(item)
      ? i18n.t('pet.unlock.secret')
      : hat
        ? i18n.t('pet.unlock.hatReady', { name: petName })
        : i18n.t('pet.unlock.roomReady', { name: petName }),
  }
}

export function unlockTrayText(item: RoomItemId, petName: string) {
  const text = unlockText(item, petName)
  const hat = unlockedPart(item).part === 'hat'
  return {
    title: hat ? i18n.t('pet.unlock.trayHat', { hat: text.title }) : text.title,

    description: hat
      ? text.message
      : isSecretItem(item)
        ? i18n.t('pet.unlock.trayRoomDescription', {
            where: text.eyebrow,
            detail: text.message,
          })
        : text.eyebrow,
  }
}
