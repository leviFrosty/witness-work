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
    content: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'],
  },
  {
    version: '1.8.2',
    date: moment('2023-12-18').toDate(),
    content: ['c1'],
  },
  {
    version: '1.8.1',
    date: moment('2023-12-15').toDate(),
    content: ['c1'],
  },
  {
    version: '1.8.0',
    date: moment('2023-12-14').toDate(),
    content: ['c1', 'c2'],
  },
  {
    version: '1.7.0',
    date: moment('2023-12-11').toDate(),
    content: ['c1'],
  },
  {
    version: '1.6.2',
    date: moment('2023-12-08').toDate(),
    content: ['c1'],
  },
  {
    version: '1.6.1',
    date: moment('2023-12-06').toDate(),
    content: ['c1'],
  },
  {
    version: '1.6.0',
    date: moment('2023-11-15').toDate(),
    content: ['c1', 'c2', 'c3'],
  },
]
