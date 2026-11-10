export type ShortcutKey = {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  repeat?: boolean
  isComposing?: boolean
}

export const isApplePlatform = (platform: string) =>
  /mac|iphone|ipad|ipod/i.test(platform)

export const isSubmitShortcut = (event: ShortcutKey, apple: boolean) =>
  event.key === 'Enter' &&
  !event.altKey &&
  !event.shiftKey &&
  !event.repeat &&
  !event.isComposing &&
  (apple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)

export type SubmitFocus =
  | 'owner'
  | 'singleLine'
  | 'multiline'
  | 'control'
  | 'none'

export type SubmitCandidate<Target> = {
  target: Target

  distance: number
  disabled: boolean
}

export type SubmitDecision<Target> =
  | { action: 'press'; target: Target }
  | { action: 'blur' }
  | { action: 'swallow' }
  | { action: 'leave' }

export function decideSubmit<Target>(input: {
  focus: SubmitFocus
  candidates: SubmitCandidate<Target>[]

  hasField: boolean
}): SubmitDecision<Target> {
  const { focus, candidates } = input
  if (focus === 'owner') return { action: 'leave' }
  const typing = focus === 'singleLine' || focus === 'multiline'
  const nearest = Math.min(...candidates.map((item) => item.distance))
  const closest = candidates.filter((item) => item.distance === nearest)
  if (!closest.length) {
    return focus === 'multiline' ? { action: 'blur' } : { action: 'leave' }
  }
  if (!typing && !input.hasField) return { action: 'leave' }

  if (closest.length > 1 || closest[0].disabled) return { action: 'swallow' }
  return { action: 'press', target: closest[0].target }
}

type SubmitAction = {
  press: () => void
  disabled: () => boolean
  focused: () => boolean

  owns?: boolean
}

const actions: SubmitAction[] = []

export function registerSubmitAction(action: SubmitAction) {
  actions.push(action)
  return () => {
    const index = actions.indexOf(action)
    if (index !== -1) actions.splice(index, 1)
  }
}

export function pressSubmitAction(typing: boolean) {
  const owner = actions.findLast((item) => item.owns && item.focused())
  if (owner) {
    owner.press()
    return true
  }
  if (!typing) return false
  const action = actions.findLast((item) => item.focused())
  if (!action || action.disabled()) return false
  action.press()
  return true
}
