import { Component } from "react"
import { logClientEvent } from "../services/monitoring"

export class ErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error, info) {
    logClientEvent("react.error", {
      message: error?.message || "Unknown render error",
      componentStack: info?.componentStack || "",
    })
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="page-pad narrow">
          <section className="status-panel">
            <h1>Something went wrong.</h1>
            <p className="muted">Please refresh the page and try again.</p>
            <button
              className="primary-button"
              type="button"
              style={{ marginTop: "1rem" }}
              onClick={() => this.setState({ failed: false })}
            >
              Try again
            </button>
          </section>
        </main>
      )
    }
    return this.props.children
  }
}

