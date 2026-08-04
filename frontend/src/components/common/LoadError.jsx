// What a screen shows when the data it needs did not arrive.
//
// The alternative, and what most of these screens used to do, is a toast that
// disappears after a few seconds and an empty page that looks like the account
// simply has nothing in it. That is worse than an error: it is wrong, and it is
// indistinguishable from working.
//
// So: say what failed, say whether it is worth trying again, and offer the
// button. A failed read is usually transient - a sleeping instance, a dropped
// connection - and retrying is the recovery path.
const LoadError = ({ what = 'this page', error, onRetry, retrying = false }) => {
  const status = error?.response?.status;

  // The server sends an id with every error it did not expect. Quoting it in a
  // support request leads straight to the log line for that exact failure.
  const requestId = error?.response?.data?.requestId;

  // What to say depends on why it failed, because the useful next step differs.
  const { title, detail, canRetry } =
    status === 403
      ? {
          title: 'You do not have access to this',
          detail: 'If you think you should, your clinic can check your account.',
          canRetry: false,
        }
      : status === 404
        ? {
            title: `We could not find ${what}`,
            detail: 'It may have been removed, or the link may be out of date.',
            canRetry: false,
          }
        : status === 429
          ? {
              title: 'Too many requests',
              detail: 'Please wait a moment and try again.',
              canRetry: true,
            }
          : {
              title: `We could not load ${what}`,
              detail: 'This is usually temporary. Trying again often works.',
              canRetry: true,
            };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
      <p className="text-base font-semibold text-slate-900">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">{detail}</p>

      {canRetry && onRetry && (
        <button type="button" onClick={onRetry} disabled={retrying} className="btn-primary mt-5">
          {retrying ? 'Trying again...' : 'Try again'}
        </button>
      )}

      {requestId && (
        <p className="mt-5 text-xs text-slate-400">
          Reference: <code className="font-mono">{requestId}</code>
        </p>
      )}
    </div>
  );
};

export default LoadError;
