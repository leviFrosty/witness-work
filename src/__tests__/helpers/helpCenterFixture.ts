import type { HelpBundle, HelpEntry } from '@/features/updates/types/helpCenter'

const paragraph = (text: string) => ({
  type: 'paragraph' as const,
  content: [{ type: 'text' as const, text }],
})

/** A Help Center entry as the website publishes it. */
export function helpEntry(
  id: string,
  question: string,
  answer: string,
  extra: Partial<HelpEntry> = {}
): HelpEntry {
  const slug = id.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
  return {
    id,
    slug,
    category: 'general',
    platforms: ['ios', 'android', 'web'],
    pinned: false,
    related: [],
    question,
    doc: { type: 'doc', content: [paragraph(answer)] },
    plainText: answer,
    url: `https://leviwilkerson.com/witness-work/help-center/general/${slug}`,
    ...extra,
  }
}

/** A small English bundle covering pinned, platform and version cases. */
export function helpBundle(
  overrides: Partial<HelpBundle> = {},
  entries: HelpEntry[] = [
    helpEntry(
      'timeRollover',
      'Can partial hours carry over to next month?',
      'Yes. Turn on Automatic time rollover in Settings.',
      { category: 'time', pinned: true }
    ),
    helpEntry(
      'widgets',
      'How do I add widgets?',
      'Long press the Home Screen and tap the plus button.',
      { category: 'customization', platforms: ['ios'] }
    ),
    helpEntry(
      'wearOs',
      'Does WitnessWork work on Wear OS?',
      'Yes. Install it from Google Play on your watch.',
      { category: 'general', platforms: ['android'] }
    ),
    helpEntry(
      'submitReport',
      'How do I submit my report?',
      'Share a plain-text summary from the month.',
      { category: 'time' }
    ),
    helpEntry(
      'futureFeature',
      'What is the new thing?',
      'It arrives in a later version.',
      { category: 'general', minAppVersion: '99.0.0' }
    ),
  ]
): HelpBundle {
  return {
    schemaVersion: 1,
    locale: 'en-US',
    hash: 'aaaaaaaaaaaaaaaa',
    generatedAt: '2026-10-22T00:00:00.000Z',
    categories: [
      { id: 'time', title: 'Time' },
      { id: 'customization', title: 'Customization' },
      { id: 'general', title: 'General' },
    ],
    entries,
    ...overrides,
  }
}
