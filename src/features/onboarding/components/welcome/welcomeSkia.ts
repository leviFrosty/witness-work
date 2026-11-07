import type WelcomeBackdropComponent from '@/features/onboarding/components/welcome/WelcomeBackdrop'
import type WelcomeCurtainComponent from '@/features/onboarding/components/welcome/WelcomeCurtain'
import { canvasKitComponent } from '@/lib/canvasKit/canvasKitComponent'

export const WelcomeBackdrop = canvasKitComponent(
  (): typeof WelcomeBackdropComponent =>
    require('@/features/onboarding/components/welcome/WelcomeBackdrop').default
)

export const WelcomeCurtain = canvasKitComponent(
  (): typeof WelcomeCurtainComponent =>
    require('@/features/onboarding/components/welcome/WelcomeCurtain').default
)
