import { useEffect, useState } from 'react'
import { View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MapPinPlus as MapPinPlusIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import Section from '@/components/ui/inputs/Section'
import TextInputRow from '@/components/ui/inputs/TextInputRow'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import Header from '@/components/ui/layout/Header'
import KeyboardAwareScrollView from '@/components/ui/layout/KeyboardAwareScrollView'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useFormValidation from '@/hooks/useFormValidation'
import confirmDestructive from '@/lib/confirmDestructive'
import i18n from '@/lib/locales'
import DoNotCallDateRow from '@/features/territories/components/DoNotCallDateRow'
import TerritoryHeaderSave from '@/features/territories/components/TerritoryHeaderSave'
import TerritoryLocationField from '@/features/territories/components/TerritoryLocationField'
import {
  type DoNotCallField,
  doNotCallField,
  doNotCallNumberTaken,
  editDoNotCall,
  pinCentre,
} from '@/features/territories/lib/doorPins'
import {
  removeDoNotCall,
  territoryDoNotCalls,
} from '@/features/territories/lib/doors'
import { formatDoorAddress } from '@/features/territories/lib/territoryTitle'
import {
  useTerritories,
  useTerritory,
} from '@/features/territories/stores/territories'
import type { RootStackParamList } from '@/types/rootStack'

type Props = NativeStackScreenProps<RootStackParamList, 'TerritoryDoNotCall'>

const FIELD_LABEL = {
  number: 'territories.houseNumberLabel',
  description: 'territories.describeDoor',
  address: 'territories.doNotCallAddress',
} as const

const fieldPlaceholder = (field: DoNotCallField) =>
  field === 'number'
    ? '12'
    : i18n.t(
        field === 'description'
          ? 'territories.describeDoor_placeholder'
          : 'territories.doNotCallAddressPlaceholder'
      )

export default function TerritoryDoNotCallFormScreen({
  route,
  navigation,
}: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { territoryId, entryId } = route.params
  const territory = useTerritory(territoryId)
  const update = useTerritories((state) => state.update)
  const entry = territory
    ? territoryDoNotCalls(territory, formatDoorAddress).find(
        (had) => had.id === entryId
      )
    : undefined
  const initial = territory && entry && doNotCallField(territory, entry)
  const [text, setText] = useState(initial?.text ?? '')
  const [date, setDate] = useState(new Date(entry?.at ?? Date.now()))
  const [coordinate, setCoordinate] = useState(entry?.coordinate)
  const [placing, setPlacing] = useState(false)

  const field = initial?.field ?? 'address'
  const taken =
    field === 'number' &&
    !!territory &&
    !!entry &&
    doNotCallNumberTaken(territory, entry, text, formatDoorAddress)
  const validation = useFormValidation(
    {
      text: !text.trim() && !(field === 'description' && coordinate),
      taken,
    },
    'territory_do_not_call'
  )

  const gone = !territory || !entry
  useEffect(() => {
    if (gone) navigation.goBack()
  }, [gone, navigation])

  if (!territory || !entry) return null

  const street = territory.streets.find((had) => had.id === entry.streetId)

  const save = () => {
    if (!validation.validate()) return
    update(territoryId, (current) =>
      editDoNotCall(
        current,
        entry,
        { text, at: date.getTime(), coordinate },
        Date.now(),
        formatDoorAddress
      )
    )
    navigation.goBack()
  }

  const remove = () =>
    confirmDestructive({
      title: i18n.t('territories.removeDoNotCall_title'),
      description: entry.fromDoor
        ? i18n.t('territories.removeDoNotCall_door', {
            address: entry.address,
          })
        : entry.address,
      confirmLabel: i18n.t('remove'),
      onConfirm: () => {
        update(territoryId, (current) => removeDoNotCall(current, entry))
        navigation.goBack()
      },
    })

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Header
        buttonType='back'
        title={i18n.t('territories.pins.editDoNotCall')}
        rightElement={
          <TerritoryHeaderSave onPress={save} testID='dnc-edit-save' />
        }
      />
      <KeyboardAwareScrollView
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps='handled'
      >
        <ContentColumn
          style={{
            paddingTop: 20,
            paddingBottom: insets.bottom + 30,
            paddingHorizontal: inputLayout.horizontalPadding,
            gap: 24,
          }}
        >
          <View style={{ gap: 8 }}>
            <Section>
              <TextInputRow
                label={i18n.t(FIELD_LABEL[field])}
                description={
                  taken
                    ? i18n.t('territories.pins.numberTaken')
                    : street && field !== 'address'
                      ? street.name
                      : undefined
                }
                controlWidth={field === 'description' ? 'full' : undefined}
                textInputProps={{
                  invalid:
                    validation.invalid('text') || validation.invalid('taken'),
                  value: text,
                  onChangeText: setText,
                  placeholder: fieldPlaceholder(field),
                  keyboardType: field === 'number' ? 'number-pad' : undefined,
                  textAlign: field === 'number' ? undefined : 'start',
                  maxLength: field === 'description' ? 80 : 120,
                  testID: 'dnc-edit-address',
                }}
              />
              <DoNotCallDateRow value={date} onChange={setDate} />
              {coordinate || placing ? (
                <TerritoryLocationField
                  coordinate={coordinate}
                  onChange={setCoordinate}
                  onClear={() => {
                    setCoordinate(undefined)
                    setPlacing(false)
                  }}
                  around={coordinate ?? pinCentre(territory, street)}
                  pinId={entry.id}
                  hints={{
                    empty: i18n.t('territories.pins.placeHint'),
                    placed: i18n.t('territories.pins.placedHint'),
                  }}
                />
              ) : (
                <InputRowButton
                  leftIcon={MapPinPlusIcon}
                  label={i18n.t('territories.pins.addPin')}
                  onPress={() => setPlacing(true)}
                  lastInSection
                />
              )}
            </Section>
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
                paddingHorizontal: 5,
              }}
            >
              {i18n.t('territories.doNotCall_rule')}
            </Text>
          </View>

          <Button
            onPress={remove}
            testID='dnc-edit-remove'
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text
              style={{
                color: theme.colors.error,
                textAlign: 'center',
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {i18n.t('territories.pins.removeDoNotCall')}
            </Text>
          </Button>
        </ContentColumn>
      </KeyboardAwareScrollView>
    </View>
  )
}
