import { Component, type ReactNode } from 'react'

interface Props {
  /** What shows instead once `children` throw. */
  fallback: ReactNode
  onError: (error: unknown) => void
  children: ReactNode
}

/**
 * Shows `fallback` for good once its children throw while rendering, or once
 * the code they load fails to download.
 */
export default class FallbackOnError extends Component<
  Props,
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
