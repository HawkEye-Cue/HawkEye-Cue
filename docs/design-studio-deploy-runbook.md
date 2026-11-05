# Design Studio — Production Deployment Runbook

Status: PREPARED, NOT DEPLOYED. No merge or deploy without explicit owner approval.
Target: AWS account `971598352824`, region `us-east-1`, stack `SocialLeadGen-Api`.
Branch: `feat-sales-tracker-ux-phase1-20261027`.

---

## 1. Exact production changes (verified via read-only `cdk diff`)

Taken against the LIVE prod stack (not `main`, which is ~83 commits behind prod).
Additive only — **zero resource removals, zero replacements**.

New API routes + their Lambda-invoke permissions (all → existing ContentHandlerFn):
- `POST /content/edit-image`
- `GET /brand-kit`, `PUT /brand-kit`, `POST /brand-kit/logo-upload`
- `GET /designs`, `GET /designs/{id}`, `PUT /designs/{id}`, `DELETE /designs/{id}`, `POST /designs/{id}/upload`

Lambda code update:
- `ContentHandlerFn` — code asset (`.S3Key`) only. No IAM, env, or S3-grant change
  (prod already has MEDIA_BUCKET, the OpenAI secret grant, and mediaBucket.grantReadWrite).
  The image model `gpt-image-1.5` is the code default; no new env var required.

One incidental non-Design-Studio route that also ships (handler code already live in prod):
- `POST /sales/deals/{id}/void` — the sale-void workflow route (route not yet wired in prod).

NOT changed by this deploy (confirmed absent from the diff):
- `EmailOAuthFn`, `CadenceEmailSenderFn` (see §2)
- All existing routes: Create (`/content/generate`, `/content/generate-image`),
  Calendar (`/calendar/*`), Flocks (`/network/*`), posts/scheduling (`/posts/*`),
  sales/team/opportunities/keywords/etc.

## 2. OAuth credential protection (MANDATORY)

`EmailOAuthFn` and `CadenceEmailSenderFn` hold live Google/Microsoft OAuth client id+secret
set out-of-band (NOT in source). A plain deploy would synth empty env and WIPE them.

Guard (already in `api-stack.ts`): with `-c pinDriftedAssets=true`, the synth THROWS if any of
the four OAuth values is missing from the deploy shell — fail-closed, verified this session:
- Without creds + `pinDriftedAssets=true` → synth aborts: "Refusing to synth empty OAuth env".
- With the four live values loaded into the shell → the final change set shows NO changes to
  EmailOAuthFn/CadenceEmailSenderFn (verified: they do not appear in the diff at all).

Load the live values transiently from the running Lambda (never printed, never committed):
```powershell
$cfg = aws lambda get-function-configuration --function-name SocialLeadGen-EmailOAuth `
  --query "Environment.Variables" --output json | ConvertFrom-Json
$env:GOOGLE_CLIENT_ID=$cfg.GOOGLE_CLIENT_ID; $env:GOOGLE_CLIENT_SECRET=$cfg.GOOGLE_CLIENT_SECRET
$env:MICROSOFT_CLIENT_ID=$cfg.MICROSOFT_CLIENT_ID; $env:MICROSOFT_CLIENT_SECRET=$cfg.MICROSOFT_CLIENT_SECRET
```

## 3. AI image limits (FINALIZED)

- Nest (free): 0 — no paid AI image generation/editing (server denies: 403 AI_IMAGE_REQUIRES_PAID_PLAN).
- Soar: 40 / month. Summit: 100 / month (stored tier 'summit' normalizes to 'team').
- Generations and edits each count as 1 against the monthly image counter (aiImagesUsed/aiImagesMonth).
- Manual template editing, uploads, resizing, text changes, Brand Kit, and image SUGGESTIONS
  are unlimited and never consume an image credit (they never call the AI handler).
Enforced in `lambdas/dist/content-handler/index.js`: `AI_IMAGE_MONTHLY_LIMITS = { soar: 40, team: 100 }`.

## 4. Pre-deploy checklist

- [ ] Owner approval to MERGE and to DEPLOY (explicit).
- [ ] On the deploy branch; `pnpm test` green (1049/1049).
- [ ] Load the 4 live OAuth env values into the deploy shell (§2).
- [ ] Confirm prod OpenAI project exposes `gpt-image-1.5` (verified read-only this session).
- [ ] Dry-run: `cdk diff SocialLeadGen-Api -c pinDriftedAssets=true` — confirm ONLY the
      §1 changes, zero removals, and NO EmailOAuthFn/CadenceEmailSenderFn changes.

## 5. Deploy

```powershell
# from packages/cdk, with the 4 OAuth env values loaded (§2):
npx cdk deploy SocialLeadGen-Api -c pinDriftedAssets=true
```
- Review the change set summary before confirming: it must match §1 exactly.
- If the synth throws the OAuth guard error, STOP and load the credentials (§2); do not bypass.

## 6. Post-deploy smoke tests (paid test account)

1. Create a post, open Design Studio, see automatic image suggestions (no credit spent).
2. Upload a photo, Ask Wingman to edit it → real edit returns; quota increments by 1.
3. Save the design → reopen on a second device/session → still editable.
4. Use in Post → schedule the post → confirm the media attaches and persists on the post.
5. Flocks: Use in Post → Copy image → paste into a Facebook group (clipboard carries a PNG).
6. Regression: Create generate, Calendar view, Flocks list, scheduling all work.
7. Free/Nest account: AI edit is gated (403) with an upgrade message; manual edits still work.

## 7. Rollback

- Change is additive (new routes + Lambda code). Rollback = redeploy the previous
  `SocialLeadGen-Api` revision (CloudFormation retains it) or point ContentHandlerFn back to
  the prior code asset S3 key.
- No destructive data migration: cloud storage is new per-user data; the client migration is
  non-destructive and idempotent and never deletes local designs/Brand Kits.
- OAuth functions are untouched, so rollback has no effect on email integration.

## 8. Risk summary

- Email OAuth: HIGH if the guard is bypassed; MITIGATED by fail-closed `pinDriftedAssets`.
- Create / Calendar / Flocks / subscriptions / saved work: LOW — additive only; existing
  endpoints and data unchanged (verified live + in the diff).
- AI cost: bounded — ~$0.035/edit (measured), capped at 40/mo (Soar) and 100/mo (Summit);
  failed/over-limit requests refund and cost nothing.
