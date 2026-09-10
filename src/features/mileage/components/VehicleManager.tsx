import { Alert, Pressable, View } from 'react-native'
import ActionButton from '@/components/ui/ActionButton'
import Avatar from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useFeatureAccess from '@/hooks/useFeatureAccess'
import i18n from '@/lib/locales'
import { useMileage } from '@/stores/mileage'

interface Props {
  onAdd: () => void
  onEdit: (vehicleId: string) => void
}

const VehicleManager = ({ onAdd, onEdit }: Props) => {
  const theme = useTheme()
  const { hasAccess: canCustomizeBackground } =
    useFeatureAccess('customAccentColor')
  const { vehicles, entries, archiveVehicle, restoreVehicle, deleteVehicle } =
    useMileage()
  const groups = [
    {
      title: i18n.t('mileage.vehicles.active'),
      items: vehicles.filter((item) => item.archivedAt === undefined),
    },
    {
      title: i18n.t('mileage.vehicles.archived'),
      items: vehicles.filter((item) => item.archivedAt !== undefined),
    },
  ]
  return (
    <View style={{ gap: 20 }}>
      <Text style={{ color: theme.colors.textAlt }}>
        {i18n.t('mileage.vehicles.description')}
      </Text>
      <ActionButton onPress={onAdd}>
        {i18n.t('mileage.vehicles.add')}
      </ActionButton>
      {vehicles.length === 0 && (
        <Card>
          <Text>{i18n.t('mileage.vehicles.empty')}</Text>
        </Card>
      )}
      {groups.map(
        (group) =>
          group.items.length > 0 && (
            <View key={group.title} style={{ gap: 10 }}>
              <Text
                style={{
                  fontFamily: theme.fonts.semiBold,
                  fontSize: theme.fontSize('lg'),
                }}
              >
                {group.title}
              </Text>
              {group.items.map((vehicle) => {
                const referenced = entries.some(
                  (entry) => entry.vehicleId === vehicle.id
                )
                const archived = vehicle.archivedAt !== undefined
                return (
                  <Card key={vehicle.id}>
                    <Pressable
                      accessibilityRole='button'
                      accessibilityLabel={i18n.t('mileage.vehicles.editNamed', {
                        name: vehicle.name,
                      })}
                      onPress={() => onEdit(vehicle.id)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        paddingVertical: 6,
                      }}
                    >
                      <Avatar
                        avatar={vehicle.avatar}
                        name={vehicle.name}
                        size={44}
                        background={
                          canCustomizeBackground && vehicle.avatarBackground
                            ? vehicle.avatarBackground
                            : theme.colors.accent
                        }
                      />
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={{ fontFamily: theme.fonts.semiBold }}>
                          {vehicle.name}
                        </Text>
                        {vehicle.combinedMpg !== undefined && (
                          <Text style={{ color: theme.colors.textAlt }}>
                            {i18n.t('mileage.vehicles.mpgValue', {
                              value: vehicle.combinedMpg,
                            })}
                          </Text>
                        )}
                      </View>
                      <Text style={{ color: theme.colors.accent }}>
                        {i18n.t('edit')}
                      </Text>
                    </Pressable>
                    <View
                      style={{ flexDirection: 'row', gap: 20, paddingTop: 8 }}
                    >
                      {archived ? (
                        <Button
                          accessibilityRole='button'
                          onPress={() => restoreVehicle(vehicle.id)}
                        >
                          <Text style={{ color: theme.colors.accent }}>
                            {i18n.t('mileage.vehicles.restore')}
                          </Text>
                        </Button>
                      ) : (
                        <Button
                          accessibilityRole='button'
                          onPress={() => archiveVehicle(vehicle.id)}
                        >
                          <Text style={{ color: theme.colors.accent }}>
                            {i18n.t('mileage.vehicles.archive')}
                          </Text>
                        </Button>
                      )}
                      {!referenced && (
                        <Button
                          accessibilityRole='button'
                          onPress={() =>
                            Alert.alert(
                              i18n.t('mileage.vehicles.deleteTitle'),
                              i18n.t('mileage.vehicles.deleteDescription', {
                                name: vehicle.name,
                              }),
                              [
                                { text: i18n.t('cancel'), style: 'cancel' },
                                {
                                  text: i18n.t('delete'),
                                  style: 'destructive',
                                  onPress: () => deleteVehicle(vehicle.id),
                                },
                              ]
                            )
                          }
                        >
                          <Text style={{ color: theme.colors.error }}>
                            {i18n.t('delete')}
                          </Text>
                        </Button>
                      )}
                    </View>
                  </Card>
                )
              })}
            </View>
          )
      )}
    </View>
  )
}

export default VehicleManager
