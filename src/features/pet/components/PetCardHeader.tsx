import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import PixelHearts from '@/features/pet/components/PixelHearts'
import type { HeartPulse } from '@/features/pet/hooks/usePetReveal'
import type { PetCardLife } from '@/features/pet/lib/sceneInput'

/**
 * The pet card's header: the name, then its hearts or what's wrong. Gold's
 * first day adds a one-line note. `heartPulse` pops or crumbles the heart that
 * just changed (`usePetReveal`).
 */
export default function PetCardHeader({
  name,
  life,
  size = 'lg',
  heartPulse = null,
}: {
  name: string
  life: PetCardLife
  /** The name's size: `lg` on the card, `xl` as a sheet's title. */
  size?: 'lg' | 'xl'
  heartPulse?: HeartPulse | null
}) {
  const theme = useTheme()
  const status = life.dead
    ? i18n.t('pet.died', { name })
    : life.asleep
      ? i18n.t('pet.asleep', { name })
      : null

  return (
    <View style={{ gap: 4 }}>
      <Text
        numberOfLines={1}
        style={{
          fontSize: theme.fontSize(size),
          fontFamily: size === 'xl' ? theme.fonts.bold : theme.fonts.semiBold,
        }}
      >
        {name}
      </Text>
      {!life.dead && (
        <PixelHearts hearts={life.hearts} gold={life.gold} pulse={heartPulse} />
      )}
      {life.goldStartedToday && !life.dead && (
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.warnText,
          }}
        >
          {i18n.t('pet.goldNote')}
        </Text>
      )}
      {status && (
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
        >
          {status}
        </Text>
      )}
    </View>
  )
}
