import { useState } from 'react'
import { View } from 'react-native'
import * as Crypto from 'expo-crypto'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'
import { analytics } from '@/lib/analytics'
import confirmDestructive from '@/lib/confirmDestructive'
import useMileage from '@/stores/mileage'
import Wrapper from '@/components/ui/layout/Wrapper'
import Section from '@/components/ui/inputs/Section'
import TextInputRow from '@/components/ui/inputs/TextInputRow'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import {
  effectiveEntry,
  resolveHistoryWrite,
  toDateKey,
  type HistoryChangeMode,
} from '@/lib/mileage/calc'
import {
  displayToPricePerGallon,
  formatInputNumber,
  fuelVolumeUnit,
  parseDecimal,
  pricePerGallonToDisplay,
} from '@/lib/mileage/units'
import useMileageFormatter from '@/features/mileage/hooks/useMileageFormatter'
import useMileageIndex from '@/features/mileage/hooks/useMileageIndex'
import HistoryChangeRow from '@/features/mileage/components/HistoryChangeRow'
import HistoryList from '@/features/mileage/components/HistoryList'
import type { RootStackParamList } from '@/types/rootStack'

type Props = NativeStackScreenProps<RootStackParamList, 'MileageFuelForm'>

/** Add or edit a fuel and its effective-dated price. */
export default function MileageFuelFormScreen({ route, navigation }: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { fuels, vehicleSetups, saveFuel, deleteFuel, saveFuelPrice } =
    useMileage()
  const deleteFuelPrice = useMileage((s) => s.deleteFuelPrice)
  const format = useMileageFormatter()
  const index = useMileageIndex()
  const existing = fuels.find((f) => f.id === route.params?.fuelId)
  const history = existing ? (index.pricesByFuel.get(existing.id) ?? []) : []
  const today = toDateKey(new Date())
  const current = effectiveEntry(history, today)
  const toInput = (pricePerGallon?: number) =>
    pricePerGallon === undefined
      ? ''
      : formatInputNumber(
          pricePerGallonToDisplay(pricePerGallon, format.economyUnit),
          3
        )

  const [name, setName] = useState(existing?.name ?? '')
  const [price, setPrice] = useState(() => toInput(current?.pricePerGallon))
  const [changeMode, setChangeMode] = useState<HistoryChangeMode>('starting')
  const [changeDate, setChangeDate] = useState(() => new Date())

  const priceValue = parseDecimal(price)
  const priceChanged = price !== toInput(current?.pricePerGallon)
  const askHowToApply = !!current && priceChanged && priceValue !== undefined
  const submittable = name.trim().length > 0

  const save = () => {
    if (!submittable) return
    const fuelId = existing?.id ?? Crypto.randomUUID()
    saveFuel({
      id: fuelId,
      name: name.trim(),
      createdAt: existing?.createdAt ?? Date.now(),
    })
    if (priceValue !== undefined && priceChanged) {
      const { target, effectiveFrom } = current
        ? resolveHistoryWrite(history, changeMode, toDateKey(changeDate), today)
        : { target: undefined, effectiveFrom: today }
      saveFuelPrice({
        id: target?.id ?? Crypto.randomUUID(),
        fuelId,
        effectiveFrom,
        pricePerGallon: displayToPricePerGallon(priceValue, format.economyUnit),
      })
    }
    if (!existing)
      analytics.capture('mileage_fuel_added', {
        has_price: priceValue !== undefined,
        price_change: askHowToApply ? changeMode : undefined,
      })
    navigation.goBack()
  }

  const requestDelete = () => {
    if (!existing) return
    const carCount = new Set(
      vehicleSetups
        .filter((s) => s.fuelId === existing.id)
        .map((s) => s.vehicleId)
    ).size
    confirmDestructive({
      title: i18n.t('mileage.deleteFuel_title'),
      description: i18n.t('mileage.deleteFuel_description' as TranslationKey, {
        count: carCount,
      }),
      onConfirm: () => {
        deleteFuel(existing.id)

        navigation.goBack()
      },
    })
  }

  return (
    <Wrapper insets='bottom'>
      <KeyboardAwareScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{
          paddingTop: 20,
          paddingBottom: insets.bottom + 30,
          paddingHorizontal: inputLayout.horizontalPadding,
          width: '100%',
          maxWidth: inputLayout.contentMaxWidth,
          alignSelf: 'center',
          gap: 20,
        }}
      >
        <Section>
          <TextInputRow
            label={i18n.t('name')}
            required
            textInputProps={{
              value: name,
              onChangeText: setName,
              placeholder: i18n.t('mileage.fuelNamePlaceholder'),
              autoFocus: !existing,
              maxLength: 60,
            }}
          />
          <TextInputRow
            label={i18n.t(
              `mileage.pricePer_${fuelVolumeUnit(format.economyUnit)}`
            )}
            info={i18n.t('mileage.fuelPrice_info')}
            lastInSection
            textInputProps={{
              value: price,
              onChangeText: setPrice,
              inputMode: 'decimal',
              placeholder: i18n.t('mileage.optional'),
              maxLength: 8,
            }}
          />
        </Section>

        {askHowToApply && (
          <HistoryChangeRow
            mode={changeMode}
            onChangeMode={setChangeMode}
            date={changeDate}
            onChangeDate={setChangeDate}
          />
        )}

        <HistoryList
          entries={history.map((entry) => ({
            id: entry.id,
            effectiveFrom: entry.effectiveFrom,
            value: format.price(entry.pricePerGallon),
          }))}
          onDelete={deleteFuelPrice}
        />

        <View style={{ gap: 8 }}>
          <ActionButton disabled={!submittable} onPress={save}>
            {i18n.t('save')}
          </ActionButton>
          {existing && (
            <Button
              noTransform
              accessibilityRole='button'
              onPress={requestDelete}
              style={{ alignItems: 'center', paddingVertical: 12 }}
            >
              <Text
                style={{
                  color: theme.colors.error,
                  fontFamily: theme.fonts.semiBold,
                  fontSize: theme.fontSize('md'),
                }}
              >
                {i18n.t('deleteEllipsis')}
              </Text>
            </Button>
          )}
        </View>
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}
