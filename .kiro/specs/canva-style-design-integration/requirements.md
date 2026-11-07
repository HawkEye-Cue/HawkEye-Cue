# Requirements Document

## Introduction

This feature adds **Canva-style automatic designs** to the HawkEye-Cue Create experience. When a user composes a post, HawkEye automatically produces three genuinely different, professionally designed graphic options — **photo-based**, **illustrated**, and **minimal/editorial** — built entirely from the user's own caption and their saved Brand Kit. Each design is fully editable in the existing Design Studio and costs **zero AI image credits** (100% client-side rendering, no network calls, no paid APIs).

This spec is scoped to an **insurance-first rollout**. Three insurance trades (`insurance-agent`, `health-insurance-agent`, `insurance-producer`) receive the new designs; the other 56 trades continue to use the existing template-based image suggestions unchanged. Existing templates also serve as a **fallback** for insurance if a new design fails to compose or render.

This spec **documents work that is already substantially implemented** and governs the remaining validation and controlled rollout. It does not restart the project or rebuild working functionality. It is intentionally kept **separate from the `create-tab-redesign` spec**, which covers the Create tab's workflow/launcher restructuring. The Canva design engine treats image/design generation as its own concern and must not entangle with that redesign.

The feature must preserve all existing Create functionality: AI content generation, AI image generation, media upload, platform selection, the Flock / Copy & Open flow, scheduling, posting, saved post history, and tier gating. Nothing in this feature auto-posts to any social platform.

### Implementation status at time of writing

This section records what exists today so the design and tasks phases plan against reality.

**Already implemented (web, `apps/web`):**
- Production design engine promoted from the dev prototype to `apps/web/src/lib/canvaDesigns/`: `spec.ts`, `builder.ts`, `kit.ts`, `inputs.ts`, `insurancePhoto.ts`, `insuranceIllustrated.ts`, `insuranceEditorial.ts`.
- Public API `apps/web/src/lib/canvaDesigns/index.ts`: `tradeHasCanvaDesigns`, `buildCanvaSpecs`, `buildInsuranceSpecs`, with `CANVA_TRADES = {insurance-agent, health-insurance-agent, insurance-producer}`.
- `document.ts`: `composeSpecToDocument` renders a full-resolution preview and returns an editable Design Studio document (Fabric JSON serialized with `EXTRA_PROPS` so role/frame/mask tags round-trip). `fonts.ts`: production font loader (Montserrat, Playfair Display).
- Assets shipped under `apps/web/src/lib/canvaDesigns/assets/`: OFL fonts with licenses; CC0 photos `neighborhood-aerial.jpg` (generic, no identifiable property/people) and `roof-tiles-lahalla.jpg`; license manifest `assets/photos/LICENSES.json`. Identifiable private-property photos were removed.
- `ImageSuggestions.tsx`: `canvaCards` / `onOpenCanva` props, `CanvaCard` interface, and a caption-summary note (`data-testid="caption-summary-note"`). When `canvaCards` are present it renders those instead of template cards; the template path is unchanged for other trades.
- `ContentCreatorPage.tsx`: `canvaCards` state, `canvaDocs` ref, `canvaSig` signature gate, a compose effect gated on the suggestion signature that clears designs on failure (fallback to templates), an `openCanvaCard` handler, and the strip renders when template suggestions OR canva cards exist.
- `SetupWizard.tsx`: starts collapsed on the `/create` route (Setup Guide overlap fix).
- Illustrated CTA/footer spacing adjustment (footer `y=944`, CTA clamped via `maxTop`).
- Validation scripts under `scripts/` (render quality, Studio validation, photo replacement, text dump) and review HTML pages under `suggestions-validation/`.
- `designPolish.test.ts` moved to `dev-notes/designPolish.test.ts.unused` (it imported a nonexistent helper and was never committed).

**Verified so far:**
- Typecheck: 0 errors. Prototype checks pass (render 6/6 both kits, Studio 102/102, photo replacement 4/4, original Studio validator 71/71).
- Authenticated desktop E2E: all 11 checks passed (three distinct styles, caption preserved, summary note shown, editable in Studio, free customize, "Use in Post" attaches, 0 AI calls).

**Incomplete / open:**
- Mobile authenticated E2E last failed at clicking the "Write" button (obscured by an overlay — a test-harness issue; a robustness fix was applied to `scripts/e2e-insurance-canva.mjs` but not yet re-run).
- Fallback behavior not yet confirmed end-to-end for a non-insurance trade (e.g. roofing) and for an insurance compose failure.
- Draft save/reopen and schedule/publish not yet validated end-to-end through the existing Create flow with a Canva design attached.
- Full focused test suite + `tsc --noEmit -p apps/web` not yet re-run after the latest edits.
- Remaining 56 trades not yet designed (deferred to controlled phases after insurance validation).
- The dev prototype tree `apps/web/src/dev/canva/` (roofing/realEstate prototypes, harness, registry) still exists and is not part of the shipping path; its disposition is open.
- Production deployment is **on hold** pending an explicit approval gate and the AWS Lambda concurrency support case.

## Glossary

- **Canva_Design**: An automatically composed, professionally styled graphic option produced client-side from the user's caption and Brand Kit, rendered as a full-resolution preview and openable as an editable Design Studio document.
- **Design_Style**: One of three genuinely distinct visual treatments — `photo` (photo-based), `illustrated` (original/licensed vector illustration), `editorial` (minimal/editorial). Distinct means different layout structure, not a recolor of one layout.
- **Canva_Trade**: A trade that receives Canva_Designs in the current phase. Phase 1 set: `insurance-agent`, `health-insurance-agent`, `insurance-producer`.
- **Template_Fallback**: The existing template-based image suggestions, used for all non-Canva_Trades and as the fallback for a Canva_Trade when design composition or rendering fails.
- **Brand_Kit**: The signed-in user's saved brand data (company name, phone, logo, primary color). Source of all business identity shown in a Canva_Design.
- **Caption**: The user's complete post text. Always preserved verbatim for the post, regardless of what the graphic displays.
- **Image_Summary**: A shortened headline or excerpt the graphic may display instead of the full Caption. Never replaces the Caption; always accompanied by a user-visible notice.
- **Caption_Summary_Notice**: The UI note shown when any displayed design uses an Image_Summary, stating the full post caption is unchanged (`data-testid="caption-summary-note"`).
- **Design_Studio**: The existing editor (`DesignStudio.tsx`) that opens a Canva_Design as individually editable layers (illustration, photo mask, text, background, branding).
- **Photo_Frame**: A shaped photo placeholder (rect, rounded, arch, circle) with a focal point, used so a replacement photo keeps the selected frame, shape, and crop.
- **Ready_Photo**: The photo currently placed in a Canva_Design — a shipped production-safe licensed starter image, a curated stock image, or the user's uploaded photo.
- **Credit_Free**: A property of Canva_Designs: composing, previewing, and editing them performs no network request, no AI call, and consumes no AI image credits.
- **Rollout_Phase**: A controlled increment that adds Canva_Designs to a defined set of additional trades after insurance is validated.
- **Deployment_Approval_Gate**: An explicit, human approval checkpoint that must be passed before any merge, push, or production deployment of this feature.

## Requirements

### Requirement 1: Insurance-First Canva Designs

**User Story:** As an insurance agent, I want HawkEye to automatically produce polished design options for my post, so that I can share professional graphics without starting from scratch.

#### Acceptance Criteria

1. WHEN a signed-in user whose trade is a Canva_Trade composes a post with a non-empty Caption, THE system SHALL produce three Canva_Designs: one `photo`, one `illustrated`, and one `editorial`.
2. THE three Canva_Designs SHALL be genuinely different Design_Styles, differing in layout structure rather than only in color.
3. WHEN the user's trade is not a Canva_Trade, THE system SHALL NOT produce Canva_Designs and SHALL present the Template_Fallback unchanged.
4. WHEN the Caption is empty, THE system SHALL NOT produce Canva_Designs.
5. THE Canva_Trade set for this phase SHALL be exactly `insurance-agent`, `health-insurance-agent`, and `insurance-producer`.

### Requirement 2: Template Fallback and Non-Regression

**User Story:** As a product owner, I want existing designs retained as a fallback and all other trades untouched, so that the rollout never breaks what already works.

#### Acceptance Criteria

1. IF composing or rendering a Canva_Design fails for a Canva_Trade, THEN THE system SHALL clear the Canva_Designs and present the Template_Fallback.
2. THE system SHALL keep the existing template-based image suggestions functioning unchanged for all 56 non-Canva_Trades.
3. THE system SHALL render the suggestion strip WHEN template suggestions exist OR WHEN Canva_Designs exist.
4. WHERE a Canva_Trade has Canva_Designs available, THE suggestion strip SHALL display the Canva_Designs in place of the template cards.
5. THE system SHALL NOT remove, disable, or alter any existing Create capability (AI content generation, AI image generation, media upload, platform selection, Flock / Copy & Open flow, scheduling, posting, saved post history, tier gating).

### Requirement 3: Caption and Brand Kit Sourcing

**User Story:** As a business owner, I want designs to use my real caption and brand details and never invent information, so that my posts are accurate and trustworthy.

#### Acceptance Criteria

1. THE system SHALL compose every Canva_Design from the user's current Caption and the signed-in user's Brand_Kit.
2. THE system SHALL populate business name, phone, logo, and accent color only from the Brand_Kit.
3. WHERE a Brand_Kit field (company, phone, logo) is empty, THE system SHALL omit that layer rather than display a placeholder or invented value.
4. THE system SHALL NOT insert fake business names, phone numbers, logos, license numbers, or any other invented detail into a Canva_Design.
5. WHERE the Brand_Kit primary color equals the application default color, THE system SHALL treat it as "not chosen" and SHALL NOT apply it as a custom accent.
6. THE system SHALL derive headline, supporting text, feature chips, and call-to-action only from words present in the Caption (or the trade name), never inventing claims.

### Requirement 4: Full Caption Preservation

**User Story:** As a user, I want my complete post caption preserved even when the image shows a shorter headline, so that nothing I wrote is lost.

#### Acceptance Criteria

1. THE system SHALL preserve the complete original Caption for the post regardless of what any Canva_Design displays.
2. WHERE a Canva_Design displays an Image_Summary instead of the full Caption, THE system SHALL mark that design so the UI can indicate a summary is shown.
3. WHEN any displayed Canva_Design uses an Image_Summary, THE system SHALL show the Caption_Summary_Notice stating the full post caption is unchanged.
4. WHERE text is shortened for display, THE system SHALL retain the full text within the design layer data so it is not lost on edit or reopen.
5. WHEN a shortened display string is produced, THE system SHALL make it visually distinguishable from the full text (for example, ending with an ellipsis).

### Requirement 5: Editability in Design Studio

**User Story:** As a user, I want every automatic design to be fully editable, so that I can adjust it to my needs in the tool I already use.

#### Acceptance Criteria

1. WHEN the user opens a Canva_Design, THE system SHALL open it in the existing Design_Studio without modifying the Design_Studio itself.
2. THE opened document SHALL expose individually editable layers: illustration components, Photo_Frame / photo mask, background, text, and branding.
3. THE system SHALL tag layers with the role/frame/mask metadata the Design_Studio already understands so editing behaves as for native designs.
4. WHEN a Canva_Design is saved and reopened, THE system SHALL preserve its layers, crop, mask, and role tags.
5. THE system SHALL provide a "Use This Design" action and a "Customize" action that open the selected Canva_Design in the Design_Studio.

### Requirement 6: Photo Upload, Replacement, and Shaped Frames

**User Story:** As a user, I want to use my own photo and swap photos without breaking the layout, so that designs reflect my real business.

#### Acceptance Criteria

1. THE system SHALL support user photo upload into a Canva_Design via the existing media-upload behavior.
2. WHEN the user replaces a photo in a Photo_Frame, THE system SHALL preserve the frame's shape, mask, and crop and SHALL re-fit the new photo to the frame's focal point.
3. THE system SHALL support Photo_Frame shapes rect, rounded, arch, and circle.
4. WHERE a Canva_Design ships with a Ready_Photo starter image, THE system SHALL present it as a replaceable starting point, not as a claim about the user's business.
5. WHERE a design represents a specific listing that lacks the user's own photo, THE system SHALL prompt the user for a real photo rather than presenting unrelated stock as a real listing.

### Requirement 7: Credit-Free, Client-Side Generation

**User Story:** As a user on any plan, I want automatic designs to be free, so that exploring design options never costs me AI image credits.

#### Acceptance Criteria

1. WHEN composing, previewing, or editing a Canva_Design, THE system SHALL perform no network request and no AI call.
2. THE system SHALL consume zero AI image credits for any Canva_Design operation.
3. THE system SHALL render Canva_Design previews at full resolution (1080x1080) entirely client-side.
4. THE system SHALL keep existing tier gating for paid AI image generation unchanged and independent of Canva_Designs.

### Requirement 8: Production-Safe Assets

**User Story:** As a product owner, I want only appropriately licensed, production-safe imagery and type, so that we have no legal or privacy exposure.

#### Acceptance Criteria

1. THE system SHALL use only photos that are appropriately licensed for commercial use and whose source and license are documented in the asset license manifest.
2. THE system SHALL NOT ship photos of identifiable private property or recognizable people.
3. THE system SHALL use only original illustrations or illustrations whose commercial-use and redistribution rights are verified.
4. THE system SHALL use only fonts whose licenses permit the intended use, with the license files shipped alongside the fonts.

### Requirement 9: Responsive Desktop and Mobile

**User Story:** As a mobile user, I want the design suggestions and editing to work well on my phone, so that I can create on the go.

#### Acceptance Criteria

1. WHILE the viewport is desktop width, THE system SHALL present the Canva_Designs in a layout suited to desktop (for example, a grid).
2. WHILE the viewport is mobile width, THE system SHALL present the Canva_Designs in a layout suited to mobile (for example, a horizontally scrollable strip) with readable text sizes.
3. THE Setup Guide SHALL NOT overlap or obstruct the Create composer or the design gallery on desktop or mobile.
4. WHILE on the `/create` route, THE Setup Guide SHALL start collapsed and remain accessible without obstructing the user's work.

### Requirement 10: End-to-End Create Workflow Validation

**User Story:** As a product owner, I want the complete signed-in workflow validated, so that selecting, editing, saving, scheduling, and publishing a design all work through existing flows.

#### Acceptance Criteria

1. THE system SHALL support selecting a Canva_Design and attaching it to the post through the existing Create workflow.
2. THE system SHALL support editing a selected Canva_Design in the Design_Studio and carrying the edited result back into the post.
3. THE system SHALL support saving a Canva_Design-bearing post as a draft and reopening it with the design intact via the existing draft-persistence behavior.
4. THE system SHALL support scheduling and publishing a Canva_Design-bearing post through the existing scheduling and posting flows, with no auto-posting.
5. THE validation SHALL cover both desktop and mobile authenticated sessions.
6. THE validation SHALL confirm the fallback path: a non-Canva_Trade shows unchanged templates, and an insurance compose failure falls back to templates.

### Requirement 11: Phased Rollout Beyond Insurance

**User Story:** As a product owner, I want expansion to the remaining trades to happen in controlled phases, so that each increment is validated and low-risk.

#### Acceptance Criteria

1. THE system SHALL keep the Canva_Trade set limited to insurance until insurance is validated and approved.
2. WHEN insurance is approved, THE system SHALL expand to additional trades in defined Rollout_Phases, each a bounded set of trades.
3. THE system SHALL support all 57 trades at the engine level while gating which trades are active behind the Canva_Trade set.
4. WHERE a trade has no Canva_Design yet, THE system SHALL present the Template_Fallback for that trade.
5. THE rollout plan SHALL avoid rework by reusing the insurance engine and validation approach for each subsequent phase.

### Requirement 12: Production Deployment Approval Gate

**User Story:** As the owner, I want an explicit approval gate before any production release, so that nothing ships without my sign-off.

#### Acceptance Criteria

1. THE system changes SHALL remain local and uncommitted until explicit approval is given.
2. THE process SHALL NOT merge, push, or deploy any part of this feature without explicit human approval at the Deployment_Approval_Gate.
3. THE Deployment_Approval_Gate SHALL require the insurance validation (Requirement 10) to be complete and reviewed.
4. WHERE the AWS Lambda concurrency support case is unresolved, THE process SHALL treat production release as blocked.
5. WHEN approval is granted, THE process SHALL stage only the specific files belonging to this feature and SHALL NOT stage unrelated changes.
