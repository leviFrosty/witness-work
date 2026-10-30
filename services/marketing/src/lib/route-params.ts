import { notFound } from '@tanstack/react-router'
import {
  DEFAULT_LOCALE,
  isHelpLocale,
  type HelpLocale,
} from './help-center/locales'

/** A `/<locale>` segment: any locale but English, which is unprefixed. */
export function localeParam(value: string): HelpLocale {
  if (value === DEFAULT_LOCALE || !isHelpLocale(value)) throw notFound()
  return value
}
