import { useState } from 'react'
import { Pressable, View } from 'react-native'
import useTheme from '../contexts/theme'
import i18n, { TranslationKey } from '../lib/locales'
import { ContactStaleness, stalenessToColor } from '../lib/contactStaleness'
import { useMarkerColors } from '../hooks/useMarkerColors'
import { MarkerColors, usePreferences } from '../stores/preferences'
import Text from './MyText'
import Button from './Button'
import ColorPickerSheet from './ColorPickerSheet'

/**
 * Order shown left-to-right / top-to-bottom: most stale first so the eye lands
 * on red (needs attention) before grey (no data). Mirrors ContactsStatsHeader.
 */
const STALENESS_ORDER: ContactStaleness[] = ['month', 'week', 'recent', 'never']

const stalenessToMarkerKey: Record<ContactStaleness, keyof MarkerColors> = {
  never: 'noConversations',
  recent: 'withinThePastWeek',
  week: 'longerThanAWeekAgo',
  month: 'longerThanAMonthAgo',
}

type Props = {
  /** Hide the title/subtitle header — useful when the host already shows one. */
  showHeader?: boolean
}

export default function StalenessColorKey({ showHeader = true }: Props) {
  const theme = useTheme()
  const colors = useMarkerColors()
  const { set, mapKeyColors } = usePreferences()
  const [activeBucket, setActiveBucket] = useState<ContactStaleness | null>(
    null
  )

  const updateBucket = (bucket: ContactStaleness, hex: string | null) => {
    const key = stalenessToMarkerKey[bucket]
    set({
      mapKeyColors: {
        ...mapKeyColors,
        [key]: hex ?? undefined,
      },
    })
  }

  const isOverridden = (bucket: ContactStaleness) =>
    mapKeyColors?.[stalenessToMarkerKey[bucket]] !== undefined

  const activeColor = activeBucket
    ? stalenessToColor(activeBucket, colors)
    : '#000000'

  return (
    <View style={{ gap: 10 }}>
      {showHeader && (
        <View style={{ gap: 2 }}>
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
      )}

      <View style={{ gap: 8 }}>
        {STALENESS_ORDER.map((bucket) => {
          const color = stalenessToColor(bucket, colors)
          return (
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
                  {i18n.t(
                    `contacts_stalenessCriteria_${bucket}` as TranslationKey
                  )}
                </Text>
              </View>
              {isOverridden(bucket) && (
                <Button onPress={() => updateBucket(bucket, null)}>
                  <Text
                    style={{
                      textDecorationLine: 'underline',
                      color: theme.colors.textAlt,
                      fontSize: theme.fontSize('xs'),
                    }}
                  >
                    {i18n.t('reset')}
                  </Text>
                </Button>
              )}
              <Pressable
                onPress={() => setActiveBucket(bucket)}
                accessibilityLabel={i18n.t(
                  `contacts_pinStaleness_${bucket}` as TranslationKey
                )}
                accessibilityRole='button'
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: color,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              />
            </View>
          )
        })}
      </View>
      <ColorPickerSheet
        visible={activeBucket !== null}
        value={activeColor}
        onClose={() => setActiveBucket(null)}
        onChange={(hex) => {
          if (activeBucket) updateBucket(activeBucket, hex)
        }}
        title={
          activeBucket
            ? i18n.t(`contacts_pinStaleness_${activeBucket}` as TranslationKey)
            : undefined
        }
      />
    </View>
  )
}
