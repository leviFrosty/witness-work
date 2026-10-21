import type { ReactNode } from 'react'
import { useWindowDimensions, View } from 'react-native'
import Popover from '@/components/ui/Popover'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { formatDate } from '@/lib/dates'
import {
  isUnlimitedUsage,
  notesImportUsageView,
  type NotesImportCredits,
  type NotesImportPublicSchedule,
} from '@/features/notes-import/lib/notesImportUsage'
import {
  notesImportUsageBody,
  notesImportUsageLabels,
} from '@/features/notes-import/lib/notesImportUsageCopy'
import { alignText } from '@/lib/direction'

export type RenderNotesImportSupporterCta = (props: {
  onPress: () => void
}) => ReactNode

interface Props {
  credits: NotesImportCredits | null
  /** The public allowance schedule, for the copy before the first import. */
  schedule: NotesImportPublicSchedule | null
  /** This device's own Supporter entitlement, until the server's answer. */
  supporter: boolean
  onRequestUpgrade?: () => void
  renderSupporterCta?: RenderNotesImportSupporterCta
  /** Opening the breakdown; the composer reads the account's balance again. */
  onOpen?: () => void
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
  schedule,
  supporter,
  onRequestUpgrade,
  renderSupporterCta,
  onOpen,
}: Props) => {
  const theme = useTheme()
  const { width: windowWidth } = useWindowDimensions()
  const contentWidth = Math.min(300, windowWidth - 24)
  const { view, isSupporter } = notesImportUsageView({
    credits,
    schedule,
    supporter,
  })
  const { balance: importBalance, trigger: triggerLabel } =
    notesImportUsageLabels(view)
  const resetCaption =
    view.kind === 'balance' && view.credits.resetsAt
      ? i18n.t('notesImport_usageRefreshes', {
          date: formatDate(view.credits.resetsAt),
        })
      : view.kind === 'allowance' && view.limit !== null && view.limit > 0
        ? i18n.t('notesImport_usageBalanceAfterImport')
        : undefined

  return (
    <Popover
      contentWidth={contentWidth}
      contentStyle={{ padding: 14, gap: 12 }}
      renderTrigger={({ onPress }) => (
        <Button
          noTransform
          onPress={() => {
            onOpen?.()
            onPress()
          }}
          accessibilityRole='button'
          accessibilityLabel={i18n.t(
            'notesImport_importUsageAccessibilityLabel',
            { imports: importBalance }
          )}
          accessibilityHint={i18n.t('notesImport_usageHint')}
          hitSlop={8}
          style={{
            minWidth: 50,
            // Grows with large text instead of clipping the label.
            minHeight: 32,
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
      )}
    >
      {({ closeThen }) => (
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
                  textAlign: alignText('end'),
                }}
              >
                {importBalance}
              </Text>
            </View>
            {(view.kind === 'balance' || isUnlimitedUsage(view)) && (
              <UsageBar
                remaining={
                  view.kind === 'balance' ? view.credits.remaining : null
                }
                limit={view.kind === 'balance' ? view.credits.limit : null}
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
              {notesImportUsageBody(view, isSupporter)}
            </Text>
          </View>
          {!isSupporter && onRequestUpgrade && renderSupporterCta && (
            <View
              style={{
                paddingTop: 12,
                borderTopWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              {renderSupporterCta({
                onPress: () => closeThen(onRequestUpgrade),
              })}
            </View>
          )}
        </>
      )}
    </Popover>
  )
}

export default NotesImportUsage
