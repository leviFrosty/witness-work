import { createContext, useContext } from 'react'

export interface OnboardingProgress {
  currentStep?: number
  totalSteps?: number
}

export const OnboardingProgressContext = createContext<OnboardingProgress>({})

export const useOnboardingProgress = (): OnboardingProgress =>
  useContext(OnboardingProgressContext)
