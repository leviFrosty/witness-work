import { useState } from 'react'
import { View } from 'react-native'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { useMileage } from '@/stores/mileage'
import VehicleEditor from '@/features/mileage/components/VehicleEditor'
import VehicleManager from '@/features/mileage/components/VehicleManager'

const MileageOnboardingSetup = ({ onContinue }: { onContinue: () => void }) => {
  const theme = useTheme()
  const vehicles = useMileage((s) => s.vehicles)
  const [editing, setEditing] = useState<{ vehicleId?: string } | null>(() =>
    vehicles.some((vehicle) => vehicle.archivedAt === undefined) ? null : {}
  )
  return (
    <View style={{ gap: 20 }}>
      <Text style={{ fontSize: 32, fontFamily: theme.fonts.bold }}>
        {i18n.t('mileage.onboarding.title')}
      </Text>
      <Text style={{ color: theme.colors.textAlt }}>
        {i18n.t('mileage.onboarding.description')}
      </Text>
      {editing ? (
        <VehicleEditor
          key={editing.vehicleId ?? 'new'}
          vehicleId={editing.vehicleId}
          onSaved={onContinue}
        />
      ) : (
        <>
          <VehicleManager
            onAdd={() => setEditing({})}
            onEdit={(vehicleId) => setEditing({ vehicleId })}
          />
          <ActionButton onPress={onContinue}>{i18n.t('continue')}</ActionButton>
        </>
      )}
      <Button
        onPress={onContinue}
        accessibilityRole='button'
        style={{ paddingVertical: 12, alignItems: 'center' }}
      >
        <Text style={{ color: theme.colors.textAlt }}>
          {i18n.t('mileage.onboarding.skip')}
        </Text>
      </Button>
    </View>
  )
}
export default MileageOnboardingSetup
