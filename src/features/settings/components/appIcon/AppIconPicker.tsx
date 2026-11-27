import { useEffect, useState } from 'react'
import { View } from 'react-native'
import Section from '@/components/ui/inputs/Section'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'
import { toast } from '@/stores/toasts'
import { usePreferences, type AppIconVariant } from '@/stores/preferences'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import AppIconTile, {
  TILE_INSET,
} from '@/features/settings/components/appIcon/AppIconTile'
import {
  SEASON_ICONS,
  applyAppIcon,
  determineHemisphere,
  isAppIconSupported,
  resolvePluginIcon,
} from '@/features/settings/lib/appIcon'
import {
  APP_ICON_GROUPS,
  type AppIconGroup,
} from '@/features/settings/lib/appIconCatalog'
import { APP_ICON_PREVIEWS } from '@/features/settings/lib/appIconPreviews'
import { seasonFor, type Hemisphere } from '@/features/settings/lib/hemisphere'

const MIN_ICON = 64
const MIN_COLUMNS = 4
const COLUMN_GAP = 8
const ROW_GAP = 14
const SECTION_PADDING = 12
const GROUP_GAP = 24

const gridMetrics = (width: number) => {
  const inner = width - SECTION_PADDING * 2
  const tile = MIN_ICON + TILE_INSET * 2
  const columns = Math.max(
    MIN_COLUMNS,
    Math.floor((inner + COLUMN_GAP) / (tile + COLUMN_GAP))
  )
  const iconSize =
    (inner - COLUMN_GAP * (columns - 1)) / columns - TILE_INSET * 2
  return { iconSize: Math.floor(iconSize) }
}

const AppIconPicker = () => {
  const theme = useTheme()
  const customAppIcon = usePreferences((s) => s.customAppIcon)
  const set = usePreferences((s) => s.set)
  const [hemisphere, setHemisphere] = useState<Hemisphere>('north')
  const [pending, setPending] = useState<AppIconVariant | null>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    let cancelled = false
    void determineHemisphere().then((h) => {
      if (!cancelled) setHemisphere(h)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const selected: AppIconVariant = customAppIcon ?? 'Default'

  const previewFor = (variant: AppIconVariant) =>
    APP_ICON_PREVIEWS[
      variant === 'Seasonal'
        ? SEASON_ICONS[seasonFor(new Date(), hemisphere)]
        : variant
    ]

  const handlePick = async (variant: AppIconVariant, group: AppIconGroup) => {
    if (variant === selected) return
    if (!isAppIconSupported()) {
      toast.error(i18n.t('appIconUnsupported'))
      return
    }
    setPending(variant)
    try {
      await applyAppIcon(resolvePluginIcon(variant, hemisphere))
      set({ customAppIcon: variant === 'Default' ? null : variant })
      void Haptics.success()
      analytics.capture('app_icon_changed', { icon: variant, group: group.id })
    } catch {
      toast.error(i18n.t('appIconChangeFailed'))
    } finally {
      setPending(null)
    }
  }

  const { iconSize } = gridMetrics(width)

  return (
    <View
      style={{ gap: GROUP_GAP }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <Text style={{ fontSize: 13, color: theme.colors.textAlt }}>
        {i18n.t('appIconScreenDescription')}
      </Text>
      {APP_ICON_GROUPS.map((group) => (
        <View key={group.id}>
          <SectionTitle text={i18n.t(group.title)} />
          <Section>
            <View
              style={{
                padding: SECTION_PADDING,
                flexDirection: 'row',
                flexWrap: 'wrap',
                columnGap: COLUMN_GAP,
                rowGap: ROW_GAP,
              }}
            >
              {width > 0 &&
                group.options.map((option) => (
                  <AppIconTile
                    key={option.variant}
                    label={i18n.t(option.label)}
                    preview={previewFor(option.variant)}
                    size={iconSize}
                    selected={selected === option.variant}
                    pending={pending === option.variant}
                    disabled={pending !== null}
                    onPress={() => handlePick(option.variant, group)}
                  />
                ))}
            </View>
          </Section>
        </View>
      ))}
    </View>
  )
}

export default AppIconPicker
