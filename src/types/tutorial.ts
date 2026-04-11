import { Publisher } from './publisher'
import { TranslationKey } from '../lib/locales'

/**
 * Tutorial event bus — real UI action sites emit these names (e.g. after a
 * contact is saved). When no tutorial is active, emissions are no-ops. When a
 * `waitForAction` step is awaiting this event name, the step advances.
 */
export type TutorialEventName =
  | 'contacts.addPressed'
  | 'contacts.saved'
  | 'contacts.editPressed'
  | 'contacts.editSaved'
  | 'conversations.addPressed'
  | 'conversations.saved'
  | 'conversations.editPressed'
  | 'conversations.editSaved'
  | 'time.addPressed'
  | 'time.saved'
  | 'month.opened'
  | 'plan.created'
  /**
   * Internal dispatch: the overlay fires these when the user taps "Fill sample"
   * on a waitForAction step. The mounted form screen subscribes and hydrates
   * its fields with the sample payload.
   */
  | 'sample.contact'
  | 'sample.conversation'
  | 'sample.time'

/**
 * Optional sample data payload attached to a form-entry step. The matching form
 * screen can listen via the event bus and hydrate its fields when the user taps
 * "Fill sample".
 */
export type SampleFill =
  | { form: 'contact'; data: Record<string, unknown> }
  | { form: 'conversation'; data: Record<string, unknown> }
  | { form: 'time'; data: Record<string, unknown> }

/**
 * A tutorial is composed of sequentially-executed steps. The engine runs
 * through them in order, advancing based on each step's kind.
 */
export type TutorialStep =
  | {
      kind: 'modal'
      titleKey: TranslationKey
      bodyKey: TranslationKey
      ctaKey?: TranslationKey
    }
  | {
      kind: 'info'
      titleKey?: TranslationKey
      bodyKey: TranslationKey
    }
  | {
      kind: 'navigate'
      /** Route name — typed loosely to avoid a circular import. */
      route: string
      /**
       * Params passed to the navigation call. Can be a plain object or a
       * resolver function evaluated at step execution time — this lets a
       * tutorial open "the first contact", "today's plan", etc. without baking
       * concrete ids into the config. Returning `undefined` from the resolver
       * signals that the desired context doesn't exist (e.g. user has no
       * contacts yet); in that case the engine skips the navigation and
       * advances to the next step, which should be prepared for that fallback
       * state.
       */
      params?:
        | Record<string, unknown>
        | (() => Record<string, unknown> | undefined)
    }
  | {
      kind: 'spotlight'
      targetId: string
      titleKey: TranslationKey
      bodyKey: TranslationKey
      placement?: 'top' | 'bottom'
      /**
       * If set, step advances automatically when this event is emitted. If
       * unset, step advances when the user taps the highlighted target and the
       * corresponding event fires.
       */
      advanceOn?: TutorialEventName
    }
  | {
      kind: 'waitForAction'
      event: TutorialEventName
      hintKey?: TranslationKey
      sample?: SampleFill
    }

export interface Tutorial {
  /** Stable identifier, e.g. 'core.contacts'. */
  id: string
  /** Bump to invalidate `completedTutorials` entries and re-offer. */
  version: number
  titleKey: TranslationKey
  descriptionKey: TranslationKey
  /** Approximate tour length in seconds, shown in the prompt. */
  estimatedSeconds?: number
  /** '*' matches all publisher types. */
  appliesTo: Publisher[] | '*'
  /** Other tutorial ids that must be completed first. */
  prerequisites?: string[]
  steps: TutorialStep[]
}

export type TutorialRunState =
  | 'idle'
  | 'prompting'
  | 'running'
  | 'paused'
  | 'completed'
  | 'skipped'
