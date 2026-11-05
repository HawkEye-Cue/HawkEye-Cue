# PR: AI Design Studio (Canva-style editor + AI photo editing + account-backed storage)

## Summary
Upgrades the Create tab's AI image feature into an editable Design Studio:
- Fabric.js canvas editor with templates, Brand Kit, and layer editing (lazy-loaded).
- Automatic image SUGGESTIONS (client-side template matching; no AI cost).
- AI photo editing via OpenAI GPT Image (`gpt-image-1.5`) at `/content/edit-image`.
- Account-backed, cross-device storage for Brand Kit + saved Designs (DynamoDB metadata +
  private S3 via short-lived presigned URLs; non-destructive, idempotent migration from
  the old browser-only localStorage).
- Concurrency-safe AI quotas (atomic reserve/refund) for image generation, image editing,
  and text generation.

## Scope note (read before merging)
This branch (`feat-sales-tracker-ux-phase1-20261027`) is ~83 commits ahead of `main`, which
is a stale integration branch; production has been deployed from this branch in prior
launches. The production `cdk diff` (below) is therefore the authoritative view of what a
deploy changes — NOT `main..HEAD`. A deploy adds only the Design Studio routes + a single
already-coded sales route. See `docs/design-studio-deploy-runbook.md` §1.

## Production changes (additive only; zero removals/replacements)
- Routes: `POST /content/edit-image`; `GET|PUT /brand-kit`; `POST /brand-kit/logo-upload`;
  `GET /designs`; `GET|PUT|DELETE /designs/{id}`; `POST /designs/{id}/upload`.
- `ContentHandlerFn` code update (adds the above handlers + `gpt-image-1.5`).
- Incidental: `POST /sales/deals/{id}/void` route (handler already live in prod).
- No change to EmailOAuthFn / CadenceEmailSenderFn, or any existing Create/Calendar/
  Flocks/posts/sales/team endpoint.

## Safety verification (this session)
- OAuth fail-closed guard: synth ABORTS under `-c pinDriftedAssets=true` if the live
  Google/Microsoft credentials are missing; with them loaded, the two email functions show
  ZERO diff. Credentials are never printed, committed, or placed in the diff.
- AI limits FINALIZED and enforced server-side: Nest 0, Soar 40, Summit 100 / month;
  generations and edits each count 1; manual edits/uploads/resize/text/Brand Kit/suggestions
  are free. Free/unauthenticated calls are blocked (403 / 401).
- One real sandbox AI edit succeeded (trash-can removal; 1024x1024; ~13.5s; ~$0.035);
  quota increments 0->1 on success and refunds to 0 on failure.
- Real media attachment: a finished design uploads to S3 (verified object bytes) and
  persists attached to a scheduled post.
- Flocks workflow (real Chromium): finish design -> Use in Post -> copy image -> clipboard
  holds a pasteable PNG (ready to paste into the Facebook group). 6/6.
- Browser studio validation 67/67 (desktop + mobile + free-plan gating).
- Full test suite: 1049/1049.

## Deploy
See `docs/design-studio-deploy-runbook.md`. Deploy requires `-c pinDriftedAssets=true` with
the live OAuth env loaded, targeting `SocialLeadGen-Api` only. Do not merge or deploy without
explicit owner approval.
