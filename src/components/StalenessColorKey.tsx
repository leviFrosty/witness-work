import { useRef, useState } from 'react'
import { Modal, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { runOnJS } from 'react-native-reanimated'
import ColorPicker, {
  ColorPickerRef,
  HueSlider,
  Panel1,
} from 'reanimated-color-picker'
import useTheme from '../contexts/theme'
import i18n, { TranslationKey } from '../lib/locales'
import { ContactStaleness, stalenessToColor } from '../lib/contactStaleness'
import { useMarkerColors } from '../hooks/useMarkerColors'
import { MarkerColors, usePreferences } from '../stores/preferences'
import Text from './MyText'
import Button from './Button'
import Card from './Card'
import ActionButton from './ActionButton'

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
  const insets = useSafeAreaInsets()
  const colors = useMarkerColors()
  const { set } = usePreferences()
  const pickerRef = useRef<ColorPickerRef>(null)
  const [editing, setEditing] = useState<{
    bucket: ContactStaleness
    color: string
  }>()

  const reset = (bucket: ContactStaleness) => {
    const key = stalenessToMarkerKey[bucket]
    set({
      mapKeyColors: {
        ...colors,
        [key]: undefined,
      },
    })
    pickerRef.current?.setColor(colors[key])
    setTimeout(() => {
      pickerRef.current?.setColor(colors[key])
    }, 100)
  }

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
            <Button
              key={bucket}
              noTransform
              onPress={() => setEditing({ bucket, color })}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: color,
                }}
              />
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
              <Text
                style={{
                  textDecorationLine: 'underline',
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('xs'),
                }}
              >
                {i18n.t('edit')}
              </Text>
            </Button>
          )
        })}
      </View>

      <Modal visible={!!editing} animationType='fade'>
        {editing && (
          <View
            style={{
              backgroundColor: stalenessToColor(editing.bucket, colors),
              padding: 10,
              gap: 10,
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              paddingTop: insets.top + 10,
              paddingBottom: insets.bottom,
            }}
          >
            <Card style={{ maxWidth: 600 }}>
              <View
                style={{
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexDirection: 'row',
                  gap: 10,
                  width: '80%',
                }}
              >
                <Text
                  style={{
                    fontSize: theme.fontSize('2xl'),
                    fontFamily: theme.fonts.bold,
                  }}
                >
                  {i18n.t('editColor')}
                </Text>
                <Button onPress={() => reset(editing.bucket)}>
                  <Text style={{ textDecorationLine: 'underline' }}>
                    {i18n.t('reset')}
                  </Text>
                </Button>
              </View>
              <ColorPicker
                ref={pickerRef}
                value={editing.color}
                onComplete={({ hex }) => {
                  'worklet'
                  runOnJS(set)({
                    mapKeyColors: {
                      ...colors,
                      [stalenessToMarkerKey[editing.bucket]]: hex,
                    },
                  })
                }}
              >
                <Panel1 />
                <HueSlider style={{ marginTop: 15 }} />
              </ColorPicker>
              <View
                style={{
                  gap: 10,
                  alignItems: 'center',
                  marginTop: 30,
                }}
              >
                <View style={{ width: '100%' }}>
                  <ActionButton onPress={() => setEditing(undefined)}>
                    {i18n.t('ok')}
                  </ActionButton>
                </View>
              </View>
            </Card>
          </View>
        )}
      </Modal>
    </View>
  )
}
