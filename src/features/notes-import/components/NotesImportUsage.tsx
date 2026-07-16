import type { ReactNode } from 'react'
import { useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AnchoredPopover, {
  type ResolveAnchorPosition,
} from '@/components/ui/AnchoredPopover'
import Button from '@/components/ui/Button'
import CircularProgress from '@/components/ui/CircularProgress'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { formatDate } from '@/lib/dates'
import {
  notesImportPrimaryUsage,
  shouldShowNotesImportSupporterCta,
  type NotesImportCredits,
} from '@/features/notes-import/lib/notesImportUsage'

export type RenderNotesImportSupporterCta = (props: {
  onPress: () => void
}) => ReactNode

interface Props {
  credits: NotesImportCredits
  onRequestUpgrade?: () => void
  renderSupporterCta?: RenderNotesImportSupporterCta
}

/** A thin progress bar (fills by fraction remaining) with a direct balance. */
const UsageBar = ({
  remaining,
  limit,
  color,
  label,
}: {
  remaining: number | null
  limit: number | null
  color: string
  label: string
}) => {
  const theme = useTheme()
  const unlimited = remaining === null && limit === null
  const percentage = unlimited
    ? 1
    : limit === 0
      ? 0
      : Math.min(1, Math.max(0, (remaining ?? 0) / (limit ?? 1)))

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View
        style={{
          flex: 1,
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
      <Text
        style={{
          flexShrink: 1,
          textAlign: 'right',
          color: theme.colors.textAlt,
          fontSize: theme.fontSize('xs'),
        }}
      >
        {label}
      </Text>
    </View>
  )
}

const Detail = ({
  title,
  body,
  bar,
  caption,
}: {
  title: string
  body: string
  /** Optional progress bar rendered between the section title and its body. */
  bar?: ReactNode
  caption?: string
}) => {
  const theme = useTheme()
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontFamily: theme.fonts.semiBold }}>{title}</Text>
      {bar}
      {caption && (
        <Text
          style={{
            color: theme.colors.text,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {caption}
        </Text>
      )}
      <Text
        style={{
          color: theme.colors.textAlt,
          fontSize: theme.fontSize('sm'),
          lineHeight: 19,
        }}
      >
        {body}
      </Text>
    </View>
  )
}

/**
 * The Scribe AI usage affordance: a ghost button whose ring fills with the
 * relevant balance remaining: imports for metered users, or refinements when
 * imports are unlimited. Tapping opens the usage popover — the same
 * imports/refinements breakdown and Supporter CTA as before. It lives inline in
 * the composer's control row (the remaining refinement count is shown
 * per-message in the chat, so this no longer spells out numbers), with the
 * popover carrying the full detail one tap away.
 */
const NotesImportUsage = ({
  credits,
  onRequestUpgrade,
  renderSupporterCta,
}: Props) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { width: windowWidth } = useWindowDimensions()
  const contentWidth = Math.min(340, windowWidth - 24)
  const importsUnlimited = credits.remaining === null && credits.limit === null
  const primaryUsage = notesImportPrimaryUsage(credits)
  const importBalance = importsUnlimited
    ? i18n.t('notesImport_usageUnlimitedImports')
    : credits.limit === 0
      ? i18n.t('notesImport_usageNoImports')
      : credits.remaining === 0
        ? i18n.t('notesImport_usageImportAllowanceReached')
        : i18n.t('notesImport_usageImportsLeft', {
            remaining: credits.remaining,
            limit: credits.limit,
          })
  const refinementsUnlimited =
    credits.refinements.remaining === null && credits.refinements.limit === null
  const refinementBalance = refinementsUnlimited
    ? i18n.t('notesImport_usageUnlimitedRefinements')
    : credits.refinements.limit === 0
      ? i18n.t('notesImport_usageNoRefinements')
      : i18n.t('notesImport_usageRefinementsLeft', {
          remaining: credits.refinements.remaining,
          limit: credits.refinements.limit,
        })
  const resetCaption = credits.resetsAt
    ? i18n.t('notesImport_usageRefreshes', {
        date: formatDate(credits.resetsAt),
      })
    : undefined

  const ringProgress =
    primaryUsage.limit === null
      ? 1
      : primaryUsage.limit === 0
        ? 0
        : (primaryUsage.remaining ?? 0) / primaryUsage.limit
  const ringColor =
    primaryUsage.remaining === 0
      ? theme.colors.warn
      : primaryUsage.kind === 'refinements'
        ? theme.colors.indigo
        : theme.colors.accent

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
      contentStyle={{ padding: 16, gap: 16 }}
      renderTrigger={({ onPress, anchorRef }) => (
        <View ref={anchorRef} collapsable={false}>
          <Button
            noTransform
            onPress={onPress}
            accessibilityRole='button'
            accessibilityLabel={i18n.t('notesImport_usageAccessibilityLabel', {
              imports: importBalance,
              refinements: refinementBalance,
            })}
            accessibilityHint={i18n.t('notesImport_usageHint')}
            hitSlop={8}
            style={{
              width: 32,
              height: 32,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CircularProgress
              progress={ringProgress}
              size={22}
              strokeWidth={2.5}
              color={ringColor}
              trackColor={theme.colors.border}
            />
          </Button>
        </View>
      )}
    >
      {({ close }) => (
        <>
          <View style={{ gap: 4 }}>
            <Text
              style={{
                fontFamily: theme.fonts.bold,
                fontSize: theme.fontSize('lg'),
              }}
            >
              {i18n.t('notesImport_usagePopoverTitle')}
            </Text>
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {importsUnlimited && credits.isSupporter
                ? i18n.t('notesImport_usageSupporterStatus')
                : i18n.t('notesImport_usageIncludedStatus')}
            </Text>
          </View>
          <Detail
            title={i18n.t('notesImport_usageImports')}
            body={i18n.t('notesImport_usageImportsBody')}
            caption={resetCaption}
            bar={
              <UsageBar
                remaining={credits.remaining}
                limit={credits.limit}
                color={theme.colors.accent}
                label={importBalance}
              />
            }
          />
          <Detail
            title={i18n.t('notesImport_usageRefinements')}
            body={i18n.t('notesImport_usageRefinementsBody')}
            bar={
              <UsageBar
                remaining={credits.refinements.remaining}
                limit={credits.refinements.limit}
                color={theme.colors.indigo}
                label={refinementBalance}
              />
            }
          />
          {shouldShowNotesImportSupporterCta(credits) &&
            onRequestUpgrade &&
            renderSupporterCta && (
              <View
                style={{
                  gap: 10,
                  paddingTop: 14,
                  borderTopWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <View style={{ gap: 3 }}>
                  <Text style={{ fontFamily: theme.fonts.semiBold }}>
                    {i18n.t('notesImport_usageSupporterTitle')}
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.textAlt,
                      fontSize: theme.fontSize('sm'),
                      lineHeight: 19,
                    }}
                  >
                    {i18n.t('notesImport_usageSupporterBody')}
                  </Text>
                </View>
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
