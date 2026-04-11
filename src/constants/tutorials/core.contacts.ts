import { Tutorial } from '../../types/tutorial'

/**
 * Contacts end-to-end walkthrough.
 *
 * Mirrors the app's real navigation flow: saving a new contact immediately
 * pushes the user onto the Conversation Form (under the assumption that they're
 * adding a contact _because_ they just had a conversation with them). After
 * saving that first conversation the user lands on Contact Details, where we
 * demonstrate the edit path.
 *
 * Steps, with the screen the user is on at each point:
 *
 * 1. (Home) Intro modal
 * 2. (Home) Navigate → Home (no-op if already there)
 * 3. (Home) Spotlight: contacts.addButton
 * 4. (Contact Form) Wait: contacts.saved (with sample-fill)
 * 5. (Conversation) "Since you just talked to them" bridge modal
 * 6. (Conversation) Wait: conversations.saved (with sample-fill)
 * 7. (Contact Details) Modal: intro to editing contacts
 * 8. (Contact Details) Spotlight: contacts.editButton
 * 9. (Contact Form) Wait: contacts.editSaved
 * 10. (Contact Details) Outro modal
 */
export const coreContactsTutorial: Tutorial = {
  id: 'core.contacts',
  version: 2,
  titleKey: 'tutorial.tutorials.contacts.title',
  descriptionKey: 'tutorial.tutorials.contacts.description',
  estimatedSeconds: 90,
  appliesTo: '*',
  steps: [
    {
      kind: 'modal',
      titleKey: 'tutorial.tutorials.contacts.introTitle',
      bodyKey: 'tutorial.tutorials.contacts.introBody',
    },
    {
      kind: 'navigate',
      route: 'Root',
      params: { screen: 'Home' },
    },
    {
      kind: 'spotlight',
      targetId: 'contacts.addButton',
      titleKey: 'tutorial.tutorials.contacts.addSpotlightTitle',
      bodyKey: 'tutorial.tutorials.contacts.addSpotlightBody',
      advanceOn: 'contacts.addPressed',
    },
    {
      kind: 'waitForAction',
      event: 'contacts.saved',
      hintKey: 'tutorial.tutorials.contacts.formWaitHint',
      sample: {
        form: 'contact',
        data: {
          name: 'Sample Contact',
          address: { line1: '123 Sample St' },
        },
      },
    },
    {
      kind: 'modal',
      titleKey: 'tutorial.tutorials.contacts.conversationBridgeTitle',
      bodyKey: 'tutorial.tutorials.contacts.conversationBridgeBody',
    },
    {
      kind: 'waitForAction',
      event: 'conversations.saved',
      hintKey: 'tutorial.tutorials.contacts.conversationWaitHint',
      sample: {
        form: 'conversation',
        data: {
          note: 'Discussed a scripture about hope. Going to return next week.',
          isBibleStudy: false,
        },
      },
    },
    {
      kind: 'modal',
      titleKey: 'tutorial.tutorials.contacts.editIntroTitle',
      bodyKey: 'tutorial.tutorials.contacts.editIntroBody',
    },
    {
      kind: 'spotlight',
      targetId: 'contacts.editButton',
      titleKey: 'tutorial.tutorials.contacts.editSpotlightTitle',
      bodyKey: 'tutorial.tutorials.contacts.editSpotlightBody',
      advanceOn: 'contacts.editPressed',
    },
    {
      kind: 'waitForAction',
      event: 'contacts.editSaved',
      hintKey: 'tutorial.tutorials.contacts.editWaitHint',
    },
    {
      kind: 'modal',
      titleKey: 'tutorial.tutorials.contacts.editDoneTitle',
      bodyKey: 'tutorial.tutorials.contacts.editDoneBody',
    },
  ],
}
