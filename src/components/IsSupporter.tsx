import { ReactNode, useState } from 'react'
import { Pressable, View } from 'react-native'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import Text from '@/components/ui/MyText'
import SupporterBadge from '@/components/SupporterBadge'
import SupporterInfoSheet from '@/components/SupporterInfoSheet'
import useFeatureAccess from '@/hooks/useFeatureAccess'
import type { FeatureKey } from '@/lib/featureAccess'
import useSupporterGateAnalytics from '@/hooks/useSupporterGateAnalytics'
import type {
  SupporterGateAttribution,
  SupporterGateSurface,
} from '@/lib/supporterGateAnalytics'

interface Props {
  children: ReactNode

  feature: FeatureKey

  analyticsSurface: SupporterGateSurface

  size?: 'sm' | 'md' | 'lg'

  title?: string

  fill?: boolean
}

const IsSupporter = ({
  children,
  feature,
  analyticsSurface,
  size = 'sm',
  title,
  fill,
}: Props) => {
  const theme = useTheme()
  const { hasAccess } = useFeatureAccess(feature)

  const largeText = useAccessibilityTextSize()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [attribution, setAttribution] = useState<SupporterGateAttribution>()
  const { headerRef, recordClick } = useSupporterGateAnalytics(
    feature,
    analyticsSurface,
    hasAccess
  )

  const titleEl = title ? (
    <Text
      style={{
        flexShrink: 1,
        fontFamily: theme.fonts.semiBold,
        color: theme.colors.text,
      }}
    >
      {title}
    </Text>
  ) : null

  if (hasAccess) {
    return (
      <View style={{ gap: 10, ...(fill ? { flex: 1 } : null) }}>
        {titleEl}
        {children}
      </View>
    )
  }

  return (
    <>
      <Pressable
        onPress={() => {
          if (sheetOpen) return
          setAttribution(recordClick())
          setSheetOpen(true)
        }}
        style={{
          gap: 10,
          ...(fill
            ? {
                flex: 1,
                backgroundColor: theme.colors.background,
                paddingTop: 10,
              }
            : null),
        }}
      >
        <View
          ref={headerRef}
          collapsable={false}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: title ? 'space-between' : 'flex-end',
            flexWrap: largeText ? 'wrap' : undefined,
            gap: 12,
            ...(fill ? { paddingHorizontal: 12 } : null),
          }}
        >
          {titleEl}
          <SupporterBadge size={size} />
        </View>
        <View pointerEvents='none' style={{ opacity: 0.3 }}>
          {children}
        </View>
      </Pressable>
      <SupporterInfoSheet
        open={sheetOpen}
        setOpen={setSheetOpen}
        featureKey={feature}
        attribution={attribution}
      />
    </>
  )
}

export default IsSupporter
