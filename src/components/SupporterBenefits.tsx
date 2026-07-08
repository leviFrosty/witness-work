import {
  CloudUpload as CloudUploadIcon,
  FileText as FileTextIcon,
  Palette as PaletteIcon,
  Plus as PlusIcon,
  Shapes as ShapesIcon,
} from 'lucide-react-native'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'

const HeroCard = () => {
  const theme = useTheme()
  return (
    <View
      style={{
        borderRadius: theme.numbers.borderRadiusLg,
        backgroundColor: theme.colors.supporterTranslucent,
        borderWidth: 1,
        borderColor: theme.colors.supporter,
        padding: 16,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: theme.colors.supporter,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LucideIcon
            icon={CloudUploadIcon}
            size={18}
            color={theme.colors.textInverse}
          />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text
              style={{
                fontSize: theme.fontSize('lg'),
                fontFamily: theme.fonts.bold,
                color: theme.colors.text,
              }}
            >
              {i18n.t('supporterHeroTitle')}
            </Text>
          </View>
          <Text
            style={{
              fontSize: 13,
              color: theme.colors.textAlt,
              marginTop: 2,
              lineHeight: 18,
            }}
          >
            {i18n.t('supporterHeroDesc')}
          </Text>
        </View>
      </View>
    </View>
  )
}

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

interface Props {
  /** Hides the hero (iCloud sync) row. Useful in narrow contexts. */
  compact?: boolean
}

const SupporterBenefits = ({ compact }: Props) => {
  const theme = useTheme()

  return (
    <View style={{ gap: 16 }}>
      <Text
        style={{
          fontSize: 12,
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textAlt,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {i18n.t('supportersUnlock')}
      </Text>
      {!compact && <HeroCard />}
      <View style={{ gap: 14 }}>
        {/* <Text
          style={{
            fontSize: 12,
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.textAlt,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {i18n.t('supporterPerksLabel')}
        </Text> */}
        <PerkRow
          icon={FileTextIcon}
          title={i18n.t('supporterPerkAiTitle')}
          desc={i18n.t('supporterPerkAiDesc')}
        />
        <PerkRow
          icon={PaletteIcon}
          title={i18n.t('supporterPerkAccentTitle')}
          desc={i18n.t('supporterPerkAccentDesc')}
        />
        <PerkRow
          icon={ShapesIcon}
          title={i18n.t('supporterPerkAppIconTitle')}
          desc={i18n.t('supporterPerkAppIconDesc')}
        />
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
