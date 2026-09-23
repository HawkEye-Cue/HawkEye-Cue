# Cognito Verification Email → Amazon SES (production email)

## Why
Cognito's built-in email (current setup) is capped at ~50 emails/day and sends from
a generic address. Moving verification/password-reset codes to SES with the
`hawkeyecue.com` domain lifts the cap and brands the sender as `no-reply@hawkeyecue.com`.

**The code is already prepped and deploy-safe.** Until you set the `COGNITO_SES_EMAIL`
GitHub secret, deploys keep using the built-in Cognito email, so nothing breaks.

---

## One-time setup (AWS console — needs your access)

All steps in region **us-east-1** (same as the rest of the app).

### 1. Verify the domain in SES
1. AWS Console → **Amazon SES** → **Configuration → Identities** → **Create identity**.
2. Choose **Domain**, enter `hawkeyecue.com`.
3. Enable **Easy DKIM** (recommended). SES gives you CNAME records.
4. Add the CNAME records to your domain's DNS (same place Resend's records live).
5. Wait for status to become **Verified** (minutes to a few hours).

> You already send from `notifications@hawkeyecue.com` via Resend, so the domain's
> DNS is largely set up — you're just adding SES's DKIM records alongside it.

### 2. Request production access (leave the SES sandbox)
1. SES → **Account dashboard** → **Request production access**.
2. Fill in the use case (transactional signup verification emails for your app).
3. Approval is usually quick (hours to ~1 day). Until approved, SES only sends to
   verified addresses — same limitation as before, so don't flip the switch until
   this shows **Production**.

### 3. Add the GitHub secret
Repo → **Settings → Secrets and variables → Actions → New repository secret**:
- Name: `COGNITO_SES_EMAIL`
- Value: `no-reply@hawkeyecue.com`

Optional secrets (sensible defaults if omitted):
- `COGNITO_SES_REPLY_TO` — defaults to the same address.
- `COGNITO_SES_REGION` — defaults to the stack region (us-east-1).

### 4. Deploy
Push any commit to `main` (or re-run the latest deploy). GitHub Actions runs
`cdk deploy`, which flips Cognito to SES because the secret is now set.

### 5. Verify it works
1. Register a brand-new test account (an email you control, not the two admin ones).
2. Confirm the code email arrives **from `no-reply@hawkeyecue.com`** with the
   HawkEye-Cue subject.
3. Complete verification and log in.

---

## Rollback
If anything looks wrong, delete the `COGNITO_SES_EMAIL` secret and re-deploy — Cognito
falls back to the built-in email automatically. No code change required.

## Notes
- SES also needs permission to be used by Cognito. When you use a domain identity
  that you own in the same account/region, Cognito can send through it after the
  `withSES` config is applied. If AWS asks for an identity policy, allow the
  `cognito-idp.amazonaws.com` service to `ses:SendEmail` / `ses:SendRawEmail` on the
  identity ARN.
- The verification email copy is already branded ("🦅 Verify your HawkEye-Cue account").
