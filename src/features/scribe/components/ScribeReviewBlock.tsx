import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import {
  Mic as MicIcon,
  NotebookText as NotebookTextIcon,
  TriangleAlert as TriangleAlertIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import i18n, { type TranslationKey } from '@/lib/locales'
import type { RootStackNavigation } from '@/types/rootStack'
import {
  undoScribeProposal,
  useScribeProposal,
  type ScribeCardTarget,
  type ScribeProposalStatus,
} from '@/features/scribe'
import ScribeReviewCard from '@/features/scribe/components/ScribeReviewCard'

interface Props {
  proposalId: string

  onSayAChange?: () => void
}

const COLLAPSED: Partial<
  Record<
    ScribeProposalStatus,
    'scribe_notAdded' | 'scribe_replaced' | 'scribe_undone'
  >
> = {
  dismissed: 'scribe_notAdded',
  superseded: 'scribe_replaced',
  undone: 'scribe_undone',
}

const Note = ({
  text,
  tone = 'muted',
  icon,
}: {
  text: string
  tone?: 'muted' | 'warn'
  icon?: typeof NotebookTextIcon
}) => {
  const theme = useTheme()
  const color = tone === 'warn' ? theme.colors.warnText : theme.colors.textAlt
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 4,
      }}
    >
      {icon ? <LucideIcon icon={icon} size={14} color={color} /> : null}
      <Text style={{ flex: 1, fontSize: theme.fontSize('sm'), color }}>
        {text}
      </Text>
    </View>
  )
}

const ScribeReviewBlock = ({ proposalId, onSayAChange }: Props) => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const stacked = useAccessibilityTextSize()
  const controller = useScribeProposal(proposalId)
  const { proposal, counts } = controller
  if (!proposal) return null

  const open = (target: ScribeCardTarget) =>
    target.type === 'contact'
      ? navigation.navigate('Contact Details', {
          id: target.contactId,
          highlightedVisitId: target.visitId ?? undefined,
        })
      : navigation.navigate('Plan Details', { dayPlanId: target.planId })

  const keptNote =
    proposal.undoKept > 0 ? (
      <Note
        icon={TriangleAlertIcon}
        text={i18n.t('scribe_undoKept' as TranslationKey, {
          count: proposal.undoKept,
        })}
      />
    ) : null

  const collapsed = COLLAPSED[proposal.status]
  if (collapsed)
    return (
      <View style={{ gap: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            columnGap: 8,
            rowGap: 2,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderRadius: 16,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: theme.colors.border,
          }}
        >
          <Text
            style={{
              flexGrow: 1,
              flexShrink: 1,
              fontSize: theme.fontSize('md'),
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('scribe_reviewTitle')}
          </Text>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t(collapsed)}
          </Text>
        </View>
        {keptNote}
      </View>
    )

  const pending =
    proposal.status === 'pending' || proposal.status === 'applying'
  const appliedCount = proposal.cards.filter(
    (c) => c.status === 'applied' || c.status === 'partial'
  ).length
  const skippedCount = proposal.cards.filter(
    (c) => c.status === 'skipped'
  ).length
  const applied =
    proposal.status === 'applied' || proposal.status === 'partially_applied'

  const countsLine = [
    i18n.t('scribe_reviewReady' as TranslationKey, { count: counts.ready }),
    counts.needsChoice > 0
      ? i18n.t('scribe_reviewNeedsChoice' as TranslationKey, {
          count: counts.needsChoice,
        })
      : null,
    counts.needsConsent > 0
      ? i18n.t('scribe_reviewNeedsConsent' as TranslationKey, {
          count: counts.needsConsent,
        })
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <View style={{ gap: 10 }}>
      {}
      <View
        style={
          stacked
            ? { alignItems: 'flex-start', gap: 8 }
            : { flexDirection: 'row', alignItems: 'center', gap: 12 }
        }
      >
        <View style={{ alignSelf: 'stretch', flex: stacked ? 0 : 1, gap: 2 }}>
          <Text
            accessibilityRole='header'
            style={{
              fontSize: theme.fontSize('xl'),
              fontFamily: theme.fonts.bold,
            }}
          >
            {applied && appliedCount > 0
              ? i18n.t('scribe_added' as TranslationKey, {
                  count: appliedCount,
                })
              : applied
                ? i18n.t('scribe_notAdded')
                : i18n.t('scribe_reviewTitle')}
          </Text>
          {pending ? (
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
              }}
            >
              {countsLine}
            </Text>
          ) : null}
        </View>
        {pending ? (
          onSayAChange ? (
            <Button
              noTransform
              onPress={onSayAChange}
              disabled={proposal.status === 'applying'}
              style={{
                minHeight: 44,
                paddingHorizontal: 14,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.backgroundLighter,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <LucideIcon icon={MicIcon} size={15} color={theme.colors.text} />
              <Text
                style={{
                  fontSize: theme.fontSize('sm') + 1,
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('scribe_sayAChange')}
              </Text>
            </Button>
          ) : null
        ) : applied && controller.canUndo ? (
          <Button
            noTransform
            onPress={() => void undoScribeProposal(proposal.id, 'conversation')}
            style={{
              minHeight: 44,
              paddingHorizontal: 14,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontSize: theme.fontSize('md'),
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.accent,
              }}
            >
              {i18n.t('scribe_undo')}
            </Text>
          </Button>
        ) : null}
      </View>
      <View style={{ gap: 10 }}>
        {proposal.cards.map((card) => {
          const { target } = card
          return (
            <ScribeReviewCard
              key={card.id}
              card={card}
              editable={proposal.status === 'pending'}
              onToggle={() => controller.toggleCard(card.id)}
              onChoose={(choice) => controller.chooseContact(card.id, choice)}
              onConsent={(agreed) => controller.setConsent(card.id, agreed)}
              onOpen={target ? () => open(target) : undefined}
            />
          )
        })}
      </View>
      {proposal.invalidCount > 0 ? (
        <Note
          icon={TriangleAlertIcon}
          tone='warn'
          text={i18n.t('scribe_reviewInvalid' as TranslationKey, {
            count: proposal.invalidCount,
          })}
        />
      ) : null}
      {proposal.tainted ? (
        <Note icon={NotebookTextIcon} text={i18n.t('scribe_reviewFromNotes')} />
      ) : null}
      {proposal.status === 'partially_applied' && skippedCount > 0 ? (
        <Note
          tone='warn'
          icon={TriangleAlertIcon}
          text={i18n.t('scribe_applySkipped' as TranslationKey, {
            count: skippedCount,
          })}
        />
      ) : null}
      {keptNote}
      {proposal.status === 'failed' ? (
        <Note
          tone='warn'
          icon={TriangleAlertIcon}
          text={i18n.t('scribe_applyFailed')}
        />
      ) : null}
    </View>
  )
}

export default ScribeReviewBlock
