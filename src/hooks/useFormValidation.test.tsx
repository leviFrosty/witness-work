import React, { useEffect } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import useFormValidation from '@/hooks/useFormValidation'

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture } }))

let renderer: ReactTestRenderer
let validation: ReturnType<typeof useFormValidation>
const saved = vi.fn()
function Form({
  errors,
  active = true,
}: {
  errors: Record<string, boolean>
  active?: boolean
}) {
  const formValidation = useFormValidation(errors, 'test_form', active)
  useEffect(() => {
    validation = formValidation
  })
  return (
    <button
      onClick={() => {
        if (formValidation.validate()) saved()
      }}
    />
  )
}
async function render(errors: Record<string, boolean>) {
  await act(async () => {
    renderer = create(<Form errors={errors} />)
  })
}
async function submit() {
  await act(async () => renderer.root.findByType('button').props.onClick())
}
afterEach(async () => {
  await act(async () => renderer.unmount())
  vi.clearAllMocks()
})

describe('form submission validation', () => {
  it('keeps Submit enabled, rejects invalid submissions and shows every invalid field', async () => {
    await render({ duration: true, category: true, note: false })
    expect(renderer.root.findByType('button').props.disabled).toBeUndefined()
    expect(validation.invalid('duration')).toBe(false)
    await submit()
    expect(saved).not.toHaveBeenCalled()
    expect(validation.invalid('duration')).toBe(true)
    expect(validation.invalid('category')).toBe(true)
    expect(validation.invalid('note')).toBe(false)
    await submit()
    expect(capture).toHaveBeenCalledTimes(1)
    expect(capture).toHaveBeenCalledWith('form_validation_failed', {
      form: 'test_form',
      fields: 'duration,category',
    })
  })

  it('clears corrected field outlines while guarding the remaining errors, then saves', async () => {
    await render({ duration: true, category: true })
    await submit()
    await act(async () =>
      renderer.update(<Form errors={{ duration: false, category: true }} />)
    )
    expect(validation.invalid('duration')).toBe(false)
    expect(validation.invalid('category')).toBe(true)
    await submit()
    expect(saved).not.toHaveBeenCalled()
    await act(async () =>
      renderer.update(<Form errors={{ duration: false, category: false }} />)
    )
    expect(validation.invalid('category')).toBe(false)
    await submit()
    expect(saved).toHaveBeenCalledTimes(1)

    await act(async () =>
      renderer.update(<Form errors={{ duration: true, category: false }} />)
    )
    expect(validation.invalid('duration')).toBe(false)
  })

  it('starts a reopened sheet without showing errors before Submit', async () => {
    await render({ name: true })
    await submit()
    expect(validation.invalid('name')).toBe(true)
    await act(async () =>
      renderer.update(<Form errors={{ name: true }} active={false} />)
    )
    await act(async () =>
      renderer.update(<Form errors={{ name: true }} active />)
    )
    expect(validation.invalid('name')).toBe(false)
    await submit()
    expect(validation.invalid('name')).toBe(true)
    expect(saved).not.toHaveBeenCalled()
  })
})
