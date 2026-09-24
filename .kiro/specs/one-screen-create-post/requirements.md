# Requirements Document

## Introduction

The Create-a-Post experience (the "Flock" / content creator) is redesigned to fit on **one screen with no scrolling** on a standard mobile viewport. A single unified composer replaces the current stack of collapsible tool cards. The user picks one of three modes at the top — **Write**, **AI Draft**, or **Get Ideas** — fills one input, optionally adds a photo (upload or AI-generated), selects target platforms, and taps one primary action (**Create & Preview**). Everything the user needs to start a post is visible at once, in a calm, obvious layout.

This redesign also establishes a broader product principle: **no HawkEye-Cue tab should require scrolling to use its primary action.** The Create tab is the first application of that principle.

The redesign must preserve all existing behavior that feeds the downstream flow: AI content generation, AI image generation (gpt-image-1), image/video upload, platform selection, the generated post feeding the "Today's Flocks / Copy & Open" flow, and Meta compliance (never auto-post; user-approved copy only).

Positioning anchor: "HawkEye can help at any step."

## Glossary

- **Create_Screen**: The single, no-scroll Create-a-Post surface on the Create tab.
- **Compose_Mode**: One of three top-level modes — `write` (user types their own), `ai_draft` (AI writes from a short intent), `ideas` (AI suggests post ideas). Exactly one is active at a time.
- **Intent_Input**: The single text field on the Create_Screen whose meaning depends on the Compose_Mode (the user's own draft in `write`; a promote-this description in `ai_draft`; unused/guidance in `ideas`).
- **Intent_Chip**: A quick-select chip that seeds the intent (e.g. "Promote a service", "Share a tip", "Ask a question") in `ai_draft` mode.
- **Platform_Selector**: The multi-select control for target platforms (Facebook, Instagram, LinkedIn, TikTok, Nextdoor).
- **Add_Photo**: Upload an image from the device.
- **Create_AI_Image**: Generate an image from a text description via the existing image endpoint.
- **Ready_Image**: The image currently attached to the post (uploaded or AI-generated), if any.
- **Primary_Action**: The single main button on the Create_Screen — labeled "Create & Preview" — that produces the post and advances to preview.
- **Preview_Step**: The state after Primary_Action where the finished caption (and per-platform versions + image) is shown for review before it enters the Flock/Copy-&-Open flow.
- **Flock_Flow**: The existing "Today's Flocks / Copy & Open" posting flow that consumes the generated post.
- **No_Scroll_Principle**: On a standard mobile viewport, the Create_Screen's mode tabs, input, media actions, platform selector, and primary action are all reachable without vertical scrolling.

## Requirements

### Requirement 1: One-Screen, No-Scroll Layout

**User Story:** As a busy local-business owner, I want the whole Create-a-Post flow on one screen, so that I can post without hunting or scrolling.

#### Acceptance Criteria

1. WHEN the Create_Screen is displayed on a standard mobile viewport (>= 360x640 CSS px), THE HawkEye_Cue SHALL render the mode tabs, Intent_Input, media actions, Platform_Selector, and Primary_Action without requiring vertical scrolling to reach the Primary_Action.
2. THE HawkEye_Cue SHALL present exactly one Primary_Action ("Create & Preview") on the Create_Screen.
3. THE HawkEye_Cue SHALL NOT display the previous stacked tool cards (separate collapsible idea generator, separate AI photo card, tone/length/post-type cards) on the initial Create_Screen.
4. WHERE secondary options (tone, length, post type) are needed, THE HawkEye_Cue SHALL keep them off the primary screen (e.g. sensible defaults or a compact inline control) so they do not force scrolling.

### Requirement 2: Three Compose Modes

**User Story:** As a user, I want to choose how I start a post — write it, have AI draft it, or get ideas — from one place.

#### Acceptance Criteria

1. THE HawkEye_Cue SHALL display three Compose_Mode tabs on the Create_Screen: Write, AI Draft, and Get Ideas.
2. THE HawkEye_Cue SHALL keep exactly one Compose_Mode active at a time and visibly indicate which is active.
3. WHEN the user selects a Compose_Mode, THE HawkEye_Cue SHALL update the Intent_Input label/placeholder and the visible helper text to match that mode without leaving the Create_Screen.
4. WHILE Compose_Mode is `ai_draft`, THE HawkEye_Cue SHALL display the Intent_Chips and the promise text "HawkEye will create your caption and platform-ready versions."
5. WHILE Compose_Mode is `write`, THE HawkEye_Cue SHALL treat the Intent_Input content as the user's post text and offer an "Improve with AI" affordance.
6. WHILE Compose_Mode is `ideas`, THE HawkEye_Cue SHALL let the user request ideas and load a chosen idea into the composer without leaving the Create_Screen.

### Requirement 3: Intent Input and Chips

**User Story:** As a user, I want a single clear input plus quick chips, so that I can tell HawkEye what I want fast.

#### Acceptance Criteria

1. THE HawkEye_Cue SHALL provide one Intent_Input on the Create_Screen with a mode-appropriate placeholder (e.g. "Example: Help local families understand their auto coverage" in `ai_draft`).
2. THE HawkEye_Cue SHALL display a character count for the Intent_Input with a defined maximum.
3. WHEN the user taps an Intent_Chip, THE HawkEye_Cue SHALL seed the Intent_Input or the generation intent accordingly.
4. WHEN Compose_Mode is `ai_draft` and the Intent_Input is empty, THE HawkEye_Cue SHALL disable the Primary_Action or prompt the user to describe the post before generating.

### Requirement 4: Media — Add Photo and Create AI Image

**User Story:** As a user, I want to add a photo or generate one inline, so that my post has an image without leaving the screen.

#### Acceptance Criteria

1. THE HawkEye_Cue SHALL provide an Add_Photo control and a Create_AI_Image control on the Create_Screen.
2. WHEN the user selects Add_Photo and picks a file, THE HawkEye_Cue SHALL set it as the Ready_Image and show a compact preview without forcing scroll past the Primary_Action.
3. WHEN the user selects Create_AI_Image and provides a description, THE HawkEye_Cue SHALL generate an image via the existing image endpoint and set it as the Ready_Image.
4. WHERE a Ready_Image exists, THE HawkEye_Cue SHALL indicate it is attached and allow removing/replacing it.
5. THE HawkEye_Cue SHALL preserve the existing Meta-compliant image handling (the image is attached to the user's post; nothing is auto-posted).

### Requirement 5: Platform Selection

**User Story:** As a user, I want to pick where the post goes with one tap each, so that I control distribution.

#### Acceptance Criteria

1. THE HawkEye_Cue SHALL display the Platform_Selector with Facebook, Instagram, LinkedIn, TikTok, and Nextdoor as multi-select options, each showing a selected/unselected state.
2. THE HawkEye_Cue SHALL default to at least one platform selected (Facebook).
3. WHERE a selected platform requires media (Instagram, TikTok), THE HawkEye_Cue SHALL indicate the media requirement before the Primary_Action proceeds.
4. THE HawkEye_Cue SHALL keep the Platform_Selector visible on the Create_Screen without scrolling.

### Requirement 6: Create & Preview Flow

**User Story:** As a user, I want one button that turns my input into a finished post I can review, so that posting is fast and predictable.

#### Acceptance Criteria

1. WHEN the user taps Primary_Action in `ai_draft`, THE HawkEye_Cue SHALL generate the caption and per-platform versions from the Intent_Input and advance to the Preview_Step.
2. WHEN the user taps Primary_Action in `write`, THE HawkEye_Cue SHALL use the typed text as the caption and advance to the Preview_Step.
3. WHEN the Preview_Step is shown, THE HawkEye_Cue SHALL display the finished caption, any Ready_Image, and the selected platforms for review.
4. WHEN the user confirms from the Preview_Step, THE HawkEye_Cue SHALL feed the post into the existing Flock_Flow (Today's Flocks / Copy & Open) unchanged.
5. IF content generation fails, THEN THE HawkEye_Cue SHALL show the error inline on the Create_Screen and keep the user's input intact.
6. THE HawkEye_Cue SHALL provide an "I want to write it myself" affordance that switches to `write` mode from `ai_draft`.

### Requirement 7: Preserve Existing Behavior and Compliance

**User Story:** As an existing user, I want the redesign to keep everything that worked, so that nothing I rely on breaks.

#### Acceptance Criteria

1. THE HawkEye_Cue SHALL keep AI content generation, AI image generation, image/video upload, and platform selection functionally intact.
2. THE HawkEye_Cue SHALL keep the generated post feeding the Today's Flocks / Copy & Open flow.
3. THE HawkEye_Cue SHALL NOT auto-post to any social platform; posting remains user-approved copy/attach.
4. THE HawkEye_Cue SHALL preserve tier gating (e.g. Create_AI_Image availability) as it exists today.

### Requirement 8: No-Scroll Principle Across Tabs

**User Story:** As a user, I want every HawkEye-Cue tab to fit and be usable without scrolling to its main action, so that the app feels calm and effortless.

#### Acceptance Criteria

1. THE HawkEye_Cue SHALL treat No_Scroll_Principle as the design standard for the Create tab in this feature.
2. WHERE a tab's content legitimately exceeds one screen (e.g. a long list of groups), THE HawkEye_Cue SHALL keep the tab's primary action reachable without scrolling and confine overflow to an inner scroll region rather than the whole page.
