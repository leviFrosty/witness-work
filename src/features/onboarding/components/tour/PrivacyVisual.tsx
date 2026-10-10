import { ComponentType } from 'react'
import { Platform, View } from 'react-native'
import Animated, {
  DerivedValue,
  useAnimatedStyle,
} from 'react-native-reanimated'
import useTheme from '@/contexts/theme'
import { withAlpha } from '@/lib/color'
import i18n, { TranslationKey } from '@/lib/locales'
import {
  ExportIllustration,
  OfflineIllustration,
  OnDeviceIllustration,
  type PrivacyIllustrationProps,
  ShareLinkIllustration,
} from '@/features/onboarding/components/PrivacyIllustrations'
import { WelcomePalette } from '@/features/onboarding/lib/welcomePalette'
import {
  RevealVisualProps,
  VISUAL,
  VisualText,
  backOut,
  seg,
  useVisualClock,
} from '@/features/updates/components/reveal/visuals/kit'

const GAP = 8
const TILE = {
  width: (VISUAL.width - GAP) / 2,
  height: (VISUAL.height - GAP) / 2,
}

interface Promise {
  id: string
  Illustration: ComponentType<PrivacyIllustrationProps>
  titleKey: TranslationKey
  color: string
}

/**
 * Privacy, by design: the four promises from the privacy sketches — works
 * offline, stays on the device, shares by link, exports anytime — popping in as
 * tiles, each acting out its promise.
 */
const PrivacyVisual = ({
  palette,
  active,
  reduceMotion,
}: RevealVisualProps) => {
  const theme = useTheme()
  const { intro } = useVisualClock({
    active,
    reduceMotion,
    introMs: 900,
    loopMs: 4000,
    restAt: 0,
  })
  const promises: Promise[] = [
    {
      id: 'offline',
      Illustration: OfflineIllustration,
      titleKey: 'privacyOfflineTitle',
      color: theme.colors.accent,
    },
    {
      id: 'on-device',
      Illustration: OnDeviceIllustration,
      titleKey:
        Platform.OS === 'android'
          ? 'privacyOnDeviceTitleAndroid'
          : 'privacyOnDeviceTitle',
      color: theme.colors.indigo,
    },
    {
      id: 'share-in-link',
      Illustration: ShareLinkIllustration,
      titleKey: 'privacyShareInLinkTitle',
      color: theme.colors.teal,
    },
    {
      id: 'your-data',
      Illustration: ExportIllustration,
      titleKey: 'privacyYourDataTitle',
      color: theme.colors.purple,
    },
  ]

  return (
    <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
      {promises.map((promise, index) => (
        <Tile
          key={promise.id}
          promise={promise}
          index={index}
          intro={intro}
          palette={palette}
          // Only the page on screen plays its sketches.
          still={reduceMotion || !active}
        />
      ))}
    </View>
  )
}

const Tile = ({
  promise: { Illustration, titleKey, color },
  index,
  intro,
  palette,
  still,
}: {
  promise: Promise
  index: number
  intro: DerivedValue<number>
  palette: WelcomePalette
  still: boolean
}) => {
  const style = useAnimatedStyle(() => {
    const p = seg(intro.value, index * 0.15, index * 0.15 + 0.55)
    return {
      opacity: Math.min(1, p * 2),
      transform: [{ scale: 0.6 + 0.4 * backOut(p) }],
    }
  })
  return (
    <Animated.View
      style={[
        {
          width: TILE.width,
          height: TILE.height,
          borderRadius: 18,
          borderCurve: 'continuous',
          borderWidth: 1,
          borderColor: palette.surfaceBorder,
          backgroundColor: palette.surface,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: withAlpha(color, 0x14),
        }}
      >
        <Illustration color={color} reduceMotion={still} />
      </View>
      <VisualText
        numberOfLines={2}
        style={{
          paddingHorizontal: 10,
          paddingVertical: 8,
          fontSize: 11,
          lineHeight: 14,
          color: palette.text,
        }}
      >
        {i18n.t(titleKey)}
      </VisualText>
    </Animated.View>
  )
}

export default PrivacyVisual
