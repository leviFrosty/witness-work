import type { ReactNode } from 'react'
import { View } from 'react-native'
import { MessageSquareText as MessageSquareTextIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { mix, withAlpha } from '@/lib/color'
import i18n from '@/lib/locales'

/**
 * Where a Follow-up stands, as its card shows it. Until a visit keeps it, it's
 * an outline, sketched in dashes: gray while `planned` (with only a teal pill
 * saying how far off it is), amber once `missed`, and dimmer still once
 * dismissed or past (`quiet`). Going fills it in: `done` is the only filled,
 * teal card, so color comes from something the User did.
 */
export type FollowUpCardTone = 'planned' | 'missed' | 'done' | 'quiet'

/**
 * A Follow-up card's colors: its `fill` (none for an outline), the opaque
 * `surface` behind its content (so avatar rings can match it), its `border`,
 * `accent` for the pill, and `detail` for small text and icons.
 */
export function useFollowUpCardColors(tone: FollowUpCardTone) {
  const theme = useTheme()
  const outline = {
    fill: 'transparent',
    surface: theme.colors.background,
    dashed: true,
  }
  switch (tone) {
    case 'done':
      return {
        fill: mix(theme.colors.background, theme.colors.accent3, 0.11),
        surface: mix(theme.colors.background, theme.colors.accent3, 0.11),
        dashed: false,
        border: withAlpha(theme.colors.accent3, 0x80),
        accent: theme.colors.accent3,
        pill: withAlpha(theme.colors.accent3, 0x2e),
        detail: theme.colors.accent3,
      }
    case 'missed':
      return {
        ...outline,
        border: withAlpha(theme.colors.warn, 0x99),
        accent: theme.colors.warnText,
        pill: withAlpha(theme.colors.warn, 0x2e),
        detail: theme.colors.warnText,
      }
    case 'planned':
      return {
        ...outline,
        border: withAlpha(theme.colors.textAlt, 0x80),
        accent: theme.colors.accent3,
        pill: withAlpha(theme.colors.accent3, 0x1a),
        detail: theme.colors.textAlt,
      }
    case 'quiet':
      return {
        ...outline,
        border: withAlpha(theme.colors.textAlt, 0x4d),
        accent: theme.colors.textAlt,
        pill: theme.colors.border,
        detail: theme.colors.textAlt,
      }
  }
}

/**
 * The Follow-up's topic in its own labeled box, so it never has to fit a
 * sentence.
 */
export function FollowUpTopic({
  topic,
  tone,
}: {
  topic: string
  tone: FollowUpCardTone
}) {
  const theme = useTheme()
  const { detail } = useFollowUpCardColors(tone)
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 8,
        padding: 10,
        borderRadius: theme.numbers.borderRadiusSm,
        backgroundColor: withAlpha(theme.colors.text, 0x0a),
      }}
    >
      <LucideIcon
        icon={MessageSquareTextIcon}
        size={16}
        color={detail}
        style={{ marginTop: 1 }}
      />
      <View style={{ flex: 1, gap: 1 }}>
        <Text
          style={{
            fontSize: theme.fontSize('xs') + 0.5,
            fontFamily: theme.fonts.bold,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            color: detail,
          }}
        >
          {i18n.t('topic')}
        </Text>
        <Text selectable>{topic}</Text>
      </View>
    </View>
  )
}

/**
 * A Follow-up as a card: a pill saying how far off it is ("In 2 days", "A day
 * ago"), then whatever the host puts in it, outlined until a visit keeps it and
 * filled in once one does. The User's own (Visit Details) and a buddy's
 * invitation share it.
 */
export default function FollowUpCard({
  tone,
  pill,
  children,
}: {
  tone: FollowUpCardTone
  pill?: string
  children: ReactNode
}) {
  const theme = useTheme()
  const colors = useFollowUpCardColors(tone)
  return (
    <View
      style={{
        borderRadius: theme.numbers.borderRadiusLg,
        padding: 14,
        gap: 10,
        borderWidth: colors.dashed ? 1.5 : 1,
        borderStyle: colors.dashed ? 'dashed' : 'solid',
        borderColor: colors.border,
        backgroundColor: colors.fill,
      }}
    >
      {pill ? (
        <View
          style={{
            alignSelf: 'flex-start',
            borderRadius: 999,
            paddingHorizontal: 8,
            paddingVertical: 2,
            backgroundColor: colors.pill,
          }}
        >
          <Text
            style={{
              fontSize: theme.fontSize('xs') + 1,
              fontFamily: theme.fonts.bold,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              color: colors.accent,
            }}
          >
            {pill}
          </Text>
        </View>
      ) : null}
      {children}
    </View>
  )
}
