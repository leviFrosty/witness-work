import useContacts from '../../stores/contactsStore'
import { Tutorial } from '../../types/tutorial'

/**
 * Resolve the id of the contact to use for this tutorial. We try to pick a
 * non-dismissed contact so the walkthrough lands somewhere meaningful. Returns
 * undefined if the user has no contacts at all — the engine will skip the
 * navigate step in that case and the next modal will explain that a contact is
 * required.
 */
const resolveTutorialContactParams = () => {
  const contacts = useContacts.getState().contacts
  const first = contacts[0]
  if (!first) return undefined
  return { id: first.id }
}

/**
 * Return visits tutorial. Covers logging additional conversations with an
 * existing contact and editing past conversations.
 *
 * Because this tour can be launched from the Help screen (not just as a
 * follow-on to core.contacts), the first steps make sure the user ends up on a
 * contact's details screen before any spotlights fire — the alternative being
 * the confused state of spotlighting a button that only exists on a screen the
 * user isn't looking at.
 */
export const coreConversationsTutorial: Tutorial = {
  id: 'core.conversations',
  version: 2,
  titleKey: 'tutorial.tutorials.conversations.title',
  descriptionKey: 'tutorial.tutorials.conversations.description',
  estimatedSeconds: 45,
  appliesTo: '*',
  prerequisites: ['core.contacts'],
  steps: [
    {
      kind: 'modal',
      titleKey: 'tutorial.tutorials.conversations.introTitle',
      bodyKey: 'tutorial.tutorials.conversations.introBody',
    },
    {
      // Auto-open the first contact so every spotlight that follows has
      // the right screen context. If the user has zero contacts, this
      // resolver returns undefined and the engine will skip the
      // navigation — the next modal explains how to recover.
      kind: 'navigate',
      route: 'Contact Details',
      params: resolveTutorialContactParams,
    },
    {
      kind: 'spotlight',
      targetId: 'conversations.addButton',
      titleKey: 'tutorial.tutorials.conversations.addSpotlightTitle',
      bodyKey: 'tutorial.tutorials.conversations.addSpotlightBody',
      advanceOn: 'conversations.addPressed',
    },
    {
      kind: 'waitForAction',
      event: 'conversations.saved',
      hintKey: 'tutorial.tutorials.conversations.formWaitHint',
      sample: {
        form: 'conversation',
        data: {
          note: 'Revisited and read a scripture about peace.',
          isBibleStudy: false,
        },
      },
    },
    {
      kind: 'spotlight',
      targetId: 'conversations.editButton',
      titleKey: 'tutorial.tutorials.conversations.editSpotlightTitle',
      bodyKey: 'tutorial.tutorials.conversations.editSpotlightBody',
      advanceOn: 'conversations.editPressed',
    },
    {
      kind: 'waitForAction',
      event: 'conversations.editSaved',
      hintKey: 'tutorial.tutorials.conversations.editWaitHint',
    },
    {
      kind: 'modal',
      titleKey: 'tutorial.tutorials.conversations.doneTitle',
      bodyKey: 'tutorial.tutorials.conversations.doneBody',
    },
  ],
}
