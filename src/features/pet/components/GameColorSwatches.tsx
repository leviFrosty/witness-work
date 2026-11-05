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

/** A swatch's circle, in points; its frame is a full touch target. */
const SWATCH = 30
/** The picked ring's width, and its gap from the circle. */
const RING = 2
/** The red "New" dot, in Shop pixels (as on the tabs). */
const DOT = 4

/** One colour in the row. */
export type GameColorSwatch = {
  key: string
  /** Its colour; null for a secret not found yet, shown as `?`. */
  color: Rgb | null
  /** What a screen reader says for it. */
  label: string
  /** Ringed: the one in use (the pet's details) or picked (the Shop). */
  picked: boolean
  /** Owned already, in the Shop: checked, and can't be picked. */
  owned?: boolean
  /** Owned and never picked on this install. */
  isNew?: boolean
}

/** Whether a check reads better dark than white over `color`. */
const isLight = (color: Rgb) => {
  const r = (color >> 16) & 0xff
  const g = (color >> 8) & 0xff
  const b = color & 0xff
  return 0.299 * r + 0.587 * g + 0.114 * b > 150
}

/**
 * A part's colours as a row of small circles, the way the app's accent colour
 * is picked, under the cards of what they colour (the wall's pattern), so the
 * cards are picked first and the colour after. The picked one is ringed; in the
 * Shop, owned ones are checked and a secret not found yet is a `?`. A "More in
 * Shop" circle can end the row.
 */
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
  /** How many more the Shop sells, and what opens it. */
  more?: { count: number; onPress: () => void } | null
  /** The pet's details pick (`radiogroup`); the Shop only shows (`none`). */
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
        // The frames touch; the circles sit a frame's margin apart.
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
