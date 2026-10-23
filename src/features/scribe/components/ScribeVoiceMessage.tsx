import { ScrollView, View } from 'react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import useUnbrokenWords from '@/hooks/useUnbrokenWords'

interface Action {
  label: string
  onPress: () => void
}

interface Props {
  icon: AppIcon
  tone?: 'accent' | 'warn'
  title?: string
  body: string
  primary: Action
  secondary?: Action
}

/**
 * What the voice sheet shows instead of the orb when it needs something from
 * the User: microphone priming, access turned off, an error, or nothing heard.
 */
const ScribeVoiceMessage = ({
  icon,
  tone = 'accent',
  title,
  body,
  primary,
  secondary,
}: Props) => {
  const theme = useTheme()
  const titleFit = useUnbrokenWords(title ?? '')
  const bodyFit = useUnbrokenWords(body)
  const color = tone === 'warn' ? theme.colors.warnText : theme.colors.accent
  return (
    // Scrolls when large text makes it taller than the sheet, so its buttons
    // stay reachable.
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: 24,
        paddingVertical: 12,
        gap: 24,
      }}
    >
      <View style={{ alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor:
              tone === 'warn'
                ? theme.colors.warnTranslucent
                : theme.colors.accentTranslucent,
          }}
        >
          <LucideIcon icon={icon} size={28} color={color} />
        </View>
        {title ? (
          <Text
            accessibilityRole='header'
            onTextLayout={titleFit.onTextLayout}
            style={{
              fontSize: theme.fontSize('xl') * titleFit.scale,
              fontFamily: theme.fonts.bold,
              textAlign: 'center',
            }}
          >
            {title}
          </Text>
        ) : null}
        <Text
          onTextLayout={bodyFit.onTextLayout}
          style={{
            fontSize: (theme.fontSize('md') + 1) * bodyFit.scale,
            color: title ? theme.colors.textAlt : theme.colors.text,
            fontFamily: title ? theme.fonts.regular : theme.fonts.semiBold,
            textAlign: 'center',
            lineHeight: 22 * bodyFit.scale,
          }}
        >
          {body}
        </Text>
      </View>
      <View style={{ gap: 6 }}>
        <Button
          noTransform
          onPress={primary.onPress}
          style={{
            minHeight: 52,
            paddingHorizontal: 20,
            paddingVertical: 10,
            borderRadius: 999,
            backgroundColor: theme.colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              fontSize: theme.fontSize('lg'),
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textInverse,
              textAlign: 'center',
            }}
          >
            {primary.label}
          </Text>
        </Button>
        {secondary ? (
          <Button
            noTransform
            onPress={secondary.onPress}
            style={{
              minHeight: 48,
              paddingHorizontal: 20,
              paddingVertical: 8,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'transparent',
              borderRadius: 999,
            }}
          >
            <Text
              style={{
                fontSize: theme.fontSize('md') + 1,
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.accent,
                textAlign: 'center',
              }}
            >
              {secondary.label}
            </Text>
          </Button>
        ) : null}
      </View>
    </ScrollView>
  )
}

export default ScribeVoiceMessage
