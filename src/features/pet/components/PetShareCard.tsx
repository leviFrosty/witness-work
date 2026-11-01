import { useState, type Ref } from 'react'
import { Image, PixelRatio, View } from 'react-native'
import { CalendarHeart, Flame } from 'lucide-react-native'
import AppWordmark from '@/components/AppWordmark'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'
import { scaleNearest, type PixelBuffer } from '@/lib/pixelArt'
import {
  HEART_ICON_H,
  heartsRow,
  VIEW_CARD,
  type PlayerInput,
} from '@/features/pet/art'
import { ROOM_TAB_ICONS } from '@/features/pet/components/roomTabIcons'
import { petShareImage, type PetShareStats } from '@/features/pet/lib/share'
import { bufferToPngBase64 } from '@/features/pet/render/skiaImage'

const PAD = 16

const HEARTS_H = 14

const MAX_ROOM_SCALE = 12

const pngSource = (buffer: PixelBuffer, scale: number) => {
  const png = bufferToPngBase64(scaleNearest(buffer, scale))
  return png ? { uri: `data:image/png;base64,${png}` } : null
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: AppIcon
  value: number
  label: string
}) {
  const theme = useTheme()
  return (
    <View
      accessible
      accessibilityLabel={`${value} ${label}`}
      style={{ flex: 1, alignItems: 'center', gap: 2 }}
    >
      <LucideIcon icon={icon} size={18} color={theme.colors.accent} />
      <Text
        style={{
          fontSize: theme.fontSize('xl'),
          fontFamily: theme.fonts.bold,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontSize: theme.fontSize('xs'),
          color: theme.colors.textAlt,
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
    </View>
  )
}

export default function PetShareCard({
  input,
  name,
  hearts,
  gold,
  stats,
  showSign,
  maxWidth,
  ref,
}: {
  input: PlayerInput
  name: string
  hearts: number
  gold: boolean
  stats: PetShareStats

  showSign: boolean

  maxWidth: number
  ref?: Ref<View>
}) {
  const theme = useTheme()
  const ratio = PixelRatio.get()
  const roomScale = Math.max(
    1,
    Math.min(
      MAX_ROOM_SCALE,
      Math.floor(((maxWidth - PAD * 2) * ratio) / VIEW_CARD[2])
    )
  )
  const roomWidth = (VIEW_CARD[2] * roomScale) / ratio
  const heartsScale = Math.max(1, Math.round((HEARTS_H * ratio) / HEART_ICON_H))

  const [images] = useState(() => {
    const row = heartsRow(hearts, gold)
    return {
      room: pngSource(petShareImage(input, 1), roomScale),
      roomWithSign: pngSource(petShareImage(input, 1, true), roomScale),
      hearts: pngSource(row, heartsScale),
      heartsSize: {
        width: (row.width * heartsScale) / ratio,
        height: (row.height * heartsScale) / ratio,
      },
    }
  })

  const streakLabel =
    stats.streak &&
    i18n.t(
      (stats.streak.kind === 'plans'
        ? 'pet.shareCard.streakPlans'
        : 'pet.shareCard.streakMonths') as TranslationKey,
      { count: stats.streak.count }
    )

  return (
    <View
      ref={ref}
      collapsable={false}
      style={{
        alignSelf: 'center',
        width: roomWidth + PAD * 2,
        padding: PAD,
        gap: 14,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.backgroundLighter,
      }}
    >
      {images.room && images.roomWithSign && (
        <Image
          source={showSign ? images.roomWithSign : images.room}
          accessibilityLabel={i18n.t('pet.a11y.scene', { name })}
          style={{
            width: roomWidth,
            height: (VIEW_CARD[3] * roomScale) / ratio,
            borderRadius: theme.numbers.borderRadiusMd,
          }}
        />
      )}
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: theme.fontSize('2xl'),
            fontFamily: theme.fonts.bold,
          }}
        >
          {name}
        </Text>
        {images.hearts && (
          <Image
            source={images.hearts}
            accessibilityLabel={i18n.t('pet.a11y.hearts', { count: hearts })}
            style={images.heartsSize}
          />
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {stats.streak && streakLabel && (
          <Stat icon={Flame} value={stats.streak.count} label={streakLabel} />
        )}
        <Stat
          icon={CalendarHeart}
          value={stats.daysTogether}
          label={i18n.t('pet.shareCard.together' as TranslationKey, {
            count: stats.daysTogether,
          })}
        />
        {stats.hats > 0 && (
          <Stat
            icon={ROOM_TAB_ICONS.hat}
            value={stats.hats}
            label={i18n.t('pet.shareCard.hats' as TranslationKey, {
              count: stats.hats,
            })}
          />
        )}
      </View>
      <View style={{ paddingTop: 2 }}>
        <AppWordmark size={22} />
      </View>
    </View>
  )
}
