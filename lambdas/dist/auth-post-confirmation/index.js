'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const secretsClient = new SecretsManagerClient({});
const TABLE_NAME = process.env.TABLE_NAME;
const FROM_EMAIL = 'HawkEye-Cue <notifications@hawkeyecue.com>';
const NOTIFY_TO = ['briannafrashier@gmail.com', 'rmfrashier888@gmail.com'];

// ─── Resend Email Helper ──────────────────────────────────────────────────────
let resendApiKey = null;
async function getResendKey() {
  if (resendApiKey) return resendApiKey;
  const result = await secretsClient.send(new GetSecretValueCommand({ SecretId: 'SocialLeadGen/Resend' }));
  const secret = JSON.parse(result.SecretString);
  resendApiKey = secret.RESEND_API_KEY;
  return resendApiKey;
}

async function sendEmail(to, subject, text) {
  const apiKey = await getResendKey();
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: Array.isArray(to) ? to : [to], subject, text }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Resend error (${response.status}): ${err}`);
  }
  return response.json();
}

/**
 * Cognito Post-Confirmation Trigger
 * Creates a user profile record in DynamoDB when a user confirms their account.
 * Sends an email notification to the admin.
 */
exports.handler = async (event) => {
  console.log('Post-confirmation trigger fired for:', event.userName);

  const { sub, email } = event.request.userAttributes;

  if (!sub || !email) {
    console.error('Missing sub or email in user attributes');
    return event;
  }

  try {
    const now = new Date().toISOString();

    await dynamo.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `USER#${sub}`,
          SK: 'PROFILE',
          userId: sub,
          email,
          createdAt: now,
          subscriptionTier: 'soar',
          subscriptionStatus: 'trial',
          trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          aiGenerationsUsed: 0,
          selectedTradeId: null,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      })
    );

    console.log(`Created user profile for ${email} (${sub}) with 7-day Soar trial`);

    // Send notification email to admin
    try {
      await sendEmail(NOTIFY_TO, `🦅 New HawkEye-Cue Signup: ${email}`, `A new user just signed up for HawkEye-Cue!\n\nEmail: ${email}\nUser ID: ${sub}\nAccount: Soar (7-day free trial)\nTime: ${now}\n\n— HawkEye-Cue`);
      console.log('Admin notification sent');
    } catch (emailErr) {
      console.error('Failed to send admin notification (non-fatal):', emailErr.message);
    }
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') {
      console.log(`User profile already exists for ${sub}, skipping`);
    } else {
      console.error('Failed to create user profile:', e);
    }
  }

  return event;
};
