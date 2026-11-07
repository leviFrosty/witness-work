import { Component, type ReactNode } from 'react'

interface Props {
  fallback: ReactNode
  onError: (error: unknown) => void
  children: ReactNode
}

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
