import { Component } from 'react';

// Catches a rendering error anywhere beneath it.
//
// Without one, a single thrown error in any component unmounts the entire React
// tree and leaves a blank white page - no message, no navigation, nothing to
// click. The user's only recourse is to guess that reloading might help.
//
// Written as a class because there is no hook equivalent: `componentDidCatch`
// is the only way React exposes this.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Kept where a developer can find it. A production error reporter would be
    // wired in here; until there is one, the browser console is the honest
    // answer rather than pretending the error was recorded somewhere.
    console.error('Unhandled rendering error:', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-brand">IntelliCare</h1>

          <p className="mt-4 text-sm text-slate-800">
            Something on this screen stopped working. Nothing you were looking at has been
            changed or lost.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            {/* Clearing the error re-renders the same screen, which is enough
                when the cause was transient. */}
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="btn-primary"
            >
              Try again
            </button>
            {/* And a way out that does not depend on the broken screen
                recovering at all. */}
            <button
              type="button"
              onClick={() => {
                window.location.href = '/';
              }}
              className="btn-outline"
            >
              Back to the start
            </button>
          </div>

          {/* Shown only in development. A user has no use for a stack trace, and
              in a deployment it would leak the shape of the application. */}
          {import.meta.env.DEV && (
            <pre className="mt-6 max-h-48 overflow-auto rounded bg-slate-100 p-3 text-xs text-slate-700">
              {error.message}
              {'\n\n'}
              {error.stack}
            </pre>
          )}
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
