import type WelcomeBackdropComponent from '@/features/onboarding/components/welcome/WelcomeBackdrop'
import type WelcomeCurtainComponent from '@/features/onboarding/components/welcome/WelcomeCurtain'
import { canvasKitComponent } from '@/lib/canvasKit/canvasKitComponent'

// The welcome scene's Skia layers. On the web they draw once CanvasKit has
// downloaded; until then, or without WebGL, the scene shows its plain
// background and skips the curtain, and onboarding goes on.

export const WelcomeBackdrop = canvasKitComponent(
  (): typeof WelcomeBackdropComponent =>
    require('@/features/onboarding/components/welcome/WelcomeBackdrop').default
)

export const WelcomeCurtain = canvasKitComponent(
  (): typeof WelcomeCurtainComponent =>
    require('@/features/onboarding/components/welcome/WelcomeCurtain').default
)
