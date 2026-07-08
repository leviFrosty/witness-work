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
import {
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

/** A thin progress bar (fills by fraction remaining) with a trailing label. */
const UsageBar = ({
  remaining,
  limit,
  color,
  unlimited,
}: {
  remaining: number | null
  limit: number | null
  color: string
  unlimited?: boolean
}) => {
  const theme = useTheme()
  const percentage =
    unlimited || remaining === null || limit === null || limit === 0
      ? 1
      : Math.min(1, Math.max(0, remaining / limit))
  const label = unlimited
    ? i18n.t('notesImport_usageNoLimit')
    : i18n.t('notesImport_usagePercentRemaining', {
        percent: Math.round(percentage * 100),
      })

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
          minWidth: 58,
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
}: {
  title: string
  body: string
  /** Optional progress bar rendered between the section title and its body. */
  bar?: ReactNode
}) => {
  const theme = useTheme()
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontFamily: theme.fonts.semiBold }}>{title}</Text>
      {bar}
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
 * fraction of import credits spent (full and muted when imports are unlimited).
 * Tapping opens the usage popover — the same imports/refinements breakdown and
 * Supporter CTA as before. It lives inline in the composer's control row (the
 * remaining refinement count is shown per-message in the chat, so this no
 * longer spells out numbers), with the popover carrying the full detail one tap
 * away.
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
  const importsUnlimited = credits.isSupporter || credits.remaining === null

  // The ring shows the import-credit balance remaining. Unlimited plans show a
  // full, muted ring; a depleted balance goes warn-colored.
  const ringProgress =
    importsUnlimited || credits.remaining === null || !credits.limit
      ? 1
      : credits.remaining / credits.limit
  const ringColor = importsUnlimited
    ? theme.colors.accentTranslucent
    : credits.remaining === 0
      ? theme.colors.warn
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
              imports:
                credits.remaining === null
                  ? i18n.t('notesImport_usageUnlimited')
                  : credits.remaining,
              refinements: credits.refinements.remaining,
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
              {importsUnlimited
                ? credits.isSupporter
                  ? i18n.t('notesImport_usageSupporterStatus')
                  : i18n.t('notesImport_usageDevelopmentStatus')
                : i18n.t('notesImport_usageIncludedStatus')}
            </Text>
          </View>
          <Detail
            title={i18n.t('notesImport_usageImports')}
            body={i18n.t('notesImport_usageImportsBody')}
            bar={
              <UsageBar
                remaining={credits.remaining}
                limit={credits.limit}
                color={theme.colors.accent}
                unlimited={importsUnlimited}
              />
            }
          />
          <Detail
            title={i18n.t('notesImport_usageRefinements')}
            body={i18n.t('notesImport_usageRefinementsBody', {
              count: credits.refinements.limit,
            })}
            bar={
              <UsageBar
                remaining={credits.refinements.remaining}
                limit={credits.refinements.limit}
                color={theme.colors.indigo}
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
