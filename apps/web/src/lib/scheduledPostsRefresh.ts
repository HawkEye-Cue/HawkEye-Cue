// Small, testable helper for the Calendar "show newly scheduled posts without a manual
// refresh" fix.
//
// Context: the Calendar is rendered as a SIBLING of the content creator on the Create
// tab, so when a post is scheduled the Calendar component is already mounted and a
// mount-only fetch never re-runs. We fix this by re-fetching scheduled posts when:
//   1. the content creator dispatches 'hawkeye-post-scheduled' on a successful schedule,
//   2. the window regains focus (navigating back to the tab), and
//   3. the document becomes visible again.
//
// This module isolates the event-wiring so it can be unit-tested without mounting the
// full CalendarPage (which pulls in many contexts + the API client).

export const POST_SCHEDULED_EVENT = 'hawkeye-post-scheduled';

/**
 * Register listeners that invoke `onRefresh` whenever scheduled-post data should be
 * re-fetched. Returns a cleanup function that removes every listener.
 *
 * `target`/`doc` are injectable for testing; they default to window/document.
 */
export function registerScheduledPostsRefresh(
  onRefresh: () => void,
  target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> = window,
  doc: {
    visibilityState?: string;
    addEventListener: EventTarget['addEventListener'];
    removeEventListener: EventTarget['removeEventListener'];
  } = document,
): () => void {
  const onScheduled = () => onRefresh();
  const onVisible = () => {
    if (doc.visibilityState === 'visible') onRefresh();
  };

  target.addEventListener(POST_SCHEDULED_EVENT, onScheduled);
  target.addEventListener('focus', onScheduled);
  doc.addEventListener('visibilitychange', onVisible);

  return () => {
    target.removeEventListener(POST_SCHEDULED_EVENT, onScheduled);
    target.removeEventListener('focus', onScheduled);
    doc.removeEventListener('visibilitychange', onVisible);
  };
}

/** Dispatch the "a post was just scheduled" signal (used by the content creator). */
export function notifyPostScheduled(target: Pick<EventTarget, 'dispatchEvent'> = window): void {
  target.dispatchEvent(new CustomEvent(POST_SCHEDULED_EVENT));
}
