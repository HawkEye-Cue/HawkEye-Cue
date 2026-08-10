'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.TABLE_NAME;

// Google OAuth credentials
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

function ok(body) { return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
function redirect(url) { return { statusCode: 302, headers: { Location: url }, body: '' }; }
function err(status, code, message) { return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: { code, message } }) }; }
function getUserId(event) { return event.requestContext?.authorizer?.jwt?.claims?.sub ?? null; }

/**
 * Email OAuth Handler
 * Manages Gmail/Outlook OAuth flows and sends emails via connected accounts.
 */
exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method ?? event.httpMethod;
    const path = event.requestContext?.http?.path ?? event.path;
    const userId = getUserId(event);

    // GET /email/oauth/google — redirect user to Google consent screen
    if (method === 'GET' && path === '/email/oauth/google') {
      if (!userId) return err(401, 'UNAUTHORIZED', 'Not authenticated');
      const params = event.queryStringParameters || {};
      const redirectUri = params.redirect || 'https://hawkeyecue.com/settings';
      
      // Store the redirect and userId in a state param
      const state = Buffer.from(JSON.stringify({ userId, redirect: redirectUri })).toString('base64');
      
      const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${GOOGLE_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent('https://www.googleapis.com/auth/gmail.send')}` +
        `&access_type=offline` +
        `&prompt=consent` +
        `&state=${state}`;

      return redirect(googleAuthUrl);
    }

    // POST /email/oauth/callback — exchange code for token and store
    if (method === 'POST' && path === '/email/oauth/callback') {
      if (!userId) return err(401, 'UNAUTHORIZED', 'Not authenticated');
      const body = event.body ? JSON.parse(event.body) : {};
      const { provider, code, redirect: redirectUri } = body;

      if (provider === 'google') {
        // Exchange code for tokens
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            code,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri || 'https://hawkeyecue.com/settings',
          }).toString(),
        });

        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) {
          console.error('[email-oauth] Google token exchange failed:', tokenData);
          return err(400, 'TOKEN_EXCHANGE_FAILED', tokenData.error_description || 'Failed to get token from Google');
        }

        // Get user's Gmail address
        let gmailAddress = '';
        try {
          const profileRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
          });
          const profile = await profileRes.json();
          gmailAddress = profile.emailAddress || '';
        } catch { /* ignore */ }

        // Store tokens in DynamoDB
        await dynamo.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: `USER#${userId}`,
            SK: 'EMAIL_OAUTH#google',
            provider: 'google',
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token || null,
            expiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
            emailAddress: gmailAddress,
            connectedAt: new Date().toISOString(),
          },
        }));

        return ok({ connected: true, provider: 'google', email: gmailAddress });
      }

      // Microsoft OAuth would go here (similar pattern)
      if (provider === 'microsoft') {
        // TODO: Implement Microsoft token exchange
        return err(501, 'NOT_IMPLEMENTED', 'Microsoft OAuth coming soon');
      }

      return err(400, 'INVALID_PROVIDER', 'Provider must be google or microsoft');
    }

    // POST /email/send — send an email via connected account
    if (method === 'POST' && path === '/email/send') {
      if (!userId) return err(401, 'UNAUTHORIZED', 'Not authenticated');
      const body = event.body ? JSON.parse(event.body) : {};
      const { to, subject, body: emailBody } = body;

      if (!to || !subject || !emailBody) return err(400, 'INVALID_INPUT', 'to, subject, and body are required');

      // Get stored OAuth tokens
      const tokenResult = await dynamo.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'EMAIL_OAUTH#google' },
      }));
      const tokenRecord = tokenResult.Item;
      if (!tokenRecord) return err(400, 'NOT_CONNECTED', 'No email account connected. Connect Gmail in Settings.');

      let accessToken = tokenRecord.accessToken;

      // Check if token is expired and refresh if needed
      if (tokenRecord.expiresAt && new Date(tokenRecord.expiresAt) < new Date() && tokenRecord.refreshToken) {
        const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            refresh_token: tokenRecord.refreshToken,
            grant_type: 'refresh_token',
          }).toString(),
        });
        const refreshData = await refreshRes.json();
        if (refreshData.access_token) {
          accessToken = refreshData.access_token;
          // Update stored token
          await dynamo.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: { ...tokenRecord, accessToken, expiresAt: new Date(Date.now() + (refreshData.expires_in || 3600) * 1000).toISOString() },
          }));
        } else {
          return err(401, 'TOKEN_EXPIRED', 'Gmail token expired and could not be refreshed. Please reconnect in Settings.');
        }
      }

      // Send email via Gmail API
      const rawEmail = [
        `To: ${to}`,
        `Subject: ${subject}`,
        'Content-Type: text/html; charset=utf-8',
        '',
        emailBody,
      ].join('\r\n');

      const encodedEmail = Buffer.from(rawEmail).toString('base64url');

      const sendRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: encodedEmail }),
      });

      if (!sendRes.ok) {
        const sendErr = await sendRes.text();
        console.error('[email-send] Gmail API error:', sendErr);
        return err(500, 'SEND_FAILED', 'Failed to send email via Gmail');
      }

      const sendResult = await sendRes.json();
      return ok({ sent: true, messageId: sendResult.id });
    }

    // GET /email/status — check if user has a connected email
    if (method === 'GET' && path === '/email/status') {
      if (!userId) return err(401, 'UNAUTHORIZED', 'Not authenticated');
      const tokenResult = await dynamo.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'EMAIL_OAUTH#google' },
      }));
      if (tokenResult.Item) {
        return ok({ connected: true, provider: 'google', email: tokenResult.Item.emailAddress });
      }
      return ok({ connected: false });
    }

    // DELETE /email/disconnect — remove connected email
    if (method === 'DELETE' && path === '/email/disconnect') {
      if (!userId) return err(401, 'UNAUTHORIZED', 'Not authenticated');
      await dynamo.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'EMAIL_OAUTH#google' },
      }));
      return ok({ disconnected: true });
    }

    return err(404, 'NOT_FOUND', `No route for ${method} ${path}`);
  } catch (e) {
    console.error('[email-oauth-handler] Error:', e);
    return err(500, 'INTERNAL_ERROR', e.message || 'An unexpected error occurred');
  }
};
