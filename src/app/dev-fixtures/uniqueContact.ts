import moment from 'moment'
import { Contact } from '@/types/contact'
import { Visit } from '@/types/visit'

export const UNIQUE_CONTACT_ID = 'unique-contact'
export const UNIQUE_VISIT_ID_PREFIX = 'unique-visit-'

export const UNIQUE_CONTACT_UNKNOWN_DEF_ID = 'unknown-def-id'

export const UNIQUE_CONTACT_CUSTOM_FIELD_LABELS = {
  language: 'Language',
  bestTime: 'Best time to visit',
  longLabel:
    'Preferred publication format and delivery instructions (long label)',
  archived: 'Archived field (should not render)',
  emptyValue: 'Empty value field',
} as const

export type UniqueContactCustomFieldKey =
  keyof typeof UNIQUE_CONTACT_CUSTOM_FIELD_LABELS

export type UniqueContactFixtureInput = {
  now: moment.Moment | Date

  customFieldIds: Record<UniqueContactCustomFieldKey, string>
}

export type UniqueContactFixture = {
  contact: Contact
  visits: Visit[]

  highlightedVisitId: string
}

const visitId = (slug: string) => `${UNIQUE_VISIT_ID_PREFIX}${slug}`

const visit = (
  slug: string,
  fields: Omit<Visit, 'id' | 'contact' | 'isBibleStudy'> & {
    isBibleStudy?: boolean
  }
): Visit => ({
  id: visitId(slug),
  contact: { id: UNIQUE_CONTACT_ID },
  isBibleStudy: false,
  ...fields,
})

const LONG_CUSTOM_FIELD_VALUE =
  'Prefers the large-print Watchtower and Awake! magazines. Leave them in the ' +
  'blue mailbox beside the side gate (not the front door), and send a text ' +
  'first because the dog barks at every knock.'

const MULTILINE_STUDY_NOTE = [
  'Studied chapter 3 of the Enjoy Life Forever! book. She had underlined ' +
    'every answer ahead of time.',
  'We read Psalm 37:10, 11 together and talked about life on a paradise ' +
    'earth. She wondered how her late mother fits into that hope, so we ' +
    'looked at John 5:28, 29.',
  'Next time: finish chapter 3 and preview chapter 4. Her husband may join us.',
].join('\n\n')

const LINKS_NOTE =
  'Showed her how to find the daily text at https://www.jw.org/en/library/ ' +
  'on her phone. Her daughter asked us to call (415) 555-0134 before coming ' +
  'by, and to send the study reminder to maria@example.com.'

const LONG_UNBROKEN_URL =
  'https://www.jw.org/en/library/books/enjoy-life-forever/' +
  'lesson-04-who-is-god-and-what-is-his-name/' +
  '?utm_source=witnesswork&utm_medium=dev-fixture&utm_content=unbroken-url'

const LONG_STUDY_NOTE = [
  'Long study today — almost an hour and a half. We covered all of chapter 5 ' +
    'and she asked to keep going into the review box because she wanted to ' +
    'make sure she could explain it to her sister.',
  'She is especially drawn to the scriptures about the resurrection. We ' +
    'read Acts 24:15 and talked about the difference between the righteous ' +
    'and the unrighteous being raised. She asked whether people who never ' +
    'heard about Jehovah will have an opportunity to learn about him, and we ' +
    'looked at how the thousand-year reign gives everyone that chance.',
  'Her husband listened from the kitchen for most of the study. At the end ' +
    'he asked a question about why there are so many religions if there is ' +
    'only one true God. We offered to answer that properly next time and he ' +
    'seemed interested. Bring the "Why So Many Religions?" video on the ' +
    'tablet.',
  'Practical notes: she prefers studying at the dining table because the ' +
    'light is better. Her reading glasses broke, so the large-print edition ' +
    'would help a lot. She mentioned that Thursday evenings are hard because ' +
    'of her work schedule, so Tuesdays or Saturdays work best going forward.',
  'Goals for the next few weeks: invite her to the midweek meeting, show the ' +
    'Kingdom Hall video, and ask if her sister would like to sit in on the ' +
    'study. Keep the pace comfortable — she likes to read every paragraph ' +
    'aloud and look up every cited scripture herself.',
].join('\n\n')

const LONG_FOLLOW_UP_TOPIC =
  'Review chapter 5 questions 1–4, then read Isaiah 65:21-23 together and ask ' +
  'how she feels about everyone having their own home; bring the large-print ' +
  'edition for her mother as well, since she asked to join next time.'

export function buildUniqueContactFixture({
  now,
  customFieldIds,
}: UniqueContactFixtureInput): UniqueContactFixture {
  const current = moment(now)
  const today = current.clone().startOf('day')

  const at = (
    amount: number,
    unit: moment.unitOfTime.DurationConstructor,
    hour: number,
    minute = 0
  ) => today.clone().add(amount, unit).set({ hour, minute }).toDate()

  const hoursAgoToday = (hours: number) =>
    moment
      .max(
        today.clone().add(1, 'minute'),
        current.clone().subtract(hours, 'hours')
      )
      .toDate()

  const contact: Contact = {
    id: UNIQUE_CONTACT_ID,

    createdAt: today
      .clone()
      .subtract(5, 'years')
      .startOf('year')
      .subtract(1, 'day')
      .toDate(),
    name: 'Maria-Guadalupe de la Cruz Fernández-Ortega',
    gender: 'female',
    isFavorite: true,
    avatar: { type: 'emoji', value: '🌻' },
    avatarBackground: '#F59E0B',

    heroBackground: '#14B8A6',

    phone: '070-123 45 67',
    phoneRegionCode: 'SE',
    email: 'maria.fernandez-ortega+witnesswork@example.com',
    address: {
      line1: 'Apartment 4B, 1234 Really Long Street Name Boulevard',
      line2: 'Building C, Floor 3',
      city: 'San Francisco',
      state: 'CA',
      zip: '94103',
      country: 'United States',
    },
    coordinate: { latitude: 37.7749, longitude: -122.4194 },
    userDraggedCoordinate: true,
    customFields: {
      [customFieldIds.language]: 'Spanish (Mexican) / English',
      [customFieldIds.bestTime]: 'Weekday evenings after 6 PM',
      [customFieldIds.longLabel]: LONG_CUSTOM_FIELD_VALUE,

      [customFieldIds.archived]: 'Archived — must not render',

      [customFieldIds.emptyValue]: '',

      [UNIQUE_CONTACT_UNKNOWN_DEF_ID]: 'Orphaned value — must not render',
    },
  }

  const highlighted = visit('today-grace-followup', {
    date: hoursAgoToday(3),
    note:
      'Talked on the porch about why God permits suffering. She asked for ' +
      'something to read, so we promised to bring the brochure next time.',
    followUp: {
      date: current.clone().subtract(1, 'hour').toDate(),
      notifyMe: true,
      topic: 'Bring the brochure we discussed',
    },
  })

  const visits: Visit[] = [
    highlighted,

    visit('today-second-study', {
      date: hoursAgoToday(6),
      isBibleStudy: true,
      note: MULTILINE_STUDY_NOTE,
      followUp: {
        date: at(1, 'days', 10),
        notifyMe: true,
        topic: 'Chapter 4, paragraphs 8–12',
        notifications: [
          {
            id: 'unique-notification-today-second-study',
            date: at(1, 'days', 9),
          },
        ],
      },
    }),

    visit('today-midnight-nah', {
      date: today.clone().toDate(),
      notAtHome: true,
      note: '',
    }),

    visit('later-today-nah', {
      date: today.clone().endOf('day').startOf('minute').toDate(),
      notAtHome: true,
      note: 'Neighbor said they return after 9 PM',
    }),

    visit('yesterday-study-links', {
      date: at(-1, 'days', 19, 30),
      isBibleStudy: true,
      note: LINKS_NOTE,
      followUp: {
        date: at(-1, 'days', 20),
        notifyMe: false,
        topic: 'Missed — reschedule Saturday',
      },
    }),

    visit('three-days-ago-nah-note', {
      date: at(-3, 'days', 10, 15),
      notAtHome: true,
      note: 'Left a tract in the door',
    }),

    visit('four-days-ago-both-flags', {
      date: at(-4, 'days', 17, 45),
      notAtHome: true,
      isBibleStudy: true,
      note: '',
    }),

    visit('five-days-ago-dismissed', {
      date: at(-5, 'days', 16),
      note:
        'Brief conversation at the gate. She was on her way to work, so we ' +
        'agreed to reschedule.',
      followUp: {
        date: at(-4, 'days', 16),
        notifyMe: true,
        topic: 'Dismissed follow-up (should read as cancelled)',
        dismissed: true,
      },
    }),

    visit('six-days-ago-placeholder-followup', {
      date: at(-6, 'days', 9),
      note: 'Her son answered and said she would be home next week.',
      followUp: {
        date: at(-2, 'days', 9),
        notifyMe: false,
      },
    }),

    visit('eight-days-ago-long-url', {
      date: at(-8, 'days', 13, 20),
      note: LONG_UNBROKEN_URL,
    }),

    visit('two-weeks-ago-long-note', {
      date: at(-14, 'days', 11),
      isBibleStudy: true,
      note: LONG_STUDY_NOTE,
      followUp: {
        date: at(10, 'days', 18, 30),
        notifyMe: true,
        topic: LONG_FOLLOW_UP_TOPIC,
      },
    }),

    visit('three-weeks-ago-whitespace-note', {
      date: at(-21, 'days', 15),
      note: '   \n  ',
    }),

    visit('tie-a', {
      date: at(-25, 'days', 9),
      notAtHome: true,
      note: '',
    }),
    visit('tie-b', {
      date: at(-25, 'days', 9),
      note: 'Her sister answered and accepted the Memorial invitation.',
    }),

    visit('last-month-study', {
      date: at(-40, 'days', 10),
      isBibleStudy: true,
      note: 'Studied chapter 2. She is enjoying the videos.',
    }),

    visit('last-month-nah-old-followup', {
      date: at(-45, 'days', 14),
      notAtHome: true,
      followUp: {
        date: at(-44, 'days', 14),
        notifyMe: true,
      },
    }),

    visit('far-future-followup', {
      date: at(-50, 'days', 12),
      note:
        'She is travelling for two months to visit family. Agreed to call ' +
        'once she is back.',
      followUp: {
        date: at(60, 'days', 12),
        notifyMe: false,
        topic: 'Beyond the widget window',
      },
    }),

    visit('six-months-ago-mixed-script', {
      date: at(-6, 'months', 16, 10),
      note: 'Studied in Hebrew and Arabic 📖 — שלום / مرحبا — asked about Psalm 83:18',
    }),

    visit('previous-year-study', {
      date: at(-13, 'months', 10, 30),
      isBibleStudy: true,
      note: 'Started a study in chapter 1 after the Memorial invitation.',
    }),

    visit('two-years-ago-nah', {
      date: at(-2, 'years', 11),
      notAtHome: true,
      note: '',
    }),

    visit('very-old-first-contact', {
      date: today.clone().subtract(5, 'years').startOf('year').toDate(),
      note: 'First contact at the door',
    }),

    visit('future-imported-visit', {
      date: at(1, 'days', 14),
      note: 'Imported from notes: scheduled visit',
      followUp: {
        date: at(3, 'days', 14),
        notifyMe: true,
        topic: 'Confirm the imported appointment',
      },
    }),
  ]

  return { contact, visits, highlightedVisitId: highlighted.id }
}
