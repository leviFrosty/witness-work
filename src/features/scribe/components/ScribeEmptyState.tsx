import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useUnbrokenWords from '@/hooks/useUnbrokenWords'
import i18n from '@/lib/locales'
import {
  useScribeAvailability,
  useScribeHasFinishedTurn,
} from '@/features/scribe'
import { ScribePill } from '@/features/scribe/components/ScribeBadge'

const ScribeEmptyState = () => {
  const theme = useTheme()
  const titleFit = useUnbrokenWords(i18n.t('scribe_emptyTitle'))
  const hasFinishedTurn = useScribeHasFinishedTurn()
  const availability = useScribeAvailability()
  const canSend = availability.status === 'available' && !availability.limited
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        paddingHorizontal: 12,
        paddingVertical: 32,
      }}
    >
      <ScribePill />
      <Text
        accessibilityRole='header'
        onTextLayout={titleFit.onTextLayout}
        style={{
          fontSize: theme.fontSize('2xl') * titleFit.scale,
          fontFamily: theme.fonts.bold,
          textAlign: 'center',
        }}
      >
        {i18n.t('scribe_emptyTitle')}
      </Text>
      {canSend && !hasFinishedTurn && (
        <View style={{ gap: 6, alignItems: 'center' }}>
          {(
            [
              'scribe_voiceExample1',
              'scribe_voiceExample2',
              'scribe_voiceExample3',
            ] as const
          ).map((key) => (
            <Text
              key={key}
              style={{
                fontSize: theme.fontSize('md'),
                color: theme.colors.textAlt,
                textAlign: 'center',
              }}
            >
              {i18n.t(key)}
            </Text>
          ))}
        </View>
      )}
    </View>
  )
}

export default ScribeEmptyState
