import { useState } from 'react'
import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import {
  BackPaperSheet,
  PaperSurface,
  PaperRow,
  HandwrittenValue,
  PAPER_WIDTH,
  PAPER_HEIGHT_MIN,
  PAPER_INK,
  PAPER_INK_SOFT,
} from '@/components/ReportPaper'
import { useHandwritingFonts } from '@/lib/handwritingFont'
import i18n, { _i18n } from '@/lib/locales'
import type { MileageCategory, MileageVehicle } from '@/types/mileage'
import {
  mileageVehicleLabel,
  mileageCategoryLabel,
  type MileageSummary,
} from '@/features/mileage/lib/summary'

export default function MileageReportPaper({
  title,
  summary,
  vehicles,
  categories,
  formatDistance,
}: {
  title: string
  summary: MileageSummary
  vehicles: MileageVehicle[]
  categories: MileageCategory[]
  formatDistance: (meters: number) => string
}) {
  const fonts = useHandwritingFonts(_i18n.locale)
  const [height, setHeight] = useState(PAPER_HEIGHT_MIN)
  return (
    <View
      style={{
        width: PAPER_WIDTH + 40,
        alignSelf: 'center',
        padding: 20,
        marginBottom: 16,
      }}
    >
      <BackPaperSheet height={height} />
      <PaperSurface
        height={height}
        onLayoutContent={(event) =>
          setHeight(
            Math.max(
              PAPER_HEIGHT_MIN,
              Math.ceil(event.nativeEvent.layout.height)
            )
          )
        }
      >
        <Text
          style={{
            fontFamily: fonts.bold,
            fontSize: 27,
            lineHeight: 38,
            color: PAPER_INK,
            textAlign: 'center',
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            fontFamily: fonts.regular,
            fontSize: 20,
            color: PAPER_INK_SOFT,
            textAlign: 'center',
            marginTop: 4,
          }}
        >
          {i18n.t('mileage.report.mileage')}
        </Text>
        <PaperRow label={i18n.t('mileage.report.total')}>
          <HandwrittenValue
            value={formatDistance(summary.meters)}
            fontFamily={fonts.bold}
            seed={23}
          />
        </PaperRow>
        {summary.vehicles.map((vehicle) => (
          <PaperRow
            key={vehicle.vehicleId}
            label={mileageVehicleLabel(
              vehicles,
              vehicle.vehicleId,
              i18n.t('mileage.dashboard.unknownVehicle')
            )}
            extraGap
          >
            <Text
              style={{ fontFamily: fonts.bold, fontSize: 24, color: PAPER_INK }}
            >
              {formatDistance(vehicle.meters)}
            </Text>
            {vehicle.categories.map((category) => (
              <View
                key={category.categoryId ?? 'uncategorized'}
                style={{ flexDirection: 'row', gap: 12, paddingVertical: 4 }}
              >
                <Text
                  style={{
                    flex: 1,
                    fontFamily: fonts.regular,
                    fontSize: 16,
                    color: PAPER_INK_SOFT,
                  }}
                >
                  {mileageCategoryLabel(
                    categories,
                    category.categoryId,
                    i18n.t('mileage.dashboard.uncategorized'),
                    i18n.t('mileage.dashboard.unknownCategory')
                  )}
                </Text>
                <Text
                  style={{
                    fontFamily: fonts.regular,
                    fontSize: 16,
                    color: PAPER_INK_SOFT,
                  }}
                >
                  {formatDistance(category.meters)}
                </Text>
              </View>
            ))}
          </PaperRow>
        ))}
        {summary.completedCount === 0 && (
          <Text
            style={{
              fontFamily: fonts.regular,
              color: PAPER_INK_SOFT,
              marginTop: 24,
            }}
          >
            {i18n.t('mileage.dashboard.noCompletedEntries')}
          </Text>
        )}
      </PaperSurface>
    </View>
  )
}
