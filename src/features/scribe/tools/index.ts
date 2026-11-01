import type { ScribeTool } from '@/features/scribe/tools/types'
import contactsSearch from '@/features/scribe/tools/contactsSearch'
import contactsGet from '@/features/scribe/tools/contactsGet'
import visitsList from '@/features/scribe/tools/visitsList'
import visitsReadNotes from '@/features/scribe/tools/visitsReadNotes'
import followupsList from '@/features/scribe/tools/followupsList'
import plansList from '@/features/scribe/tools/plansList'
import timeSummary from '@/features/scribe/tools/timeSummary'
import timeList from '@/features/scribe/tools/timeList'
import buddiesPlans from '@/features/scribe/tools/buddiesPlans'
import timeLog from '@/features/scribe/tools/timeLog'
import plansCreate from '@/features/scribe/tools/plansCreate'
import plansUpdate from '@/features/scribe/tools/plansUpdate'
import contactsCreate from '@/features/scribe/tools/contactsCreate'
import contactsUpdate from '@/features/scribe/tools/contactsUpdate'
import visitsLog from '@/features/scribe/tools/visitsLog'
import categoriesCreate from '@/features/scribe/tools/categoriesCreate'
import timeUpdate from '@/features/scribe/tools/timeUpdate'
import timeDelete from '@/features/scribe/tools/timeDelete'
import memoryUpdate from '@/features/scribe/tools/memoryUpdate'

export const SCRIBE_TOOLS: readonly ScribeTool[] = [
  contactsSearch,
  contactsGet,
  visitsList,
  visitsReadNotes,
  followupsList,
  plansList,
  timeSummary,
  timeList,
  buddiesPlans,
  timeLog,
  plansCreate,
  plansUpdate,
  contactsCreate,
  contactsUpdate,
  visitsLog,
  categoriesCreate,
  timeUpdate,
  timeDelete,
  memoryUpdate,
]

const BY_NAME = new Map(SCRIBE_TOOLS.map((tool) => [tool.name, tool]))

export const scribeTool = (name: string): ScribeTool | null =>
  BY_NAME.get(name) ?? null
