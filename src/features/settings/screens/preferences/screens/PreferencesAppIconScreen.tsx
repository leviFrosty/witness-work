import { useEffect, useMemo, useState } from 'react'
import { Image, Pressable, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faCheck } from '@fortawesome/free-solid-svg-icons'
import { useToastController } from '@tamagui/toast'
import Wrapper from '../../../../../components/layout/Wrapper'
import Text from '../../../../../components/MyText'
import IsSupporter from '../../../../../components/IsSupporter'
import useTheme from '../../../../../contexts/theme'
import i18n from '../../../../../lib/locales'
import { email } from '../../../../../constants/contactInformation'
import { openURL } from '../../../../../lib/links'
import {
  AppIconVariant,
  usePreferences,
} from '../../../../../stores/preferences'
import {
  applyAppIcon,
  determineHemisphere,
  isAppIconSupported,
  resolvePluginIcon,
} from '../../../lib/appIcon'
import type { Hemisphere } from '../../../../../lib/hemisphere'

const TILES = [
  {
    variant: 'Default',
    label: 'appIconDefault',
    preview: require('../../../../../assets/icon.png'),
  },
  {
    variant: 'Gold',
    label: 'appIconGold',
    preview: require('../../../../../assets/icons/Gold.png'),
  },
  {
    variant: 'Dark',
    label: 'appIconDark',
    preview: require('../../../../../assets/icons/Dark.png'),
  },
  {
    variant: 'Seasonal',
    label: 'appIconSeasonal',
    // Spring stands in as the seasonal preview; the actual rendered icon
    // rotates with the date once selected.
    preview: require('../../../../../assets/icons/SeasonalSpring.png'),
  },
  {
    variant: 'Minimalist',
    label: 'appIconMinimalist',
    preview: require('../../../../../assets/icons/Minimalist.png'),
  },
  {
    variant: 'Mono',
    label: 'appIconMono',
    preview: require('../../../../../assets/icons/Mono.png'),
  },
] as const satisfies ReadonlyArray<{
  variant: AppIconVariant
  label:
    | 'appIconDefault'
    | 'appIconGold'
    | 'appIconDark'
    | 'appIconSeasonal'
    | 'appIconMinimalist'
    | 'appIconMono'
  preview: number
}>

const ArtistCallout = () => {
  const theme = useTheme()
  return (
    <View
      style={{
        marginHorizontal: 20,
        padding: 16,
        borderRadius: theme.numbers.borderRadiusLg,
        backgroundColor: theme.colors.backgroundLighter,
        borderWidth: 1,
        borderColor: theme.colors.border,
        gap: 8,
      }}
    >
      <Text
        style={{
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('md'),
          color: theme.colors.text,
        }}
      >
        {i18n.t('appIconArtistCallTitle')}
      </Text>
      <Text
        style={{
          fontSize: theme.fontSize('sm'),
          color: theme.colors.textAlt,
          lineHeight: 20,
        }}
      >
        {i18n.t('appIconArtistCallDescription')}{' '}
        <Text
          onPress={() => openURL(`mailto:${email}`)}
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.accent,
            textDecorationLine: 'underline',
          }}
        >
          {email}
        </Text>
      </Text>
    </View>
  )
}

const PreferencesAppIconPicker = () => {
  const theme = useTheme()
  const toast = useToastController()
  const { customAppIcon, set } = usePreferences()
  const [hemisphere, setHemisphere] = useState<Hemisphere>('north')
  const [pending, setPending] = useState<AppIconVariant | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const h = await determineHemisphere()
      if (!cancelled) setHemisphere(h)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const supported = useMemo(() => isAppIconSupported(), [])

  const selected: AppIconVariant = customAppIcon ?? 'Default'

  const handlePick = async (variant: AppIconVariant) => {
    if (variant === selected) return
    if (!supported) {
      toast.show(i18n.t('appIconUnsupported'), { native: true })
      return
    }
    setPending(variant)
    try {
      await applyAppIcon(resolvePluginIcon(variant, hemisphere))
      set({ customAppIcon: variant === 'Default' ? null : variant })
    } catch {
      toast.show(i18n.t('appIconChangeFailed'), { native: true })
    } finally {
      setPending(null)
    }
  }

  return (
    <View style={{ gap: 24 }}>
      <View>
        <Text style={{ fontSize: 13, color: theme.colors.textAlt }}>
          {i18n.t('appIconScreenDescription')}
        </Text>
      </View>

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        {TILES.map((tile) => {
          const isSelected = selected === tile.variant
          const isPending = pending === tile.variant
          return (
            <Pressable
              key={tile.variant}
              onPress={() => handlePick(tile.variant)}
              disabled={pending !== null}
              style={{
                width: '47%',
                alignItems: 'center',
                gap: 8,
                opacity: pending !== null && !isPending ? 0.5 : 1,
              }}
              accessibilityRole='button'
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={i18n.t(tile.label)}
            >
              <View
                style={{
                  width: '100%',
                  aspectRatio: 1,
                  borderRadius: theme.numbers.borderRadiusLg,
                  overflow: 'hidden',
                  borderWidth: isSelected ? 3 : 1,
                  borderColor: isSelected
                    ? theme.colors.accent
                    : theme.colors.border,
                  backgroundColor: theme.colors.backgroundLighter,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {tile.preview && (
                  <Image
                    source={tile.preview}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode='cover'
                  />
                )}
                {isSelected && (
                  <View
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      backgroundColor: theme.colors.accent,
                      borderRadius: 999,
                      width: 28,
                      height: 28,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <FontAwesomeIcon
                      icon={faCheck}
                      size={14}
                      color={theme.colors.textInverse}
                    />
                  </View>
                )}
              </View>
              <Text
                style={{
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.text,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {i18n.t(tile.label)}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const PreferencesAppIconScreen = () => (
  <Wrapper insets='bottom'>
    <KeyboardAwareScrollView
      contentContainerStyle={{ gap: 24, paddingTop: 24, paddingBottom: 120 }}
    >
      <ArtistCallout />
      <View style={{ paddingHorizontal: 20 }}>
        <IsSupporter feature='customAppIcon'>
          <PreferencesAppIconPicker />
        </IsSupporter>
      </View>
    </KeyboardAwareScrollView>
  </Wrapper>
)

export default PreferencesAppIconScreen
