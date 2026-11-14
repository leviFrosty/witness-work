import { describe, expect, it, vi } from 'vitest'
import { transcribePage } from './transcribe'

const mocks = vi.hoisted(() => ({ generateText: vi.fn() }))

vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: mocks.generateText,
}))

describe('transcribePage', () => {
  it('reads a page with prompt caching off, on the ZDR hosts, and reports the billed cost', async () => {
    mocks.generateText.mockResolvedValue({
      text: ' Oct 12 2 hrs \n',
      usage: {
        inputTokens: 4_690,
        outputTokens: 146,
        inputTokenDetails: { cacheReadTokens: 0, cacheWriteTokens: 0, noCacheTokens: 4_690 },
      },
      finishReason: 'stop',
      providerMetadata: { openrouter: { provider: 'Azure', usage: { cost: 0.000542 } } },
    })
    const output = await transcribePage({
      apiKey: 'or-test',
      target: { model: 'openai/gpt-6-luna', providers: ['azure'] },
      image: '/9j/4AAQ',
      mimeType: 'image/jpeg',
    })
    expect(output).toMatchObject({ text: 'Oct 12 2 hrs', costUsd: 0.000542, resolvedProvider: 'Azure' })
    const openrouter = mocks.generateText.mock.calls[0][0].providerOptions.openrouter
    expect(openrouter.prompt_cache_options).toEqual({ mode: 'explicit' })
    expect(openrouter).not.toHaveProperty('prompt_cache_key')
    expect(openrouter.provider).toEqual({
      only: ['azure'],
      order: ['azure'],
      data_collection: 'deny',
      zdr: true,
      allow_fallbacks: true,
      require_parameters: true,
    })
    expect(openrouter.reasoning).toEqual({ enabled: false })
  })
})
