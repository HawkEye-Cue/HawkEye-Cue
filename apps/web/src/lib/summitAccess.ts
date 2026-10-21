// Pure, framework-free resolution of a user's Summit (Team) access and role.
//
// "Summit access" is what lights up Summit HQ in the nav. It is true when EITHER:
//   • the account's OWN subscription is the Summit/Team tier and is in a live state
//     (active or trialing — NOT expired/canceled-and-lapsed), OR
//   • the account is a member of a team (members get the team experience even though
//     their personal tier may be free — team access is additive).
//
// Keeping this pure makes it trivially unit-testable in the node test env (no DOM) and
// keeps the context/nav code declarative.

export type TeamRole = 'admin' | 'member' | null;

// Mirror of the canonical backend normalizeTier (free|soar|team). summit → team;
// base/growth/flight/pro → soar; unknown/expired labels → free.
export function normalizeTierLabel(raw: string | null | undefined): 'free' | 'soar' | 'team' {
  const t = (raw ?? '').toLowerCase();
  if (t === 'summit' || t === 'team') return 'team';
  if (t === 'base' || t === 'growth' || t === 'flight' || t === 'pro' || t === 'soar') return 'soar';
  return 'free';
}

// A subscription status counts as "live" (entitlement active) when it is active or
// trialing. Expired/canceled/past-due-lapsed do NOT grant Summit. (past_due keeps
// access as a grace period, matching the billing handlers.)
export function isLiveStatus(status: string | null | undefined): boolean {
  const s = (status ?? '').toLowerCase();
  return s === 'active' || s === 'trial' || s === 'trialing' || s === 'past_due' || s === '';
}

export interface SummitInputs {
  /** The account's own subscription tier label (raw from /subscription). */
  subscriptionTier?: string | null;
  /** The account's own subscription status (raw from /subscription). */
  subscriptionStatus?: string | null;
  /** The role on a team the user belongs to, if any (from /team). */
  teamRole?: TeamRole;
}

export interface SummitAccess {
  /** Whether Summit HQ should be visible/accessible. */
  isSummit: boolean;
  /** The user's role in a team, or null if not on a team. */
  teamRole: TeamRole;
  /** True when the user belongs to a team (admin or member). */
  hasTeam: boolean;
  /** True when Summit access comes from the user's OWN paid/trialing Summit sub. */
  isOwner: boolean;
}

export function resolveSummitAccess(inputs: SummitInputs): SummitAccess {
  const ownTier = normalizeTierLabel(inputs.subscriptionTier);
  const ownLive = isLiveStatus(inputs.subscriptionStatus);
  const isOwner = ownTier === 'team' && ownLive;
  const teamRole: TeamRole = inputs.teamRole ?? null;
  const hasTeam = teamRole === 'admin' || teamRole === 'member';
  return {
    isSummit: isOwner || hasTeam,
    teamRole,
    hasTeam,
    isOwner,
  };
}
