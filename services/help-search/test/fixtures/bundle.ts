import type { HelpBundle, HelpEntry } from '../../src/contract'

export const entry = (overrides: Partial<HelpEntry> = {}): HelpEntry => ({
  id: 'timeRollover',
  slug: 'time-rollover',
  category: 'time',
  platforms: ['ios', 'android', 'web'],
  pinned: true,
  related: [196],
  question: 'Can partial hours carry over to the next month?',
  doc: { type: 'doc', content: [] },
  plainText: 'Yes. Partial hours below your monthly goal can carry over.',
  url: 'https://witnesswork.app/help/time/time-rollover',
  ...overrides,
})

export const bundle = (
  entries: HelpEntry[] = [
    entry(),
    entry({
      id: 'iCloudSync',
      slug: 'i-cloud-sync',
      category: 'backups',
      platforms: ['ios'],
      question: 'How does iCloud sync work?',
      plainText: 'Turn on iCloud Sync in Settings.',
    }),
    entry({
      id: 'notesPhotos',
      slug: 'notes-photos',
      category: 'notes',
      minAppVersion: '4.12.0',
      question: 'Can I add photos to notes?',
      plainText: 'Yes, tap the photo button in the note editor.',
    }),
  ],
  overrides: Partial<HelpBundle> = {}
): HelpBundle => ({
  schemaVersion: 1,
  locale: 'en-US',
  hash: 'aaaa',
  generatedAt: '2026-10-22T00:00:00.000Z',
  categories: [{ id: 'time', title: 'Time' }],
  entries,
  ...overrides,
})
