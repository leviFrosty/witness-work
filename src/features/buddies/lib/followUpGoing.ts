import type { ShareReply } from '@/features/buddies/lib/schemas'

const SENTENCES = {
  going: {
    one: 'buddies_followUpGoingOne',
    two: 'buddies_followUpGoingTwo',
    many: 'buddies_followUpGoingMany',
  },
  declined: {
    one: 'buddies_followUpDeclinedOne',
    two: 'buddies_followUpDeclinedTwo',
    many: 'buddies_followUpDeclinedMany',
  },
  waiting: {
    one: 'buddies_followUpWaitingOne',
    two: 'buddies_followUpWaitingTwo',
    many: 'buddies_followUpWaitingMany',
  },
} as const

type Answer = keyof typeof SENTENCES
type SentenceKey = (typeof SENTENCES)[Answer][keyof (typeof SENTENCES)[Answer]]

export type GoingSentence = {
  answer: Answer
  key: SentenceKey
  values: Record<string, string>
}

/**
 * The sentences under a Follow-up's invited buddies, one per answer in this
 * order: "Anna is going with you.", "Ben and Grace can't make it.", "3 buddies
 * haven't answered." Names are whole-sentence placeholders, so every language
 * can order them its own way.
 */
export function followUpGoingSentences(
  invited: { name: string; reply?: ShareReply }[]
): GoingSentence[] {
  return (['going', 'declined', 'waiting'] as const).flatMap(
    (answer): GoingSentence[] => {
      const names = invited
        .filter((buddy) => (buddy.reply ?? 'waiting') === answer)
        .map((buddy) => buddy.name)
      if (names.length === 0) return []
      const keys = SENTENCES[answer]
      return [
        names.length === 1
          ? { answer, key: keys.one, values: { name: names[0] } }
          : names.length === 2
            ? {
                answer,
                key: keys.two,
                values: { first: names[0], second: names[1] },
              }
            : {
                answer,
                key: keys.many,
                values: { count: String(names.length) },
              },
      ]
    }
  )
}
