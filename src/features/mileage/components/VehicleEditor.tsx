import { useState } from 'react'
import { View } from 'react-native'
import * as Crypto from 'expo-crypto'
import { useLocales } from 'expo-localization'
import AvatarPickerPopover from '@/components/AvatarPickerPopover'
import { VEHICLE_EMOJI_OPTIONS } from '@/components/AvatarPickerContent'
import ActionButton from '@/components/ui/ActionButton'
import Text from '@/components/ui/MyText'
import Section from '@/components/ui/inputs/Section'
import TextInput from '@/components/ui/TextInput'
import MileageMeasurementField from '@/features/mileage/components/MileageMeasurementField'
import useTheme from '@/contexts/theme'
import useFeatureAccess from '@/hooks/useFeatureAccess'
import { formatMileageNumberInput, parseMileageNumber } from '@/lib/mileage'
import i18n from '@/lib/locales'
import { useMileage } from '@/stores/mileage'
import { usePreferences } from '@/stores/preferences'
import { ProfileAvatar } from '@/types/avatar'

interface Props {
  vehicleId?: string
  onSaved?: (vehicleId: string) => void
}

const VehicleEditor = ({ vehicleId, onSaved }: Props) => {
  const theme = useTheme()
  const { hasAccess: canCustomizeBackground } =
    useFeatureAccess('customAccentColor')
  const { vehicles, addVehicle, updateVehicle } = useMileage()
  const vehicle = vehicles.find((item) => item.id === vehicleId)
  const [newId] = useState(() => Crypto.randomUUID())
  const [name, setName] = useState(vehicle?.name ?? '')
  const locales = useLocales()
  const locale = locales[0]?.languageTag
  const decimalSeparator = locales[0]?.decimalSeparator
  const [mpg, setMpg] = useState(() =>
    vehicle?.combinedMpg === undefined
      ? ''
      : formatMileageNumberInput(vehicle.combinedMpg, locale, decimalSeparator)
  )
  const [avatar, setAvatar] = useState<ProfileAvatar>(
    vehicle?.avatar ?? { type: 'emoji', value: '🚗' }
  )
  const [background, setBackground] = useState(vehicle?.avatarBackground ?? '')
  const [error, setError] = useState('')
  const setLastVehicle = usePreferences((s) => s.setMileageLastVehicleId)

  const save = () => {
    const combinedMpg = mpg.trim()
      ? parseMileageNumber(mpg, locale, decimalSeparator)
      : undefined
    if (!name.trim()) {
      setError(i18n.t('mileage.vehicles.nameRequired'))
      return
    }
    if (combinedMpg === null || combinedMpg === 0) {
      setError(i18n.t('mileage.vehicles.mpgInvalid'))
      return
    }
    const values = {
      name: name.trim(),
      combinedMpg,
      avatar,
      avatarBackground: background,
    }
    if (vehicleId) {
      if (!vehicle) {
        setError(i18n.t('mileage.vehicles.unavailable'))
        return
      }
      updateVehicle({ id: vehicleId, ...values })
    } else {
      addVehicle({
        id: newId,
        ...values,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      setLastVehicle(newId)
    }
    onSaved?.(vehicleId ?? newId)
  }

  return (
    <View style={{ gap: 20 }}>
      <View style={{ alignItems: 'center', paddingVertical: 12 }}>
        <AvatarPickerPopover
          emojiOnly
          emojiOptions={VEHICLE_EMOJI_OPTIONS}
          value={avatar}
          onChange={setAvatar}
          name={name}
          size={72}
          accessibilityLabel={i18n.t('mileage.vehicles.avatar')}
          background={
            canCustomizeBackground && background
              ? background
              : theme.colors.accent
          }
          backgroundValue={background || null}
          onBackgroundChange={(next) => {
            if (canCustomizeBackground) setBackground(next ?? '')
          }}
        />
      </View>
      <Section>
        <View style={{ paddingRight: 20, paddingVertical: 8, gap: 10 }}>
          <Text style={{ fontFamily: theme.fonts.semiBold }}>
            {i18n.t('mileage.vehicles.name')}
            <Text style={{ color: theme.colors.error }}> *</Text>
          </Text>
          <TextInput
            value={name}
            onChangeText={(next) => {
              setName(next)
              setError('')
            }}
            placeholder={i18n.t('mileage.vehicles.namePlaceholder', {
              year: new Date().getFullYear(),
            })}
            autoCapitalize='words'
            accessibilityLabel={i18n.t('mileage.vehicles.name')}
            textAlign='left'
            style={{
              color: theme.colors.text,
              backgroundColor: theme.colors.background,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.numbers.borderRadiusSm,
              padding: 12,
              minHeight: 46,
            }}
          />
        </View>
        <MileageMeasurementField
          label={i18n.t('mileage.vehicles.combinedMpg')}
          value={mpg}
          onChangeText={(next) => {
            setMpg(next)
            setError('')
          }}
          placeholder={i18n.t('mileage.vehicles.mpgPlaceholder')}
        />
      </Section>
      <Text
        style={{ color: theme.colors.textAlt, fontSize: theme.fontSize('sm') }}
      >
        {i18n.t('mileage.vehicles.mpgDescription')}
      </Text>
      {!!error && (
        <Text accessibilityRole='alert' style={{ color: theme.colors.error }}>
          {error}
        </Text>
      )}
      <ActionButton noTransform onPress={save}>
        {i18n.t('save')}
      </ActionButton>
    </View>
  )
}

export default VehicleEditor
