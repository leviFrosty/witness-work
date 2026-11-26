import { Check as CheckIcon } from 'lucide-react-native'
import { useShallow } from 'zustand/react/shallow'
import LucideIcon from '@/components/ui/LucideIcon'
import {
  GroupedList,
  GroupedListRow,
  GroupedListSection,
  GroupedListSwitchRow,
} from '@/components/ui/GroupedList'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import type { MapCardDetail } from '@/types/map'
import useMapCardDetail from '@/features/map/hooks/useMapCardDetail'
import { CARD_DETAIL_CHOICES } from '@/features/map/lib/contactPins'

const PreferencesMapScreen = () => {
  const theme = useTheme()
  const { detail: current, fields, choose } = useMapCardDetail('settings')
  const { autoLookupPinAddress, dataProtectionMode, set } = usePreferences(
    useShallow((s) => ({
      autoLookupPinAddress: s.autoLookupPinAddress,
      dataProtectionMode: s.dataProtectionMode,
      set: s.set,
    }))
  )

  const check = (value: MapCardDetail) =>
    value === current ? (
      <LucideIcon icon={CheckIcon} size={18} color={theme.colors.accent} />
    ) : undefined

  return (
    <GroupedList>
      {!dataProtectionMode && (
        <GroupedListSection
          title={i18n.t('map_droppedPins')}
          footer={i18n.t('map_autoLookupPinAddress_info')}
        >
          <GroupedListSwitchRow
            testID='map-auto-lookup-pin-address'
            label={i18n.t('map_autoLookupPinAddress')}
            value={autoLookupPinAddress}
            onValueChange={(value) => set({ autoLookupPinAddress: value })}
          />
        </GroupedListSection>
      )}
      <GroupedListSection
        title={i18n.t('map_cardDetail')}
        footer={i18n.t('map_cardDetail_info')}
      >
        {CARD_DETAIL_CHOICES.map((option) => (
          <GroupedListRow
            key={option.value}
            label={i18n.t(option.label)}
            sublabel={
              option.description ? i18n.t(option.description) : undefined
            }
            accessory='none'
            trailing={check(option.value)}
            checked={option.value === current}
            onPress={() => choose(option.value)}
          />
        ))}
      </GroupedListSection>
      {fields.length > 0 && (
        <GroupedListSection title={i18n.t('map_cardDetail_fields')}>
          {fields.map((def) => {
            const value = `field:${def.id}` as const
            return (
              <GroupedListRow
                key={def.id}
                label={def.label}
                accessory='none'
                trailing={check(value)}
                checked={value === current}
                onPress={() => choose(value)}
              />
            )
          })}
        </GroupedListSection>
      )}
    </GroupedList>
  )
}

export default PreferencesMapScreen
