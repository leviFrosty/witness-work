'use client'
import { LoaderCircle, Search as SearchIcon, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { searchLocal, searchRemote } from '@/lib/help-center/search'
import type {
  HelpBundle,
  HelpEntry,
  HelpPlatform,
} from '@/lib/help-center/types'
import { currentPlatform } from './platform-filter'

const bundles = new Map<string, Promise<HelpBundle>>()

function loadBundle(path: string): Promise<HelpBundle> {
  let bundle = bundles.get(path)
  if (!bundle) {
    bundle = fetch(path).then((response) => {
      if (!response.ok) throw new Error(`Bundle ${response.status}`)
      return response.json() as Promise<HelpBundle>
    })
    bundle.catch(() => bundles.delete(path))
    bundles.set(path, bundle)
  }
  return bundle
}

type Results = {
  query: string
  source: 'remote' | 'local'
  entries: HelpEntry[]
  /** The search Worker hasn't answered this query yet. */
  pending: boolean
}

/**
 * The Help Center search box. Local results appear as soon as the bundle is
 * loaded; semantic results from the search Worker replace them when they arrive
 * within the timeout. While the Worker is still answering, an empty local
 * result shows "Searching…" rather than "no results": a paraphrased question
 * often matches nothing locally but has a semantic answer.
 */
export default function HelpSearch({
  bundlePath,
  placeholder,
  noResults,
  searching,
  clearLabel,
  categoryTitles,
  onlyLabels,
}: {
  bundlePath: string
  placeholder: string
  noResults: string
  searching: string
  clearLabel: string
  categoryTitles: Record<string, string>
  onlyLabels: Record<HelpPlatform, string>
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Results | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults(null)
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      let bundle: HelpBundle
      try {
        bundle = await loadBundle(bundlePath)
      } catch {
        return
      }
      if (controller.signal.aborted) return
      const platform = currentPlatform()
      let remoteArrived = false
      const remote = searchRemote(
        bundle,
        trimmed,
        platform,
        controller.signal
      ).then((entries) => {
        if (controller.signal.aborted) return
        remoteArrived = true
        // No semantic match keeps the local results rather than emptying them.
        if (entries?.length)
          setResults({
            query: trimmed,
            source: 'remote',
            entries,
            pending: false,
          })
        else setResults((current) => current && { ...current, pending: false })
      })
      const local = searchLocal(bundle, trimmed, platform)
      if (!remoteArrived)
        setResults({
          query: trimmed,
          source: 'local',
          entries: local,
          // Offline, the request fails at once; don't flash "Searching…".
          pending: navigator.onLine !== false,
        })
      await remote
    }, 600)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [query, bundlePath])

  const visible = results?.entries.slice(0, 8) ?? []

  return (
    <div className='relative w-full' data-help-search=''>
      <label className='ww-search'>
        <SearchIcon
          className='size-5 shrink-0 text-[var(--ww-muted)]'
          aria-hidden
        />
        <input
          ref={inputRef}
          type='search'
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => void loadBundle(bundlePath).catch(() => {})}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setQuery('')
            if (event.key === 'Enter' && visible[0]) {
              window.location.assign(new URL(visible[0].url).pathname)
            }
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          className='h-full w-full bg-transparent text-[17px] text-[var(--ww-ink)] outline-none placeholder:text-[var(--ww-faint)] [&::-webkit-search-cancel-button]:hidden'
        />
        {results?.pending && (
          <LoaderCircle
            className='size-4 shrink-0 animate-spin text-[var(--ww-muted)]'
            aria-hidden
            data-search-pending=''
          />
        )}
        {query && (
          <button
            type='button'
            onClick={() => {
              setQuery('')
              inputRef.current?.focus()
            }}
            className='ww-icon-btn -me-2 flex shrink-0 items-center justify-center'
            aria-label={clearLabel}
          >
            <X className='size-4' />
          </button>
        )}
      </label>

      {results && (
        <div
          className='ww-popover absolute inset-x-0 top-full z-40 mt-2 overflow-hidden'
          data-results-source={results.source}
          role='region'
          aria-live='polite'
        >
          {visible.length === 0 ? (
            <p
              className='px-5 py-4 text-sm text-[var(--ww-muted)]'
              data-search-state={results.pending ? 'searching' : 'empty'}
            >
              {results.pending ? searching : noResults}
            </p>
          ) : (
            <ul className='max-h-[60vh] overflow-y-auto p-1.5'>
              {visible.map((entry) => (
                <li key={entry.id}>
                  <a
                    href={new URL(entry.url).pathname}
                    className='ww-search-result'
                    data-result-slug={entry.slug}
                  >
                    <span className='text-[13px] text-[var(--ww-muted)]'>
                      {categoryTitles[entry.category] ?? entry.category}
                      {entry.platforms.length === 1 &&
                        ` · ${onlyLabels[entry.platforms[0]!]}`}
                    </span>
                    <span className='font-semibold text-[var(--ww-ink)]'>
                      {entry.question}
                    </span>
                    <span className='line-clamp-2 text-sm text-[var(--ww-muted)]'>
                      {entry.plainText}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
