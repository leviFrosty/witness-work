import { View } from 'react-native'
import { styles } from '@/features/onboarding/components/Onboarding.styles'
import OnboardingNav from '@/features/onboarding/components/OnboardingNav'
import BadgesPreview from '@/features/onboarding/components/BadgesPreview'
import Text from '@/components/ui/MyText'
import InfoPopover from '@/components/ui/InfoPopover'
import Wrapper from '@/components/ui/layout/Wrapper'
import ActionButton from '@/components/ui/ActionButton'
import i18n from '@/lib/locales'

interface Props {
  goBack: () => void
  goNext: () => void
  /** Where Buddies is unavailable, badges stay on the User's own profile. */
  buddiesAvailable: boolean
}

/**
 * Introduces badges before setup finishes, so the first one doesn't arrive
 * unexplained: the preview acts out earning one, and the copy says how they
 * grow and who sees them. Nothing to choose: badges grow on their own, and
 * Preferences can hide them later.
 */
const Badges = ({ goBack, goNext, buddiesAvailable: buddies }: Props) => {
  return (
    <Wrapper
      style={{
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 100,
        justifyContent: 'space-between',
      }}
    >
      <OnboardingNav goBack={goBack} />
      <View>
        <View style={{ marginBottom: 24 }}>
          <BadgesPreview buddies={buddies} />
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <Text
            // Keeps a short last line from holding a single word.
            textBreakStrategy='balanced'
            lineBreakStrategyIOS='push-out'
            style={[styles.stepTitle, { marginBottom: 0, flexShrink: 1 }]}
          >
            {i18n.t('onboardingBadges_title')}
          </Text>
          <InfoPopover
            title={i18n.t('badges_title')}
            description={i18n.t(
              buddies
                ? 'onboardingBadges_info'
                : 'onboardingBadges_infoNoBuddies'
            )}
          />
        </View>
        <Text style={styles.description}>
          {i18n.t(
            buddies
              ? 'onboardingBadges_description'
              : 'onboardingBadges_descriptionNoBuddies'
          )}
        </Text>
      </View>
      <ActionButton onPress={goNext}>{i18n.t('continue')}</ActionButton>
    </Wrapper>
  )
}

export default Badges
