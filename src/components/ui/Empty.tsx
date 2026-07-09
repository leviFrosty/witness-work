import { ReactNode } from 'react'
import { View } from 'react-native'

import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'

interface EmptyProps {
  /** Optional illustrative icon / graphic rendered above the title. */
  icon?: ReactNode
  /** Short, focused headline describing what's missing. */
  title: string
  /** Optional supporting copy beneath the title. */
  description?: string
  /** Optional call-to-action (button, link, etc.) rendered below the copy. */
  action?: ReactNode
  /** Draws a faint dashed outline around the empty surface. */
  dashedOutline?: boolean
}

/**
 * Small, reusable empty-state component. Shadcn-flavored: centered column,
 * generous padding, subdued palette. Used across the new Progress subscreens
 * for zero-data surfaces (e.g. All-time tab with no reports yet).
 */
const Empty = ({
  icon,
  title,
  description,
  action,
  dashedOutline,
}: EmptyProps) => {
  const theme = useTheme()

  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
        paddingHorizontal: 24,
        gap: 12,
        borderWidth: dashedOutline ? 1 : 0,
        borderStyle: dashedOutline ? 'dashed' : undefined,
        borderColor: theme.colors.border,
        borderRadius: theme.numbers.borderRadiusLg,
      }}
    >
      {icon ? (
        <View
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 4,
            opacity: 0.6,
          }}
        >
          {icon}
        </View>
      ) : null}
      <Text
        style={{
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('lg'),
          color: theme.colors.text,
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      {description ? (
        <Text
          style={{
            fontFamily: theme.fonts.regular,
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
            textAlign: 'center',
            maxWidth: 320,
          }}
        >
          {description}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: 8 }}>{action}</View> : null}
    </View>
  )
}

export default Empty
