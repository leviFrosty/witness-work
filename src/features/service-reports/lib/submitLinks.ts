import links from '@/constants/links'

export type NwPublisherReport = {
  sharedInMinistry: boolean

  hours?: number

  credit?: number
  bibleStudies?: number | null
  remarks?: string
}

export const buildNwPublisherLink = (report: NwPublisherReport): string => {
  const parts = [`sharedInMinistry=${report.sharedInMinistry}`]

  if (report.hours) {
    parts.push(`hours=${report.hours}`)
  }
  if (report.bibleStudies) {
    parts.push(`bibleStudies=${report.bibleStudies}`)
  }
  if (report.credit) {
    parts.push(`credit=${report.credit}`)
  }
  if (report.remarks) {
    const remarks = encodeURI(report.remarks.replaceAll(':', '-'))
      .replaceAll('%20', '+')
      .replaceAll('%0A', '+')
    parts.push(`remarks=${remarks}`)
  }

  return `${links.nwpublisherSubmitReport}${parts.join(':')}`
}

export type HourglassReport = {
  month: number
  year: number

  minutes: number
  studies?: number | null

  remarks?: string
}

export const buildHourglassLink = (report: HourglassReport): string => {
  const params = [
    `month=${report.month}`,
    `year=${report.year}`,
    `minutes=${report.minutes}`,
  ]

  if (report.studies) {
    params.push(`studies=${report.studies}`)
  }
  if (report.remarks) {
    params.push(`remarks=${encodeURIComponent(report.remarks)}`)
  }

  return `${links.hourglassBase}${params.join('&')}`
}
