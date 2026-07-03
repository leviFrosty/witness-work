import { useState } from 'react'
import { Pressable, StyleProp, View, ViewStyle } from 'react-native'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faPencil } from '@fortawesome/free-solid-svg-icons/faPencil'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import {
  ContactStaleness,
  STALENESS_DISPLAY_ORDER,
  stalenessToColor,
  stalenessToMarkerKey,
} from '@/lib/contactStaleness'
import { getStalenessCriteriaText } from '@/lib/stalenessText'
import {
  DEFAULT_STALENESS_BREAKPOINTS,
  MIN_STALENESS_DAYS,
  normalizeStalenessBreakpoints,
} from '@/constants/staleness'
import { StalenessBreakpoints } from '@/types/staleness'
import { useMarkerColors } from '@/hooks/useMarkerColors'
import { usePreferences } from '@/stores/preferences'
import Section from '@/components/ui/inputs/Section'
import TextInputRow from '@/components/ui/inputs/TextInputRow'
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import Divider from '@/components/ui/Divider'
import ColorPickerSheet from '@/components/ColorPickerSheet'

const SectionHeading = ({
  title,
  subtitle,
  style,
}: {
  title: string
  subtitle: string
  style?: StyleProp<ViewStyle>
}) => {
  const theme = useTheme()
  return (
    <View style={[{ gap: 2 }, style]}>
      <Text
        style={{
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('md'),
          color: theme.colors.text,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontSize: theme.fontSize('xs'),
          color: theme.colors.textAlt,
        }}
      >
        {subtitle}
      </Text>
    </View>
  )
}

const ResetLink = ({ onPress }: { onPress: () => void }) => {
  const theme = useTheme()
  return (
    <Button onPress={onPress}>
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
  )
}

/**
 * The only place the staleness color key is edited: per-bucket color overrides
 * (the swatch with the pencil badge opens a picker) and the day thresholds that
 * move a contact between buckets.
 */
const ColorKeyPreferencesSection = () => {
  const theme = useTheme()
  const colors = useMarkerColors()
  const { set, mapKeyColors, stalenessBreakpoints } = usePreferences()
  const [activeBucket, setActiveBucket] = useState<ContactStaleness | null>(
    null
  )

  const updateBucketColor = (bucket: ContactStaleness, hex: string | null) => {
    set({
      mapKeyColors: {
        ...mapKeyColors,
        [stalenessToMarkerKey[bucket]]: hex ?? undefined,
      },
    })
  }

  const isColorOverridden = (bucket: ContactStaleness) =>
    mapKeyColors?.[stalenessToMarkerKey[bucket]] !== undefined

  // While typing, accept any whole number of days ≥ 1 — no upper bound. The
  // ordering rule (stale at least MIN_STALENESS_GAP_DAYS above recent) is not
  // enforced mid-keystroke so intermediate values don't fight the keyboard;
  // it's applied when editing ends, and the classifiers normalize anyway.
  const setBreakpoint = (key: keyof StalenessBreakpoints, raw: string) => {
    const days = parseInt(raw, 10) || 0
    if (days >= MIN_STALENESS_DAYS) {
      set({ stalenessBreakpoints: { ...stalenessBreakpoints, [key]: days } })
    }
  }

  // Snap the stored values to the enforced shape so the inputs show what the
  // classifiers will actually use (e.g. stale raised to recent + 2).
  const commitBreakpoints = () =>
    set({
      stalenessBreakpoints: normalizeStalenessBreakpoints(stalenessBreakpoints),
    })

  const breakpointsAreDefault =
    stalenessBreakpoints.weekDays === DEFAULT_STALENESS_BREAKPOINTS.weekDays &&
    stalenessBreakpoints.monthDays === DEFAULT_STALENESS_BREAKPOINTS.monthDays

  return (
    <View style={{ gap: 8 }}>
      <SectionHeading
        title={i18n.t('contacts_stalenessInfo_title')}
        subtitle={i18n.t('contacts_stalenessInfo_subtitle')}
        style={{ marginHorizontal: 20 }}
      />
      <Section>
        <View style={{ gap: 14 }}>
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
              {isColorOverridden(bucket) && (
                <ResetLink onPress={() => updateBucketColor(bucket, null)} />
              )}
              <Pressable
                onPress={() => setActiveBucket(bucket)}
                accessibilityLabel={i18n.t('colorKey_edit')}
                accessibilityRole='button'
                hitSlop={8}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: stalenessToColor(bucket, colors),
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                />
                {/* Pencil badge — signals the swatch itself is tappable. */}
                <View
                  style={{
                    position: 'absolute',
                    right: -5,
                    bottom: -5,
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: theme.colors.card,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <FontAwesomeIcon
                    icon={faPencil}
                    size={9}
                    color={theme.colors.textAlt}
                  />
                </View>
              </Pressable>
            </View>
          ))}
        </View>
      </Section>

      <Divider marginVertical={20} />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 10,
          marginHorizontal: 20,
        }}
      >
        <View style={{ flex: 1 }}>
          <SectionHeading
            title={i18n.t('colorKey_timePeriods')}
            subtitle={i18n.t('colorKey_timePeriods_description')}
          />
        </View>
        {!breakpointsAreDefault && (
          <ResetLink
            onPress={() =>
              set({ stalenessBreakpoints: DEFAULT_STALENESS_BREAKPOINTS })
            }
          />
        )}
      </View>
      <Section>
        <TextInputRow
          label={i18n.t('colorKey_recentDays')}
          textInputProps={{
            value: stalenessBreakpoints.weekDays.toString(),
            onChangeText: (value) => setBreakpoint('weekDays', value),
            onEndEditing: commitBreakpoints,
            keyboardType: 'numeric',
            placeholder: DEFAULT_STALENESS_BREAKPOINTS.weekDays.toString(),
          }}
        />
        <Text
          style={{
            fontSize: theme.fontSize('xs'),
            color: theme.colors.textAlt,
            paddingVertical: 10,
          }}
        >
          {i18n.t('colorKey_recentDays_description', {
            label: i18n.t('contacts_pinStaleness_recent'),
          })}
        </Text>
        <TextInputRow
          label={i18n.t('colorKey_staleDays')}
          textInputProps={{
            value: stalenessBreakpoints.monthDays.toString(),
            onChangeText: (value) => setBreakpoint('monthDays', value),
            onEndEditing: commitBreakpoints,
            keyboardType: 'numeric',
            placeholder: DEFAULT_STALENESS_BREAKPOINTS.monthDays.toString(),
          }}
          lastInSection
        />
        <Text
          style={{
            fontSize: theme.fontSize('xs'),
            color: theme.colors.textAlt,
            paddingTop: 10,
          }}
        >
          {i18n.t('colorKey_staleDays_description', {
            label: i18n.t('contacts_pinStaleness_month'),
          })}
        </Text>
      </Section>

      <ColorPickerSheet
        visible={activeBucket !== null}
        value={
          activeBucket ? stalenessToColor(activeBucket, colors) : '#000000'
        }
        onClose={() => setActiveBucket(null)}
        onChange={(hex) => {
          if (activeBucket) updateBucketColor(activeBucket, hex)
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

export default ColorKeyPreferencesSection
