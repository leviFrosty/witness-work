import { beforeEach, describe, expect, it } from 'vitest'
import { useProfileOverlay } from '@/stores/profileOverlay'

const ORIGIN = { x: 0, y: 0, width: 1, height: 1 }
const state = () => useProfileOverlay.getState()

describe('profile overlay stepping away for a badge view', () => {
  beforeEach(() => {
    useProfileOverlay.setState({ open: false, away: false, origin: null })
    state().show(ORIGIN)
  })

  it('opens again when the badge view closes', () => {
    state().stepAway()
    state().hide()
    expect(state()).toMatchObject({ open: false, away: true })

    state().comeBack()
    expect(state()).toMatchObject({ open: true, away: false })
  })

  it('stays open when the badge view closes before it has faded', () => {
    state().stepAway()
    state().comeBack()
    state().hide()
    expect(state()).toMatchObject({ open: true, away: false })
  })

  it('leaves a closed overlay closed', () => {
    state().close()
    state().comeBack()
    expect(state().open).toBe(false)
  })
})
