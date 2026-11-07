'use client'
import { useEffect, useState } from 'react'
import type { HelpPlatform } from '@/lib/help-center/types'

export type PlatformChoice = HelpPlatform | 'all'

const STORAGE_KEY = 'ww-help-platform'

export function currentPlatform(): PlatformChoice {
  if (typeof document === 'undefined') return 'all'
  const value = document.documentElement.getAttribute('data-ww-platform')
  return value === 'ios' || value === 'android' || value === 'web'
    ? value
    : 'all'
}

export default function PlatformFilter({
  label,
  allLabel,
  webLabel,
}: {
  label: string
  allLabel: string
  webLabel: string
}) {
  const [platform, setPlatform] = useState<PlatformChoice | null>(null)
  useEffect(() => setPlatform(currentPlatform()), [])

  const choose = (choice: PlatformChoice) => {
    setPlatform(choice)
    document.documentElement.setAttribute('data-ww-platform', choice)
    try {
      localStorage.setItem(STORAGE_KEY, choice)
    } catch {}
  }

  const options: { value: PlatformChoice; label: string }[] = [
    { value: 'all', label: allLabel },
    { value: 'ios', label: 'iOS' },
    { value: 'android', label: 'Android' },
    { value: 'web', label: webLabel },
  ]

  return (
    <div className='flex items-center gap-3'>
      <span className='text-sm text-[var(--ww-muted)]'>{label}</span>
      <div role='radiogroup' aria-label={label} className='ww-segmented'>
        {options.map((option) => (
          <button
            key={option.value}
            type='button'
            role='radio'
            aria-checked={platform === option.value}
            data-platform-option={option.value}
            onClick={() => choose(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
