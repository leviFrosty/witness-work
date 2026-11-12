import {
  Ban as BanIcon,
  DoorClosed as DoorClosedIcon,
  MessageCircle as MessageCircleIcon,
} from 'lucide-react-native'
import type { AppIcon } from '@/components/ui/LucideIcon'
import type { TranslationKey } from '@/lib/locales'
import type { Theme } from '@/types/theme'
import type { DoorOutcome } from '@/features/territories/types/territory'

export const DOOR_OUTCOMES: readonly DoorOutcome[] = [
  'doNotCall',
  'spoke',
  'notHome',
]

export const OUTCOME_LABEL: Record<DoorOutcome, TranslationKey> = {
  notHome: 'territories.outcome.notHome',
  spoke: 'territories.outcome.spoke',
  doNotCall: 'territories.outcome.doNotCall',
}

export const OUTCOME_ICON: Record<DoorOutcome, AppIcon> = {
  notHome: DoorClosedIcon,
  spoke: MessageCircleIcon,
  doNotCall: BanIcon,
}

export const outcomeColor = (
  outcome: DoorOutcome,
  colors: Theme['colors']
): string =>
  outcome === 'notHome'
    ? colors.orange
    : outcome === 'spoke'
      ? colors.accent
      : colors.error
