import WelcomeHero from '@/features/onboarding/components/welcome/WelcomeHero'

interface Props {
  goNext: () => void
  goBack?: () => void
  goToStep?: (stepId: 'pickUpWhereLeftOff') => void
}

const StepOne = ({ goNext, goToStep }: Props) => {
  const handleReturningUser = () => {
    if (goToStep) {
      goToStep('pickUpWhereLeftOff')
      return
    }
    goNext()
    goNext()
  }

  return (
    <WelcomeHero onGetStarted={goNext} onReturningUser={handleReturningUser} />
  )
}

export default StepOne
