import { Pencil as PencilIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import PointerHover from '@/components/ui/PointerHover'
import { useState } from 'react'
import { Pressable, StyleProp, View, ViewStyle } from 'react-native'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import { formatPlainNumber } from '@/lib/numbers'
import {
  ContactStaleness,
  STALENESS_DISPLAY_ORDER,
  stalenessToColor,
  stalenessToMarkerKey,
} from '@/lib/contactStaleness'
import { getStalenessCriteriaText } from '@/lib/stalenessText'
import {
  DEFAULT_STALENESS_BREAKPOINTS,
  normalizeStalenessBreakpoints,
} from '@/constants/staleness'
import { StalenessBreakpoints } from '@/types/staleness'
import { useMarkerColors } from '@/hooks/useMarkerColors'
import { usePreferences } from '@/stores/preferences'
import Section from '@/components/ui/inputs/Section'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import TextInputRow from '@/components/ui/inputs/TextInputRow'
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import Divider from '@/components/ui/Divider'
import ColorPickerSheet from '@/components/ColorPickerSheet'
import { readStalenessDaysInput } from '@/features/settings/lib/stalenessDaysInput'

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
          fontSize: theme.fontSize('lg'),
          color: theme.colors.text,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontSize: theme.fontSize('sm'),
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
          fontSize: theme.fontSize('sm'),
        }}
      >
        {i18n.t('reset')}
      </Text>
    </Button>
  )
}

const ColorKeyPreferencesSection = () => {
  const theme = useTheme()
  const colors = useMarkerColors()
  const { set, mapKeyColors, stalenessBreakpoints } = usePreferences()
  const [activeBucket, setActiveBucket] = useState<ContactStaleness | null>(
    null
  )

  const [draft, setDraft] = useState<{
    key: keyof StalenessBreakpoints
    text: string
    daysBeforeEdit: number
  } | null>(null)

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

  const setBreakpoint = (key: keyof StalenessBreakpoints, text: string) => {
    const daysBeforeEdit =
      draft?.key === key ? draft.daysBeforeEdit : stalenessBreakpoints[key]
    const days = readStalenessDaysInput(text, daysBeforeEdit)
    if (days === null) return
    setDraft({ key, text, daysBeforeEdit })
    if (days === stalenessBreakpoints[key]) return
    set({ stalenessBreakpoints: { ...stalenessBreakpoints, [key]: days } })
  }

  const commitBreakpoints = () => {
    setDraft(null)
    set({
      stalenessBreakpoints: normalizeStalenessBreakpoints(stalenessBreakpoints),
    })
  }

  const breakpointValue = (key: keyof StalenessBreakpoints) =>
    draft?.key === key
      ? draft.text
      : formatPlainNumber(stalenessBreakpoints[key])

  const breakpointsAreDefault =
    stalenessBreakpoints.weekDays === DEFAULT_STALENESS_BREAKPOINTS.weekDays &&
    stalenessBreakpoints.monthDays === DEFAULT_STALENESS_BREAKPOINTS.monthDays

  return (
    <View style={{ gap: 8 }}>
      <SectionHeading
        title={i18n.t('contacts_stalenessInfo_title')}
        subtitle={i18n.t('contacts_stalenessInfo_subtitle')}
        style={{ marginHorizontal: inputLayout.horizontalPadding }}
      />
      <Section>
        {STALENESS_DISPLAY_ORDER.map((bucket, index) => (
          <InputRowContainer
            key={bucket}
            label={i18n.t(`contacts_pinStaleness_${bucket}` as TranslationKey)}
            description={getStalenessCriteriaText(bucket, stalenessBreakpoints)}
            lastInSection={index === STALENESS_DISPLAY_ORDER.length - 1}
            controlWidth='auto'
            controlStyle={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              flexShrink: 0,
            }}
          >
            {isColorOverridden(bucket) && (
              <ResetLink onPress={() => updateBucketColor(bucket, null)} />
            )}
            <PointerHover effect='lift'>
              <Pressable
                onPress={() => setActiveBucket(bucket)}
                accessibilityLabel={i18n.t('colorKey_editBucketColor', {
                  label: i18n.t(
                    `contacts_pinStaleness_${bucket}` as TranslationKey
                  ),
                })}
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
                {}
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
                  <LucideIcon
                    icon={PencilIcon}
                    size={9}
                    color={theme.colors.textAlt}
                  />
                </View>
              </Pressable>
            </PointerHover>
          </InputRowContainer>
        ))}
      </Section>

      <Divider marginVertical={20} />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 10,
          marginHorizontal: inputLayout.horizontalPadding,
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
            onPress={() => {
              setDraft(null)
              set({ stalenessBreakpoints: DEFAULT_STALENESS_BREAKPOINTS })
            }}
          />
        )}
      </View>
      <Section>
        <TextInputRow
          label={i18n.t('colorKey_recentDays')}
          description={i18n.t('colorKey_recentDays_description', {
            label: i18n.t('contacts_pinStaleness_recent'),
          })}
          textInputProps={{
            value: breakpointValue('weekDays'),
            onChangeText: (value) => setBreakpoint('weekDays', value),
            onEndEditing: commitBreakpoints,
            type: 'number',
            placeholder: formatPlainNumber(
              DEFAULT_STALENESS_BREAKPOINTS.weekDays
            ),
          }}
        />
        <TextInputRow
          label={i18n.t('colorKey_staleDays')}
          description={i18n.t('colorKey_staleDays_description', {
            label: i18n.t('contacts_pinStaleness_month'),
          })}
          textInputProps={{
            value: breakpointValue('monthDays'),
            onChangeText: (value) => setBreakpoint('monthDays', value),
            onEndEditing: commitBreakpoints,
            type: 'number',
            placeholder: formatPlainNumber(
              DEFAULT_STALENESS_BREAKPOINTS.monthDays
            ),
          }}
          lastInSection
        />
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
