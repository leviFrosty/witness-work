import moment from 'moment'

export type ReleaseNote = {
  version: string
  date: Date
  /**
   * i18n translation key array
   */
  content: string[]
}

export const releaseNotes: ReleaseNote[] = [
  {
    version: '1.9.0',
    date: moment('2023-12-21').toDate(),
    content: ['c1', 'c2', 'c3', 'c4', 'bugFixes'],
  },
  {
    version: '1.8.2',
    date: moment('2023-12-18').toDate(),
    content: ['c1', 'bugFixes'],
  },
  {
    version: '1.8.1',
    date: moment('2023-12-15').toDate(),
    content: ['v181c1', 'bugFixes'],
  },
  {
    version: '1.8.0',
    date: moment('2023-12-14').toDate(),
    content: ['v180c1', 'bugFixes'],
  },
  {
    version: '1.7.0',
    date: moment('2023-12-10').toDate(),
    content: ['v170c1', 'v170c2', 'bugFixes'],
  },
  {
    version: '1.6.2',
    date: moment('2023').toDate(),
    content: ['v162c1', 'bugFixes'],
  },
  {
    version: '1.6.0',
    date: moment('2023').toDate(),
    content: ['v160c1', 'bugFixes'],
  },
]
