import {
  Palette as PaletteIcon,
  Plus as PlusIcon,
  Route as RouteIcon,
  Shapes as ShapesIcon,
  Sparkles as SparklesIcon,
} from 'lucide-react-native'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import { Platform, View } from 'react-native'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'
import { tracking } from '@/lib/tracking'
import { useScribeOffered } from '@/hooks/useScribeEnabled'

type PerkProps = { icon: AppIcon; title: string; desc: string }

const PerkRow = ({ icon, title, desc }: PerkProps) => {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: theme.colors.supporterTranslucent,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 2,
        }}
      >
        <LucideIcon icon={icon} size={12} color={theme.colors.supporter} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 14,
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.text,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: theme.colors.textAlt,
            marginTop: 2,
            lineHeight: 16,
          }}
        >
          {desc}
        </Text>
      </View>
    </View>
  )
}

const SupporterBenefits = () => {
  const theme = useTheme()
  const scribeOffered = useScribeOffered()

  return (
    <View style={{ gap: 16 }}>
      <Text
        style={{
          fontSize: 12,
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textAlt,
          textTransform: 'uppercase',
          letterSpacing: tracking(0.5),
        }}
      >
        {i18n.t('supportersUnlock')}
      </Text>
      <View style={{ gap: 14 }}>
        {scribeOffered && (
          <PerkRow
            icon={SparklesIcon}
            title={i18n.t('supporterPerkAiTitle')}
            desc={i18n.t('supporterPerkAiDesc')}
          />
        )}
        <PerkRow
          icon={RouteIcon}
          title={i18n.t('supporterPerkRouteTitle')}
          desc={i18n.t('supporterPerkRouteDesc')}
        />
        <PerkRow
          icon={PaletteIcon}
          title={i18n.t('supporterPerkAccentTitle')}
          desc={i18n.t('supporterPerkAccentDesc')}
        />
        {Platform.OS === 'ios' && (
          <PerkRow
            icon={ShapesIcon}
            title={i18n.t('supporterPerkAppIconTitle')}
            desc={i18n.t('supporterPerkAppIconDesc')}
          />
        )}
        <PerkRow
          icon={PlusIcon}
          title={i18n.t('supporterPerkMoreTitle')}
          desc={i18n.t('supporterPerkMoreDesc')}
        />
      </View>
      <View
        style={{
          marginTop: 6,
          padding: 12,
          borderRadius: theme.numbers.borderRadiusMd,
          backgroundColor: theme.colors.backgroundLighter,
        }}
      >
        <Text
          style={{
            fontSize: 12,
            color: theme.colors.textAlt,
            lineHeight: 17,
            textAlign: 'center',
          }}
        >
          {i18n.t('supporterAlwaysFreeNote')}
        </Text>
      </View>
    </View>
  )
}

export default SupporterBenefits
