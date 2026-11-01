import { View } from 'react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'
import type { Rgb } from '@/lib/pixelArt'
import { cssColor, type GamePalette } from '@/features/pet/art/gameUi'
import { GameIcon } from '@/features/pet/components/GameControls'
import { gamePixelScale } from '@/features/pet/components/GamePixels'

const SWATCH = 30

const RING = 2

const DOT = 4

export type GameColorSwatch = {
  key: string

  color: Rgb | null

  label: string

  picked: boolean

  owned?: boolean

  isNew?: boolean
}

const isLight = (color: Rgb) => {
  const r = (color >> 16) & 0xff
  const g = (color >> 8) & 0xff
  const b = color & 0xff
  return 0.299 * r + 0.587 * g + 0.114 * b > 150
}

export default function GameColorSwatches({
  swatches,
  onPress,
  palette,
  more,
  accessibilityRole = 'radiogroup',
}: {
  swatches: readonly GameColorSwatch[]
  onPress: (key: string) => void
  palette: GamePalette

  more?: { count: number; onPress: () => void } | null

  accessibilityRole?: 'radiogroup' | 'none'
}) {
  const theme = useTheme()
  const scale = gamePixelScale()
  const ink = palette.ink
  const ring = RING + SWATCH + RING
  const frame = Math.max(ring + 2 * RING, MIN_TOUCH_TARGET)
  const radio = accessibilityRole === 'radiogroup'
  return (
    <View
      accessibilityRole={radio ? 'radiogroup' : undefined}
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',

        marginHorizontal: -(frame - ring) / 2,
      }}
    >
      {swatches.map((swatch) => {
        const { color, owned = false } = swatch
        return (
          <Button
            key={swatch.key}
            onPress={() => onPress(swatch.key)}
            disabled={owned}
            pointerEffect='highlight'
            accessibilityRole={radio ? 'radio' : 'button'}
            accessibilityState={
              radio ? { checked: swatch.picked } : { selected: swatch.picked }
            }
            accessibilityLabel={
              swatch.isNew
                ? i18n.t('pet.room.secret.newA11y', { option: swatch.label })
                : swatch.label
            }
            style={{
              width: frame,
              height: frame,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: ring,
                height: ring,
                borderRadius: ring / 2,
                borderWidth: RING,
                borderColor: swatch.picked ? ink : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: SWATCH - RING,
                  height: SWATCH - RING,
                  borderRadius: SWATCH / 2,
                  backgroundColor: cssColor(color ?? palette.pill),
                  borderWidth: 1,
                  borderColor: cssColor(palette.cardEdge),
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: owned ? 0.6 : 1,
                }}
              >
                {color === null ? (
                  <Text
                    style={{
                      fontSize: 14,
                      fontFamily: theme.fonts.bold,
                      color: palette.inkAlt,
                    }}
                  >
                    ?
                  </Text>
                ) : owned ? (
                  <GameIcon
                    name='check'
                    color={isLight(color) ? '#211d1a' : '#ffffff'}
                  />
                ) : null}
              </View>
              {swatch.isNew && (
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    end: 0,
                    width: DOT * scale,
                    height: DOT * scale,
                    borderRadius: (DOT * scale) / 2,
                    backgroundColor: cssColor(palette.newFill),
                  }}
                />
              )}
            </View>
          </Button>
        )
      })}
      {more && (
        <Button
          onPress={more.onPress}
          pointerEffect='highlight'
          accessibilityRole='button'
          accessibilityLabel={`${i18n.t('pet.locker.moreInShop')}, ${i18n.t(
            'pet.locker.moreCount' as TranslationKey,
            { count: more.count }
          )}`}
          style={{
            width: frame,
            height: frame,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              width: SWATCH - RING,
              height: SWATCH - RING,
              borderRadius: SWATCH / 2,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: palette.inkAlt,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <GameIcon name='shop' color={palette.inkAlt} />
          </View>
        </Button>
      )}
    </View>
  )
}
