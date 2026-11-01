import type { ReactNode } from 'react'
import { View } from 'react-native'
import Card from '@/components/ui/Card'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'

export type ProfileCardDetail = {
  icon: AppIcon
  tint: string

  filled?: boolean
  text: string
}

const CARD_PADDING_V = 14
const CARD_PADDING_H = 16

export default function ProfileCardLayout({
  avatar,
  title,
  subtitle,
  trailing,
  details,
  footer,
}: {
  avatar: ReactNode

  title: ReactNode
  subtitle?: string

  trailing?: ReactNode
  details: ProfileCardDetail[]

  footer?: ReactNode
}) {
  const theme = useTheme()
  return (
    <Card
      style={{
        paddingVertical: CARD_PADDING_V,
        paddingHorizontal: CARD_PADDING_H,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {avatar}
        <View style={{ flex: 1 }}>
          {typeof title === 'string' ? (
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                fontSize: 16,
                color: theme.colors.text,
              }}
              numberOfLines={1}
            >
              {title}
            </Text>
          ) : (
            title
          )}
          {subtitle ? (
            <Text
              style={{
                fontSize: 12,
                color: theme.colors.textAlt,
                marginTop: 1,
              }}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        {trailing}
      </View>
      {details.map((detail) => (
        <View
          key={detail.text}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          <LucideIcon
            icon={detail.icon}
            size={11}
            color={detail.tint}
            fill={detail.filled ? detail.tint : undefined}
          />
          <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
            {detail.text}
          </Text>
        </View>
      ))}
      {footer}
    </Card>
  )
}
