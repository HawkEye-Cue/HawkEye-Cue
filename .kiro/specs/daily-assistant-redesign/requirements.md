# Requirements — HawkEye-Cue "Daily Assistant" Redesign

## Vision

Make HawkEye-Cue feel like a **daily assistant**, not a complicated CRM.

> Open HawkEye-Cue. Complete your Flight Plan. Get back to running your business.

Every screen answers exactly one question. Powerful features stay, but they no longer
all show at once. The experience is a calm, personal command center: clean, sharp,
and extremely obvious.

Guiding rule per screen:
- **Today** — What should I do next?
- **Create** — What should I post?
- **Opportunities** — Who should I contact?
- **Pipeline** — Who needs follow-up?
- **Insights** — What is making me money?

---

## Requirement 1 — The "Today" screen (Flight Plan)

**User story:** As a busy business owner, I want to log in and immediately see only what
needs my attention today, so I don't have to think about where to start.

### Acceptance Criteria
1. WHEN a user opens the app THEN the Today screen SHALL show a time-aware greeting with their name (e.g. "Good morning, Brianna 👋").
2. WHEN the Today screen loads THEN it SHALL display a short "flight plan" summary with up to four counts: new opportunities, leads needing follow-up, posts ready to publish, and total active opportunity value ($).
3. WHEN there is at least one actionable item THEN the screen SHALL show a single prominent primary button labeled "Start My Flight Plan".
4. WHEN the user taps "Start My Flight Plan" THEN the app SHALL guide them through each pending task one at a time (a guided checklist), advancing to the next task as each is completed or skipped.
5. WHEN there are no actionable items THEN the screen SHALL show an encouraging "all clear" state instead of the button.
6. The Today screen SHALL NOT render dense calendars, engagement charts, or multiple competing panels above the fold. Secondary detail may live lower or behind a tap.
7. Counts SHALL come from existing endpoints (`/opportunities/stats`, `/posts`, `/sales/deals`) and SHALL degrade gracefully to 0 if an endpoint fails.

---

## Requirement 2 — Simplified primary navigation (5 tabs)

**User story:** As a new user, I don't want to be overwhelmed by seven tabs of jargon.

### Acceptance Criteria
1. The primary navigation SHALL show exactly five tabs: **Today**, **Create**, **Opportunities**, **Pipeline**, **Insights**.
2. Network, Appreciations, Flocks, Team/Summit, Settings, Profile, and Keywords SHALL remain fully accessible under a secondary "More" menu.
3. WHEN a user is on the Team (Summit) tier THEN team management SHALL still be reachable from More (and surfaced contextually where relevant).
4. Renaming SHALL NOT break existing routes — old paths SHALL continue to resolve (e.g. `/sales` → Pipeline, `/team`, `/network` still work).
5. The active tab SHALL be visually obvious.

---

## Requirement 3 — Everyday wording with branded subtitles

**User story:** As a user, I want buttons I instantly understand, while still feeling the brand.

### Acceptance Criteria
1. Primary action buttons SHALL use plain-language labels first (e.g. "Send a message", "Start follow-up plan").
2. Branded names SHALL appear as small secondary text/subtitles (e.g. "Powered by Talon Trigger", "Flight Projection"), never as the sole label a user must decode.
3. Tab labels SHALL be plain words (Today, Create, Opportunities, Pipeline, Insights).

---

## Requirement 4 — Calmer visual direction (KEEP DARK THEME)

**User story:** As a user, I want the interface to feel clean and confident, not aggressively black-and-yellow and cluttered on every surface.

### Acceptance Criteria
1. The app SHALL keep its existing DARK theme (slate/charcoal surfaces). Do NOT switch to a light/off-white background.
2. Within the dark theme, the design SHALL feel calmer: more whitespace, fewer competing panels, clear hierarchy.
3. Yellow/gold SHALL be reserved for primary buttons, key highlights, and alerts — not applied as large background fills.
4. Red SHALL be used only for genuinely overdue items; green SHALL be used only for wins and completed tasks.
5. Cards SHALL be rounded with subtle shadows and generous spacing.
6. The redesign SHALL preserve legibility and existing functionality on the older/short-screen laptop (no content cut off; modals still fit).

---

## Requirement 5 — Clean, visual opportunity cards (HawkSight)

**User story:** As a user scanning opportunities, I want each one to read at a glance.

### Acceptance Criteria
1. Each opportunity SHALL render as a clean card showing: the need/summary line, source group, relative time, an opportunity score with a quality label, and clear next-step actions ("Write Response", "Save for Later").
2. Distance/location SHALL be shown only when available and hidden otherwise (no fabricated data).
3. Urgency SHALL be shown as a simple badge (e.g. "Respond soon").
4. Detailed AI reasoning SHALL be hidden by default and revealed only when the user taps "Why this score?".

---

## Requirement 6 — Human pipeline rows

**User story:** As a user, I want to know each lead's next action without opening every card.

### Acceptance Criteria
1. Each pipeline row SHALL show the person, their product/interest, current status, the **next step**, last contact (relative), and potential value.
2. Overdue next-steps SHALL be flagged in red; nothing else SHALL use red.

---

## Requirement 7 — Guided vs Pro mode

**User story:** As a solo owner I want simplicity; as a team I want full power.

### Acceptance Criteria
1. The app SHALL offer a per-user mode toggle: **Guided** (default) and **Pro**.
2. Guided mode SHALL show one task at a time, include short explanations, use recommended defaults, and hide advanced surfaces (bulk actions, advanced filters, dense dashboards).
3. Pro mode SHALL expose full dashboards, bulk actions, automation controls, team reporting, and advanced filters.
4. The selected mode SHALL persist per user and default to Guided for new users.

---

## Requirement 8 — Conversational setup

**User story:** As a new user, I want to be asked a few simple questions, not handed a big settings page.

### Acceptance Criteria
1. First-run setup SHALL ask, conversationally: what kind of business, where they serve customers, which services they want leads for, which social accounts to connect, and how they'd naturally respond to a customer.
2. WHEN setup completes THEN the app SHALL confirm readiness ("Your HawkEye is ready. Let's find your first opportunity.") and route the user to the Today screen.
3. Setup answers SHALL persist to the existing profile/preferences and trade selection so the rest of the app is customized.
4. Users SHALL be able to skip and complete setup later without being blocked.

---

## Non-goals / Constraints
- Do NOT remove or break any existing feature (Radar, Hawk Memory, Social Proof, folios, team claiming, email automation, extension).
- Keep replies user-approved (copy-to-clipboard), never auto-post (Meta compliance).
- Push to `main`; deploys run via GitHub Actions. Verify web build before pushing.
- Reuse existing endpoints where possible; avoid new backend unless a requirement can't be met client-side.
