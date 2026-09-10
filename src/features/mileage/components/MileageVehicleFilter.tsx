import Select from '@/components/ui/Select'
import useMileage from '@/stores/mileage'
import i18n from '@/lib/locales'

export default function MileageVehicleFilter({
  vehicleId,
  onChange,
}: {
  vehicleId?: string
  onChange: (id?: string) => void
}) {
  const vehicles = useMileage((state) => state.vehicles)
  return (
    <Select
      value={vehicleId ?? ''}
      data={[
        { value: '', label: i18n.t('mileage.dashboard.allVehicles') },
        ...vehicles.map((vehicle) => ({
          value: vehicle.id,
          label: vehicle.archivedAt
            ? i18n.t('mileage.dashboard.archivedVehicle', {
                name: vehicle.name,
              })
            : vehicle.name,
        })),
      ]}
      onChange={(item) => onChange(item.value || undefined)}
    />
  )
}
