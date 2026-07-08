import { Pencil as PencilIcon } from 'lucide-react-native'
import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import {
  STALENESS_DISPLAY_ORDER,
  stalenessToColor,
} from '@/lib/contactStaleness'
import { getStalenessCriteriaText } from '@/lib/stalenessText'
import { useMarkerColors } from '@/hooks/useMarkerColors'
import { usePreferences } from '@/stores/preferences'
import Text from '@/components/ui/MyText'
import IconButton from '@/components/ui/IconButton'
import { RootStackNavigation } from '@/types/rootStack'

type Props = {
  /** Hide the title/subtitle header — useful when the host already shows one. */
  showHeader?: boolean
  /**
   * Called right before navigating to the Color Key settings screen — hosts
   * that render this inside a popover/sheet close it here so it isn't still
   * open when the user navigates back.
   */
  onBeforeNavigate?: () => void
}

/**
 * Read-only legend for the staleness colors. Editing (colors and day
 * thresholds) lives on the Color Key settings screen — the pencil in the header
 * is the way there.
 */
export default function StalenessColorKey({
  showHeader = true,
  onBeforeNavigate,
}: Props) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const colors = useMarkerColors()
  const { stalenessBreakpoints } = usePreferences()

  const goToSettings = () => {
    onBeforeNavigate?.()
    navigation.navigate('PreferencesColorKey')
  }

  return (
    <View style={{ gap: 10, paddingHorizontal: 10 }}>
      {showHeader && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 10,
          }}
        >
          {/*
            flexShrink (not flex: 1) — inside the stats-header popover the
            container has no fixed width, so the title's intrinsic width is
            what sizes the whole popover. flex: 1 zeroes that out and the
            popover collapses to one character per line.
          */}
          <View style={{ gap: 2, flexShrink: 1, flexGrow: 1 }}>
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('md'),
                color: theme.colors.text,
              }}
            >
              {i18n.t('contacts_stalenessInfo_title')}
            </Text>
            <Text
              style={{
                fontSize: theme.fontSize('xs'),
                color: theme.colors.textAlt,
              }}
            >
              {i18n.t('contacts_stalenessInfo_subtitle')}
            </Text>
          </View>
          <IconButton
            hitSlop={20}
            icon={PencilIcon}
            size='sm'
            onPress={goToSettings}
            accessibilityLabel={i18n.t('colorKey_edit')}
          />
        </View>
      )}

      <View style={{ gap: 8 }}>
        {STALENESS_DISPLAY_ORDER.map((bucket) => (
          <View
            key={bucket}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: theme.fonts.semiBold,
                  fontSize: theme.fontSize('sm'),
                  color: theme.colors.text,
                }}
              >
                {i18n.t(`contacts_pinStaleness_${bucket}` as TranslationKey)}
              </Text>
              <Text
                style={{
                  fontSize: theme.fontSize('xs'),
                  color: theme.colors.textAlt,
                }}
              >
                {getStalenessCriteriaText(bucket, stalenessBreakpoints)}
              </Text>
            </View>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: stalenessToColor(bucket, colors),
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            />
          </View>
        ))}
      </View>
    </View>
  )
}
