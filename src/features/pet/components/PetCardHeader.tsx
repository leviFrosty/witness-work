import type { ReactElement } from 'react'
import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import PixelHearts from '@/features/pet/components/PixelHearts'
import type { HeartPulse } from '@/features/pet/hooks/usePetReveal'
import type { PetCardLife } from '@/features/pet/lib/sceneInput'

export default function PetCardHeader({
  name,
  life,
  size = 'lg',
  heartPulse = null,
  ink,
  wrapHearts,
}: {
  name: string
  life: PetCardLife

  size?: 'lg' | 'xl'
  heartPulse?: HeartPulse | null

  ink?: { text: string; alt: string }
  wrapHearts?: (hearts: ReactElement) => ReactElement
}) {
  const theme = useTheme()
  const hearts = (
    <PixelHearts hearts={life.hearts} gold={life.gold} pulse={heartPulse} />
  )
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
          color: ink?.text ?? theme.colors.text,
        }}
      >
        {name}
      </Text>
      {!life.dead && (wrapHearts ? wrapHearts(hearts) : hearts)}
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
            color: ink?.alt ?? theme.colors.textAlt,
          }}
        >
          {status}
        </Text>
      )}
    </View>
  )
}
