import { Tutorial } from '../../types/tutorial'

/**
 * Time tracking tour. Skipped for the `publisher` type (no hour requirement) —
 * they see only the simple time checkbox tour in the welcome sequence.
 */
export const coreTimeTutorial: Tutorial = {
  id: 'core.time',
  version: 1,
  titleKey: 'tutorial.tutorials.time.title',
  descriptionKey: 'tutorial.tutorials.time.description',
  estimatedSeconds: 40,
  appliesTo: [
    'regularAuxiliary',
    'regularPioneer',
    'circuitOverseer',
    'specialPioneer',
    'custom',
  ],
  steps: [
    {
      kind: 'modal',
      titleKey: 'tutorial.tutorials.time.introTitle',
      bodyKey: 'tutorial.tutorials.time.introBody',
    },
    {
      kind: 'spotlight',
      targetId: 'time.addButton',
      titleKey: 'tutorial.tutorials.time.addSpotlightTitle',
      bodyKey: 'tutorial.tutorials.time.addSpotlightBody',
      advanceOn: 'time.addPressed',
    },
    {
      kind: 'waitForAction',
      event: 'time.saved',
      hintKey: 'tutorial.tutorials.time.formWaitHint',
      sample: {
        form: 'time',
        data: {
          hours: 1,
          minutes: 0,
        },
      },
    },
    {
      kind: 'modal',
      titleKey: 'tutorial.tutorials.time.doneTitle',
      bodyKey: 'tutorial.tutorials.time.doneBody',
    },
  ],
}
