import { View } from 'react-native'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import {
  faCloudArrowUp,
  faPalette,
  faWandMagicSparkles,
} from '@fortawesome/free-solid-svg-icons'
import { IconProp } from '@fortawesome/fontawesome-svg-core'
import useTheme from '../contexts/theme'
import Text from './MyText'
import i18n from '../lib/locales'

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
          <FontAwesomeIcon
            icon={faCloudArrowUp}
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
            <View
              style={{
                paddingVertical: 2,
                paddingHorizontal: 6,
                borderRadius: 4,
                backgroundColor: theme.colors.supporter,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontFamily: theme.fonts.bold,
                  color: theme.colors.textInverse,
                  letterSpacing: 0.5,
                }}
              >
                {i18n.t('comingSoon').toUpperCase()}
              </Text>
            </View>
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

type PerkProps = { icon: IconProp; title: string; desc: string }

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
        <FontAwesomeIcon icon={icon} size={12} color={theme.colors.supporter} />
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
      {!compact && <HeroCard />}
      <View style={{ gap: 14 }}>
        <Text
          style={{
            fontSize: 12,
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.textAlt,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {i18n.t('supporterPerksLabel')}
        </Text>
        <PerkRow
          icon={faPalette}
          title={i18n.t('supporterPerkAccentTitle')}
          desc={i18n.t('supporterPerkAccentDesc')}
        />
        <PerkRow
          icon={faWandMagicSparkles}
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
