import type { Colors } from '@/types/theme'

export type VehicleChartColor = { vehicleId: string; color: string }

export const getVehicleChartColors = (
  colors: Colors,
  vehicleIds: readonly string[]
): VehicleChartColor[] => {
  const palette = [
    colors.accent,
    colors.accent3,
    colors.accent2,
    colors.purple,
    colors.orange,
    colors.info,
  ]
  return vehicleIds.map((vehicleId, i) => ({
    vehicleId,
    color: palette[i % palette.length],
  }))
}
