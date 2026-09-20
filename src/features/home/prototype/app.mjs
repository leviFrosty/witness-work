/* global document, location, history, window */
/* Throwaway #479 exploration: three structurally different Home variants on /?variant=A|B|C.
 * Fictional per-candidate fixtures, memory-only actions. No native stores or real mutations.
 * UI copy lives in this prototype's en-US.json; production locale catalogs are untouched.
 */
import {
  formatMinutes,
  formatMinutesCompact,
  derivePublisherCapabilities,
} from './runtime.mjs'
const locale = await fetch('/en-US.json').then((r) => r.json())
const { catalog } = locale
const $ = (selector) => document.querySelector(selector)
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]
  )
const t = (key) => locale.ui[key] ?? key
const params = new URLSearchParams(location.search)
const pages = [
  'home',
  'contacts',
  'progress',
  'schedule',
  'map',
  'catalog',
  'widgets',
]
const appPages = ['home', 'contacts', 'progress', 'schedule', 'map']
const legacyPages = {
  people: 'contacts',
  timing: 'map',
  pace: 'progress',
  history: 'progress',
  recap: 'home',
}
const parked = new Set([56, 63, 64])
const activeCatalog = catalog.filter((entry) => !parked.has(entry.id))
const variants = ['A', 'B', 'C']
const initial = () => ({
  publisher: 'regularPioneer',
  data: 'established',
  format: 'short',
  discreet: false,
  flag: true,
  privateExperiments: false,
  supporter: false,
  away: null,
  autoFreeze: false,
  logged: 2280,
  planned: 540,
  goal: 3000,
  checkedIn: false,
  plans: [],
  logs: [],
  contacts: {},
  notes: {},
  drafts: {},
  reminders: {},
  personalTargets: {},
  routes: [],
  offDays: [],
  ignored: {},
  hiddenMemories: [],
  observations: [],
  actions: [],
  studyVisits: [],
  outliers: false,
  calendar: [],
  optins: [],
  dismissed: [],
  today: '2026-09-21',
  newContacts: [],
  resolvedPlans: [],
})
let state = initial()
let page =
  legacyPages[params.get('page')] ||
  (pages.includes(params.get('page')) ? params.get('page') : 'home')
let variant = variants.includes(params.get('variant'))
  ? params.get('variant')
  : 'A'
let search = '',
  group = 'all',
  highlightId = activeCatalog.some(
    (e) => e.id === Number(params.get('highlight'))
  )
    ? Number(params.get('highlight'))
    : 1,
  progressTab = 'month',
  progressMonth = 0,
  scheduleMonth = 0,
  scheduleDay = '2026-09-21',
  scheduleMode = 'plans',
  contactSearch = '',
  contactFilter = 'all',
  selectedContact = 'Maria',
  timerStarted = null,
  timerSeconds = 0,
  selectedCell = [5, 0],
  slide = 0,
  routeOrder = [],
  activeItem = null
let undo = [],
  toastTimer,
  lastFocus,
  controlsOpen = false
const sampleNames = ['Maria', 'Carlos', 'Yusuf', 'Rosa', 'Ana', 'Daniel']
const capabilities = () =>
  derivePublisherCapabilities({
    publisher: state.publisher,
    publisherHours: {
      publisher: 0,
      regularAuxiliary: 30,
      regularPioneer: 50,
      circuitOverseer: 50,
      specialPioneer: 100,
      custom: 50,
    },
    userSpecifiedHasAnnualGoal: 'default',
    milestoneOverrides: null,
    overrideCreditLimit: false,
    customCreditLimitHours: 55,
  })
const hours = () => capabilities().entryMode === 'hours'
const isAway = () =>
  !!state.away &&
  state.away.start <= state.today &&
  state.away.end >= state.today
const duration = (value) => formatMinutes(value, state.format).formatted
const name = (value) =>
  state.discreet &&
  [...sampleNames, ...state.newContacts.map((c) => c.name)].includes(value)
    ? value[0] + '.'
    : value
function copy(value) {
  return value
    .replace(/\{m:(\d+)\}/g, (_, n) => duration(Number(n)))
    .replace(/\{cap\}/g, () =>
      capabilities().creditCapMinutes === null
        ? t('unlimited')
        : duration(capabilities().creditCapMinutes)
    )
    .replace(/\{(Maria|Carlos|Yusuf|Rosa|Ana|Daniel)\}/g, (_, n) => name(n))
}
const text = (value) => esc(copy(value))
const item = (id) => catalog.find((x) => x.id === Number(id))
const groupName = (g) => t(g + 'Group')
const button = (label, action, cls = 'primary', attrs = '') =>
  `<button type="button" class="${cls}" data-action="${action}" ${attrs}>${esc(label)}</button>`
const openButton = (entry, cls = 'primary') =>
  button(entry.action, 'detail', cls, `data-id="${entry.id}"`)
const icon = (p) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${p}"/></svg>`
const icons = {
  home: 'M3 10 12 3l9 7v11H3ZM9 21v-8h6v8',
  contacts:
    'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M18 4a4 4 0 0 1 0 8M22 21v-3a4 4 0 0 0-3-4',
  timing: 'M12 8v5l3 2M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',
  progress: 'm3 17 5-7 5 4 8-11M16 3h5v5',
  history: 'M4 19h16M6 15V9m6 6V4m6 11v-4',
  recap: 'M5 3h14v18l-7-4-7 4Z',
  catalog: 'M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z',
  schedule: 'M4 5h16v16H4ZM4 10h16M8 2v6m8-6v6',
  map: 'm3 5 6-3 6 3 6-3v17l-6 3-6-3-6 3Zm6-3v17m6-14v17',
  widgets: 'M6 2h12v20H6ZM10 18h4',
}
function updateURL() {
  const p = new URLSearchParams(location.search)
  p.set('variant', variant)
  p.set('page', page)
  p.set('highlight', String(highlightId))
  history.replaceState(null, '', `${location.pathname}?${p}`)
}
function snapshot() {
  return structuredClone(state)
}
function mutate(label, fn) {
  undo.push(snapshot())
  fn()
  state.logged = recordedEntries()
    .filter((e) => e.date.startsWith('2026-09'))
    .reduce((sum, e) => sum + e.minutes, 0)
  state.planned = plannedEntries()
    .filter((e) => e.date.startsWith('2026-09'))
    .reduce((sum, e) => sum + e.minutes, 0)
  state.actions.push({ label, at: state.actions.length + 1 })
  render()
  notify(t('saved'))
}
function notify(message) {
  $('#toast').textContent = message
  $('#toast').classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 2800)
}
function availableCount(entry) {
  if (state.data === 'established') return Math.max(entry.gate, 24)
  return (
    (state.data === 'sparse'
      ? entry.id === 53
        ? 3
        : entry.id === 62
          ? 2
          : 1
      : 0) +
    ([15, 16, 18, 56, 63].includes(entry.id) ? state.observations.length : 0)
  )
}
function gate(entry) {
  if (entry.hours && !hours()) return 'hoursOnly'
  if (entry.annual && !capabilities().hasAnnualGoal) return 'annualOnly'
  if (entry.tenure && !capabilities().tracksTenure) return 'tenureOnly'
  if (
    entry.optin &&
    !state.privateExperiments &&
    !state.optins.includes(entry.id)
  )
    return 'needsOptin'
  if (
    entry.id === 44 &&
    ['2026-09-21', '2026-09-24', '2026-09-26'].every((date) =>
      state.offDays.includes(date)
    )
  )
    return 'noEligiblePlans'
  if (entry.id === 57 && state.hiddenMemories.includes('Ana'))
    return 'hiddenMemory'
  if (state.dismissed.includes(entry.id)) return 'dismissed'
  if (entry.gate > availableCount(entry)) return 'unlock'
  if ([15, 18].includes(entry.id) && state.data !== 'established') {
    const yes =
      state.observations.filter((x) => x === 'home').length +
      (state.data === 'sparse' ? 1 : 0)
    const no = state.observations.filter((x) => x === 'notAtHome').length
    if (yes < 5 || no < 5) return 'unlock'
  }
  if (
    state.data === 'empty' &&
    state.observations.length === 0 &&
    ![47, 49, 51, 52].includes(entry.id)
  )
    return 'unlock'
  return null
}
function card(entry, compact = false) {
  const locked = gate(entry)
  if (['hiddenMemory', 'dismissed'].includes(locked))
    return `<article class="card disabled-card"><p>${esc(t(locked))}</p></article>`
  return `<article class="card ${compact ? 'compact' : ''} ${locked ? 'disabled-card' : ''} catalog-card">
    <span class="catalog-id">${String(entry.id).padStart(2, '0')}</span><div class="eyebrow">${esc(groupName(entry.group))}</div>
    <h3>${text(entry.title)}</h3><p>${text(entry.stat)}</p>${locked ? `<div class="pill">${esc(t(locked))}</div>` : ''}
    <div>${openButton(entry, 'text-button')}</div></article>`
}
const section = (title, extra = '') =>
  `<div class="section-label"><h3>${esc(t(title))}</h3>${extra}</div>`
function heading(title, sub) {
  return `<header class="heading"><div><div class="eyebrow">${esc(t('brand'))} / ${esc(t(page))}</div><h1>${esc(t(title))}</h1><p>${esc(t(sub))}</p></div><span class="pill"><i class="dot"></i>${esc(t('fictional'))}</span></header>`
}
function controls() {
  const select = (key, values) =>
    `<label>${esc(t(key === 'publisher' ? 'role' : key))}<select data-control="${key}" aria-label="${esc(t(key))}">${values.map((v) => `<option value="${v}" ${state[key] === v ? 'selected' : ''}>${esc(t(v))}</option>`).join('')}</select></label>`
  const toggle = (key, label) =>
    `<label class="toggle">${esc(t(label))}<input type="checkbox" data-control="${key}" ${state[key] ? 'checked' : ''}></label>`
  return `<details class="controls" ${controlsOpen ? 'open' : ''}><summary>${esc(t('controls'))}</summary>
  ${select('publisher', ['regularPioneer', 'publisher', 'regularAuxiliary', 'specialPioneer', 'circuitOverseer', 'custom'])}
  ${select('data', ['established', 'sparse', 'empty'])}${select('format', ['short', 'decimal'])}
  ${toggle('discreet', 'discreet')}${toggle('away', 'away')}${toggle('flag', 'flag')}${toggle('privateExperiments', 'optin')}${toggle('supporter', 'supporterOption')}
  ${button(t('reset'), 'reset', 'reset')}${button(t('advanceWeek'), 'advanceWeek', 'reset')}<div class="lab-links">${button(t('catalog'), 'navigate', 'text-button', 'data-page="catalog"')}${button(t('widgets'), 'navigate', 'text-button', 'data-page="widgets"')}</div></details>`
}
function awayBanner() {
  if (!state.away) return ''
  const active = isAway(),
    expired = state.away.end < state.today
  return `<div class="banner"><div><h3>${esc(t(active ? 'awayTitle' : expired ? 'awayExpired' : 'awayScheduled'))}</h3><p>${esc(t(active ? 'awaySub' : 'awayScheduledSub'))}</p><small>${esc(state.away.start)} — ${esc(state.away.end)}</small></div>${button(t(active ? 'resume' : 'close'), 'resume', 'secondary')}</div>`
}
function peopleRows() {
  const people = [
    { name: 'Maria', id: 2, desc: copy(item(2).stat) },
    { name: 'Ana', id: 21, desc: copy(item(21).stat) },
    { name: 'Carlos', id: 16, desc: copy(item(16).stat) },
  ]
  const active = people.filter(
    (p) => !state.contacts[p.name] || state.contacts[p.name].status === 'active'
  )
  if (!active.length)
    return `<div class="empty"><h2>${esc(t('emptyQueue'))}</h2><p>${esc(t('emptyQueueSub'))}</p></div>`
  return active
    .map(
      (
        p
      ) => `<div class="status-row"><div class="initial">${esc(p.name[0])}</div><div class="row-body"><h3>${esc(name(p.name))}</h3><p>${esc(p.desc)}</p>
    <div class="small-actions">${button(t('snooze'), 'snooze', '', `data-name="${p.name}"`)}${button(t('disable'), 'mute', '', `data-name="${p.name}"`)}${button(t('inactive'), 'inactive', '', `data-name="${p.name}"`)}</div></div>${button(t('schedule'), 'detail', '', `data-id="${p.id}"`)}</div>`
    )
    .join('')
}
function reportCard() {
  if (isAway())
    return `<div class="card disabled-card"><div class="eyebrow">${esc(t('away'))}</div><h3>${esc(t('pacingPaused'))}</h3><p>${esc(t('pacingPausedSub'))}</p>${hours() ? `<p class="spaced">${esc(t('logged'))}: ${esc(duration(state.logged))}</p>` : ''}</div>`
  if (!hours())
    return `<div class="card"><div class="eyebrow">${esc(t('today'))}</div><h3>${esc(t('checkboxTitle'))}</h3><p>${esc(t('checkboxStat'))}</p>${button(t(state.checkedIn ? 'checkedIn' : 'checkin'), 'checkin', 'primary', state.checkedIn ? 'disabled' : '')}</div>`
  const ratio = Math.min(1, state.logged / state.goal),
    projected = state.logged + state.planned
  return `<div class="card"><div class="ring-row"><div class="ring"><svg width="112" height="112" viewBox="0 0 112 112"><circle cx="56" cy="56" r="48" stroke="#e6eadc" stroke-width="7" fill="none"/><circle cx="56" cy="56" r="48" stroke="#a6bd80" stroke-width="7" fill="none" stroke-dasharray="${Math.min(1, projected / state.goal) * 302} 302"/><circle cx="56" cy="56" r="48" stroke="#345f4c" stroke-width="7" fill="none" stroke-dasharray="${ratio * 302} 302"/></svg><strong>${Math.round(ratio * 100)}%<small>${esc(t('logged'))}</small></strong></div><div><div class="eyebrow">${esc(t('goalLabel'))}</div><h3>${esc(duration(state.goal))}</h3><p>${esc(t(projected >= state.goal ? 'onTrack' : 'paceReason'))}</p></div></div>
  <div class="metrics"><div><strong>${esc(formatMinutesCompact(state.logged))}</strong><small>${esc(t('logged'))}</small></div><div><strong>${esc(formatMinutesCompact(state.planned))}</strong><small>${esc(t('planned'))}</small></div><div><strong>${esc(formatMinutesCompact(Math.max(0, state.goal - projected)) || '0')}</strong><small>${esc(t('remainingLabel'))}</small></div></div>
  ${button(t('viewInsight'), 'detail', 'text-button', 'data-id="29"')}</div>`
}
function miniPlans() {
  if (isAway()) return `<p class="subtle">${esc(t('neutral'))}</p>`
  const plans = plannedEntries()
    .filter((p) => p.date >= state.today)
    .slice(0, 3)
  return (
    plans
      .map(
        (p) =>
          `<div class="mini-plan"><div class="date-box">${esc(new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(p.date + 'T12:00:00Z')))}<b>${Number(p.date.slice(-2))}</b></div><div><p>${esc(p.people.map(name).join(', '))}</p><small>${esc(p.time)}${hours() ? ' · ' + esc(duration(p.minutes)) : ''}</small></div>${button('→', 'openDay', '', `data-date="${p.date}" aria-label="${esc(t('viewSchedule'))}"`)}</div>`
      )
      .join('') || `<p class="subtle">${esc(t('noPlans'))}</p>`
  )
}
function highlightDestination(entry) {
  if (['people', 'studies'].includes(entry.group)) return 'contacts'
  if (entry.group === 'timing') return 'map'
  if (['rhythm', 'seasonal'].includes(entry.group)) return 'schedule'
  return capabilities().showsYearTabs ? 'progress' : 'schedule'
}
function highlightCandidates() {
  return activeCatalog.filter(
    (e) =>
      !state.dismissed.includes(e.id) &&
      !(e.id === 57 && state.hiddenMemories.includes('Ana'))
  )
}
function hero(focused = false) {
  const candidates = highlightCandidates()
  const entry = item(highlightId),
    index = candidates.findIndex((e) => e.id === entry.id),
    locked = gate(entry)
  const destination = highlightDestination(entry)
  return `<article class="hero ${focused ? 'focus-highlight' : ''}" aria-roledescription="carousel" aria-label="${esc(t('dailyHighlight'))}" data-highlight="${entry.id}">
    <div class="highlight-top"><div class="eyebrow">${esc(t('dailyHighlight'))}</div><div class="highlight-controls">${button('←', 'highlightPrev', '', `aria-label="${esc(t('previousInsight'))}"`)}<span>${index + 1} / ${candidates.length}</span>${button('→', 'highlightNext', '', `aria-label="${esc(t('nextInsight'))}"`)}</div></div>
    <div class="highlight-copy" aria-live="polite" aria-atomic="true"><h2>${text(entry.title)}</h2><p>${text(entry.stat)}</p></div>
    ${locked ? `<p class="highlight-gate">${esc(t(locked))}</p>` : ''}
    <div class="highlight-actions">${openButton(entry)}${button(t('why'), 'detail', 'why', `data-id="${entry.id}"`)}</div>
    <div class="highlight-bottom"><label class="sr-only" for="highlight-choice">${esc(t('insightChooser'))}</label><select id="highlight-choice" aria-label="${esc(t('insightChooser'))}">${candidates.map((e) => `<option value="${e.id}" ${e.id === entry.id ? 'selected' : ''}>${String(e.id).padStart(2, '0')} · ${text(e.title)}</option>`).join('')}</select>${button(t('open' + destination[0].toUpperCase() + destination.slice(1)) + ' ↗', 'navigate', 'context-link', `data-page="${destination}"`)}</div></article>`
}
function currentWeek() {
  const start = new Date(state.today + 'T12:00:00Z')
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7))
  return days.map((day, index) => {
    const date = new Date(start)
    date.setUTCDate(start.getUTCDate() + index)
    return {
      day,
      date: date.toISOString().slice(0, 10),
      number: date.getUTCDate(),
    }
  })
}
function weekStrip() {
  return `<div class="week-strip" aria-label="${esc(t('weekStrip'))}">${currentWeek()
    .map(
      ({ day, date, number }) =>
        `<button data-action="openDay" data-date="${date}" class="${date === state.today ? 'today' : ''}"><span>${esc(t(day).slice(0, 3))}</span><strong>${number}</strong><i class="${plannedEntries().some((p) => p.date === date) ? 'has-plan' : ''}"></i></button>`
    )
    .join('')}</div>`
}
function timerCard() {
  if (!capabilities().showsTimer) return ''
  return `<div class="card timer-card"><div><div class="eyebrow">${esc(t('serviceTimer'))}</div><strong id="timer-display">${timerText()}</strong><p>${esc(t(timerStarted ? 'timerRunning' : 'timerReady'))}</p></div><div>${button(t(timerStarted ? 'pauseTimer' : 'startTimer'), 'timerToggle', 'secondary')}${timerSeconds ? button(t('resetTimer'), 'timerReset', 'text-button') : ''}</div></div>`
}
function timerText() {
  const seconds =
    timerSeconds +
    (timerStarted ? Math.floor((Date.now() - timerStarted) / 1000) : 0)
  return [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((n) => String(n).padStart(2, '0'))
    .join(':')
}
function home() {
  const header = heading('goodMorning', 'introSub')
  const currentMonth = `<div class="home-month">${reportCard()}${button(t('openProgress') + ' →', 'navigate', 'text-button', `data-page="${capabilities().showsYearTabs ? 'progress' : 'schedule'}"`)}</div>`
  const upcoming = `${section('upcomingConversations', button(t('viewContacts'), 'navigate', 'text-button', 'data-page="contacts"'))}<div class="card compact">${isAway() ? `<p>${esc(t('awaySub'))}</p>` : peopleRows()}</div>`
  const plans = `${section('thisWeek', button(t('viewSchedule'), 'navigate', 'text-button', 'data-page="schedule"'))}<div class="card compact">${miniPlans()}</div>`
  if (state.data !== 'established')
    return (
      header +
      `<div class="empty"><h2>${esc(t('homeEmpty'))}</h2><p>${esc(t('selectHistory'))}</p>${button(t('firstVisit'), 'sample')}</div>` +
      (state.flag ? `<div class="spaced">${hero()}</div>` : '') +
      weekStrip() +
      timerCard()
    )
  if (!state.flag)
    return (
      header +
      weekStrip() +
      `<div class="two-col"><div>${currentMonth}${timerCard()}</div><div>${plans}${upcoming}</div></div>`
    )
  if (variant === 'B')
    return (
      header +
      awayBanner() +
      weekStrip() +
      `<div class="two-col"><div>${timerCard()}${section('todayActivity')}<div class="agenda"><div class="agenda-day">${esc(new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(state.today + 'T12:00:00Z')))}<b>${Number(state.today.slice(-2))}</b></div><div class="agenda-content">${miniPlans()}</div></div>${hero()}</div><div>${currentMonth}${upcoming}</div></div>`
    )
  if (variant === 'C')
    return (
      header +
      awayBanner() +
      hero(true) +
      weekStrip() +
      `<div class="two-col"><div>${currentMonth}${timerCard()}</div><div>${plans}${upcoming}</div></div>`
    )
  return (
    header +
    awayBanner() +
    weekStrip() +
    `<div class="two-col"><div>${hero()}${upcoming}</div><div>${currentMonth}${timerCard()}${plans}</div></div>`
  )
}
function contactRecords() {
  return [
    ...sampleNames.map((contact, i) => ({
      name: contact,
      study: ['Ana', 'Daniel'].includes(contact),
      favorite: [0, 3, 4].includes(i),
      id: [2, 16, 8, 9, 21, 24][i],
    })),
    ...state.newContacts.map((c) => ({ ...c, id: 1 })),
  ]
}
function contactsPage() {
  const filtered = contactRecords().filter(
    (c) =>
      name(c.name).toLowerCase().includes(contactSearch.toLowerCase()) &&
      (contactFilter === 'all' ||
        (contactFilter === 'studies' && c.study) ||
        (contactFilter === 'favorites' && c.favorite))
  )
  if (!filtered.some((c) => c.name === selectedContact) && filtered.length)
    selectedContact = filtered[0].name
  const current = filtered.find((c) => c.name === selectedContact)
  return (
    heading('contacts', 'contactsSub') +
    `<div class="page-toolbar"><div class="search-row"><input id="contact-search" type="search" value="${esc(contactSearch)}" placeholder="${esc(t('searchContacts'))}" aria-label="${esc(t('searchContacts'))}"><select id="contact-filter" aria-label="${esc(t('allContacts'))}">${[
      ['all', 'allContacts'],
      ['studies', 'studiesFilter'],
      ['favorites', 'favoritesFilter'],
    ]
      .map(
        ([v, key]) =>
          `<option value="${v}" ${v === contactFilter ? 'selected' : ''}>${esc(t(key))}</option>`
      )
      .join(
        ''
      )}</select></div>${button('+ ' + t('addContact'), 'addContact', 'primary')}</div><p class="subtle">${contactRecords().length} ${esc(t('contacts'))} · ${contactRecords().filter((c) => c.study).length} ${esc(t('bibleStudies'))}</p>
    <div class="contact-layout spaced"><div class="card contact-list">${filtered.map((c) => `<button class="contact-select ${c.name === selectedContact ? 'selected' : ''}" data-action="selectContact" data-name="${esc(c.name)}"><span class="initial">${esc(c.name[0])}</span><span><strong>${esc(name(c.name))}${c.favorite ? ' ☆' : ''}</strong><small>${esc(t(c.study ? 'contactStudy' : 'contactFollowup'))}</small></span><span class="contact-arrow">›</span></button>`).join('') || `<p>${esc(t('contactEmpty'))}</p>`}</div><div class="card contact-inspector">${current ? `<div class="contact-heading"><span class="initial">${esc(current.name[0])}</span><div><h2>${esc(name(current.name))}</h2><p>${esc(t(current.study ? 'contactStudy' : 'contactFollowup'))}</p></div></div><div class="contact-details"><p>${esc(state.contacts[current.name]?.phone || '')}</p><p>${esc(state.contacts[current.name]?.address || '')}</p></div>${section('recentConversations')}<div class="conversation-entry"><small>${esc(t('contactDate'))}</small><p>${esc(t('conversationNote'))}</p><p class="subtle spaced">${esc(t('followUpTopic'))}</p></div>${state.flag ? `<div class="inline-insight"><div class="eyebrow">${esc(t('proposed'))}</div><h3>${text(item(current.id).title)}</h3><p>${text(item(current.id).stat)}</p>${openButton(item(current.id), 'text-button')}</div>` : ''}<div class="sheet-actions">${button(t('contactAction'), 'detail', 'primary', `data-id="${current.id}"`)}${button(t('viewOnMap'), 'navigate', 'text-button', `data-page="map" data-contact="${esc(current.name)}"`)}</div>` : ''}</div></div>`
  )
}
const heat = [
  [
    [1, 4],
    [1, 4],
    [2, 4],
  ],
  [
    [1, 4],
    [1, 4],
    [2, 3],
  ],
  [
    [2, 4],
    [1, 4],
    [1, 3],
  ],
  [
    [2, 4],
    [1, 4],
    [3, 4],
  ],
  [
    [2, 4],
    [1, 4],
    [2, 3],
  ],
  [
    [9, 12],
    [3, 6],
    [2, 4],
  ],
  [
    [0, 0],
    [0, 0],
    [0, 0],
  ],
]
const days = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]
function heatChart() {
  return `<div class="heat-grid"><div></div>${['morning', 'afternoon', 'evening'].map((s) => `<span class="heat-label">${esc(t(s))}</span>`).join('')}${heat.map((row, i) => `<span class="heat-label">${esc(t(days[i]))}</span>${row.map(([yes, total], j) => `<button class="heat ${selectedCell[0] === i && selectedCell[1] === j ? 'selected' : ''}" data-action="heat" data-day="${i}" data-slot="${j}" style="--strength:${total ? (yes / total) * 85 : 0}%" aria-label="${esc(t(days[i]) + ' ' + t(['morning', 'afternoon', 'evening'][j]) + ': ' + yes + ' / ' + total)}">${total ? yes + '/' + total : '—'}</button>`).join('')}`).join('')}</div>`
}
function timingSection() {
  const [yes, total] = heat[selectedCell[0]][selectedCell[1]],
    locked = gate(item(15))
  return `<section class="card timing-panel"><div class="eyebrow">${esc(t('heatTitle'))}</div><h3>${esc(t('pattern'))}</h3><p>${esc(t('heatSub'))}</p>${locked ? `<div class="empty spaced"><p>${esc(t('heatEmpty'))}</p>${button(t('recordOutcome'), 'detail', 'secondary', 'data-id="15"')}</div>` : heatChart()}${!locked ? `<div class="timing-selection" aria-live="polite"><strong>${esc(t(days[selectedCell[0]]))} · ${esc(t(['morning', 'afternoon', 'evening'][selectedCell[1]]))}</strong><span>${total ? `${yes} / ${total} · ${Math.round((yes / total) * 100)}% ${esc(t('rate'))}` : esc(t('noVisitsInSlot'))}</span></div>` : ''}<p class="subtle spaced">${esc(t('heatHint'))}</p></section>`
}
function monthInfo(offset = 0) {
  const date = new Date(Date.UTC(2026, 8 + offset, 1))
  return {
    prefix: date.toISOString().slice(0, 7),
    days: new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)
    ).getUTCDate(),
    start: (date.getUTCDay() + 6) % 7,
    label: new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date),
  }
}
function monthNavigator(context, offset) {
  return `<div class="month-navigator">${button('‹', 'monthPrev', 'secondary', `data-context="${context}" aria-label="${esc(t('previousMonth'))}"`)}<strong>${esc(monthInfo(offset).label)}</strong>${button('›', 'monthNext', 'secondary', `data-context="${context}" aria-label="${esc(t('nextMonth'))}"`)}${offset ? button(t('jumpCurrent'), 'monthCurrent', 'text-button', `data-context="${context}"`) : ''}</div>`
}
function recordedEntries() {
  const base =
    state.data === 'empty'
      ? []
      : [
          [20, 180],
          [19, 240],
          [17, 120],
          [15, 180],
          [14, 120],
          [12, 240],
          [10, 180],
          [8, 240],
          [7, 180],
          [5, 240],
          [3, 180],
          [1, 180],
        ].map(([day, minutes]) => ({
          date: `2026-09-${String(day).padStart(2, '0')}`,
          minutes,
          category: 'field',
        }))
  return [...base, ...state.logs].sort((a, b) => b.date.localeCompare(a.date))
}
function plannedEntries() {
  const base =
    state.data === 'empty'
      ? []
      : [
          {
            date: '2026-09-21',
            time: '09:00',
            minutes: 120,
            people: [t('field')],
          },
          { date: '2026-09-24', time: '16:00', minutes: 60, people: ['Ana'] },
          {
            date: '2026-09-26',
            time: '09:00',
            minutes: 180,
            people: [t('returns')],
          },
          {
            date: '2026-09-28',
            time: '09:00',
            minutes: 180,
            people: [t('field')],
          },
        ]
  return [
    ...base.map((p) => ({ ...p, key: 'base-' + p.date })),
    ...state.plans.map((p, i) => ({ ...p, key: 'saved-' + i })),
  ]
    .filter((p) => !state.resolvedPlans.includes(p.key))
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)
    )
}
function paceSummary() {
  const gap = Math.max(0, state.goal - state.logged - state.planned)
  return `<div class="card projection-card"><div class="eyebrow">${esc(t('projectedTotal'))}</div><div class="projection-total"><strong>${esc(duration(state.logged + state.planned))}</strong><span>/ ${esc(duration(state.goal))}</span></div><div class="progress-track"><i style="width:${Math.min(100, (state.logged / state.goal) * 100)}%"></i><i style="width:${Math.min(100, (state.planned / state.goal) * 100)}%"></i></div><p>${esc(t('reportHint'))}</p>${state.flag ? `<div class="inline-insight"><div class="eyebrow">${esc(t('proposed'))}</div><h3>${esc(t(isAway() ? 'pacingPaused' : gap ? 'paceReason' : 'onTrack'))}</h3><p>${isAway() ? esc(t('pacingPausedSub')) : `${esc(duration(state.logged))} ${esc(t('logged'))} + ${esc(duration(state.planned))} ${esc(t('planned'))} · ${esc(duration(gap))} ${esc(t('remainingLabel'))}`}</p>${!isAway() ? button(t('openSchedule') + ' →', 'navigate', 'text-button', 'data-page="schedule"') : ''}</div>` : ''}</div>`
}
function progressPage() {
  if (!capabilities().showsYearTabs) return heading('progress', 'noHours')
  const tabs = `<div class="segmented" aria-label="${esc(t('progress'))}">${['month', 'year', 'allTime'].map((tab) => button(t(tab), 'progressTab', tab === progressTab ? 'selected' : '', `data-tab="${tab}" aria-pressed="${tab === progressTab}"`)).join('')}</div>`
  const headingMarkup = heading('progress', 'progressSub') + tabs
  if (progressTab === 'month') {
    const entries = recordedEntries().filter((e) =>
      e.date.startsWith(monthInfo(progressMonth).prefix)
    )
    const total = entries.reduce((sum, e) => sum + e.minutes, 0)
    return (
      headingMarkup +
      monthNavigator('progress', progressMonth) +
      awayBanner() +
      `<div class="two-col"><div><div class="card month-report"><div class="eyebrow">${esc(t('total'))}</div><div class="report-total">${esc(duration(total))}</div><div class="metrics"><div><strong>${entries.length}</strong><small>${esc(t('entries'))}</small></div><div><strong>${progressMonth === 0 ? 2 : 0}</strong><small>${esc(t('bibleStudies'))}</small></div></div>${section('monthlyCategories')}<div class="category"><span>${esc(t('fieldService'))}</span><div class="progress-track"><i style="width:100%"></i></div><span>${esc(formatMinutesCompact(total) || '0')}</span></div>${button('+ ' + t('addTime'), 'addTime', 'primary')}</div>${progressMonth === 0 ? `<div class="spaced">${paceSummary()}</div>` : ''}</div><section class="card all-days"><div class="section-label"><h3>${esc(t('allDays'))}</h3><span>${entries.length}</span></div>${entries.map((e) => `<div class="entry-row"><span>${esc(new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', weekday: 'short', timeZone: 'UTC' }).format(new Date(e.date + 'T12:00:00Z')))}</span><strong>${esc(duration(e.minutes))}</strong></div>`).join('') || `<p>${esc(t('emptyMonth'))}</p>`}</section></div>`
    )
  }
  if (progressTab === 'year')
    return (
      headingMarkup +
      `<div class="year-toolbar"><strong>${esc(t('yearReport'))}</strong></div><div class="card"><div class="eyebrow">${esc(t('yearToDate'))}</div><div class="report-total">${esc(duration(36000))}</div><p>${esc(t('yearContext'))}</p>${yearChart()}</div>${state.flag ? `<div class="inline-insight"><div class="eyebrow">${esc(t('proposed'))}</div><h3>${text(item(53).title)}</h3><p>${text(item(53).stat)}</p>${openButton(item(53), 'text-button')}</div>` : ''}`
    )
  return (
    headingMarkup +
    `<div class="card spaced"><div class="eyebrow">${esc(t('allTimeTotal'))}</div><div class="report-total">${esc(duration(68400))}</div><p>${esc(t('historySubline'))}</p>${section('personalRecords')}<div class="entry-row"><span>${text(item(34).title)}</span><strong>${esc(duration(3720))}</strong></div>${button(t('viewInsight'), 'detail', 'text-button', 'data-id="34"')}</div>${state.flag ? `<div class="inline-insight"><div class="eyebrow">${esc(t('proposed'))}</div><h3>${text(item(55).title)}</h3><p>${text(item(55).stat)}</p>${openButton(item(55), 'text-button')}</div>` : ''}`
  )
}
function scheduleCalendar() {
  const month = monthInfo(scheduleMonth),
    records = scheduleMode === 'plans' ? plannedEntries() : recordedEntries()
  return `<div class="schedule-calendar"><div class="calendar-days">${days.map((day) => `<span>${esc(t(day).slice(0, 3))}</span>`).join('')}</div><div class="calendar-grid">${'<span class="calendar-spacer"></span>'.repeat(month.start)}${Array.from(
    { length: month.days },
    (_, i) => {
      const date = `${month.prefix}-${String(i + 1).padStart(2, '0')}`,
        entries = records.filter((e) => e.date === date),
        minutes = entries.reduce((sum, e) => sum + e.minutes, 0),
        off =
          new Date(date + 'T12:00:00Z').getUTCDay() === 0 ||
          state.offDays.includes(date)
      return `<button data-action="calendarDay" data-date="${date}" class="calendar-cell ${date === scheduleDay ? 'selected' : ''} ${off ? 'off' : ''}" aria-pressed="${date === scheduleDay}" aria-label="${esc(date + (off ? ' ' + t('dayOff') : '') + ' · ' + entries.length + ' ' + t(scheduleMode === 'plans' ? 'plans' : 'entries') + (entries.length && hours() ? ' · ' + duration(minutes) : ''))}"><strong>${i + 1}</strong><small>${entries.length ? (hours() ? esc(formatMinutesCompact(minutes)) : entries.length + ' ' + esc(t('plans'))) : off ? '—' : ''}</small>${entries.length ? '<i></i>' : ''}</button>`
    }
  ).join('')}</div></div>`
}
function schedulePage() {
  const records = (
    scheduleMode === 'plans' ? plannedEntries() : recordedEntries()
  ).filter((e) => e.date === scheduleDay)
  return (
    heading('schedule', 'scheduleSub') +
    monthNavigator('schedule', scheduleMonth) +
    awayBanner() +
    `<div class="schedule-layout"><div><div class="card"><div class="segmented">${['plans', 'entries'].map((mode) => button(t(mode), 'scheduleMode', scheduleMode === mode ? 'selected' : '', `data-mode="${mode}" aria-pressed="${mode === scheduleMode}"`)).join('')}</div>${scheduleCalendar()}<div class="legend"><span><i></i>${esc(t('planned'))}</span><span><i></i>${esc(t('logged'))}</span><span>— ${esc(t('dayOff'))}</span></div></div>${section('recurringPlans')}<div class="card"><div class="entry-row"><div><h3>${esc(t('recurringSample'))}</h3><p>${esc(t('recurringTime'))}</p></div>${button(t('open'), 'detail', 'text-button', 'data-id="43"')}</div>${state.flag && !isAway() ? `<div class="inline-insight"><div class="eyebrow">${esc(t('proposed'))}</div><h3>${text(item(43).title)}</h3><p>${esc(t('planFollowThrough'))}</p>${openButton(item(43), 'text-button')}</div>` : ''}</div></div><div><div class="card day-inspector"><div class="eyebrow">${esc(t('selectedDay'))}</div><h3>${esc(new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(scheduleDay + 'T12:00:00Z')))}</h3>${records.map((e) => `<div class="entry-row"><div><strong>${esc(e.time || '')}</strong><p>${esc(e.people ? e.people.map(name).join(', ') : t('fieldService'))}</p></div>${hours() ? `<strong>${esc(duration(e.minutes))}</strong>` : ''}</div>`).join('') || `<p>${esc(t(scheduleMode === 'plans' ? 'noPlansDay' : 'noEntriesDay'))}</p>`}${button('+ ' + t(scheduleMode === 'plans' ? 'addPlan' : 'addTime'), 'dayAdd', 'primary')}</div><div class="card spaced"><div class="eyebrow">${esc(t('assistant'))}</div><h3>${esc(t(isAway() ? 'pacingPaused' : hours() ? 'assistantSummary' : 'scheduleSub'))}</h3>${hours() ? `<p>${esc(duration(state.logged + state.planned))} / ${esc(duration(state.goal))}</p>` : ''}${!isAway() ? button(t('addPlan'), 'detail', 'primary', `data-id="${hours() ? 27 : 44}"`) : ''}${state.flag ? `<p class="spaced subtle">${esc(t('reportHint'))}</p>` : ''}</div>${state.flag && !isAway() ? `<div class="inline-insight"><div class="eyebrow">${esc(t('proposed'))}</div><h3>${esc(t('weekReflection'))}</h3><p>${text(t(hours() ? 'weeklyHours' : 'weeklyCheckbox'))}</p>${openButton(item(61), 'text-button')}</div>` : ''}</div></div>`
  )
}
function mapPage() {
  const contacts = contactRecords(),
    current = contacts.find((c) => c.name === selectedContact) || contacts[0]
  return (
    heading('map', 'mapSub') +
    `<div class="map-layout"><section class="map-surface" aria-label="${esc(t('mapContacts'))}"><div class="map-park"><span>${esc(t('mapPark'))}</span></div><span class="street-label street-one">${esc(t('mapStreet'))}</span><span class="street-label street-two">${esc(t('mapStreet2'))}</span><div class="map-name">${esc(t('mapArea'))}</div>${contacts.map((c, i) => `<button class="map-marker ${c.name === selectedContact ? 'selected' : ''}" data-action="mapContact" data-name="${esc(c.name)}" style="left:${[25, 62, 76, 38, 54, 82][i % 6]}%;top:${[24, 33, 67, 73, 57, 21][i % 6]}%" aria-label="${esc(name(c.name))}">${esc(c.name[0])}</button>`).join('')}<small class="map-disclaimer">${esc(t('mapPrivate'))}</small><div class="map-contact-card"><div><strong>${esc(name(current.name))}</strong><p>${esc(t(current.study ? 'contactStudy' : 'contactFollowup'))}</p></div>${button(t('openContacts'), 'navigate', 'text-button', `data-page="contacts" data-contact="${esc(current.name)}"`)}</div></section>${state.flag ? timingSection() : `<div class="card"><h3>${esc(t('mapContacts'))}</h3><p>${esc(t('mapSummary'))}</p>${contacts.map((c) => `<div class="entry-row">${button(name(c.name), 'mapContact', 'text-button', `data-name="${esc(c.name)}"`)}</div>`).join('')}</div>`}</div>`
  )
}
function yearChart(metric = 'time') {
  const a =
    metric === 'time'
      ? [42, 89, 137, 189, 240, 284, 344, 412, 459, 506, 551, 600]
      : [4, 8, 13, 17, 20, 26, 31, 35, 41, 47, 54, 61]
  const b =
    metric === 'time'
      ? [35, 78, 120, 168, 210, 260, 301, 346, 400, 445, 490, 540]
      : [3, 6, 10, 14, 18, 21, 24, 30, 36, 41, 46, 53]
  const max = metric === 'time' ? 600 : 64
  const points = (arr) =>
    arr.map((v, i) => `${35 + i * 39},${180 - (v / max) * 155}`).join(' ')
  return `<svg class="chart" role="img" aria-label="${esc(t('yearComparison'))}" viewBox="0 0 500 215"><path d="M35 25H464 M35 77H464 M35 128H464 M35 180H464" stroke="#e3e7db" fill="none"/>${metric === 'time' && capabilities().hasAnnualGoal ? '<path d="M35 180 464 25" stroke="#d7c492" stroke-dasharray="5 5" fill="none"/>' : ''}<polyline points="${points(b)}" stroke="#b5c1a4" stroke-width="2.5" fill="none"/><polyline points="${points(a)}" stroke="#345f4c" stroke-width="3" fill="none"/>${t(
    'months'
  )
    .split(' ')
    .map(
      (m, i) =>
        `<text x="${35 + i * 39}" y="204" text-anchor="middle">${m}</text>`
    )
    .join(
      ''
    )}<text x="9" y="183">0</text><text x="4" y="28">${max}</text></svg><div class="legend"><span><i></i>${esc(t('year2025'))}</span><span><i></i>${esc(t('year2024'))}</span>${metric === 'time' && capabilities().hasAnnualGoal ? `<span><i></i>${esc(t('goalLine'))}</span>` : ''}</div>`
}
function barComparison(
  labels,
  values,
  label,
  renderValue = (value) => String(value)
) {
  const max = Math.max(...values, 1)
  return `<div class="why-box"><strong>${esc(t(label))}</strong>${values.map((value, i) => `<div class="comparison-row"><span>${esc(labels[i])}</span><div class="progress-track"><i style="width:${(value / max) * 100}%"></i></div><strong>${esc(renderValue(value))}</strong></div>`).join('')}</div>`
}
function historyVisual(id) {
  if (id === 19)
    return (
      barComparison(
        [t('tuesday'), t('thursday'), t('saturday')],
        [2, 6, 12],
        'monthVisits'
      ) + `<p class="subtle">${esc(t('approxRatio'))}</p>`
    )
  if (id === 26)
    return barComparison(
      t('months').split(' '),
      [1, 1, 2, 2, 2, 2, 2, 3, 2, 2, 2, 2],
      'studyChart'
    )
  if (id === 34)
    return barComparison(
      ['week1', 'week2', 'week3', 'week4'].map(t),
      [900, 1080, 840, 900],
      'totalHours',
      duration
    )
  if (id === 39)
    return barComparison(
      [t('day42'), t('day7')],
      [300, 380],
      'weekly',
      duration
    )
  return yearChart(hours() ? 'time' : 'people')
}
function weekChart() {
  return `<div class="week-bars">${[48, 0, 48, 100, 24, 0, 0].map((v, i) => `<div class="week-bar"><i style="height:${v}%"></i><small>${esc(t(days[i]).slice(0, 3))}</small></div>`).join('')}</div>`
}
function rangeMonitor() {
  return `<div class="card"><div class="eyebrow">${esc(t('typicalTitle'))}</div>${[
    'weekMinutes',
    'weekVisits',
    'weekContacts',
  ]
    .filter((k) => hours() || k !== 'weekMinutes')
    .map(
      (k, i) =>
        `<div class="status-row"><div class="row-body"><h3>${esc(t(k))}</h3></div><span class="pill">${esc(t(state.outliers && i >= (hours() ? 1 : 0) ? 'outlier' : 'typical'))}</span></div>`
    )
    .join(
      ''
    )}<p class="spaced">${esc(t('typicalSub'))}</p>${state.autoFreeze ? `<div class="notice">${esc(t('freezePreview'))}</div>` : ''}<label class="toggle spaced"><small>${esc(t('outlierControl'))}</small><input type="checkbox" data-control="outliers" ${state.outliers ? 'checked' : ''}></label></div>`
}
function catalogPage() {
  const q = search.toLowerCase().replace(/^#/, '')
  const entries = activeCatalog.filter(
    (e) =>
      (group === 'all' || group === e.group) &&
      copy(`${e.id} ${e.title} ${e.stat} ${e.action}`).toLowerCase().includes(q)
  )
  return (
    heading('catalogTitle', 'catalogSub') +
    `<div class="search-row"><input id="search" type="search" value="${esc(search)}" placeholder="${esc(t('search'))}" aria-label="${esc(t('searchLabel'))}"><select id="group" aria-label="${esc(t('all'))}">${['all', ...new Set(catalog.map((e) => e.group))].map((g) => `<option value="${g}" ${g === group ? 'selected' : ''}>${esc(g === 'all' ? t('all') : groupName(g))}</option>`).join('')}</select></div><p class="catalog-count">${entries.length} / ${activeCatalog.length} ${esc(t('results'))}</p>${entries.length ? `<div class="cards">${entries.map((e) => card(e)).join('')}</div>` : `<p>${esc(t('noResults'))}</p>`}`
  )
}
function widgetsPage() {
  return (
    heading('widgetsTitle', 'widgetsSub') +
    `<div class="cards"><div class="card"><div class="eyebrow">${esc(t('widgetHome'))}</div><div class="widget"><small>${esc(t('brand'))}</small><h3>${esc(t(isAway() ? 'awayTitle' : 'widgetText'))}</h3><p>${esc(isAway() ? t('neutral') : hours() ? duration(state.logged) + ' / ' + duration(state.goal) : t('checkboxStat'))}</p>${button(t('widgetAction'), 'navigate', 'text-button', 'data-page="home"')}</div></div><div class="card"><div class="eyebrow">${esc(t('widgetLock'))}</div><div class="lockscreen"><small>${esc(t('monday'))}, 21</small><div class="clock">09:41</div><div class="widget">${esc(t(isAway() ? 'awayTitle' : 'widgetText'))}</div></div></div></div><div class="card spaced"><div class="eyebrow">${esc(t('widgetPush'))}</div><div class="notification spaced"><strong>${esc(t('brand'))}</strong><p>${esc(t(isAway() ? 'awaySub' : 'widgetDetail'))}</p></div><p class="spaced">${esc(t('sharePrivacy'))}</p></div>`
  )
}
function safeState() {
  let data = JSON.stringify(
    {
      variant,
      page,
      highlightId,
      progressTab,
      progressMonth,
      scheduleDay,
      scheduleMode,
      selectedContact,
      capabilities: capabilities(),
      ...state,
    },
    null,
    2
  )
  if (state.discreet)
    [...sampleNames, ...state.newContacts.map((c) => c.name)].forEach((n) => {
      data = data.replaceAll(n, n[0] + '.')
    })
  return data
}
function appNavigation(className) {
  return `<nav class="${className}" aria-label="${esc(t('appNavigation'))}">${appPages
    .filter((p) => p !== 'progress' || capabilities().showsYearTabs)
    .map(
      (p) =>
        `<button type="button" data-action="navigate" data-page="${p}" class="${p === page ? 'active' : ''}" ${p === page ? 'aria-current="page"' : ''}>${icon(icons[p])}<span>${esc(t(p))}</span></button>`
    )
    .join('')}</nav>`
}
function render() {
  controlsOpen = $('.controls')?.open ?? controlsOpen
  if (!highlightCandidates().some((e) => e.id === highlightId))
    highlightId = highlightCandidates()[0].id
  updateURL()
  const views = {
    home,
    contacts: contactsPage,
    progress: progressPage,
    schedule: schedulePage,
    map: mapPage,
    catalog: catalogPage,
    widgets: widgetsPage,
  }
  const body = views[page]()
  $('#root').innerHTML =
    `<div class="studio"><aside class="sidebar"><div class="brand"><span class="brand-mark" aria-hidden="true">w</span>${esc(t('brand'))}</div>${appNavigation('nav app-nav')}<div class="sidebar-foot"><div class="eyebrow">${esc(t('labOnly'))}</div>${controls()}<p class="scope-note">${esc(t('contextFixture'))}</p><a href="https://github.com/leviFrosty/witness-work/issues/479" target="_blank" rel="noreferrer">#479 ↗</a></div></aside><main class="main"><div class="topline"><div class="eyebrow">${esc(t(page))}</div><span class="pill"><i class="dot"></i>${esc(new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(state.today + 'T12:00:00Z')))}</span><div class="avatar">A</div></div><div class="content">${body}<details class="coverage"><summary>${esc(t('covered'))}</summary><p>${esc(t('coverageBody'))}</p><p>${esc(t('sourceInfo'))}</p><p>${esc(t('parkedTitle'))}: ${esc(t('parkedBody'))}</p></details><details class="activity-panel"><summary>${esc(t('inspection'))} · ${state.actions.length} ${esc(t('activityLabel'))}</summary>${
      state.actions
        .slice(-5)
        .map((a) => `<div class="activity-item">${esc(copy(a.label))}</div>`)
        .join('') || `<p class="subtle spaced">${esc(t('noActivity'))}</p>`
    }${button(t('undo'), 'undo', 'text-button', undo.length ? '' : 'disabled')}<pre>${esc(safeState())}</pre></details></div></main></div>${appNavigation('bottom-tabs')}${page === 'home' ? `<div class="switcher" aria-label="${esc(t('feedback'))}">${button('←', 'variantPrev', '', `aria-label="${esc(t('variantPrev'))}"`)}<span>${esc(t('home' + variant))}</span>${button('→', 'variantNext', '', `aria-label="${esc(t('variantNext'))}"`)}</div>` : ''}`
}
function showSheet(body, label = t('viewInsight')) {
  const dialog = $('#sheet')
  if (!dialog.open) lastFocus = document.activeElement
  dialog.innerHTML = `<div class="sheet-head"><div class="eyebrow">${esc(label)}</div>${button('×', 'close', 'close', `aria-label="${esc(t('close'))}"`)}</div><div class="sheet-body">${body}</div>`
  if (!dialog.open) dialog.showModal()
  dialog.scrollTop = 0
}
function closeSheet() {
  $('#sheet').close()
  if (lastFocus?.isConnected) lastFocus.focus()
}
function thresholdView(entry) {
  const count = availableCount(entry),
    remaining = Math.max(0, entry.gate - count)
  return `<h2>${esc(t('unlock'))}</h2><p>${text(entry.title)}</p>${[15, 18].includes(entry.id) ? `<p>${esc(t('bothOutcomes'))}</p>` : ''}<div class="why-box"><strong>${remaining} ${esc(t('remaining'))}</strong><p>${esc(entry.id === 53 ? t('seasonHistory') : entry.id === 62 ? t('shortHistory') : t('unlockSub'))}</p></div>${[15, 16, 18].includes(entry.id) ? `<form data-form="observation"><label>${esc(t('outcome'))}<select name="outcome"><option value="home">${esc(t('atHome'))}</option><option value="notAtHome">${esc(t('notAtHome'))}</option></select></label><button class="primary">${esc(t('recordOutcome'))}</button></form>` : `<p>${esc(t('controls'))}: ${esc(t('established'))}</p>`}`
}
function detail(id) {
  activeItem = item(id)
  if (!activeItem) return
  if (parked.has(activeItem.id)) {
    showSheet(
      `<h2>${esc(t('parkedTitle'))}</h2><p>${esc(t('parkedBody'))}</p>`,
      t('parkedLabel')
    )
    return
  }
  const locked = gate(activeItem)
  if (locked === 'unlock') {
    showSheet(thresholdView(activeItem))
    return
  }
  if (locked === 'needsOptin') {
    showSheet(
      `<h2>${esc(t('permissionTitle'))}</h2><p>${esc(t('permissionBody'))}</p><div class="why-box">${text(activeItem.why)}</div>${button(t('turnOn'), 'enableOptin')}`
    )
    return
  }
  if (locked) {
    showSheet(
      `<h2>${esc(t(locked))}</h2><p>${esc(t(locked === 'hoursOnly' ? 'noHours' : locked === 'annualOnly' ? 'noAnnual' : locked === 'tenureOnly' ? 'noTenure' : locked))}</p>`
    )
    return
  }
  if (activeItem.kind === 'wrapped') {
    slide = 0
    wrapped()
    return
  }
  if (activeItem.kind === 'away') {
    actionForm()
    return
  }
  const e = activeItem
  let visualization = ''
  if ([27, 28, 29].includes(e.id)) visualization = reportCard()
  if ([15, 18].includes(e.id)) visualization = heatChart()
  if (e.id === 61)
    visualization = `<div class="why-box">${text(t(hours() ? 'weeklyHours' : 'weeklyCheckbox'))}</div>${weekChart()}`
  if (e.id === 62) visualization = rangeMonitor()
  if (e.kind === 'history') visualization = historyVisual(e.id)
  if (e.id === 26) visualization = historyVisual(e.id)
  if (e.id === 42)
    visualization = `<div class="followthrough" aria-label="8 of 10">${Array.from({ length: 10 }, (_, i) => `<span class="${i < 8 ? 'kept' : ''}">${i < 8 ? '✓' : '—'}</span>`).join('')}</div>`
  if ([15, 18].includes(e.id) && state.data !== 'established')
    visualization =
      `<div class="notice">${esc(t('timingUnlocked'))}</div>` + visualization
  if (e.kind === 'route')
    visualization = `<div class="route-map">${icon('M4 18 9 6l6 12 5-12')}</div>`
  showSheet(
    `<h2>${text(e.title)}</h2><p>${text(e.stat)}</p>${visualization}<div class="why-box"><strong>${esc(t('why'))}</strong><p>${text(e.why)}</p></div><p class="subtle">${esc(t('singleScenario'))} · #${e.id}</p>${isAway() ? `<div class="notice">${esc(t('manualBrowse'))}</div>` : ''}${state.personalTargets[e.id] ? `<div class="notice">${esc(t('previewTarget'))}: ${esc(duration(state.personalTargets[e.id]))}</div>` : ''}${button(e.action, 'actionForm')}${e.id === 35 ? button(t('dismissYear'), 'dismissYear', 'text-button') : ''}${e.id === 57 ? button(t('memoryHide'), 'hideMemory', 'text-button') : ''}`,
    `${groupName(e.group)} / ${String(e.id).padStart(2, '0')}`
  )
}
const input = (label, key, type = 'text', value = '', attrs = '') =>
  `<label>${esc(t(label))}<input name="${key}" type="${type}" value="${esc(value)}" ${attrs}></label>`
const textarea = (label, key, value = '') =>
  `<label>${esc(t(label))}<textarea name="${key}" required>${esc(value)}</textarea></label>`
const check = (label, key, checked = false) =>
  `<label class="toggle">${esc(t(label))}<input type="checkbox" name="${key}" ${checked ? 'checked' : ''}></label>`
const select = (label, key, options, value) =>
  `<label>${esc(t(label))}<select name="${key}">${options.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`
function actionForm() {
  const e = activeItem
  if (!e) return
  if (gate(e)) {
    detail(e.id)
    return
  }
  let content = '',
    title = 'planTitle',
    submit = 'save',
    kind = e.kind
  if (kind === 'history') kind = 'reflect'
  if (kind === 'optin') kind = e.id === 64 ? 'portrait' : 'notes'
  if (['schedule', 'recap'].includes(kind)) {
    const evening = e.id === 17,
      saturday = [15, 16, 18].includes(e.id),
      two = e.id === 27,
      minutes = e.id === 40 ? 45 : two ? 90 : 60
    title = 'planTitle'
    submit = kind === 'recap' || e.id === 44 ? 'saveWeek' : 'schedule'
    content = `<p>${text(e.stat)}</p>${select(
      'contact',
      'contact',
      e.people.map((p) => [p, name(p)]),
      e.people[0]
    )}<div class="form-grid">${input('dateLabel', 'date', 'date', saturday ? '2026-09-26' : '2026-09-24', 'required')}${input('time', 'time', 'time', evening ? '18:00' : '09:00', 'required')}</div>${hours() ? input('duration', 'minutes', 'number', minutes, 'required min="1" max="720"') : ''}${two ? input('secondDate', 'secondDate', 'date', '2026-09-26', 'required') : ''}${kind === 'recap' || e.id === 44 ? `<p class="notice">${esc(t('copyWeekHint'))}</p>` : ''}${input('topic', 'topic', 'text', state.notes[e.id] || '')}${check('recurring', 'recurring', [15, 18, 20].includes(e.id))}<p class="subtle">${esc(t('eligible'))}</p>`
  } else if (kind === 'away') {
    title = 'awayTitle'
    submit = 'pause'
    content = `<p>${esc(t('awaySub'))}</p><div class="form-grid">${input('start', 'start', 'date', state.away?.start || '2026-09-21', 'required')}${input('end', 'end', 'date', state.away?.end || '2026-09-27', 'required')}</div>${select(
      'reason',
      'reason',
      ['travel', 'illness', 'convention', 'other'].map((k) => [k, t(k)]),
      state.away?.reason || 'travel'
    )}${check('autoFreeze', 'autoFreeze', state.autoFreeze)}<p class="subtle">${esc(t('neutral'))}</p>`
  } else if (kind === 'contacts') {
    title = 'peopleTitle'
    submit = 'schedule'
    content = `<p>${text(e.stat)}</p>${e.people.map((p) => `<label class="toggle">${esc(name(p))}<input type="checkbox" name="selected" value="${esc(p)}" checked></label>`).join('')}${input('dateLabel', 'date', 'date', '2026-09-24', 'required')}${input('time', 'time', 'time', '16:00', 'required')}`
  } else if (kind === 'contact') {
    title = 'contactDetails'
    content = `<h3>${esc(name(e.people[0]))}</h3>${input('phone', 'phone', 'tel', state.contacts[e.people[0]]?.phone || '')}${input('address', 'address', 'text', state.contacts[e.people[0]]?.address || '')}`
  } else if (kind === 'note' || kind === 'reflect' || kind === 'notes') {
    title = 'noteTitle'
    submit = 'save'
    content = `<p>${text(e.stat)}</p>${textarea('note', 'note', state.notes[e.id] || '')}`
  } else if (kind === 'message') {
    title = 'messageTitle'
    submit = 'saveDraft'
    content = `<p>${esc(name(e.people[0]))}</p>${textarea('message', 'message', state.drafts[e.id] || t('draftDefault'))}${input('eventDate', 'eventDate', 'date', '2026-09-24', 'required')}<p class="subtle">${esc(t('draftHint'))}</p>`
  } else if (kind === 'study') {
    title = 'studyHint'
    submit = 'studySave'
    content = `<h3>${esc(name(e.people[0]))}</h3>${input('dateLabel', 'date', 'date', '2026-09-21', 'required')}${check('studyConfirm', 'confirmed')}`
  } else if (kind === 'goal') {
    title = 'goalHint'
    content = `<p>${text(e.stat)}</p>${input(e.id === 31 ? 'remainingTarget' : 'personalGoal', 'target', 'number', state.personalTargets[e.id] ? state.personalTargets[e.id] / 60 : e.id === 31 ? 47 : e.id === 38 ? 24 : 40, 'required min="1" max="200" step="0.5"')}${button(t('keepGoal'), 'close', 'text-button')}`
  } else if (kind === 'rhythm') {
    title = 'moveSeries'
    content = `<p>${text(e.stat)}</p>${select(
      'rhythmDay',
      'day',
      days.filter((k) => k !== 'sunday').map((k) => [k, t(k)]),
      'thursday'
    )}${input('time', 'time', 'time', '18:00', 'required')}${check('recurring', 'recurring', true)}`
  } else if (kind === 'reminder') {
    title = 'reminderTime'
    content = `${input('reminderTime', 'time', 'time', state.reminders[e.id]?.time || '19:30', 'required')}${e.id === 4 ? input('reminderDelay', 'days', 'number', 4, 'required min="1" max="30"') : ''}${check('stopReminders', 'disabled', state.reminders[e.id]?.disabled)}`
  } else if (kind === 'log') {
    title = 'planLog'
    submit = 'saveLog'
    content = `${select(
      'logChoice',
      'choice',
      [
        ['log', t('logActual')],
        ['move', t('movePlan')],
      ],
      'log'
    )}${input('dateLabel', 'date', 'date', '2026-09-21', 'required')}${hours() ? input('minutes', 'minutes', 'number', 120, 'required min="1" max="1440"') : check('checkin', 'shared', true)}<p class="subtle">${esc(t('reportHint'))}</p>`
  } else if (kind === 'route') {
    title = 'routeTitle'
    submit = 'saveRoute'
    routeOrder = [...e.people]
    content = `<p>${esc(t('routeSub'))}</p><div class="route-map">${icon('M4 18 9 6l6 12 5-12')}</div><div id="route-stops">${routeStops()}</div>${button(t('reorder'), 'reverseRoute', 'secondary')}${input('dateLabel', 'date', 'date', '2026-09-24', 'required')}`
  } else if (kind === 'calendar') {
    title = 'confirmDates'
    content = `<p>${esc(t('calendarHint'))}</p><div class="form-grid">${input('start', 'start', 'date', e.id === 49 ? '2027-03-01' : '2026-10-02', 'required')}${input('end', 'end', 'date', e.id === 49 ? '2027-03-22' : '2026-10-04', 'required')}</div>${check('confirmDates', 'confirmed', true)}`
  } else if (kind === 'report') {
    title = 'reportTitle'
    submit = 'reportSave'
    content = `<div class="why-box">${esc(t('reportShared'))}<br>${esc(t('reportStudies'))}${hours() ? `<br>${esc(duration(state.logged))}` : ''}</div>${textarea('note', 'note', state.notes[e.id] || '')}`
  } else if (kind === 'trends') {
    title = 'typicalTitle'
    submit = 'save'
    content = `${rangeMonitor()}${textarea('note', 'note', state.notes[e.id] || '')}`
  } else if (kind === 'portrait') {
    title = 'permissionTitle'
    content = `<p>${text(e.why)}</p>${select(
      'reading',
      'portrait',
      [
        ['early', t('earlyRiser')],
        ['regular', t('neighborhoodRegular')],
        ['deep', t('deepDiver')],
        ['returned', t('returned')],
      ],
      state.portrait || 'regular'
    )}${textarea('note', 'note', state.notes[e.id] || '')}`
  }
  showSheet(
    `<h2>${esc(t(title))}</h2><form data-form="${kind}">${content}<p id="form-error" class="form-error" role="alert"></p><button class="primary" type="submit">${esc(t(submit))}</button></form>`,
    `${groupName(e.group)} / #${e.id}`
  )
  if (e.id === 46 && $('#sheet form'))
    $('#sheet form').dataset.planKey = 'base-2026-09-21'
}
function routeStops() {
  return `<div class="route-list">${routeOrder.map((p, i) => `<div class="route-stop"><b>${i + 1}</b>${esc(name(p))}</div>`).join('')}</div>`
}
function wrappedSlides() {
  const all = [
    { n: '61', title: 'slide1Title', body: 'slide1Body' },
    { n: '9', title: 'slide2Title', body: 'slide2Body' },
    { n: '12', title: 'slide3Title', body: 'slide3Body' },
  ]
  if (hours()) all.push({ n: '04', title: 'slide4Title', body: 'slide4Body' })
  if (!state.hiddenMemories.includes('Ana'))
    all.push({
      n: '01',
      title: 'slide5Title',
      body: 'slide5Body',
      private: true,
    })
  all.push({
    n: '↗',
    title: 'shareSlide',
    body: 'shareSlideBody',
    share: true,
  })
  return state.data === 'established'
    ? all
    : [
        {
          n: String(availableCount(item(63))),
          title: 'firstYearTitle',
          body: 'firstYearBody',
        },
        all.at(-1),
      ]
}
function wrapped() {
  const slides = wrappedSlides(),
    current = slides[Math.min(slide, slides.length - 1)]
  showSheet(
    `<div class="eyebrow">${esc(t('yearDates'))}</div><div class="slide-dots">${slides.map((_, i) => `<i class="${i === slide ? 'active' : ''}"></i>`).join('')}</div><div class="wrapped-slide"><div class="slide-number">${current.n}</div><h2>${esc(t(current.title))}</h2><p>${text(t(current.body).replace('{count}', availableCount(item(63))))}</p></div>${current.private ? button(t('memoryHide'), 'hideMemory', 'text-button') : ''}<div class="sheet-actions">${button(t('previous'), 'prevSlide', 'secondary', slide ? '' : 'disabled')}<small>${slide + 1} / ${slides.length}</small>${current.share ? button(t('share'), 'share') : button(t('next'), 'nextSlide')}</div>`,
    t('openWrapped')
  )
}
function shareStats() {
  return state.data === 'established'
    ? [
        [61, 'peopleMet'],
        [9, 'returnVisits'],
        [12, 'monthsShared'],
      ]
    : [
        [availableCount(item(63)), 'activitiesCount'],
        [1, 'monthsShared'],
      ]
}
function shareCard() {
  showSheet(
    `<div class="share-card"><div class="eyebrow">${esc(t('brand'))} · 2025 / 2026</div><h2>${esc(t('shareTitle'))}</h2><div class="share-stats">${shareStats()
      .map(
        ([n, key]) =>
          `<div><strong>${n}</strong><small>${esc(t(key))}</small></div>`
      )
      .join(
        ''
      )}</div><small>${esc(t('shareFooter'))}</small></div><p class="subtle spaced">${esc(t('sharePrivacy'))}</p>${button(t('download'), 'download')}`,
    t('share')
  )
}
function downloadShare() {
  // Deliberately aggregate-only: the export never takes contact objects or notes.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080"><rect width="1080" height="1080" fill="#e6ecd8"/><rect x="55" y="55" width="970" height="970" rx="100" fill="none" stroke="#9caf86"/><g text-anchor="middle" fill="#294537"><text x="540" y="210" font-family="sans-serif" font-size="24">${esc(t('brand'))} · 2025 / 2026</text><text x="540" y="405" font-family="Georgia" font-size="74">${esc(t('shareTitle'))}</text>${shareStats()
    .map(
      ([n, key], i) =>
        `<text x="${shareStats().length === 2 ? 340 + i * 400 : 240 + i * 300}" y="640" font-family="Georgia" font-size="100">${n}</text><text x="${shareStats().length === 2 ? 340 + i * 400 : 240 + i * 300}" y="700" font-family="sans-serif" font-size="22">${esc(t(key))}</text>`
    )
    .join(
      ''
    )}<text x="540" y="900" font-family="sans-serif" font-size="22">${esc(t('shareFooter'))}</text></g></svg>`
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })),
    a = document.createElement('a')
  a.href = url
  a.download = 'witnesswork-my-service-year.svg'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  notify(t('exported'))
}
function validateDate(date, minutes = 60) {
  const day = new Date(date + 'T12:00:00').getDay()
  if (day === 0 || state.offDays.includes(date)) return t('offDay')
  if (day === 3 && minutes > 60) return t('meetingDay')
  return null
}
function formSubmit(event) {
  const form = event.target.closest('form[data-form]')
  if (!form) return
  event.preventDefault()
  if (form.dataset.form === 'createContact') {
    const values = Object.fromEntries(new FormData(form))
    const contactName = values.name.trim()
    if (!contactName) return
    mutate(t('newContactSaved'), () => {
      state.newContacts.push({
        name: contactName,
        study: false,
        favorite: false,
      })
      state.contacts[contactName] = {
        phone: values.phone,
        address: values.address,
        status: 'active',
      }
      selectedContact = contactName
    })
    closeSheet()
    return
  }
  const values = new FormData(form),
    v = Object.fromEntries(values),
    kind = form.dataset.form,
    e = activeItem
  const fromDay = form.dataset.fromDay === 'true'
  const error = (message) => {
    if ($('#form-error')) $('#form-error').textContent = message
    else notify(message)
  }
  if (v.start && v.end && v.end < v.start) {
    error(t('formRequired'))
    return
  }
  if (
    ['schedule', 'recap', 'contacts', 'route'].includes(kind) ||
    (kind === 'log' && v.choice === 'move')
  ) {
    for (const date of [v.date, v.secondDate].filter(Boolean)) {
      const problem = validateDate(date, Number(v.minutes || 60))
      if (problem) {
        error(problem)
        return
      }
    }
    if (v.secondDate === v.date) {
      error(t('twoSessions'))
      return
    }
  }
  if (kind === 'study' && !v.confirmed) {
    error(t('studyHint'))
    return
  }
  if (kind === 'calendar' && !v.confirmed) {
    error(t('formRequired'))
    return
  }
  if (
    (kind === 'recap' || (e.id === 44 && !fromDay)) &&
    ['2026-09-21', '2026-09-24', '2026-09-26'].every((date) =>
      validateDate(date, Number(v.minutes || 60))
    )
  ) {
    error(t('noEligiblePlans'))
    return
  }
  if (kind === 'contacts' && !values.getAll('selected').length) {
    error(t('formRequired'))
    return
  }
  if (kind === 'contact' && !v.phone.trim() && !v.address.trim()) {
    error(t('formRequired'))
    return
  }
  if (kind === 'observation') {
    mutate(t('newObservation'), () => state.observations.push(v.outcome))
    detail(e.id)
    return
  }
  mutate(e.action, () => {
    if (v.date) scheduleDay = v.date
    if (['schedule', 'recap', 'contacts'].includes(kind)) {
      const people =
        kind === 'contacts'
          ? values.getAll('selected')
          : [v.contact || e.people[0]]
      const dates =
        kind === 'recap' || (e.id === 44 && !fromDay)
          ? ['2026-09-21', '2026-09-24', '2026-09-26'].filter(
              (date) => !validateDate(date, Number(v.minutes || 60))
            )
          : [v.date, ...(v.secondDate ? [v.secondDate] : [])]
      const minutes = Number(v.minutes || 60)
      for (const date of dates) {
        state.plans.push({
          date,
          time: v.time,
          minutes,
          people,
          topic: v.topic || '',
          recurring: !!v.recurring,
          source: e.id,
        })
        state.planned += minutes
      }
      people
        .filter((p) => sampleNames.includes(p))
        .forEach((p) => {
          state.contacts[p] = {
            ...state.contacts[p],
            status: 'scheduled',
            date: v.date,
          }
        })
    } else if (kind === 'away') {
      state.away = { start: v.start, end: v.end, reason: v.reason }
      state.autoFreeze = !!v.autoFreeze
    } else if (kind === 'contact')
      state.contacts[e.people[0]] = {
        ...state.contacts[e.people[0]],
        phone: v.phone,
        address: v.address,
        status: 'active',
      }
    else if (
      ['note', 'reflect', 'notes', 'report', 'trends', 'portrait'].includes(
        kind
      )
    ) {
      state.notes[e.id] = v.note
      if (v.portrait) state.portrait = v.portrait
    } else if (kind === 'message') state.drafts[e.id] = v.message
    else if (kind === 'study')
      state.studyVisits.push({
        contact: e.people[0],
        date: v.date,
        isBibleStudy: true,
      })
    else if (kind === 'goal')
      state.personalTargets[e.id] = Number(v.target) * 60
    else if (kind === 'rhythm') {
      state.planned += 60
      state.plans.push({
        date:
          '2026-09-' +
          {
            monday: 28,
            tuesday: 22,
            wednesday: 23,
            thursday: 24,
            friday: 25,
            saturday: 26,
          }[v.day],
        time: v.time,
        minutes: 60,
        people: e.people,
        recurring: !!v.recurring,
        source: e.id,
      })
    } else if (kind === 'reminder')
      state.reminders[e.id] = {
        time: v.time,
        days: Number(v.days || 0),
        disabled: !!v.disabled,
      }
    else if (kind === 'log') {
      const linkedPlan = plannedEntries().find(
        (p) => p.key === form.dataset.planKey
      )
      if (linkedPlan && (v.choice === 'move' || v.date === linkedPlan.date))
        state.resolvedPlans.push(linkedPlan.key)
      if (v.choice === 'move')
        state.plans.push({
          date: v.date,
          time: '09:00',
          minutes: Number(v.minutes || 60),
          people: e.people,
          moved: true,
          source: e.id,
        })
      else {
        state.logs.push({ date: v.date, minutes: Number(v.minutes || 0) })
        state.logged += Number(v.minutes || 0)
        state.checkedIn = true
      }
    } else if (kind === 'route')
      state.routes.push({ people: [...routeOrder], date: v.date })
    else if (kind === 'calendar') {
      state.calendar.push({ id: e.id, ...v })
      if (e.id === 52) {
        let date = new Date(v.start + 'T12:00:00')
        const end = new Date(v.end + 'T12:00:00')
        while (date <= end && state.offDays.length < 366) {
          state.offDays.push(date.toISOString().slice(0, 10))
          date.setUTCDate(date.getUTCDate() + 1)
        }
      }
    }
  })
  showSheet(
    `<h2>${esc(t('saved'))}</h2><p>${esc(e.action)}</p><div class="why-box"><strong>${esc(t('activity'))}</strong><p>${esc(copy(e.stat))}</p>${v.date ? `<p>${esc(v.date)} ${esc(v.time || '')}</p>` : ''}${v.target ? `<p>${esc(duration(Number(v.target) * 60))}</p>` : ''}${v.note ? `<p>${esc(v.note)}</p>` : ''}${v.start ? `<p>${esc(v.start)} — ${esc(v.end)}</p>` : ''}</div>${button(t('done'), 'close')}${['schedule', 'recap', 'contacts', 'rhythm', 'log'].includes(kind) ? button(t('viewPlan'), 'savedPlans', 'text-button') : ''}`
  )
}
function changeVariant(delta) {
  variant =
    variants[
      (variants.indexOf(variant) + delta + variants.length) % variants.length
    ]
  page = 'home'
  render()
}
document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]')
  if (!target) return
  const action = target.dataset.action,
    n = target.dataset.name
  if (action === 'navigate') {
    closeSheet()
    page = target.dataset.page
    if (target.dataset.contact) selectedContact = target.dataset.contact
    render()
    window.scrollTo(0, 0)
  } else if (action === 'variantPrev' || action === 'variantNext')
    changeVariant(action === 'variantNext' ? 1 : -1)
  else if (action === 'detail') detail(target.dataset.id)
  else if (action === 'actionForm') actionForm()
  else if (action === 'close') closeSheet()
  else if (action === 'reset') {
    state = initial()
    undo = []
    search = ''
    group = 'all'
    highlightId = 1
    progressTab = 'month'
    progressMonth = 0
    scheduleMonth = 0
    scheduleDay = '2026-09-21'
    scheduleMode = 'plans'
    contactSearch = ''
    contactFilter = 'all'
    selectedContact = 'Maria'
    timerStarted = null
    timerSeconds = 0
    selectedCell = [5, 0]
    slide = 0
    routeOrder = []
    activeItem = null
    variant = 'A'
    closeSheet()
    render()
  } else if (action === 'undo' && undo.length) {
    state = undo.pop()
    render()
  } else if (action === 'highlightNext' || action === 'highlightPrev') {
    const candidates = highlightCandidates()
    const current = candidates.findIndex((e) => e.id === highlightId)
    highlightId =
      candidates[
        (current + (action === 'highlightNext' ? 1 : -1) + candidates.length) %
          candidates.length
      ].id
    const focusAction = action
    render()
    document
      .querySelector(`[data-action="${focusAction}"]`)
      ?.focus({ preventScroll: true })
  } else if (action === 'resume')
    mutate(t('resume'), () => {
      state.away = null
    })
  else if (action === 'checkin')
    mutate(t('checkedIn'), () => {
      state.checkedIn = true
    })
  else if (action === 'dismissYear') {
    mutate(t('dismissed'), () => state.dismissed.push(activeItem.id))
    closeSheet()
  } else if (action === 'advanceWeek')
    mutate(t('advanceWeek'), () => {
      const d = new Date(state.today + 'T12:00:00Z')
      d.setUTCDate(d.getUTCDate() + 7)
      state.today = d.toISOString().slice(0, 10)
      scheduleDay = state.today
      scheduleMonth = (d.getUTCFullYear() - 2026) * 12 + d.getUTCMonth() - 8
      Object.values(state.contacts).forEach((c) => {
        if (c.status === 'snoozed' && c.until <= state.today)
          c.status = 'active'
      })
    })
  else if (action === 'sample')
    mutate(t('addSample'), () => {
      state.observations.push('home')
      state.data = 'sparse'
    })
  else if (['snooze', 'mute', 'inactive'].includes(action))
    mutate(
      t(
        action === 'snooze'
          ? 'snoozed'
          : action === 'mute'
            ? 'muted'
            : 'inactive'
      ) +
        ' · {' +
        n +
        '}',
      () => {
        state.contacts[n] = {
          ...state.contacts[n],
          status:
            action === 'snooze'
              ? 'snoozed'
              : action === 'mute'
                ? 'muted'
                : 'inactive',
          until: action === 'snooze' ? '2026-09-28' : null,
        }
        if (action === 'snooze') state.ignored[n] = (state.ignored[n] || 0) + 1
      }
    )
  else if (action === 'heat') {
    selectedCell = [Number(target.dataset.day), Number(target.dataset.slot)]
    if ($('#sheet').open) detail(activeItem.id)
    else render()
  } else if (action === 'enableOptin') {
    mutate(t('enableOptin'), () => state.optins.push(activeItem.id))
    detail(activeItem.id)
  } else if (action === 'hideMemory') {
    mutate(t('memoryHidden'), () => state.hiddenMemories.push('Ana'))
    closeSheet()
  } else if (action === 'reverseRoute') {
    routeOrder.reverse()
    $('#route-stops').innerHTML = routeStops()
  } else if (action === 'nextSlide') {
    slide = Math.min(slide + 1, wrappedSlides().length - 1)
    wrapped()
  } else if (action === 'prevSlide') {
    slide = Math.max(0, slide - 1)
    wrapped()
  } else if (action === 'share') shareCard()
  else if (action === 'download') downloadShare()
  else if (action === 'savedPlans') {
    closeSheet()
    page = 'schedule'
    scheduleDay = state.plans.at(-1)?.date || '2026-09-21'
    render()
  } else if (action === 'progressTab') {
    progressTab = target.dataset.tab
    render()
  } else if (action === 'scheduleMode') {
    scheduleMode = target.dataset.mode
    render()
  } else if (action === 'calendarDay') {
    scheduleDay = target.dataset.date
    render()
  } else if (action === 'openDay') {
    scheduleDay = target.dataset.date
    page = 'schedule'
    scheduleMonth =
      (Number(scheduleDay.slice(0, 4)) - 2026) * 12 +
      Number(scheduleDay.slice(5, 7)) -
      9
    render()
    window.scrollTo(0, 0)
  } else if (['monthPrev', 'monthNext', 'monthCurrent'].includes(action)) {
    const delta = action === 'monthNext' ? 1 : -1
    if (target.dataset.context === 'progress')
      progressMonth = action === 'monthCurrent' ? 0 : progressMonth + delta
    else {
      scheduleMonth = action === 'monthCurrent' ? 0 : scheduleMonth + delta
      scheduleDay =
        monthInfo(scheduleMonth).prefix + (scheduleMonth === 0 ? '-21' : '-01')
    }
    render()
  } else if (action === 'selectContact' || action === 'mapContact') {
    selectedContact = target.dataset.name
    render()
  } else if (action === 'dayAdd') {
    activeItem = item(scheduleMode === 'plans' ? 44 : 46)
    actionForm()
    const date = $('#sheet [name="date"]')
    if (date) date.value = scheduleDay
    const form = $('#sheet form')
    if (form) {
      form.dataset.fromDay = 'true'
      delete form.dataset.planKey
      form.querySelector('option[value="move"]')?.remove()
      const notice = form.querySelector('.notice')
      if (notice) notice.remove()
    }
  } else if (action === 'addTime') {
    activeItem = item(46)
    actionForm()
    const form = $('#sheet form')
    if (form) {
      delete form.dataset.planKey
      form.querySelector('option[value="move"]')?.remove()
      form.querySelector('[name="date"]').value =
        progressMonth === 0
          ? state.today
          : monthInfo(progressMonth).prefix + '-01'
    }
  } else if (action === 'addContact')
    showSheet(
      `<h2>${esc(t('addContact'))}</h2><form data-form="createContact">${input('newContactName', 'name', 'text', '', 'required')}${input('phone', 'phone', 'tel')}${input('address', 'address')}<button class="primary" type="submit">${esc(t('createContact'))}</button></form>`
    )
  else if (action === 'timerToggle') {
    if (timerStarted) {
      timerSeconds += Math.floor((Date.now() - timerStarted) / 1000)
      timerStarted = null
    } else timerStarted = Date.now()
    render()
  } else if (action === 'timerReset') {
    timerStarted = null
    timerSeconds = 0
    render()
  }
})
document.addEventListener('change', (event) => {
  const target = event.target
  if (target.id === 'highlight-choice') {
    highlightId = Number(target.value)
    render()
    $('#highlight-choice')?.focus({ preventScroll: true })
    return
  }
  if (target.id === 'contact-filter') {
    contactFilter = target.value
    render()
    return
  }
  if (target.id === 'group') {
    group = target.value
    render()
    return
  }
  const key = target.dataset.control
  if (!key) return
  if (key === 'away') {
    if (target.checked) {
      activeItem = item(47)
      actionForm()
      target.checked = !!state.away
    } else mutate(t('resume'), () => (state.away = null))
    return
  }
  state[key] = target.type === 'checkbox' ? target.checked : target.value
  if (key === 'publisher') {
    state.goal = capabilities().monthlyGoalHours * 60 || 3000
    if (page === 'progress' && !capabilities().showsYearTabs) page = 'home'
  }
  if (key === 'data') {
    state.observations = []
    if (state.data === 'empty') {
      state.logged = 0
      state.planned = 0
    } else {
      state.logged = 2280
      state.planned = 540
    }
  }
  const open = $('#sheet').open
  render()
  if (open && activeItem) detail(activeItem.id)
})
document.addEventListener('input', (event) => {
  if (event.target.id === 'contact-search') {
    const position = event.target.selectionStart
    contactSearch = event.target.value
    render()
    $('#contact-search').focus()
    $('#contact-search').setSelectionRange(position, position)
    return
  }
  if (event.target.id === 'search') {
    const position = event.target.selectionStart
    search = event.target.value
    render()
    $('#search').focus()
    $('#search').setSelectionRange(position, position)
  }
})
document.addEventListener('submit', formSubmit)
document.addEventListener('keydown', (event) => {
  if (
    $('#sheet').open ||
    event.target.closest('input,textarea,select,[contenteditable]')
  )
    return
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    changeVariant(event.key === 'ArrowRight' ? 1 : -1)
  }
})
$('#sheet').addEventListener('click', (event) => {
  if (event.target === $('#sheet')) {
    const r = $('#sheet').getBoundingClientRect()
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      closeSheet()
  }
})
window.addEventListener('popstate', () => {
  const p = new URLSearchParams(location.search)
  page =
    legacyPages[p.get('page')] ||
    (pages.includes(p.get('page')) ? p.get('page') : 'home')
  highlightId = activeCatalog.some((e) => e.id === Number(p.get('highlight')))
    ? Number(p.get('highlight'))
    : 1
  variant = variants.includes(p.get('variant')) ? p.get('variant') : 'A'
  render()
})
setInterval(() => {
  const display = $('#timer-display')
  if (display && timerStarted) display.textContent = timerText()
}, 1000)
render()
const initialInsight = Number(params.get('insight'))
if (initialInsight && item(initialInsight)) detail(initialInsight)
