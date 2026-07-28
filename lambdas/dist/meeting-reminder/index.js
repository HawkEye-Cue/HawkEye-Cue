'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const secretsClient = new SecretsManagerClient({});
const TABLE_NAME = process.env.TABLE_NAME;
const FROM_EMAIL = 'HawkEye-Cue <notifications@hawkeyecue.com>';

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
 * Meeting Reminder Lambda — runs every 5 minutes via EventBridge.
 * Checks all users for meetings starting in the next 15 minutes.
 * Sends email reminder if user has meetingReminder enabled.
 */
exports.handler = async () => {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const currentHour = now.getUTCHours();
  const currentMin = now.getUTCMinutes();

  // We'll check for meetings in the 10-20 minute window (to avoid duplicates on 5-min interval)
  const reminderWindowStart = currentMin + 10;
  const reminderWindowEnd = currentMin + 20;

  let emailsSent = 0;

  try {
    // Scan all profiles
    let lastKey = undefined;
    const profiles = [];
    do {
      const scanResult = await dynamo.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'SK = :sk',
        ExpressionAttributeValues: { ':sk': 'PROFILE' },
        ExclusiveStartKey: lastKey,
      }));
      profiles.push(...(scanResult.Items || []));
      lastKey = scanResult.LastEvaluatedKey;
    } while (lastKey);

    for (const profile of profiles) {
      const userId = profile.PK.replace('USER#', '');
      const email = profile.email;
      if (!email) continue;

      const emailNotifs = profile.emailNotifications || {};
      if (emailNotifs.meetingReminder === false) continue;

      // Get today's calendar events
      try {
        const calResult = await dynamo.send(new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': `CAL#${today}` },
        }));
        const events = calResult.Items || [];
        const meetings = events.filter((e) => e.eventType === 'meeting' && !e.completed);

        for (const meeting of meetings) {
          // Parse time from title: [HH:MM] Title
          const timeMatch = (meeting.title || '').match(/^\[(\d{1,2}):(\d{2})\]/);
          if (!timeMatch) continue;

          const meetingHour = parseInt(timeMatch[1]);
          const meetingMin = parseInt(timeMatch[2]);

          // Convert to UTC for comparison (assume user is in US Mountain Time, UTC-6)
          // This is a simplification — in production you'd store user timezone
          const meetingUtcHour = (meetingHour + 6) % 24;

          // Check if meeting is in the reminder window (15 min from now)
          if (meetingUtcHour === currentHour) {
            if (meetingMin >= reminderWindowStart && meetingMin < reminderWindowEnd) {
              const cleanTitle = meeting.title.replace(/^\[\d{1,2}:\d{2}\]\s*/, '');
              const timeLabel = meetingHour >= 12 ? `${meetingHour === 12 ? 12 : meetingHour - 12}:${String(meetingMin).padStart(2, '0')} PM` : `${meetingHour}:${String(meetingMin).padStart(2, '0')} AM`;

              const subject = `🤝 Meeting in 15 min: ${cleanTitle}`;
              const html = `
                <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
                  <h2 style="color:#d97706;margin:0 0 16px 0;">🤝 Meeting Reminder</h2>
                  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:16px;margin-bottom:16px;">
                    <p style="margin:0 0 8px 0;font-size:16px;font-weight:600;color:#92400e;">${cleanTitle}</p>
                    <p style="margin:0;font-size:14px;color:#78350f;">⏰ ${timeLabel} today</p>
                  </div>
                  ${meeting.link ? `<a href="${meeting.link}" style="display:inline-block;background:#d97706;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Join Meeting →</a>` : '<a href="https://hawkeyecue.com/" style="display:inline-block;background:#1e40af;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Open HawkEye-Cue →</a>'}
                  <p style="font-size:11px;color:#94a3b8;margin:16px 0 0 0;">Manage notifications in Settings → Email Notifications.</p>
                </div>
              `;
              await sendEmail(email, subject, html);
              emailsSent++;
            }
          }
        }
      } catch (e) {
        console.error(`[meeting-reminder] Error for user ${userId}:`, e.message);
      }
    }

    console.log(`Meeting reminders sent: ${emailsSent}`);
    return { statusCode: 200, body: `Sent ${emailsSent} meeting reminders` };
  } catch (e) {
    console.error('[meeting-reminder] Error:', e);
    return { statusCode: 500, body: e.message };
  }
};
