import { View } from 'react-native'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { withAlpha } from '@/lib/color'
import { useOpenScribe } from '@/features/scribe/components/openScribe'
import ScribeMicOrb from '@/features/scribe/components/ScribeMicOrb'
import { ScribePill } from '@/features/scribe/components/ScribeBadge'

interface Props {
  /** Closes the menu it sits in before Scribe AI opens. */
  onAction: () => void
}

/**
 * "Speak an update" at the top of the "+" menu. Unlike the green manual rows on
 * purpose: a dark surface lit by the same orb the voice sheet opens with.
 * Hidden where Scribe AI is; offline it greys out and explains when tapped.
 */
const ScribeQuickActionRow = ({ onAction }: Props) => {
  const theme = useTheme()
  const scribe = useOpenScribe()
  if (scribe.hidden) return null
  return (
    <Button
      noTransform
      onPress={() => {
        onAction()
        scribe.open('plus_sheet')
      }}
      accessibilityLabel={i18n.t(
        scribe.offline ? 'scribe_orbOfflineLabel' : 'scribe_orbLabel'
      )}
      style={{
        minHeight: 76,
        borderRadius: theme.numbers.borderRadiusLg,
        backgroundColor: theme.colors.card,
        borderWidth: 1,
        borderColor: scribe.offline
          ? theme.colors.border
          : withAlpha(theme.colors.accent, 0x66),
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 4,
        paddingRight: 14,
        gap: 6,
        marginBottom: 6,
      }}
    >
      <ScribeMicOrb
        box={68}
        canvas={104}
        core={0.21}
        iconSize={18}
        offline={scribe.offline}
        surface={theme.colors.card}
        badgeOffset={8}
      />
      <View style={{ flex: 1, gap: 4 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            columnGap: 8,
            rowGap: 4,
          }}
        >
          <Text
            style={{
              fontSize: theme.fontSize('md') + 1,
              fontFamily: theme.fonts.semiBold,
              color: scribe.offline ? theme.colors.textAlt : theme.colors.text,
            }}
          >
            {i18n.t('scribe_speakAnUpdate')}
          </Text>
          <ScribePill compact />
        </View>
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
        >
          {i18n.t(
            scribe.offline
              ? 'scribe_offlineBadge'
              : 'scribe_speakAnUpdateSubtitle'
          )}
        </Text>
      </View>
      <LucideIcon
        icon={ChevronForwardIcon}
        size={18}
        color={theme.colors.textAlt}
      />
    </Button>
  )
}

export default ScribeQuickActionRow
