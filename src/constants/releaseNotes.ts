import moment from 'moment'

export type ReleaseNote = {
  /** Semantic version number in format `x.y.z` */
  version: string
  date: Date
  /**
   * I18n translation key array
   *
   * @example
   *   You're adding release notes for version 1.20.0.
   *
   *
   *   File `en.json` has the following content in `"1200"` key:
   *   ```json
   *   {
   *   "c1": "Content 1",
   *   "c2": "Content 2",
   *   }
   *   ```
   *   Then the `content` array should be `['c1', 'c2']`
   */
  content: string[]
}

export const releaseNotes: ReleaseNote[] = [
  {
    version: '1.22.0',
    date: moment('2024-02-14').toDate(),
    content: ['c3', 'c1', 'c2', 'c4'],
  },
  {
    version: '1.21.1',
    date: moment('2024-02-03').toDate(),
    content: ['c1'],
  },
  {
    version: '1.21.0',
    date: moment('2024-02-02').toDate(),
    content: ['c1', 'c2', 'c3', 'c4'],
  },
  {
    version: '1.20.1',
    date: moment('2024-01-24').toDate(),
    content: ['c1', 'c2', 'c3'],
  },
  {
    version: '1.20.0',
    date: moment('2024-01-13').toDate(),
    content: ['c1'],
  },
  {
    version: '1.11.1',
    date: moment('2024-01-12').toDate(),
    content: ['c1', 'c2'],
  },
  {
    version: '1.11.0',
    date: moment('2024-01-09').toDate(),
    content: ['c1', 'c2', 'c3'],
  },
  {
    version: '1.10.0',
    date: moment('2024-01-06').toDate(),
    content: ['c1', 'c2', 'c3'],
  },
  {
    version: '1.9.2',
    date: moment('2024-01-01').toDate(),
    content: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'],
  },
  {
    version: '1.9.1',
    date: moment('2023-12-24').toDate(),
    content: ['c1'],
  },
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
  // Older versions are omitted because they were released before the release notes version tracking feature was added.
]
