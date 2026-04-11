import { Publisher } from '../../types/publisher'
import { Tutorial } from '../../types/tutorial'
import { coreContactsTutorial } from './core.contacts'
import { coreConversationsTutorial } from './core.conversations'
import { coreTimeTutorial } from './core.time'
import { corePlanningTutorial } from './core.planning'
import { coreReportsTutorial } from './core.reports'

/**
 * Ordered catalogue of tutorials. Adding a new tutorial is as simple as
 * creating a new file in this folder and appending it here — the engine and
 * Help screen pick it up automatically.
 */
export const tutorialCatalogue: Tutorial[] = [
  coreContactsTutorial,
  coreConversationsTutorial,
  coreTimeTutorial,
  corePlanningTutorial,
  coreReportsTutorial,
]

export const getTutorialById = (id: string): Tutorial | undefined =>
  tutorialCatalogue.find((t) => t.id === id)

export const getTutorialsForPublisher = (publisher: Publisher): Tutorial[] =>
  tutorialCatalogue.filter(
    (t) => t.appliesTo === '*' || t.appliesTo.includes(publisher)
  )

/**
 * Ordered sequence of tutorial ids to offer as "the full tour" for a given
 * publisher type. The post-onboarding prompt launches this as a chain, and the
 * Help screen lists these as individually replayable entries.
 */
export const getTourSequenceForPublisher = (publisher: Publisher): string[] =>
  getTutorialsForPublisher(publisher).map((t) => t.id)
