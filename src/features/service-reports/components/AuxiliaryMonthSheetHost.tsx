import AuxiliaryMonthSheet from '@/features/service-reports/components/AuxiliaryMonthSheet'
import { useAuxiliaryMonthSheet } from '@/features/service-reports/stores/auxiliaryMonthSheet'

/** The auxiliary pioneering sheet opened from the notifications tray. */
export default function AuxiliaryMonthSheetHost() {
  const open = useAuxiliaryMonthSheet((state) => state.open)
  return (
    <AuxiliaryMonthSheet
      open={open}
      onOpenChange={(next) => useAuxiliaryMonthSheet.setState({ open: next })}
      source='notifications_tray'
    />
  )
}
