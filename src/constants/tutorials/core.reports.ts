import { Tutorial } from '../../types/tutorial'

export const coreReportsTutorial: Tutorial = {
  id: 'core.reports',
  version: 1,
  titleKey: 'tutorial.tutorials.reports.title',
  descriptionKey: 'tutorial.tutorials.reports.description',
  estimatedSeconds: 20,
  appliesTo: ['circuitOverseer'],
  steps: [
    {
      kind: 'modal',
      titleKey: 'tutorial.tutorials.reports.introTitle',
      bodyKey: 'tutorial.tutorials.reports.introBody',
    },
    {
      kind: 'modal',
      titleKey: 'tutorial.tutorials.reports.doneTitle',
      bodyKey: 'tutorial.tutorials.reports.doneBody',
    },
  ],
}
