import type { ReactNode } from 'react'
import { StyleSheet, View, type TextProps, type ViewProps } from 'react-native'

import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'

type EmptyProps = ViewProps & {
  /** Draws a faint dashed outline around the empty surface. */
  dashedOutline?: boolean
} & (
    | {
        icon?: ReactNode
        title: string
        description?: ReactNode
        action?: ReactNode
        children?: never
      }
    | {
        children: ReactNode
        icon?: never
        title?: never
        description?: never
        action?: never
      }
  )

/** Centered empty surface, with shorthand props or shadcn-style composition. */
const Empty = ({
  icon,
  title,
  description,
  action,
  children,
  dashedOutline = false,
  style,
  ...props
}: EmptyProps) => {
  const theme = useTheme()

  return (
    <View
      {...props}
      style={[
        styles.empty,
        {
          borderWidth: dashedOutline ? 1 : 0,
          borderStyle: dashedOutline ? 'dashed' : 'solid',
          borderColor: theme.colors.border,
          borderRadius: theme.numbers.borderRadiusLg,
        },
        style,
      ]}
    >
      {title !== undefined ? (
        <>
          <EmptyHeader>
            {icon ? <EmptyMedia variant='icon'>{icon}</EmptyMedia> : null}
            <EmptyTitle>{title}</EmptyTitle>
            {description ? (
              <EmptyDescription>{description}</EmptyDescription>
            ) : null}
          </EmptyHeader>
          {action ? <EmptyContent>{action}</EmptyContent> : null}
        </>
      ) : (
        children
      )}
    </View>
  )
}

const EmptyHeader = ({ style, ...props }: ViewProps) => (
  <View {...props} style={[styles.header, style]} />
)

const EmptyMedia = ({
  variant = 'default',
  style,
  ...props
}: ViewProps & { variant?: 'default' | 'icon' }) => {
  const theme = useTheme()

  return (
    <View
      accessibilityElementsHidden={variant === 'icon'}
      importantForAccessibility={
        variant === 'icon' ? 'no-hide-descendants' : 'auto'
      }
      {...props}
      style={[
        styles.media,
        variant === 'icon' && [
          styles.icon,
          {
            backgroundColor: theme.colors.backgroundLighter,
            borderRadius: theme.numbers.borderRadiusMd,
          },
        ],
        style,
      ]}
    />
  )
}

const EmptyTitle = ({ style, ...props }: TextProps) => {
  const theme = useTheme()

  return (
    <Text
      accessibilityRole='header'
      {...props}
      style={[
        styles.text,
        { fontFamily: theme.fonts.semiBold, fontSize: theme.fontSize('lg') },
        style,
      ]}
    />
  )
}

const EmptyDescription = ({ style, ...props }: TextProps) => {
  const theme = useTheme()

  return (
    <Text
      {...props}
      style={[
        styles.text,
        { fontSize: theme.fontSize('sm'), color: theme.colors.textAlt },
        style,
      ]}
    />
  )
}

const EmptyContent = ({ style, ...props }: ViewProps) => (
  <View {...props} style={[styles.content, style]} />
)

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 24,
    width: '100%',
  },
  header: {
    alignItems: 'center',
    gap: 8,
    width: '100%',
    maxWidth: 320,
  },
  media: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  icon: {
    width: 48,
    height: 48,
  },
  text: {
    textAlign: 'center',
  },
  content: {
    alignItems: 'center',
    gap: 12,
    width: '100%',
    maxWidth: 320,
  },
})

export {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
}
export default Empty
