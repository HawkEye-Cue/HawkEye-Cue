// Regression tests for the Calendar "refresh newly scheduled posts without a manual
// browser reload" fix.
//
// Bug: the Calendar is a sibling of the content creator on the Create tab, so a
// mount-only fetch never re-ran after scheduling — new posts only appeared after a
// full page refresh. These tests pin the contract that:
//   • 'hawkeye-post-scheduled' triggers a re-fetch
//   • window focus triggers a re-fetch (navigating back to the tab)
//   • visibilitychange triggers a re-fetch ONLY when the document is visible
//   • notifyPostScheduled() dispatches the event the Calendar listens for
//   • cleanup removes every listener (no leak / no post-unmount fetches)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerScheduledPostsRefresh,
  notifyPostScheduled,
  POST_SCHEDULED_EVENT,
} from './scheduledPostsRefresh';

// Minimal in-memory EventTarget-like doubles so we can drive events deterministically.
function makeTarget() {
  const listeners: Record<string, Set<EventListener>> = {};
  return {
    listeners,
    addEventListener: (type: string, cb: any) => {
      (listeners[type] ||= new Set()).add(cb);
    },
    removeEventListener: (type: string, cb: any) => {
      listeners[type]?.delete(cb);
    },
    dispatch: (type: string) => {
      for (const cb of listeners[type] ? Array.from(listeners[type]) : []) {
        (cb as EventListener)({ type } as Event);
      }
    },
    count: (type: string) => listeners[type]?.size ?? 0,
  };
}

describe('registerScheduledPostsRefresh', () => {
  let target: ReturnType<typeof makeTarget>;
  let doc: ReturnType<typeof makeTarget> & { visibilityState: string };
  let onRefresh: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    target = makeTarget();
    doc = Object.assign(makeTarget(), { visibilityState: 'visible' });
    onRefresh = vi.fn();
  });

  it('re-fetches when a post is scheduled', () => {
    registerScheduledPostsRefresh(onRefresh, target as any, doc as any);
    target.dispatch(POST_SCHEDULED_EVENT);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('re-fetches when the window regains focus', () => {
    registerScheduledPostsRefresh(onRefresh, target as any, doc as any);
    target.dispatch('focus');
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('re-fetches on visibilitychange only when visible', () => {
    registerScheduledPostsRefresh(onRefresh, target as any, doc as any);
    doc.visibilityState = 'hidden';
    doc.dispatch('visibilitychange');
    expect(onRefresh).not.toHaveBeenCalled();
    doc.visibilityState = 'visible';
    doc.dispatch('visibilitychange');
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('cleanup removes every listener (no leaks, no post-unmount fetches)', () => {
    const cleanup = registerScheduledPostsRefresh(onRefresh, target as any, doc as any);
    cleanup();
    expect(target.count(POST_SCHEDULED_EVENT)).toBe(0);
    expect(target.count('focus')).toBe(0);
    expect(doc.count('visibilitychange')).toBe(0);
    target.dispatch(POST_SCHEDULED_EVENT);
    target.dispatch('focus');
    doc.dispatch('visibilitychange');
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('notifyPostScheduled dispatches the event the Calendar listens for', () => {
    const dispatched: string[] = [];
    const fakeWindow = { dispatchEvent: (e: Event) => { dispatched.push(e.type); return true; } };
    notifyPostScheduled(fakeWindow as any);
    expect(dispatched).toEqual([POST_SCHEDULED_EVENT]);
  });

  it('end-to-end: notify → registered listener fires the refresh', () => {
    // Use a single shared target so dispatch reaches the registered listener.
    registerScheduledPostsRefresh(onRefresh, target as any, doc as any);
    notifyPostScheduled({ dispatchEvent: () => { target.dispatch(POST_SCHEDULED_EVENT); return true; } } as any);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
