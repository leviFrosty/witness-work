import type { ReactNode } from 'react'
import { useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AnchoredPopover, {
  type ResolveAnchorPosition,
} from '@/components/ui/AnchoredPopover'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { formatDate } from '@/lib/dates'
import {
  shouldShowNotesImportSupporterCta,
  type NotesImportCredits,
} from '@/features/notes-import/lib/notesImportUsage'

export type RenderNotesImportSupporterCta = (props: {
  onPress: () => void
}) => ReactNode

interface Props {
  credits: NotesImportCredits | null
  onRequestUpgrade?: () => void
  renderSupporterCta?: RenderNotesImportSupporterCta
}

const usagePercentage = (
  remaining: number | null,
  limit: number | null
): number =>
  limit === null
    ? 1
    : limit === 0
      ? 0
      : Math.min(1, Math.max(0, (remaining ?? 0) / limit))

/** A thin progress bar that fills by the fraction of imports remaining. */
const UsageBar = ({
  remaining,
  limit,
  color,
}: {
  remaining: number | null
  limit: number | null
  color: string
}) => {
  const theme = useTheme()
  const unlimited = remaining === null && limit === null
  const percentage = usagePercentage(remaining, limit)

  return (
    <View
      style={{
        height: 6,
        overflow: 'hidden',
        borderRadius: 3,
        backgroundColor: theme.colors.background,
      }}
    >
      <View
        style={{
          width: `${percentage * 100}%`,
          height: '100%',
          borderRadius: 3,
          backgroundColor: color,
          opacity: unlimited ? 0.55 : 1,
        }}
      />
    </View>
  )
}

/**
 * Compact Import Credit balance beside the composer. The trigger always refers
 * to imports (for example, “5 left”); refinement allowances stay in the active
 * conversation instead. Tapping opens a dense import-only breakdown.
 */
const NotesImportUsage = ({
  credits,
  onRequestUpgrade,
  renderSupporterCta,
}: Props) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { width: windowWidth } = useWindowDimensions()
  const contentWidth = Math.min(300, windowWidth - 24)
  const importsUnlimited =
    !!credits && credits.remaining === null && credits.limit === null
  const importBalance = !credits
    ? i18n.t('notesImport_usageUnavailable')
    : importsUnlimited
      ? i18n.t('notesImport_usageUnlimitedImports')
      : i18n.t('notesImport_usageImportsLeft', {
          remaining: credits.remaining ?? 0,
          limit: credits.limit ?? 0,
        })
  const triggerLabel = !credits
    ? i18n.t('notesImport_usageUnavailableShort')
    : importsUnlimited
      ? i18n.t('notesImport_usageUnlimitedShort')
      : i18n.t('notesImport_usageRemainingShort', {
          remaining: credits.remaining ?? 0,
        })
  const resetCaption = credits?.resetsAt
    ? i18n.t('notesImport_usageRefreshes', {
        date: formatDate(credits.resetsAt),
      })
    : undefined

  const resolvePosition: ResolveAnchorPosition = ({
    anchor,
    windowWidth: width,
    windowHeight,
    contentWidth: popoverWidth,
  }) => {
    const margin = 12
    const gap = 8
    // The trigger sits low in the composer, so pin the popover's BOTTOM just
    // above it and let it grow upward — capped to the room down from the top
    // safe inset so it can never run off the top, with any overflow scrolling.
    const topSafe = insets.top + margin
    const maxHeight = Math.max(160, anchor.y - gap - topSafe)
    const left = Math.min(
      Math.max(margin, anchor.x + anchor.width - popoverWidth),
      width - popoverWidth - margin
    )
    return {
      bottom: windowHeight - anchor.y + gap,
      left,
      maxHeight,
    }
  }

  return (
    <AnchoredPopover
      contentWidth={contentWidth}
      resolvePosition={resolvePosition}
      contentStyle={{ padding: 14, gap: 12 }}
      renderTrigger={({ onPress, anchorRef }) => (
        <View ref={anchorRef} collapsable={false}>
          <Button
            noTransform
            onPress={onPress}
            accessibilityRole='button'
            accessibilityLabel={i18n.t(
              'notesImport_importUsageAccessibilityLabel',
              { imports: importBalance }
            )}
            accessibilityHint={i18n.t('notesImport_usageHint')}
            hitSlop={8}
            style={{
              minWidth: 50,
              height: 32,
              paddingHorizontal: 10,
              borderRadius: theme.numbers.borderRadiusXl,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.accentTranslucent,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                color: theme.colors.accent,
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('xs'),
              }}
            >
              {triggerLabel}
            </Text>
          </Button>
        </View>
      )}
    >
      {({ close }) => (
        <>
          <View style={{ gap: 8 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <Text
                style={{
                  flex: 1,
                  fontFamily: theme.fonts.bold,
                  fontSize: theme.fontSize('lg'),
                }}
              >
                {i18n.t('notesImport_usagePopoverTitle')}
              </Text>
              <Text
                style={{
                  flexShrink: 1,
                  color: theme.colors.accent,
                  fontFamily: theme.fonts.semiBold,
                  fontSize: theme.fontSize('sm'),
                  textAlign: 'right',
                }}
              >
                {importBalance}
              </Text>
            </View>
            {credits && (
              <UsageBar
                remaining={credits.remaining}
                limit={credits.limit}
                color={theme.colors.accent}
              />
            )}
            {resetCaption && (
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('xs'),
                }}
              >
                {resetCaption}
              </Text>
            )}
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
                lineHeight: 18,
              }}
            >
              {i18n.t('notesImport_usageImportsBody')}
            </Text>
          </View>
          {credits &&
            shouldShowNotesImportSupporterCta(credits) &&
            onRequestUpgrade &&
            renderSupporterCta && (
              <View
                style={{
                  paddingTop: 12,
                  borderTopWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                {renderSupporterCta({
                  onPress: () => {
                    close()
                    onRequestUpgrade()
                  },
                })}
              </View>
            )}
        </>
      )}
    </AnchoredPopover>
  )
}

export default NotesImportUsage
