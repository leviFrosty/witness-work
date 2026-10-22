import { View, useWindowDimensions } from 'react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import Haptics from '@/lib/haptics'
import i18n, { type TranslationKey } from '@/lib/locales'
import { showUndoToast } from '@/stores/undoToast'
import { undoScribeProposal, useScribeProposal } from '@/features/scribe'

// Pinned above the composer, so the cards keep room to scroll at the
// largest text sizes; the cards themselves scale fully.
const FOOTER_FONT_SCALE_CAP = 1.4

/**
 * Add N and the disclaimer, pinned above the composer while a Proposal waits
 * for review. Disabled until every checked "Which …?" card has its person.
 */
const ScribeReviewFooter = ({ proposalId }: { proposalId: string }) => {
  const theme = useTheme()
  const { fontScale } = useWindowDimensions()
  const controller = useScribeProposal(proposalId)
  const { proposal, counts, canAdd } = controller
  if (
    !proposal ||
    (proposal.status !== 'pending' && proposal.status !== 'applying')
  )
    return null
  const applying = proposal.status === 'applying'

  const add = async () => {
    const result = await controller.add()
    // Failed, or everything changed since: the conversation says why, and
    // there's nothing to undo.
    if (result.status === 'failed' || result.appliedCards === 0) {
      void Haptics.error()
      return
    }
    void Haptics.success()
    showUndoToast({
      message: i18n.t('scribe_added' as TranslationKey, {
        count: result.appliedCards,
      }),
      onUndo: () => void undoScribeProposal(proposalId, 'toast'),
    })
  }

  return (
    <View style={{ gap: 8 }}>
      {counts.needsChoice > 0 ? (
        <Text
          accessibilityLiveRegion='polite'
          allowFontScaling={false}
          style={{
            textAlign: 'center',
            fontSize:
              theme.fontSize('sm') * Math.min(fontScale, FOOTER_FONT_SCALE_CAP),
            color: theme.colors.warnText,
          }}
        >
          {i18n.t('scribe_addBlocked')}
        </Text>
      ) : null}
      <Button
        noTransform
        onPress={() => void add()}
        disabled={!canAdd || applying}
        loading={applying}
        loadingColor={theme.colors.textInverse}
        style={{
          minHeight: 54,
          paddingVertical: 8,
          borderRadius: 999,
          backgroundColor: canAdd
            ? theme.colors.accent
            : theme.colors.accentAlt,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          maxFontSizeMultiplier={FOOTER_FONT_SCALE_CAP}
          style={{
            fontSize: theme.fontSize('lg'),
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.textInverse,
          }}
        >
          {i18n.t('scribe_add' as TranslationKey, { count: counts.selected })}
        </Text>
      </Button>
      <Text
        // Scaled here rather than with `maxFontSizeMultiplier`, which measures
        // the Text at full size and leaves a gap under it.
        allowFontScaling={false}
        style={{
          textAlign: 'center',
          fontSize:
            (theme.fontSize('xs') + 1) *
            Math.min(fontScale, FOOTER_FONT_SCALE_CAP),
          color: theme.colors.textAlt,
        }}
      >
        {i18n.t('scribe_disclaimer')}
      </Text>
    </View>
  )
}

export default ScribeReviewFooter
