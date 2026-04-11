import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react'
import { View } from 'react-native'
import { useTutorial } from '../stores/tutorial'
import { tutorialCatalogue, getTutorialById } from '../constants/tutorials'
import { Tutorial, TutorialEventName, TutorialStep } from '../types/tutorial'
import { navigationRef } from '../lib/linking'

type TargetHandle = {
  ref: React.RefObject<View | null>
}

type Listener = (event: TutorialEventName) => void

/**
 * Scrollable container handle. Each screen that hosts tutorial targets
 * registers one of these so the engine can bring off-screen targets into view.
 * The node handle is used as the relative-to argument for `measureLayout`, so
 * it must point at an actual native view (not a JS wrapper), which is why the
 * caller resolves it — library wrappers like `KeyboardAwareScrollView` expose
 * their inner view in different ways.
 */
export interface ScrollContainerHandle {
  scrollTo: (opts: { x?: number; y?: number; animated?: boolean }) => void
  /** Returns the current vertical scroll offset. */
  getScrollY: () => number
}

interface TutorialContextValue {
  /** Currently active tutorial object (if any). */
  activeTutorial: Tutorial | null
  /** The current step object (if any). */
  currentStep: TutorialStep | null
  startTutorial: (id: string) => void
  nextStep: () => void
  skip: () => void
  registerTarget: (id: string, handle: TargetHandle) => () => void
  getTarget: (id: string) => TargetHandle | undefined
  /** Fire an event. No-op when no tutorial is running. */
  emitTutorialEvent: (event: TutorialEventName) => void
  /** Subscribe to events (used by screens wanting "Fill sample" hydration). */
  subscribe: (listener: Listener) => () => void
  /**
   * Register a scroll container so the engine can bring off-screen targets into
   * view. Returns an unregister callback.
   */
  registerScrollContainer: (
    container: ScrollContainerHandle | null
  ) => () => void
  /**
   * Ask the engine to scroll the registered container so that the target with
   * the given id is centered in the visible area. Resolves when the scroll has
   * been dispatched (does not wait for animation to finish).
   */
  scrollTargetIntoView: (id: string) => void
}

const TutorialContext = createContext<TutorialContextValue | null>(null)

export const useTutorialContext = () => {
  const ctx = useContext(TutorialContext)
  if (!ctx) {
    throw new Error('useTutorialContext must be used inside TutorialProvider')
  }
  return ctx
}

/**
 * Safe variant that returns null instead of throwing when the provider isn't
 * mounted yet — handy for UI wrappers that may render during early bootstrap.
 */
export const useOptionalTutorialContext = () => useContext(TutorialContext)

export const TutorialProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const {
    activeTutorialId,
    activeStepIndex,
    startTutorial: storeStart,
    nextStep: storeNextStep,
    skipActive,
    completeActive,
  } = useTutorial()

  const targetsRef = useRef<Map<string, TargetHandle>>(new Map())
  const listenersRef = useRef<Set<Listener>>(new Set())
  const scrollContainerRef = useRef<ScrollContainerHandle | null>(null)

  const activeTutorial = useMemo<Tutorial | null>(
    () =>
      activeTutorialId ? (getTutorialById(activeTutorialId) ?? null) : null,
    [activeTutorialId]
  )

  const currentStep = useMemo<TutorialStep | null>(() => {
    if (!activeTutorial) return null
    return activeTutorial.steps[activeStepIndex] ?? null
  }, [activeTutorial, activeStepIndex])

  const registerTarget = useCallback((id: string, handle: TargetHandle) => {
    targetsRef.current.set(id, handle)
    return () => {
      const current = targetsRef.current.get(id)
      if (current === handle) targetsRef.current.delete(id)
    }
  }, [])

  const getTarget = useCallback((id: string) => targetsRef.current.get(id), [])

  const registerScrollContainer = useCallback(
    (container: ScrollContainerHandle | null) => {
      scrollContainerRef.current = container
      return () => {
        if (scrollContainerRef.current === container) {
          scrollContainerRef.current = null
        }
      }
    },
    []
  )

  const scrollTargetIntoView = useCallback((id: string) => {
    const target = targetsRef.current.get(id)
    const container = scrollContainerRef.current
    if (!target?.ref.current || !container) return

    // Use measureInWindow (no parent-child requirement) to check whether
    // the target is already on-screen. If not, compute the scroll offset
    // using the container's current scrollY + the target's screen delta.
    //
    // This replaces the earlier measureLayout approach which fatally
    // throws on React Native's bridge when the target isn't a descendant
    // of the scroll container (e.g. header buttons rendered by
    // react-navigation outside the screen's ScrollView).
    target.ref.current.measureInWindow((_x, targetY, _w, targetH) => {
      if (targetH === 0) return // not mounted / invisible

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const screenH = require('react-native').Dimensions.get('window').height
      const margin = 120

      const isVisible = targetY >= 0 && targetY + targetH <= screenH
      if (isVisible) return

      // target's window-Y + current scroll offset = target's content-Y.
      // Scroll so target sits ~`margin`px from the top.
      const currentScrollY = container.getScrollY()
      const contentY = currentScrollY + targetY
      container.scrollTo({
        y: Math.max(0, contentY - margin),
        animated: true,
      })
    })
  }, [])

  const nextStep = useCallback(() => {
    if (!activeTutorial) return
    const nextIndex = activeStepIndex + 1
    if (nextIndex >= activeTutorial.steps.length) {
      completeActive(`${activeTutorial.id}@${activeTutorial.version}`)
      return
    }
    storeNextStep()
  }, [activeTutorial, activeStepIndex, storeNextStep, completeActive])

  const skip = useCallback(() => {
    skipActive()
  }, [skipActive])

  const startTutorial = useCallback(
    (id: string) => {
      const tutorial = getTutorialById(id)
      if (!tutorial) return
      storeStart(id)
    },
    [storeStart]
  )

  const subscribe = useCallback((listener: Listener) => {
    listenersRef.current.add(listener)
    return () => {
      listenersRef.current.delete(listener)
    }
  }, [])

  const emitTutorialEvent = useCallback(
    (event: TutorialEventName) => {
      // Notify subscribers first (so sample-fill consumers can react).
      listenersRef.current.forEach((l) => {
        try {
          l(event)
        } catch {
          // Swallow — one bad listener must not break the engine.
        }
      })

      // Then advance the current step if it's waiting for this event.
      if (!activeTutorial) return
      const step = activeTutorial.steps[activeStepIndex]
      if (!step) return
      if (step.kind === 'waitForAction' && step.event === event) {
        nextStep()
      } else if (step.kind === 'spotlight' && step.advanceOn === event) {
        nextStep()
      }
    },
    [activeTutorial, activeStepIndex, nextStep]
  )

  // Auto-advance `navigate` steps: fire the navigation side-effect and move on.
  useEffect(() => {
    if (!currentStep || !activeTutorial) return
    if (currentStep.kind !== 'navigate') return
    if (!navigationRef.isReady()) return

    // Params may be a static object or a resolver function evaluated now.
    // A resolver returning undefined means "required context missing" —
    // we skip the navigation but still advance so the next step (which
    // should handle the missing-context case) can render.
    const rawParams = currentStep.params
    const resolvedParams =
      typeof rawParams === 'function' ? rawParams() : rawParams

    const shouldNavigate =
      typeof rawParams !== 'function' || resolvedParams !== undefined

    if (shouldNavigate) {
      try {
        // @ts-expect-error — route name typed as string for decoupling.
        navigationRef.navigate(currentStep.route, resolvedParams)
      } catch {
        // If navigation fails (screen not registered), still advance so
        // the tutorial doesn't hang.
      }
    }

    // Give the nav transition a beat before advancing.
    const t = setTimeout(() => nextStep(), 350)
    return () => clearTimeout(t)
  }, [currentStep, activeTutorial, nextStep])

  const value = useMemo<TutorialContextValue>(
    () => ({
      activeTutorial,
      currentStep,
      startTutorial,
      nextStep,
      skip,
      registerTarget,
      getTarget,
      emitTutorialEvent,
      subscribe,
      registerScrollContainer,
      scrollTargetIntoView,
    }),
    [
      activeTutorial,
      currentStep,
      startTutorial,
      nextStep,
      skip,
      registerTarget,
      getTarget,
      emitTutorialEvent,
      subscribe,
      registerScrollContainer,
      scrollTargetIntoView,
    ]
  )

  return (
    <TutorialContext.Provider value={value}>
      {children}
    </TutorialContext.Provider>
  )
}

/**
 * Module-level shim so non-React call sites (action handlers that don't have
 * hook access) can still emit events. Wired up by TutorialOverlay on mount.
 */
let externalEmit: ((event: TutorialEventName) => void) | null = null

export const registerExternalEmitter = (
  emit: (event: TutorialEventName) => void
) => {
  externalEmit = emit
  return () => {
    if (externalEmit === emit) externalEmit = null
  }
}

/**
 * No-op safe emitter for use anywhere (hooks or not). Will silently do nothing
 * if the provider hasn't mounted or no tutorial is running.
 */
export const emitTutorialEvent = (event: TutorialEventName) => {
  if (externalEmit) externalEmit(event)
}

// Keep this export so other modules can inspect the catalogue without a
// provider (e.g. the Help screen listing replayable tutorials).
export { tutorialCatalogue }
