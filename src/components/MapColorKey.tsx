import { Modal, View } from 'react-native'
import Card from './Card'
import Text from './MyText'
import i18n from '../lib/locales'
import useTheme from '../contexts/theme'
import Circle from './Circle'
import Button from './Button'
import { MarkerColors, usePreferences } from '../stores/preferences'
import { useRef, useState } from 'react'
import ColorPicker, {
  ColorPickerRef,
  HueSlider,
  Panel1,
} from 'reanimated-color-picker'
import ActionButton from './ActionButton'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useMarkerColors } from '../hooks/useMarkerColors'

type MapKeyRow = {
  name: keyof MarkerColors
  color: string
}

const getPinTypes = (colors: MarkerColors): MapKeyRow[] => [
  {
    name: 'noConversations',
    color: colors.noConversations!,
  },
  {
    name: 'longerThanAMonthAgo',
    color: colors.longerThanAMonthAgo!,
  },
  {
    name: 'longerThanAWeekAgo',
    color: colors.longerThanAWeekAgo!,
  },
  {
    name: 'withinThePastWeek',
    color: colors.withinThePastWeek!,
  },
]

export default function MapKey() {
  const { set } = usePreferences()
  const theme = useTheme()
  const [showModal, setShowModal] = useState(false)
  const pickerRef = useRef<ColorPickerRef>(null)
  const insets = useSafeAreaInsets()
  const [currentColorToEdit, setCurrentColorToEdit] = useState<{
    name: keyof MarkerColors
    color: string
  }>()
  const colors = useMarkerColors()

  const reset = (currentColorKey: keyof typeof colors) => {
    set({
      mapKeyColors: {
        ...colors,
        [currentColorKey]: undefined,
      },
    })
    pickerRef.current?.setColor(colors[currentColorKey]!)
    setTimeout(() => {
      pickerRef.current?.setColor(colors[currentColorKey]!)
    }, 100)
  }

  return (
    <Card style={{ gap: 25 }}>
      <View style={{ gap: 5 }}>
        <Text
          style={{
            fontSize: theme.fontSize('lg'),
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('colorKey')}
        </Text>
        <Text style={{ color: theme.colors.textAlt }}>
          {i18n.t('pinsAreBasedOnYourMostRecentConversation')}
        </Text>
      </View>
      {getPinTypes(colors).map(({ name, color }, idx) => {
        return (
          <View key={idx}>
            <Button
              style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}
              onPress={() => {
                setCurrentColorToEdit({ name, color })
                setShowModal(true)
              }}
            >
              <Text style={{ textDecorationLine: 'underline' }}>
                {i18n.t('edit')}
              </Text>
              <Circle size={30} color={color} />
              <Text>{i18n.t(name)}</Text>
            </Button>
          </View>
        )
      })}
      <Modal visible={showModal} animationType='fade'>
        {currentColorToEdit && (
          <View
            style={{
              backgroundColor:
                colors[currentColorToEdit.name as keyof typeof colors],
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
                <Button
                  onPress={() => {
                    reset(currentColorToEdit.name)
                  }}
                >
                  <Text style={{ textDecorationLine: 'underline' }}>
                    {i18n.t('reset')}
                  </Text>
                </Button>
              </View>
              <ColorPicker
                ref={pickerRef}
                value={currentColorToEdit.color}
                onComplete={({ hex }) => {
                  set({
                    mapKeyColors: {
                      ...colors,
                      [currentColorToEdit.name as keyof typeof colors]: hex,
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
                  <ActionButton onPress={() => setShowModal(false)}>
                    {i18n.t('ok')}
                  </ActionButton>
                </View>
              </View>
            </Card>
          </View>
        )}
      </Modal>
    </Card>
  )
}
