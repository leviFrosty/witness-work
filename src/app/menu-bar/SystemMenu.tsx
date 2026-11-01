import { useEffect, useState } from 'react'
import { usePreferences } from '@/stores/preferences'
import usePublisher from '@/hooks/usePublisher'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import { navigationRef } from '@/features/contacts/lib/linking'
import {
  useScribeAvailability,
  useScribeVoiceAvailability,
} from '@/features/scribe'
import { openScribe } from '@/features/scribe/components/openScribe'

import { errorTracking } from '@/lib/errorTracking'
import * as SystemMenuBridge from '../../../modules/system-menu'
import { menuGroups, runMenuCommand } from './menuCommands'

export default function SystemMenu({ language }: { language: string }) {
  const onboardingComplete = usePreferences((s) => s.onboardingComplete)
  const { showsTimeEntry } = usePublisher()
  const { hasSidebar } = useAdaptiveLayout()
  const scribe = useScribeAvailability()
  const voice = useScribeVoiceAvailability()
  const showsScribe = scribe.status !== 'hidden'
  const [checkingUpdate, setCheckingUpdate] = useState(false)

  useEffect(() => {
    if (!SystemMenuBridge.isAvailable) return
    const groups = onboardingComplete
      ? menuGroups({ showsTimeEntry, showsScribe, checkingUpdate, language })
      : []
    void SystemMenuBridge.configure(groups).catch((error: unknown) => {
      errorTracking.captureException(error)
    })
  }, [
    onboardingComplete,
    language,
    showsTimeEntry,
    showsScribe,
    checkingUpdate,
  ])

  useEffect(() => {
    if (!SystemMenuBridge.isAvailable || !onboardingComplete) return
    const allowed = menuGroups({
      showsTimeEntry,
      showsScribe,
      checkingUpdate,
      language,
    }).flatMap((group) =>
      group.actions
        .filter((action) => action.enabled)
        .map((action) => action.id)
    )
    const subscription = SystemMenuBridge.subscribe(async ({ action }) => {
      const command = allowed.find((command) => command === action)
      if (!navigationRef.isReady() || !command) return

      if (action === 'check_update') setCheckingUpdate(true)
      await runMenuCommand(command, hasSidebar, () =>
        openScribe(navigationRef, 'menu_bar', scribe, voice)
      ).catch((error: unknown) => {
        errorTracking.captureException(error)
      })
      if (action === 'check_update') setCheckingUpdate(false)
    })
    return () => subscription?.remove()
  }, [
    onboardingComplete,
    showsTimeEntry,
    showsScribe,
    checkingUpdate,
    hasSidebar,
    language,
    scribe,
    voice,
  ])

  return null
}
