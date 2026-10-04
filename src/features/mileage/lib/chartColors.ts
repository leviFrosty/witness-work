import type { Colors } from '@/types/theme'

export type VehicleChartColor = { vehicleId: string; color: string }

/**
 * A color per car for the Mileage chart's stacked bars and the matching key
 * beside each car's total. The first car takes the accent, so a single-car
 * chart matches the rest of the app. Mid-tone hues that read on the card in
 * both themes; colors repeat past six cars.
 */
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
