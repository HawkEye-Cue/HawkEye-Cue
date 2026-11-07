# Implementation Plan: Canva-Style Automatic Design Integration

## Overview

The Canva design engine and its Create wiring are already built and typecheck clean, and desktop
E2E passed. This plan closes the remaining gaps (mobile E2E, fallback confirmation, draft/
schedule/publish validation, full suite + typecheck), adds three property tests that lock the
hard constraints, handles dev-prototype housekeeping, and defines the explicit deployment
approval gate plus the deferred controlled rollout. It deliberately avoids rebuilding working
code. Insurance-only; all other 56 trades keep their existing templates. Web only.

> **Status-aware plan.** The engine (`apps/web/src/lib/canvaDesigns/`) and the Create wiring are
> already built and typecheck clean; desktop E2E passed. This plan therefore focuses on
> **verification, closing the open gaps, adding the three property tests, and the controlled
> rollout + approval gate** — NOT on rebuilding working code. Insurance-only; other 56 trades
> keep their existing templates. Web only.

## Scope guardrails (apply to every task)

- Do NOT modify `DesignStudio.tsx`, media upload, scheduling, posting, drafts, or tier gating. (Req 2, 5, 7, 10)
- Do NOT change the existing template suggestion path for non-insurance trades. (Req 2)
- Do NOT invent business identity; empty Brand Kit fields stay omitted. (Req 3)
- Keep all Canva operations client-side, free, zero AI credits. (Req 7)
- Keep this work separate from `create-tab-redesign`. (per spec)
- Keep everything local/uncommitted; no merge/push/deploy before the approval gate. (Req 12)
- Prefer verifying/adjusting existing files over new abstractions.

## Tasks

- [x] 1. Lock the engine contract with property tests (shared, pure logic)
  - [x]* 1.1 Property test: no invented business identity
    - Create `apps/web/src/lib/canvaDesigns/__tests__/identity.property.test.ts`
    - **Property 1:** for any caption and any Brand Kit, every rendered brand string equals the Brand Kit value or is absent; empty kit → no brand/phone/logo layer; default color never applied as accent
    - fast-check ≥ 100 iterations; tag `// Feature: canva-style-design-integration, Property 1: No invented business identity`
    - _Requirements: 3_

  - [x]* 1.2 Property test: full caption preserved
    - Create `apps/web/src/lib/canvaDesigns/__tests__/caption.property.test.ts`
    - **Property 2:** for any caption, composed layers carry the full caption verbatim; any shortened display string is flagged (`imageShowsSummary`/`excerpt`); no caption text lost
    - fast-check ≥ 100 iterations; tag `// Feature: canva-style-design-integration, Property 2: Full caption is always preserved`
    - _Requirements: 4_

  - [x]* 1.3 Property test: trade gate is exact
    - Create `apps/web/src/lib/canvaDesigns/__tests__/gate.property.test.ts`
    - **Property 3:** `buildCanvaSpecs` returns three specs only for a Canva_Trade with non-empty caption; `null` otherwise
    - fast-check ≥ 100 iterations; tag `// Feature: canva-style-design-integration, Property 3: Trade gate is exact`
    - _Requirements: 1, 2, 11_

- [x] 2. Verify style distinctness and copy sourcing (unit)
  - [x] 2.1 Assert three genuinely distinct styles
    - Add/confirm a unit test that `buildInsuranceSpecs` returns one `photo`, one `illustrated`, one `editorial`, differing in layer structure (not just color)
    - _Requirements: 1_

  - [x] 2.2 Assert copy comes only from caption/Brand Kit
    - Confirm headline/sub/chips/CTA derive from the caption via `composeTemplate.ts`; `chipsFromCaption` emits only phrases present in the caption; `brandBlock` omits empty fields
    - _Requirements: 3, 4_

- [x] 3. Verify strip rendering, fallback, and summary notice (component)
  - [x] 3.1 Canva branch + caption-summary note
    - Confirm `ImageSuggestions` renders Canva cards with `data-canva="1"`, "Use This Design"/"Customize", and shows `caption-summary-note` only when a card summarizes
    - _Requirements: 2, 4, 9_

  - [x] 3.2 Fallback behavior
    - Confirm a non-insurance trade never produces Canva cards (templates shown) and that a forced compose failure clears Canva cards and shows templates
    - _Requirements: 2_

- [x] 4. Verify editability, photo frames, and reopen (integration)
  - [x] 4.1 Open in unmodified Studio with editable layers
    - Confirm `composeSpecToDocument(...).toDocument()` opens in the existing Studio with individually editable layers tagged with role/frame/mask, and that save→reopen preserves crop/mask/role and `fullCaption`
    - _Requirements: 4, 5_

  - [x] 4.2 Photo replacement preserves frame/crop
    - Confirm replacing a photo in a Photo_Frame keeps shape/mask and re-fits to the focal point for rect/rounded/arch/circle
    - _Requirements: 6_

- [x] 5. Confirm credit-free, client-side guarantee
  - [x] 5.1 Zero network / zero AI
    - Add/confirm a test (or instrument the E2E) asserting compose/preview/edit perform no network request and no AI call, and that AI image credits are untouched
    - _Requirements: 7_

- [x] 6. Setup Guide overlap fix (verify)
  - [x] 6.1 Collapsed on /create, no obstruction
    - Confirm `SetupWizard` starts collapsed on `/create` and does not overlap the composer or gallery on desktop or mobile
    - _Requirements: 9_

- [x] 7. Asset compliance check (Req 8)
  - [x] 7.1 License manifest + production-safe imagery
    - Confirm `assets/photos/LICENSES.json` documents source+license for every shipped photo; confirm no identifiable private-property/people images ship; confirm each font ships its license
    - _Requirements: 8_

- [x] 8. Authenticated end-to-end validation (desktop + mobile)
  - [x] 8.1 Re-run mobile E2E to green
    - Re-run `scripts/e2e-insurance-canva.mjs` against the staging dev server (localhost:5173) with the robust "Write" button handling; capture results to a file
    - _Requirements: 10_

  - [x] 8.2 Draft save/reopen and schedule/publish with a Canva design
    - Through the existing Create workflow: select a design, customize in Studio, save as draft, reopen with the design intact, then schedule and publish; confirm no auto-posting
    - _Requirements: 10_

  - [x] 8.3 Record the validation review page
    - Produce/refresh the review HTML under `suggestions-validation/` summarizing desktop + mobile results, fallback confirmation, and the zero-credit confirmation
    - _Requirements: 10_

- [x] 9. Full verification sweep
  - [x] 9.1 Suite + typecheck
    - Run the focused web test suite and `npx tsc --noEmit -p apps/web`; fix any regressions; confirm no existing localStorage keys, drafts, or designs are altered by this feature
    - _Requirements: 2, 5, 7, 10_

- [x] 10. Dev prototype disposition (housekeeping)
  - [x] 10.1 Decide and apply disposition of `apps/web/src/dev/canva/`
    - Confirm the dev prototype tree (roofing/realEstate/harness/registry) is excluded from the production bundle; either keep it dev-only with a clear marker or remove it — without touching the shipping `lib/canvaDesigns` path
    - _Requirements: 2_

- [x] 11. Deployment approval gate (explicit)
  - [x] 11.1 Hold for explicit approval
    - Keep all changes local/uncommitted; do NOT merge/push/deploy; gate requires Tasks 8–9 complete and reviewed; while the AWS Lambda concurrency case is open, treat production release as blocked
    - On approval only, stage ONLY this feature's files (never `git add .`, never stage `sandbox-stack.ts`)
    - _Requirements: 12_

- [ ] 12. Controlled rollout beyond insurance (DEFERRED until insurance approved)
  - [~] 12.1 Phase batches reusing the engine
    - After insurance approval, expand the Canva_Trade set in bounded batches (10–12 polished categories first, then the rest with fallbacks), adding each batch's style inputs and re-running Tasks 2–9 per batch; untouched trades keep templates
    - _Requirements: 11_

## Notes

- `*` tasks are property-based tests (strongly recommended; they encode the user's hard constraints).
- No new persisted data models; the engine emits a standard `DesignDocument`.
- The engine already supports the structure needed for all 57 trades; only the Canva_Trade gate
  and per-batch style inputs change during rollout (Req 11) — no engine rework.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "2.1", "2.2", "3.1", "3.2", "7.1"] },
    { "id": 1, "tasks": ["4.1", "4.2", "5.1", "6.1", "10.1"] },
    { "id": 2, "tasks": ["8.1", "8.2"] },
    { "id": 3, "tasks": ["8.3", "9.1"] },
    { "id": 4, "tasks": ["11.1"] },
    { "id": 5, "tasks": ["12.1"] }
  ]
}
```
