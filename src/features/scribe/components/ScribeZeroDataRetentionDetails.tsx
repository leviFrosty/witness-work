import { View } from 'react-native'
import {
  CircleCheck as CircleCheckIcon,
  ServerOff as ServerOffIcon,
  ShieldCheck as ShieldCheckIcon,
  Smartphone as SmartphoneIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import links from '@/constants/links'
import useTheme from '@/contexts/theme'
import { openURL } from '@/lib/links'
import i18n from '@/lib/locales'

const POINTS = [
  {
    icon: ServerOffIcon,
    title: 'scribe_zdrNothingStoredTitle',
    body: 'scribe_zdrNothingStoredBody',
  },
  {
    icon: ShieldCheckIcon,
    title: 'scribe_zdrNoTrainingTitle',
    body: 'scribe_zdrNoTrainingBody',
  },
  {
    icon: SmartphoneIcon,
    title: 'scribe_zdrOnDeviceTitle',
    body: 'scribe_zdrOnDeviceBody',
  },
  {
    icon: CircleCheckIcon,
    title: 'scribe_zdrInControlTitle',
    body: 'scribe_zdrInControlBody',
  },
] as const

export function ScribeZeroDataRetentionHeading() {
  const theme = useTheme()
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text
        accessibilityRole='header'
        style={{
          fontSize: theme.fontSize('xl'),
          fontFamily: theme.fonts.bold,
          color: theme.colors.text,
        }}
      >
        {i18n.t('scribe_zdrTitle')}
      </Text>
      <Text
        style={{
          fontSize: theme.fontSize('sm'),
          color: theme.colors.textAlt,
          lineHeight: 20,
        }}
      >
        {i18n.t('scribe_zdrIntro')}
      </Text>
    </View>
  )
}

export default function ScribeZeroDataRetentionDetails() {
  const theme = useTheme()
  return (
    <>
      <View style={{ gap: 18 }}>
        {POINTS.map((point) => (
          <View
            key={point.title}
            accessible
            style={{ flexDirection: 'row', gap: 14 }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: theme.colors.accentTranslucent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <LucideIcon
                icon={point.icon}
                size={20}
                color={theme.colors.accent}
              />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                style={{
                  fontSize: theme.fontSize('md'),
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.text,
                }}
              >
                {i18n.t(point.title)}
              </Text>
              <Text
                style={{
                  fontSize: theme.fontSize('sm'),
                  color: theme.colors.textAlt,
                  lineHeight: 20,
                }}
              >
                {i18n.t(point.body)}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <Button
        noTransform
        accessibilityRole='link'
        onPress={() => openURL(links.openRouterZdr)}
        style={{
          minHeight: 48,
          paddingHorizontal: 20,
          paddingVertical: 8,
          borderRadius: 999,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'transparent',
        }}
      >
        <Text
          style={{
            fontSize: theme.fontSize('md'),
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.accent,
            textAlign: 'center',
          }}
        >
          {i18n.t('scribe_zdrPolicyLink')}
        </Text>
      </Button>
    </>
  )
}
