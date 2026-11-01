import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import useGoalHoursInput from '@/hooks/useGoalHoursInput'
import { committedGoalHours } from '@/lib/goalHoursInput'

describe('committedGoalHours', () => {
  const goals = { saved: 40, fallback: 50 }

  it('saves the typed number', () => {
    expect(committedGoalHours('35', goals)).toBe(35)
    expect(committedGoalHours('12,5', goals)).toBe(12.5)
    expect(committedGoalHours('0', goals)).toBe(0)
  })

  it("resets a cleared field to the role's default goal", () => {
    expect(committedGoalHours('', goals)).toBe(50)
    expect(committedGoalHours('  ', goals)).toBe(50)
  })

  it('keeps the saved goal for text that is not a number', () => {
    expect(committedGoalHours('1.2.3', goals)).toBe(40)
    expect(committedGoalHours('.', goals)).toBe(40)
  })
})

describe('useGoalHoursInput', () => {
  let renderer: ReactTestRenderer | undefined

  const renders: ReturnType<typeof useGoalHoursInput>[] = []
  const field = () => renders[renders.length - 1]
  const onSave = vi.fn()

  beforeAll(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  })
  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = undefined
    onSave.mockReset()
    renders.length = 0
  })

  function Field({ hours }: { hours: number }) {
    renders.push(useGoalHoursInput({ hours, defaultHours: 50, onSave }))
    return null
  }
  const render = (hours = 40) =>
    act(() => {
      renderer = create(<Field hours={hours} />)
    })

  it('saves on the keyboard Done', () => {
    render()
    act(() => field().onChangeText('35'))
    act(() => field().onSubmitEditing())
    expect(onSave).toHaveBeenCalledExactlyOnceWith(35)
  })

  it('saves once when Done is followed by blur', () => {
    render()
    act(() => field().onChangeText('35'))
    act(() => field().onSubmitEditing())
    act(() => field().onBlur())
    expect(onSave).toHaveBeenCalledOnce()
  })

  it('saves a value still being typed when the field unmounts', () => {
    render()
    act(() => field().onChangeText('35'))
    act(() => renderer?.unmount())
    renderer = undefined
    expect(onSave).toHaveBeenCalledExactlyOnceWith(35)
  })

  it('shows the default goal after the field is cleared', () => {
    render()
    act(() => field().onChangeText(''))
    act(() => field().onBlur())
    expect(onSave).toHaveBeenCalledExactlyOnceWith(50)
    expect(field().value).toBe('50')
  })

  it('shows the saved goal again after text that is not a number', () => {
    render()
    act(() => field().onChangeText('1.2.3'))
    act(() => field().onBlur())
    expect(onSave).toHaveBeenCalledExactlyOnceWith(40)
    expect(field().value).toBe('40')
  })

  it("doesn't save when nothing was typed", () => {
    render()
    act(() => field().onBlur())
    act(() => renderer?.unmount())
    renderer = undefined
    expect(onSave).not.toHaveBeenCalled()
  })
})
