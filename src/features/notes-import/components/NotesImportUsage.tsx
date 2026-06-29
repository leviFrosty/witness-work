import type { ReactNode } from 'react'
import { useWindowDimensions, View } from 'react-native'
import { faChevronRight, faCircleInfo } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import AnchoredPopover, {
  type ResolveAnchorPosition,
} from '@/components/ui/AnchoredPopover'
import Button from '@/components/ui/Button'
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
  /**
   * One-line chip for the chat header; full guidance and policy stay in the
   * popover.
   */
  compact?: boolean
}

interface UsageRowProps {
  label: string
  used: number | null
  remaining: number | null
  limit: number | null
  color: string
  unlimited?: boolean
}

const UsageRow = ({
  label,
  used,
  remaining,
  limit,
  color,
  unlimited,
}: UsageRowProps) => {
  const theme = useTheme()
  const percentage =
    unlimited || used === null || limit === null || limit === 0
      ? 1
      : Math.min(1, Math.max(0, used / limit))
  const valueLabel = unlimited
    ? i18n.t('notesImport_usageUnlimited')
    : i18n.t('notesImport_usageUsed', { used, limit })
  const remainingLabel = unlimited
    ? i18n.t('notesImport_usageNoLimit')
    : i18n.t('notesImport_usageRemaining', { count: remaining ?? 0 })

  return (
    <View style={{ gap: 6 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <Text
          style={{
            flex: 1,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('xs'),
          }}
        >
          {valueLabel}
        </Text>
        <Text
          style={{
            minWidth: 45,
            color,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('xs'),
            textAlign: 'right',
          }}
        >
          {remainingLabel}
        </Text>
      </View>
      <View
        style={{
          height: 5,
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
    </View>
  )
}

const Detail = ({ title, body }: { title: string; body: string }) => {
  const theme = useTheme()
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontFamily: theme.fonts.semiBold }}>{title}</Text>
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

/** Usage disclosure with a card treatment or a one-line review variant. */
const NotesImportUsage = ({
  credits,
  onRequestUpgrade,
  renderSupporterCta,
  compact = false,
}: Props) => {
  const theme = useTheme()
  const { width: windowWidth } = useWindowDimensions()
  const contentWidth = Math.min(340, windowWidth - 24)
  const importsUnlimited = credits.isSupporter || credits.remaining === null
  const importsUsed =
    credits.limit === null || credits.remaining === null
      ? null
      : Math.max(0, credits.limit - credits.remaining)
  const refinementsUsed = Math.max(
    0,
    credits.refinements.limit - credits.refinements.remaining
  )

  const resolvePosition: ResolveAnchorPosition = ({
    anchor,
    windowWidth: width,
    windowHeight,
    contentWidth: popoverWidth,
  }) => {
    const margin = 12
    const estimatedHeight = importsUnlimited ? 240 : 340
    const left = Math.min(
      Math.max(margin, anchor.x),
      width - popoverWidth - margin
    )
    const below = anchor.y + anchor.height + 8
    return {
      top: Math.max(margin, Math.min(below, windowHeight - estimatedHeight)),
      left,
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
            style={
              compact
                ? {
                    minHeight: 32,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 7,
                    paddingHorizontal: 2,
                    paddingVertical: 4,
                  }
                : {
                    gap: 10,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: theme.numbers.borderRadiusMd,
                    backgroundColor: theme.colors.backgroundLighter,
                  }
            }
          >
            {compact ? (
              <View
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 7,
                }}
              >
                <FontAwesomeIcon
                  icon={faCircleInfo}
                  size={12}
                  color={theme.colors.textAlt}
                />
                <Text
                  numberOfLines={1}
                  style={{
                    flex: 1,
                    fontFamily: theme.fonts.semiBold,
                    fontSize: theme.fontSize('sm'),
                  }}
                >
                  {i18n.t('notesImport_usageTitle')}
                </Text>
                <View
                  style={{
                    flexShrink: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.accent,
                      fontFamily: theme.fonts.semiBold,
                      fontSize: theme.fontSize('xs'),
                    }}
                  >
                    {importsUnlimited ? '∞' : credits.remaining}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      flexShrink: 1,
                      color: theme.colors.textAlt,
                      fontSize: theme.fontSize('xs'),
                    }}
                  >
                    {i18n.t('notesImport_usageImports')}
                  </Text>
                </View>
                <Text
                  style={{
                    color: theme.colors.textAlt,
                    fontSize: theme.fontSize('xs'),
                  }}
                >
                  ·
                </Text>
                <View
                  style={{
                    flexShrink: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.indigo,
                      fontFamily: theme.fonts.semiBold,
                      fontSize: theme.fontSize('xs'),
                    }}
                  >
                    {credits.refinements.remaining}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      flexShrink: 1,
                      color: theme.colors.textAlt,
                      fontSize: theme.fontSize('xs'),
                    }}
                  >
                    {i18n.t('notesImport_usageRefinements')}
                  </Text>
                </View>
                <FontAwesomeIcon
                  icon={faChevronRight}
                  size={9}
                  color={theme.colors.textAlt}
                />
              </View>
            ) : (
              <>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <Text style={{ fontFamily: theme.fonts.semiBold }}>
                    {i18n.t('notesImport_usageTitle')}
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <Text
                      style={{
                        color: theme.colors.textAlt,
                        fontSize: theme.fontSize('xs'),
                      }}
                    >
                      {i18n.t('notesImport_usageDetails')}
                    </Text>
                    <FontAwesomeIcon
                      icon={faChevronRight}
                      size={9}
                      color={theme.colors.textAlt}
                    />
                  </View>
                </View>
                <UsageRow
                  label={i18n.t('notesImport_usageImports')}
                  used={importsUsed}
                  remaining={credits.remaining}
                  limit={credits.limit}
                  color={theme.colors.accent}
                  unlimited={importsUnlimited}
                />
                <UsageRow
                  label={i18n.t('notesImport_usageRefinements')}
                  used={refinementsUsed}
                  remaining={credits.refinements.remaining}
                  limit={credits.refinements.limit}
                  color={theme.colors.indigo}
                />
              </>
            )}
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
          />
          <Detail
            title={i18n.t('notesImport_usageRefinements')}
            body={i18n.t('notesImport_usageRefinementsBody', {
              count: credits.refinements.limit,
            })}
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
