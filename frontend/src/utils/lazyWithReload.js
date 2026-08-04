import { lazy } from 'react';

// `lazy`, but surviving a deployment that happened while somebody was using the
// app.
//
// Each screen is a separate file named after a hash of its contents, and
// index.html is what says which names to ask for. Deploy, and every name
// changes. A browser holding the previous index.html goes on asking for files
// that no longer exist - and it only finds out at the moment somebody opens a
// screen they had not opened before.
//
// Which is exactly when this was reported: signing in for the first time, or
// signing out and into a different account. Both fetch a screen this page has
// never fetched. Screens already open keep working, because their code is
// already in memory, so the app looks fine until you navigate.
//
// The host makes it worse by answering the missing file with index.html at
// `200 OK`, so the browser is handed a page of HTML where it expected a
// JavaScript module. The import rejects, React re-throws it while rendering,
// and the error boundary catches it - reporting "something on this screen
// stopped working" for an application that is in perfect health and merely one
// version out of date.
//
// Reloading fixes it, because a reload fetches the current index.html and with
// it the current names. That is the whole repair, and there is no reason to
// make a person discover it by pressing a button: do it for them.
const RELOADED_AT = 'intellicare:chunk-reload';

// Long enough to cover the reload, short enough that a failure half an hour
// later is treated as new rather than as this one repeating.
const COOLDOWN_MS = 10000;

// `sessionStorage` can throw outright - Safari in private browsing, an embedded
// frame with storage blocked. Losing the marker only costs the automatic retry,
// so it must never be what breaks the page.
const readMarker = () => {
  try {
    return Number(sessionStorage.getItem(RELOADED_AT)) || 0;
  } catch {
    return 0;
  }
};

const writeMarker = (value) => {
  try {
    if (value === null) sessionStorage.removeItem(RELOADED_AT);
    else sessionStorage.setItem(RELOADED_AT, String(value));
  } catch {
    // Nothing to do, and nothing worth telling the user about.
  }
};

const lazyWithReload = (importer) =>
  lazy(() =>
    importer().then(
      (module) => {
        // Whatever went wrong is behind us; the next failure is a fresh one.
        writeMarker(null);
        return module;
      },
      (error) => {
        // Reloading already failed to fix this, so it is not a stale build.
        // Genuinely offline, or a chunk that really is broken. Let it through
        // to the error boundary rather than reloading in a loop, which would
        // leave somebody watching a page flicker with nothing to click.
        if (Date.now() - readMarker() < COOLDOWN_MS) throw error;

        writeMarker(Date.now());
        window.location.reload();

        // The reload is on its way and this promise has no useful answer. A
        // promise that never settles leaves the Suspense fallback on screen
        // until the page is replaced; resolving or rejecting would show a
        // flash of the wrong thing first.
        return new Promise(() => {});
      }
    )
  );

export default lazyWithReload;
