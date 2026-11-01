import type { ReactNode } from 'react'
import { View } from 'react-native'
import { MessageSquareText as MessageSquareTextIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { mix, withAlpha } from '@/lib/color'
import i18n from '@/lib/locales'
import { tracking } from '@/lib/tracking'

export type FollowUpCardTone = 'planned' | 'missed' | 'done' | 'quiet'

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
            letterSpacing: tracking(0.5),
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
              letterSpacing: tracking(0.5),
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
