'use strict';

const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const sns = new SNSClient({});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const secretsClient = new SecretsManagerClient({});

const TABLE_NAME = process.env.TABLE_NAME;
const FROM_EMAIL = 'HawkEye-Cue <noreply@hawkeyecue.com>';

// ─── Resend Email Helper ──────────────────────────────────────────────────────
let resendApiKey = null;
async function getResendKey() {
  if (resendApiKey) return resendApiKey;
  const result = await secretsClient.send(new GetSecretValueCommand({ SecretId: 'SocialLeadGen/Resend' }));
  const secret = JSON.parse(result.SecretString);
  resendApiKey = secret.RESEND_API_KEY;
  return resendApiKey;
}

async function sendEmail(to, subject, text, html) {
  const apiKey = await getResendKey();
  const payload = { from: FROM_EMAIL, to: Array.isArray(to) ? to : [to], subject, text };
  if (html) payload.html = html;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Resend error (${response.status}): ${err}`);
  }
  return response.json();
}

/**
 * Cognito Create Auth Challenge trigger.
 * Generates a 6-digit code and sends it via email or SMS based on user preference.
 */
exports.handler = async (event) => {
  // Only handle CUSTOM_CHALLENGE
  if (event.request.challengeName !== 'CUSTOM_CHALLENGE') {
    return event;
  }

  const userId = event.request.userAttributes.sub;
  const email = event.request.userAttributes.email;

  // Generate 6-digit code
  const code = String(Math.floor(100000 + Math.random() * 900000));

  // Check user preference for MFA delivery (default: email)
  let mfaMethod = 'email';
  let phoneNumber = event.request.userAttributes.phone_number || null;

  try {
    const userRecord = await dynamo.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
      })
    );
    if (userRecord.Item?.mfaMethod === 'sms' && phoneNumber) {
      mfaMethod = 'sms';
    }
  } catch (e) {
    console.log('Could not fetch user preference, defaulting to email:', e.message);
  }

  // Send the code
  if (mfaMethod === 'sms' && phoneNumber) {
    try {
      await sns.send(
        new PublishCommand({
          PhoneNumber: phoneNumber,
          Message: `Your HawkEye-Cue verification code is: ${code}`,
        })
      );
      console.log(`MFA code sent via SMS to ${phoneNumber} for user ${userId}`);
    } catch (e) {
      console.error('SMS send failed, falling back to email:', e.message);
      mfaMethod = 'email';
    }
  }

  if (mfaMethod === 'email') {
    try {
      await sendEmail(
        email,
        'Your HawkEye-Cue Login Code',
        `Your verification code is: ${code}\n\nThis code expires in 5 minutes.`,
        `<div style="font-family: sans-serif; padding: 20px;">
          <h2 style="color: #2563eb;">HawkEye-Cue</h2>
          <p>Your verification code is:</p>
          <h1 style="letter-spacing: 8px; font-size: 36px; color: #1e293b;">${code}</h1>
          <p style="color: #64748b;">This code expires in 5 minutes.</p>
        </div>`
      );
      console.log(`MFA code sent via email to ${email} for user ${userId}`);
    } catch (e) {
      console.error('Email send failed:', e.message);
      // Still set the challenge so the user can retry
    }
  }

  // Set challenge parameters
  event.response.publicChallengeParameters = {
    mfaMethod,
    deliveredTo: mfaMethod === 'sms' ? phoneNumber.replace(/.(?=.{4})/g, '*') : email.replace(/(.{2})(.*)(@.*)/, '$1***$3'),
  };
  event.response.privateChallengeParameters = { code };
  event.response.challengeMetadata = `MFA-CODE-${code}`;

  return event;
};
