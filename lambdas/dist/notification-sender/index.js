'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sns = new SNSClient({});
const TABLE_NAME = process.env.TABLE_NAME;

/**
 * DynamoDB Stream-triggered Lambda
 * Fires when a new opportunity (OPP#) is inserted.
 * Sends push notifications to the user's registered devices.
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
    const keyword = newImage.keyword?.S || newImage.keywordId?.S || 'a keyword';
    const platform = newImage.sourcePlatform?.S || 'social media';

    // Get user's devices
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

    // Send push to each device that has notifications enabled
    for (const device of devices) {
      if (!device.endpointArn) continue;
      if (device.preferences?.opportunitiesEnabled === false) continue;

      const message = JSON.stringify({
        default: `New lead detected on ${platform} matching "${keyword}"`,
        GCM: JSON.stringify({
          notification: {
            title: '🦅 New Lead Detected',
            body: `Someone on ${platform} matched your keyword "${keyword}"`,
          },
        }),
        APNS: JSON.stringify({
          aps: {
            alert: {
              title: '🦅 New Lead Detected',
              body: `Someone on ${platform} matched your keyword "${keyword}"`,
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
