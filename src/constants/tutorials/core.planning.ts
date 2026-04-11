import { Tutorial } from '../../types/tutorial'

export const corePlanningTutorial: Tutorial = {
  id: 'core.planning',
  version: 1,
  titleKey: 'tutorial.tutorials.planning.title',
  descriptionKey: 'tutorial.tutorials.planning.description',
  estimatedSeconds: 30,
  appliesTo: [
    'regularAuxiliary',
    'regularPioneer',
    'circuitOverseer',
    'specialPioneer',
    'custom',
  ],
  prerequisites: ['core.time'],
  steps: [
    {
      kind: 'modal',
      titleKey: 'tutorial.tutorials.planning.introTitle',
      bodyKey: 'tutorial.tutorials.planning.introBody',
    },
    {
      kind: 'spotlight',
      targetId: 'nav.month',
      titleKey: 'tutorial.tutorials.planning.monthSpotlightTitle',
      bodyKey: 'tutorial.tutorials.planning.monthSpotlightBody',
      advanceOn: 'month.opened',
    },
    {
      kind: 'spotlight',
      targetId: 'plan.addButton',
      titleKey: 'tutorial.tutorials.planning.planSpotlightTitle',
      bodyKey: 'tutorial.tutorials.planning.planSpotlightBody',
      advanceOn: 'plan.created',
    },
    {
      kind: 'modal',
      titleKey: 'tutorial.tutorials.planning.doneTitle',
      bodyKey: 'tutorial.tutorials.planning.doneBody',
    },
  ],
}
