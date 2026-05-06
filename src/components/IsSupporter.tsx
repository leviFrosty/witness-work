import { ReactNode, useState } from 'react'
import { Pressable, View } from 'react-native'
import useTheme from '../contexts/theme'
import Text from './MyText'
import SupporterBadge from './SupporterBadge'
import SupporterInfoSheet from './SupporterInfoSheet'
import useFeatureAccess from '../hooks/useFeatureAccess'
import type { FeatureKey } from '../lib/featureAccess'

interface Props {
  children: ReactNode
  /**
   * Which feature this gate protects. Drives the copy shown in the info sheet
   * when access is denied.
   */
  feature: FeatureKey
  /** Size of the supporter badge. */
  size?: 'sm' | 'md' | 'lg'
  /**
   * Optional heading rendered in the section's title row. When provided, the
   * badge sits inline alongside the title so it feels like part of the section
   * header rather than a floating label. Without it, the badge stacks above
   * `children` (top-right aligned) as a fallback.
   */
  title?: string
  /**
   * Fill available vertical space. Use when the gate wraps an entire screen so
   * its children can flex to full height.
   */
  fill?: boolean
}

/**
 * Single-source-of-truth gate for supporter-only features. Wraps any content
 * with the full non-supporter treatment — dimming, badge, and the educational
 * sheet that links to the paywall — so callers never have to repeat
 * `useIsSupporter()` + gate boilerplate.
 *
 * Supporters see the title (if any) and `children` rendered cleanly.
 * Non-supporters see a tappable block whose header row holds the title and
 * supporter badge side-by-side, with dimmed pointer-disabled children below.
 */
const IsSupporter = ({
  children,
  feature,
  size = 'sm',
  title,
  fill,
}: Props) => {
  const theme = useTheme()
  const { hasAccess } = useFeatureAccess(feature)
  const [sheetOpen, setSheetOpen] = useState(false)

  const titleEl = title ? (
    <Text
      style={{
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
        onPress={() => setSheetOpen(true)}
        style={{ gap: 10, ...(fill ? { flex: 1 } : null) }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: title ? 'space-between' : 'flex-end',
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
      />
    </>
  )
}

export default IsSupporter
