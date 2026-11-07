import { Globe as GlobeIcon } from 'lucide-react-native'
import { useState, type ComponentType } from 'react'
import { Pressable, View, type PressableProps } from 'react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import { HoverTint } from '@/components/ui/PointerHover'
import links from '@/constants/links'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

const WebLink = Pressable as ComponentType<
  PressableProps & {
    href: string
    hrefAttrs: { target: '_blank'; rel: 'noopener noreferrer' }
  }
>

function StoreLink({ label, url }: { label: string; url: string }) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)
  const borderRadius = theme.numbers.borderRadiusSm
  return (
    <WebLink
      href={url}
      hrefAttrs={{ target: '_blank', rel: 'noopener noreferrer' }}
      accessibilityRole='link'
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={{
        flexGrow: 1,
        minHeight: 44,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius,
        borderWidth: 1,
        borderColor: theme.colors.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontSize: theme.fontSize('md'),
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.text,
        }}
      >
        {label}
      </Text>
      <HoverTint visible={hovered} borderRadius={borderRadius} />
    </WebLink>
  )
}

export default function WebRegionNotice() {
  const theme = useTheme()
  const stores = [
    {
      label: i18n.t('paywallRegionAppStoreWeb'),
      url: links.appStoreAnyStorefront,
    },
    { label: i18n.t('paywallRegionPlayStoreWeb'), url: links.playStore },
  ]
  return (
    <View
      style={{
        gap: 12,
        padding: 16,
        borderRadius: theme.numbers.borderRadiusMd,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.backgroundLightest,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <LucideIcon icon={GlobeIcon} size={18} color={theme.colors.text} />
        <Text
          accessibilityRole='header'
          style={{
            flexShrink: 1,
            fontSize: theme.fontSize('md'),
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.text,
          }}
        >
          {i18n.t('paywallRegionTitleWeb')}
        </Text>
      </View>
      <Text
        style={{
          fontSize: theme.fontSize('sm'),
          color: theme.colors.textAlt,
          lineHeight: 20,
        }}
      >
        {i18n.t('paywallRegionBodyWeb')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {stores.map(({ label, url }) => (
          <StoreLink key={url} label={label} url={url} />
        ))}
      </View>
    </View>
  )
}
