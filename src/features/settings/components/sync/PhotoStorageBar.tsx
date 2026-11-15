import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import {
  PHOTO_STORAGE_CATEGORIES,
  type PhotoStorageCategory,
  type PhotoStorageTotals,
} from '@/app/sync/photoStorageModel'
import { formatBytes } from '@/lib/formatBytes'
import i18n, { type TranslationKey } from '@/lib/locales'

type Theme = ReturnType<typeof useTheme>

export const PHOTO_STORAGE_LABEL = {
  contacts: 'photoStorage_contacts',
  notes: 'photoStorage_notes',
  profile: 'photoStorage_profile',
  recentlyDeleted: 'photoStorage_recentlyDeleted',
  unused: 'photoStorage_unused',
  other: 'photoStorage_otherPhotos',
} as const satisfies Record<PhotoStorageCategory, TranslationKey>

export const photoStorageColor = (
  theme: Theme,
  category: PhotoStorageCategory
): string =>
  ({
    contacts: theme.colors.info,
    notes: theme.colors.orange,
    profile: theme.colors.teal,
    recentlyDeleted: theme.colors.pink,
    unused: theme.colors.warn,
    other: theme.colors.purple,
  })[category]

export const photoStorageFreeColor = (theme: Theme): string =>
  theme.colors.textAlt

const MIN_SEGMENT_WIDTH = 4

export default function PhotoStorageBar({
  categories,
  used,
  limit,
  height = 14,
  legend = true,
}: {
  categories: Record<PhotoStorageCategory, PhotoStorageTotals> | null
  used: number
  limit: number
  height?: number
  legend?: boolean
}) {
  const theme = useTheme()
  const total = Math.max(limit, used, 1)
  const shown = PHOTO_STORAGE_CATEGORIES.filter(
    (category) => (categories?.[category].bytes ?? 0) > 0
  )
  const free = Math.max(0, limit - used)

  return (
    <View style={{ gap: 10 }}>
      <View
        testID='photo-storage-bar'
        accessible
        accessibilityRole='progressbar'
        accessibilityLabel={i18n.t('cloudSyncPhotoStorage_usage', {
          used: formatBytes(used),
          limit: formatBytes(limit),
        })}
        accessibilityValue={{ min: 0, max: total, now: used }}
        style={{
          flexDirection: 'row',
          height,
          borderRadius: height / 2,
          overflow: 'hidden',
          gap: 2,
        }}
      >
        {categories
          ? shown.map((category) => (
              <View
                key={category}
                testID={`photo-storage-bar-${category}`}
                style={{
                  flexGrow: categories[category].bytes / total,
                  flexBasis: 0,
                  minWidth: MIN_SEGMENT_WIDTH,
                  backgroundColor: photoStorageColor(theme, category),
                }}
              />
            ))
          : used > 0 && (
              <View
                style={{
                  flexGrow: used / total,
                  flexBasis: 0,
                  minWidth: MIN_SEGMENT_WIDTH,
                  backgroundColor: theme.colors.indigo,
                }}
              />
            )}
        {free > 0 && (
          <View
            testID='photo-storage-bar-free'
            style={{
              flexGrow: free / total,
              flexBasis: 0,
              minWidth: MIN_SEGMENT_WIDTH,
              backgroundColor: photoStorageFreeColor(theme),
            }}
          />
        )}
      </View>
      {legend && (shown.length > 0 || free > 0) && (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            columnGap: 14,
            rowGap: 6,
          }}
        >
          {shown.map((category) => (
            <LegendItem
              key={category}
              color={photoStorageColor(theme, category)}
              label={i18n.t(PHOTO_STORAGE_LABEL[category])}
            />
          ))}
          {free > 0 && (
            <LegendItem
              color={photoStorageFreeColor(theme)}
              label={i18n.t('photoStorage_free')}
            />
          )}
        </View>
      )}
    </View>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View
        style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }}
      />
      <Text
        style={{ fontSize: theme.fontSize('xs'), color: theme.colors.textAlt }}
      >
        {label}
      </Text>
    </View>
  )
}
