# Cognito Verification Email → Resend (via CustomEmailSender Lambda)

## Background
We first tried Amazon SES for Cognito's verification/reset codes, but AWS declined
production access for the account (common for newer accounts). Instead we route those
emails through **Resend** — the same provider already sending our signup notifications,
team emails, and cadence emails from `hawkeyecue.com`. No SES, no ~50/day cap, no AWS
approval needed.

## How it works
- Cognito's **CustomEmailSender** trigger fires on signup / resend / forgot-password.
- Cognito encrypts the code with a dedicated **KMS key** and passes it to a Lambda.
- The Lambda (`lambdas/dist/cognito-custom-email`) decrypts it with the AWS Encryption
  SDK and sends a branded email via **Resend** from `no-reply@hawkeyecue.com`.

## What's deployed by CDK (auth-stack.ts)
- `SocialLeadGen-CognitoCustomEmail` Lambda (bundled with `@aws-crypto/client-node`).
- `SocialLeadGen-CognitoCustomEmail` KMS key (`customSenderKmsKey`).
- User pool `lambdaTriggers.customEmailSender` wired to the Lambda.
- Lambda granted: KMS decrypt + Secrets Manager read for `SocialLeadGen/Resend`.

## Requirements / prerequisites
1. **Resend API key** must exist in Secrets Manager as `SocialLeadGen/Resend`
   (key field `RESEND_API_KEY`). This already exists — it's what team/cadence emails use.
2. **`hawkeyecue.com` verified in Resend** as a sending domain (already done — we send
   `notifications@hawkeyecue.com`). `no-reply@hawkeyecue.com` uses the same verified
   domain, so no extra DNS is needed.

## Deploy
Merged to `main` → GitHub Actions runs `cdk deploy`, which creates the KMS key + Lambda
and attaches the trigger to the user pool.

> Note: attaching a `customEmailSender` + `customSenderKmsKey` to an existing user pool
> is an update CDK handles in place. If CloudFormation ever rejects the in-place trigger
> change, the fallback is to set it via the AWS CLI:
> `aws cognito-idp update-user-pool --user-pool-id <id> --lambda-config CustomEmailSender={LambdaVersion=V1_0,LambdaArn=<arn>},KMSKeyID=<key-arn>`

## Verify it works
1. Register a brand-new test account (an email you control).
2. The verification email should arrive **from `no-reply@hawkeyecue.com`** with the
   HawkEye-Cue branding and the 6-digit code.
3. Complete verification and log in.
4. Test **Forgot password** too — same branded sender.

## Rollback
Remove `lambdaTriggers.customEmailSender` + `customSenderKmsKey` from the user pool in
auth-stack.ts and redeploy — Cognito reverts to its built-in email.

## Retry SES later (optional)
Once the AWS account has sending history, SES production access often approves on a
second attempt. Not required — Resend covers production volume fine.
