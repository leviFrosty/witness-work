import WelcomeHero from '@/features/onboarding/components/welcome/WelcomeHero'

interface Props {
  goNext: () => void
  goBack?: () => void
  /** Opens "Pick up where you left off". */
  goToRestore?: () => void
}

const StepOne = ({ goNext, goToRestore }: Props) => (
  <WelcomeHero onGetStarted={goNext} onReturningUser={goToRestore ?? goNext} />
)

export default StepOne
