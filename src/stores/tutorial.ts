import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { combine, createJSONStorage, persist } from 'zustand/middleware'
import { hasMigratedFromAsyncStorage, MmkvStorage } from './mmkv'
import { TutorialRunState } from '../types/tutorial'

const initialState = {
  activeTutorialId: null as string | null,
  activeStepIndex: 0,
  /**
   * Tutorial ids (with version appended, e.g. "core.contacts@1") fully
   * finished.
   */
  completedTutorials: [] as string[],
  /** Tutorial ids the user dismissed at the prompt. */
  dismissedPrompts: [] as string[],
  /** Whether the post-onboarding prompt has been shown + actioned. */
  hasSeenPostOnboardingPrompt: false,
  /**
   * Independently-controlled flag used by the Help screen to manually re-open
   * the prompt sheet even after it has been seen once. Not persisted so it
   * doesn't leak across launches.
   */
  promptSheetManuallyOpen: false,
  runState: 'idle' as TutorialRunState,
}

export const useTutorial = create(
  persist(
    combine(initialState, (set, get) => ({
      startTutorial: (id: string) =>
        set({
          activeTutorialId: id,
          activeStepIndex: 0,
          runState: 'running',
        }),
      setStepIndex: (activeStepIndex: number) => set({ activeStepIndex }),
      nextStep: () => set({ activeStepIndex: get().activeStepIndex + 1 }),
      pause: () => set({ runState: 'paused' }),
      resume: () => set({ runState: 'running' }),
      /** Completes and archives the currently active tutorial. */
      completeActive: (versionedId: string) =>
        set(({ completedTutorials }) => ({
          completedTutorials: completedTutorials.includes(versionedId)
            ? completedTutorials
            : [...completedTutorials, versionedId],
          activeTutorialId: null,
          activeStepIndex: 0,
          runState: 'completed',
        })),
      /** User skipped an in-progress tutorial. */
      skipActive: () =>
        set({
          activeTutorialId: null,
          activeStepIndex: 0,
          runState: 'skipped',
        }),
      /** User declined a prompt (e.g. post-onboarding offer). */
      dismissPrompt: (id: string) =>
        set(({ dismissedPrompts }) => ({
          dismissedPrompts: dismissedPrompts.includes(id)
            ? dismissedPrompts
            : [...dismissedPrompts, id],
        })),
      markPostOnboardingPromptSeen: () =>
        set({ hasSeenPostOnboardingPrompt: true }),
      setPromptSheetManuallyOpen: (promptSheetManuallyOpen: boolean) =>
        set({ promptSheetManuallyOpen }),
      /** Test / dev helper. */
      resetTutorialState: () => set({ ...initialState }),
    })),
    {
      name: 'tutorial',
      storage: createJSONStorage(() =>
        hasMigratedFromAsyncStorage() ? MmkvStorage : AsyncStorage
      ),
    }
  )
)
