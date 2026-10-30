'use client'
import { Check, Link as LinkIcon } from 'lucide-react'
import { useState } from 'react'

export default function CopyLink({
  url,
  label,
}: {
  url: string
  label: string
}) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type='button'
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        } catch {}
      }}
      className='ww-btn ww-btn-ghost'
    >
      {copied ? <Check className='size-4' /> : <LinkIcon className='size-4' />}
      {label}
    </button>
  )
}
