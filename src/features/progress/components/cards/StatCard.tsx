import type { ReactNode } from 'react'
import { View } from 'react-native'
import Card from '@/components/ui/Card'
import InfoPopover from '@/components/ui/InfoPopover'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import { tracking } from '@/lib/tracking'
import type { ProgressCardSize } from '@/lib/progressCards'

type Props = {
  icon: AppIcon
  title: string
  /** The headline figure, e.g. "1.3h". */
  value: string
  /** Small text after the value, e.g. "a day". */
  suffix?: string
  /** One line under the value. */
  caption?: string
  /** A second line, shown only when the card is wide. */
  detail?: string
  /** The value's color: the accent for good news, muted for nothing yet. */
  tone?: 'default' | 'accent' | 'muted'
  /** Optional help beside the title. */
  info?: string
  /** Drawn under the text, e.g. a bar. */
  footer?: ReactNode
  size: ProgressCardSize
}

/**
 * The shape most Progress cards share: a titled figure with a line or two of
 * context. Small cards stack it in one column; wide ones add `detail`.
 */
export default function StatCard({
  icon,
  title,
  value,
  suffix,
  caption,
  detail,
  tone = 'default',
  info,
  footer,
  size,
}: Props) {
  const theme = useTheme()
  const wide = size !== 'small'
  // At accessibility sizes the lines wrap in full rather than cut off.
  const lines = useAccessibilityTextSize() ? undefined : 2
  const valueColor =
    tone === 'accent'
      ? theme.colors.accent
      : tone === 'muted'
        ? theme.colors.textAlt
        : theme.colors.text

  return (
    <Card
      style={{
        flex: 1,
        paddingVertical: 14,
        paddingHorizontal: 14,
        gap: 6,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <LucideIcon icon={icon} size={13} color={theme.colors.accent} />
        <Text
          // Half-width cards in narrow columns wrap rather than truncate.
          numberOfLines={lines}
          style={{
            flexShrink: 1,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('xs'),
            color: theme.colors.textAlt,
            textTransform: 'uppercase',
            letterSpacing: tracking(0.5),
          }}
        >
          {title}
        </Text>
        {info ? <InfoPopover title={title} description={info} inline /> : null}
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          columnGap: 4,
        }}
      >
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={{
            flexShrink: 1,
            fontFamily: theme.fonts.bold,
            fontSize: theme.fontSize(wide ? '3xl' : '2xl'),
            color: valueColor,
          }}
        >
          {value}
        </Text>
        {suffix ? (
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {suffix}
          </Text>
        ) : null}
      </View>
      {caption ? (
        <Text
          numberOfLines={lines}
          style={{
            fontSize: theme.fontSize('xs'),
            color: theme.colors.textAlt,
          }}
        >
          {caption}
        </Text>
      ) : null}
      {wide && detail ? (
        <Text
          numberOfLines={lines}
          style={{
            fontSize: theme.fontSize('xs'),
            color: theme.colors.text,
          }}
        >
          {detail}
        </Text>
      ) : null}
      {footer ? <View style={{ marginTop: 'auto' }}>{footer}</View> : null}
    </Card>
  )
}
