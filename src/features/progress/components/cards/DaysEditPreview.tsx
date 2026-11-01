import { CalendarDays as CalendarDaysIcon } from 'lucide-react-native'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { ProgressCardSize } from '@/lib/progressCards'
import StatCard from '@/features/progress/components/cards/StatCard'
import { progressCardSizeName } from '@/features/progress/components/cards/progressCardSizes'

const ROW_HEIGHT = 14
const ROW_GAP = 10
const ROWS = { compact: 1, full: 4 } as const

export const DAYS_PREVIEW_HEIGHTS = {
  compact: 118,
  full: 118 + (ROWS.full - ROWS.compact) * (ROW_HEIGHT + ROW_GAP),
} as const

export default function DaysEditPreview({ size }: { size: ProgressCardSize }) {
  const theme = useTheme()
  const full = size === 'full'
  return (
    <StatCard
      icon={CalendarDaysIcon}
      title={i18n.t('progressCards.days.title')}
      value={progressCardSizeName(size)}
      caption={
        full
          ? i18n.t('progressCards.days.fullCaption')
          : i18n.t('progressCards.days.compactCaption')
      }
      size='wide'
      footer={
        <View style={{ gap: ROW_GAP, paddingTop: 6 }}>
          {Array.from({ length: full ? ROWS.full : ROWS.compact }, (_, i) => (
            <View
              key={i}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <View
                style={{
                  width: ROW_HEIGHT,
                  height: ROW_HEIGHT,
                  borderRadius: ROW_HEIGHT / 2,
                  backgroundColor: theme.colors.border,
                }}
              />
              <View
                style={{
                  height: ROW_HEIGHT - 4,
                  width: `${70 - i * 12}%`,
                  borderRadius: 5,
                  backgroundColor: theme.colors.border,
                }}
              />
            </View>
          ))}
        </View>
      }
    />
  )
}
