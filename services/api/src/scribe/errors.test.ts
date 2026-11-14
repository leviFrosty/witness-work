import { describe, expect, it } from 'vitest'
import { isInjectionBlock, toScribeModelError } from './errors'

const apiError = (statusCode: number, message: string, responseBody?: string) =>
  Object.assign(new Error(message), { name: 'AI_APICallError', statusCode, responseBody })

describe('isInjectionBlock', () => {
  it('spots OpenRouter’s prompt-injection guardrail', () => {
    expect(
      isInjectionBlock(
        apiError(
          403,
          'Forbidden',
          '{"error":{"message":"Request blocked: prompt injection patterns detected","code":403}}'
        )
      )
    ).toBe(true)
    expect(isInjectionBlock(apiError(403, 'Request blocked: prompt injection patterns detected'))).toBe(true)
  })

  it('looks inside a RetryError', () => {
    const retry = Object.assign(new Error('Failed after 3 attempts'), {
      name: 'AI_RetryError',
      lastError: apiError(403, 'Request blocked: prompt injection patterns detected'),
    })
    expect(isInjectionBlock(retry)).toBe(true)
  })

  it('ignores other failures', () => {
    expect(isInjectionBlock(apiError(403, 'Forbidden'))).toBe(false)
    expect(isInjectionBlock(apiError(400, 'prompt injection patterns detected'))).toBe(false)
    expect(isInjectionBlock(new Error('prompt injection'))).toBe(false)
    expect(isInjectionBlock(null)).toBe(false)
  })

  it('reports as a sanitized model error, without the provider’s text', () => {
    const error = toScribeModelError(apiError(403, 'Request blocked: prompt injection patterns detected'))
    expect(error.message).not.toContain('injection')
  })
})
