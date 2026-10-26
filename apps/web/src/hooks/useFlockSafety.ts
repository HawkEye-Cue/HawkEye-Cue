// Web adapter hook for the Flock Safety Guard. Thin wrapper over the pure shared
// util (@social-lead-gen/shared) + localStorage. Advisory-only — it never auto-posts,
// never evades restrictions, and never claims any cadence is "Facebook-safe".
//
// Exposes a small, dependency-light surface the three posting workflows share:
//   recordConfirmedPost(workflow, group) — logs a CONFIRMED post (deduped cross-workflow)
//   postsToday                           — today's confirmed-post count
//   paused / pauseReason                 — shared pause state (persists across refresh)
//   pause(reason) / resume()             — manual pause/resume (NO timer auto-resume)
//   reminder / dismissReminder()         — gentle pacing reminder (advisory)

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  recordPost,
  postsToday as postsTodayUtil,
  shouldRemind,
  setFlockPaused,
  loadActivity,
  saveActivity,
  loadPause,
  savePause,
  loadPacing,
  savePacing,
  normalizeFacebookGroupUrl,
  type PostingActivityEvent,
  type PostingWorkflow,
  type PauseState,
} from '@social-lead-gen/shared';

// Cross-workflow dedupe identity. The SAME real group is confirmed via Mass Flock
// (saved-group id) and Today's Flocks (calendar-event id) — those ids differ, so
// id-based dedupe fails to catch the same group across workflows. The group's Facebook
// URL is the one stable value both workflows carry, so we prefer the NORMALIZED URL as
// the dedupe identity (handles www/m./trailing-slash/query variants). Fall back to the
// raw id/name only when no valid group URL exists (e.g. legacy groups without a link).
function dedupeIdentity(group: ConfirmedPostGroup): string {
  const norm = group.link ? normalizeFacebookGroupUrl(group.link) : null;
  if (norm && norm.ok && norm.url) return norm.url;
  return (group.id || group.link || group.name || '').trim();
}

export interface ConfirmedPostGroup {
  id?: string;
  name?: string;
  link?: string;
}

export interface UseFlockSafety {
  recordConfirmedPost: (workflow: PostingWorkflow, group: ConfirmedPostGroup) => void;
  postsToday: number;
  paused: boolean;
  pauseReason?: PauseState['reason'];
  pause: (reason?: 'user' | 'restricted') => void;
  resume: () => void;
  reminder: { remind: boolean; count: number; dismissed: boolean };
  dismissReminder: () => void;
}

export function useFlockSafety(): UseFlockSafety {
  const { user } = useAuth();
  const sub = user?.sub;

  const [events, setEvents] = useState<PostingActivityEvent[]>([]);
  const [pauseState, setPauseState] = useState<PauseState>({ paused: false });
  const [reminderDismissed, setReminderDismissed] = useState(false);
  // Re-read trigger so counts/reminder re-derive after a record.
  const [, setTick] = useState(0);
  const lastRemindedRef = useRef<number>(0);

  // Load persisted state on mount (and when the user changes).
  useEffect(() => {
    setEvents(loadActivity(sub));
    setPauseState(loadPause(sub));
    lastRemindedRef.current = loadPacing(sub).lastRemindedAt ?? 0;
    setReminderDismissed(false);
  }, [sub]);

  const recordConfirmedPost = useCallback(
    (workflow: PostingWorkflow, group: ConfirmedPostGroup) => {
      const event: PostingActivityEvent = {
        // Link-first identity so the same group deduplicates across workflows
        // (Mass Flock vs Today's Flocks) whose raw ids differ. Falls back to id/name
        // when there's no valid URL. recordPost still applies the 2-minute window, so
        // legitimate repeat posts outside that window are counted.
        groupId: dedupeIdentity(group),
        groupLink: group.link,
        groupName: group.name,
        ts: Date.now(),
        workflow,
      };
      setEvents((prev) => {
        const next = recordPost(prev, event);
        saveActivity(sub, next);
        return next;
      });
      // A fresh post can surface the pacing reminder again.
      setReminderDismissed(false);
      setTick((t) => t + 1);
    },
    [sub],
  );

  const pause = useCallback(
    (reason: 'user' | 'restricted' = 'user') => {
      setPauseState((prev) => {
        const next = setFlockPaused(prev, true, reason);
        savePause(sub, next);
        return next;
      });
    },
    [sub],
  );

  const resume = useCallback(() => {
    setPauseState(() => {
      const next = setFlockPaused({ paused: true }, false);
      savePause(sub, next);
      return next;
    });
  }, [sub]);

  const now = Date.now();
  const decision = shouldRemind(events, { lastRemindedAt: lastRemindedRef.current }, now);

  // When a reminder newly qualifies and hasn't been dismissed, record the time so the
  // cooldown is honored across refreshes. (Advisory — does not block anything.)
  useEffect(() => {
    if (decision.remind && !reminderDismissed) {
      lastRemindedRef.current = Date.now();
      savePacing(sub, { lastRemindedAt: lastRemindedRef.current });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision.remind, reminderDismissed, sub]);

  const dismissReminder = useCallback(() => {
    lastRemindedRef.current = Date.now();
    savePacing(sub, { lastRemindedAt: lastRemindedRef.current });
    setReminderDismissed(true);
  }, [sub]);

  return {
    recordConfirmedPost,
    postsToday: postsTodayUtil(events, now),
    paused: pauseState.paused,
    pauseReason: pauseState.reason,
    pause,
    resume,
    reminder: { remind: decision.remind && !reminderDismissed, count: decision.count, dismissed: reminderDismissed },
    dismissReminder,
  };
}
