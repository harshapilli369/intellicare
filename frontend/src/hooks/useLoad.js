import { useCallback, useEffect, useState } from 'react';

// Loading something a screen needs, with the failure treated as a state rather
// than as a toast.
//
// Written because eleven screens had grown the same shape independently -
// loading flag, data, a `cancelled` guard, a toast on failure - and the toast
// was the wrong answer every time. It disappears after a few seconds and leaves
// an empty screen behind, which looks exactly like a patient who has no record
// or a clinic with no appointments. An error the user cannot see is worse than
// one they can, because they act on what is in front of them.
//
// Returns the error so the caller can show it, and `reload` so it can be
// retried. A failed read is usually transient - a sleeping instance, a dropped
// connection - and trying again is the whole recovery path.
const useLoad = (loader, deps = []) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  // Bumped to ask again. Separate from `deps` so a retry does not depend on any
  // of them having changed.
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.resolve()
      .then(loader)
      .then((result) => {
        // A response that arrives after the screen has moved on must not be
        // written into state that no longer belongs to it.
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // The loader is a new closure on every render, so it cannot be a dependency
    // without re-running forever. The caller declares what the load actually
    // depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  return { data, error, loading, reload, setData };
};

export default useLoad;
