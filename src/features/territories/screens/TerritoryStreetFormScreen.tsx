import { useEffect, useState } from 'react'
import * as Crypto from 'expo-crypto'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Button from '@/components/ui/Button'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import InputRowSelect from '@/components/ui/inputs/InputRowSelect'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import Section from '@/components/ui/inputs/Section'
import TextInputRow from '@/components/ui/inputs/TextInputRow'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import KeyboardAwareScrollView from '@/components/ui/layout/KeyboardAwareScrollView'
import Header from '@/components/ui/layout/Header'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useFormValidation from '@/hooks/useFormValidation'
import i18n from '@/lib/locales'
import { useTerritoryPrivacy } from '@/hooks/useTerritoryPrivacy'
import TerritoryHeaderSave from '@/features/territories/components/TerritoryHeaderSave'
import useTerritoryActions from '@/features/territories/hooks/useTerritoryActions'
import {
  savesDoorLocations,
  saveStreet,
  startNumber,
} from '@/features/territories/lib/doors'
import {
  useTerritories,
  useTerritory,
} from '@/features/territories/stores/territories'
import type { StreetNumbering } from '@/features/territories/types/territory'
import type { RootStackParamList } from '@/types/rootStack'

type Props = NativeStackScreenProps<RootStackParamList, 'TerritoryStreetForm'>

const NUMBERINGS: readonly StreetNumbering[] = ['both', 'odd', 'even', 'none']

export default function TerritoryStreetFormScreen({
  route,
  navigation,
}: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { territoryId, streetId } = route.params
  const territory = useTerritory(territoryId)
  const update = useTerritories((state) => state.update)
  const territoryActions = useTerritoryActions()
  const privacy = useTerritoryPrivacy()
  const existing = territory?.streets.find((street) => street.id === streetId)

  const gone = !territory || (streetId !== undefined && !existing)
  useEffect(() => {
    if (gone) navigation.goBack()
  }, [gone, navigation])

  const [name, setName] = useState(existing?.name ?? '')
  const [numbering, setNumbering] = useState<StreetNumbering>(
    existing?.numbering ?? 'both'
  )
  const [next, setNext] = useState(existing ? String(existing.next) : '1')
  const [descending, setDescending] = useState(existing?.descending ?? false)
  const [pinChoice, setPinChoice] = useState(existing?.saveLocations)
  const pinDoors = savesDoorLocations({ numbering, saveLocations: pinChoice })

  const validation = useFormValidation(
    { name: !name.trim() },
    'territory_street'
  )

  const submit = () => {
    if (!validation.validate()) return
    const id = existing?.id ?? Crypto.randomUUID()
    const typed = Number.parseInt(next, 10)
    const from =
      numbering === 'none' && existing?.numbering === 'none'
        ? existing.next
        : startNumber(numbering, Number.isNaN(typed) ? undefined : typed)
    const street = {
      id,
      name: name.trim(),
      numbering,
      next: from,
      first: existing ? existing.first : from,
      descending: numbering !== 'none' && descending ? true : undefined,
      houses: existing?.houses,
      doors: existing?.doors ?? [],
      workedAt: existing?.workedAt,
      saveLocations: pinDoors ? undefined : false,
    }
    update(territoryId, (current) => saveStreet(current, street))
    navigation.goBack()
  }

  const requestDelete = () =>
    territory &&
    existing &&
    territoryActions.requestDeleteStreet(territory, existing.id, () =>
      navigation.popTo('TerritoryDetails', { territoryId })
    )

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Header
        buttonType='back'
        title={i18n.t(
          existing ? 'territories.editStreet' : 'territories.addStreet'
        )}
        rightElement={
          <TerritoryHeaderSave onPress={submit} testID='street-save' />
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
          <Section>
            <TextInputRow
              label={i18n.t('territories.streetName')}
              required
              lastInSection
              textInputProps={{
                invalid: validation.invalid('name'),
                value: name,
                onChangeText: setName,
                placeholder: i18n.t('territories.streetNamePlaceholder'),
                autoFocus: !existing,
                autoCapitalize: 'words',
                maxLength: 80,
                testID: 'street-name',
              }}
            />
          </Section>

          {!privacy && (
            <Section>
              <InputRowSelect
                label={i18n.t('territories.numbering')}
                info={i18n.t('territories.numbering_info')}
                description={i18n.t(`territories.numberingHelp.${numbering}`)}
                selectProps={{
                  data: NUMBERINGS.map((value) => ({
                    label: i18n.t(`territories.numberingOptions.${value}`),
                    value,
                  })),
                  value: numbering,
                  onChange: (item) => setNumbering(item.value),
                  accessibilityLabel: i18n.t('territories.numbering'),
                }}
              />
              {numbering !== 'none' && (
                <TextInputRow
                  label={i18n.t(
                    existing
                      ? 'territories.nextNumber'
                      : 'territories.firstNumber'
                  )}
                  textInputProps={{
                    value: next,
                    onChangeText: setNext,
                    placeholder: '1',
                    keyboardType: 'number-pad',
                    maxLength: 6,
                    testID: 'street-first-number',
                  }}
                />
              )}
              {numbering !== 'none' && (
                <InputRowSwitch
                  label={i18n.t('territories.countDown')}
                  description={i18n.t('territories.countDown_description')}
                  value={descending}
                  onValueChange={setDescending}
                />
              )}
              <InputRowSwitch
                label={i18n.t('territories.pinDoors')}
                description={i18n.t('territories.pinDoors_description')}
                value={pinDoors}
                onValueChange={setPinChoice}
                lastInSection
              />
            </Section>
          )}

          {existing && (
            <Button
              onPress={requestDelete}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text
                style={{
                  textAlign: 'center',
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.error,
                }}
              >
                {i18n.t('territories.deleteStreet')}
              </Text>
            </Button>
          )}
        </ContentColumn>
      </KeyboardAwareScrollView>
    </View>
  )
}
