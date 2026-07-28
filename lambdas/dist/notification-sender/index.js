'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sns = new SNSClient({});
const secretsClient = new SecretsManagerClient({});
const TABLE_NAME = process.env.TABLE_NAME;
const FROM_EMAIL = 'HawkEye-Cue <notifications@hawkeyecue.com>';

// ─── Resend Email Helper ──────────────────────────────────────────────────────
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
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: Array.isArray(to) ? to : [to], subject, html }),
  });
  if (!response.ok) {
    const err = await response.text();
    console.error(`[sendEmail] Resend error (${response.status}): ${err}`);
  }
  return response.ok;
}

/**
 * DynamoDB Stream-triggered Lambda
 * Fires when a new opportunity (OPP#) is inserted.
 * Sends push notifications AND email to the user.
 */
exports.handler = async (event) => {
  for (const record of event.Records) {
    if (record.eventName !== 'INSERT') continue;

    const newImage = record.dynamodb?.NewImage;
    if (!newImage) continue;

    // Extract user ID from PK (USER#<sub>)
    const pk = newImage.PK?.S;
    if (!pk || !pk.startsWith('USER#')) continue;

    const userId = pk.replace('USER#', '');
    const sk = newImage.SK?.S || '';

    // Only process new opportunities (OPP#)
    if (!sk.startsWith('OPP#')) continue;

    const keyword = newImage.keyword?.S || newImage.keywordId?.S || 'a keyword';
    const platform = newImage.sourcePlatform?.S || 'social media';
    const authorName = newImage.sourceAuthor?.S || 'Someone';

    // ─── Send Email Notification ──────────────────────────────────────────
    try {
      // Get user profile for email + notification preferences
      const profileResult = await dynamo.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
      }));
      const profile = profileResult.Item;
      const userEmail = profile?.email;

      // Check if user has email notifications enabled for new leads
      const emailNotifs = profile?.emailNotifications || {};
      const newLeadEnabled = emailNotifs.newLead !== false; // default: on

      if (userEmail && newLeadEnabled) {
        const subject = `🦅 New Lead Detected: ${authorName}`;
        const html = `
          <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
            <h2 style="color:#1e40af;margin:0 0 16px 0;">🦅 New Lead Detected</h2>
            <div style="background:#f1f5f9;border-radius:12px;padding:16px;margin-bottom:16px;">
              <p style="margin:0 0 8px 0;font-size:14px;"><strong>Name:</strong> ${authorName}</p>
              <p style="margin:0 0 8px 0;font-size:14px;"><strong>Platform:</strong> ${platform}</p>
              <p style="margin:0;font-size:14px;"><strong>Keyword:</strong> ${keyword}</p>
            </div>
            <p style="font-size:13px;color:#64748b;margin:0 0 16px 0;">This lead was saved to your Leads tab on HawkEye-Cue.</p>
            <a href="https://hawkeyecue.com/opportunities" style="display:inline-block;background:#1e40af;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">View Lead →</a>
            <p style="font-size:11px;color:#94a3b8;margin:16px 0 0 0;">To manage notifications, go to Settings → Email Notifications on HawkEye-Cue.</p>
          </div>
        `;
        await sendEmail(userEmail, subject, html);
        console.log(`[notification-sender] Email sent to ${userEmail} for new lead: ${authorName}`);
      }
    } catch (e) {
      console.error(`[notification-sender] Failed to send email for user ${userId}:`, e);
    }

    // ─── Send Push Notifications (existing) ───────────────────────────────
    let devices = [];
    try {
      const result = await dynamo.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':sk': 'DEVICE#',
          },
        })
      );
      devices = result.Items || [];
    } catch (e) {
      console.error(`Failed to query devices for user ${userId}:`, e);
      continue;
    }

    for (const device of devices) {
      if (!device.endpointArn) continue;
      if (device.preferences?.opportunitiesEnabled === false) continue;

      const message = JSON.stringify({
        default: `New lead detected on ${platform}: ${authorName}`,
        GCM: JSON.stringify({
          notification: {
            title: '🦅 New Lead Detected',
            body: `${authorName} on ${platform} matched your keyword "${keyword}"`,
          },
        }),
        APNS: JSON.stringify({
          aps: {
            alert: {
              title: '🦅 New Lead Detected',
              body: `${authorName} on ${platform} matched your keyword "${keyword}"`,
            },
            sound: 'default',
            badge: 1,
          },
        }),
      });

      try {
        await sns.send(
          new PublishCommand({
            TargetArn: device.endpointArn,
            Message: message,
            MessageStructure: 'json',
          })
        );
        console.log(`Notification sent to device ${device.deviceId} for user ${userId}`);
      } catch (e) {
        console.error(`Failed to send notification to ${device.deviceId}:`, e);
      }
    }
  }

  return { statusCode: 200 };
};
