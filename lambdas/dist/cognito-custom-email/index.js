'use strict';

/**
 * Cognito CustomEmailSender trigger.
 *
 * Cognito hands us the verification/reset code ENCRYPTED (base64) using a KMS
 * key. We decrypt it with the AWS Encryption SDK, then send a branded email via
 * Resend from our verified hawkeyecue.com domain — bypassing Cognito's ~50/day
 * built-in email cap and SES entirely.
 *
 * Trigger sources we handle:
 *  - CustomEmailSender_SignUp            (verification code at signup)
 *  - CustomEmailSender_ResendCode        (user requested a new code)
 *  - CustomEmailSender_ForgotPassword    (password reset code)
 *  - CustomEmailSender_UpdateUserAttribute / VerifyUserAttribute (email change)
 */

const { buildClient, CommitmentPolicy, KmsKeyringNode } = require('@aws-crypto/client-node');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const { decrypt } = buildClient(CommitmentPolicy.REQUIRE_ENCRYPT_ALLOW_DECRYPT);

const KEY_ARN = process.env.KMS_KEY_ARN;
const FROM_EMAIL = process.env.FROM_EMAIL || 'HawkEye-Cue <no-reply@hawkeyecue.com>';

const secretsClient = new SecretsManagerClient({});
let resendApiKey = null;
async function getResendKey() {
  if (resendApiKey) return resendApiKey;
  const result = await secretsClient.send(new GetSecretValueCommand({ SecretId: 'SocialLeadGen/Resend' }));
  const secret = JSON.parse(result.SecretString);
  resendApiKey = secret.RESEND_API_KEY;
  return resendApiKey;
}

async function sendEmail(to, subject, html) {
  const apiKey = await getResendKey();
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: Array.isArray(to) ? to : [to], subject, html }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Resend error (${response.status}): ${err}`);
  }
  return response.json();
}

// Decrypt the code Cognito encrypted with our KMS key
async function decryptCode(encrypted) {
  if (!encrypted) return null;
  const keyring = new KmsKeyringNode({ generatorKeyId: KEY_ARN });
  const { plaintext } = await decrypt(keyring, Buffer.from(encrypted, 'base64'));
  return plaintext.toString('utf-8');
}

function codeEmailHtml(code, heading, intro) {
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0f172a;border-radius:16px;">
    <div style="text-align:center;margin-bottom:16px;">
      <span style="font-size:32px;">🦅</span>
      <h1 style="color:#facc15;font-size:20px;margin:8px 0 0 0;letter-spacing:1px;">HAWKEYE-CUE</h1>
    </div>
    <h2 style="color:#ffffff;font-size:18px;margin:0 0 8px 0;text-align:center;">${heading}</h2>
    <p style="color:#94a3b8;font-size:14px;line-height:1.5;text-align:center;margin:0 0 20px 0;">${intro}</p>
    <div style="background:#1e293b;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:20px;text-align:center;margin-bottom:20px;">
      <span style="color:#ffffff;font-size:32px;font-weight:800;letter-spacing:8px;">${code}</span>
    </div>
    <p style="color:#64748b;font-size:12px;line-height:1.5;text-align:center;margin:0;">This code expires shortly. If you didn't request it, you can safely ignore this email.</p>
  </div>`;
}

exports.handler = async (event) => {
  const trigger = event.triggerSource;
  const email = event.request?.userAttributes?.email;
  const encryptedCode = event.request?.code;

  if (!email) {
    console.error('[custom-email] No email attribute present; skipping.');
    return event;
  }

  let code;
  try {
    code = await decryptCode(encryptedCode);
  } catch (e) {
    console.error('[custom-email] Failed to decrypt code:', e.message);
    // Never throw — a thrown error blocks the user's signup/reset entirely.
    return event;
  }
  if (!code) return event;

  try {
    if (trigger === 'CustomEmailSender_ForgotPassword') {
      await sendEmail(email, '🦅 Reset your HawkEye-Cue password',
        codeEmailHtml(code, 'Reset your password', 'Use this code to reset your HawkEye-Cue password.'));
    } else if (trigger === 'CustomEmailSender_UpdateUserAttribute' || trigger === 'CustomEmailSender_VerifyUserAttribute') {
      await sendEmail(email, '🦅 Verify your email for HawkEye-Cue',
        codeEmailHtml(code, 'Verify your email', 'Use this code to confirm your email change.'));
    } else {
      // SignUp + ResendCode
      await sendEmail(email, '🦅 Verify your HawkEye-Cue account',
        codeEmailHtml(code, 'Welcome to HawkEye-Cue!', 'Enter this code to verify your account and start finding opportunities.'));
    }
    console.log(`[custom-email] Sent ${trigger} email to ${email}`);
  } catch (e) {
    console.error('[custom-email] Failed to send email:', e.message);
  }

  return event;
};
