'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.TABLE_NAME;

// Google OAuth credentials
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// Microsoft OAuth credentials
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;

function ok(body) { return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
function redirect(url) { return { statusCode: 302, headers: { Location: url }, body: '' }; }
function err(status, code, message) { return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: { code, message } }) }; }
function getUserId(event) { return event.requestContext?.authorizer?.jwt?.claims?.sub ?? null; }

/**
 * Email OAuth Handler
 * Manages Gmail/Outlook OAuth flows and sends emails via connected accounts.
 * Supports: Google (Gmail API) and Microsoft (Graph API sendMail)
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

    // GET /email/oauth/microsoft — redirect user to Microsoft consent screen
    if (method === 'GET' && path === '/email/oauth/microsoft') {
      if (!userId) return err(401, 'UNAUTHORIZED', 'Not authenticated');
      const params = event.queryStringParameters || {};
      const redirectUri = params.redirect || 'https://hawkeyecue.com/settings';

      const state = Buffer.from(JSON.stringify({ userId, redirect: redirectUri })).toString('base64');

      const msAuthUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
        `client_id=${MICROSOFT_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent('openid profile email Mail.Send offline_access')}` +
        `&response_mode=query` +
        `&prompt=consent` +
        `&state=${state}`;

      return redirect(msAuthUrl);
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

      // Microsoft OAuth token exchange
      if (provider === 'microsoft') {
        const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: MICROSOFT_CLIENT_ID,
            client_secret: MICROSOFT_CLIENT_SECRET,
            code,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri || 'https://hawkeyecue.com/settings',
            scope: 'openid profile email Mail.Send offline_access',
          }).toString(),
        });

        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) {
          console.error('[email-oauth] Microsoft token exchange failed:', tokenData);
          return err(400, 'TOKEN_EXCHANGE_FAILED', tokenData.error_description || 'Failed to get token from Microsoft');
        }

        // Get user's email address from Microsoft Graph
        let outlookAddress = '';
        try {
          const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
          });
          const profile = await profileRes.json();
          outlookAddress = profile.mail || profile.userPrincipalName || '';
        } catch { /* ignore */ }

        // Store tokens in DynamoDB
        await dynamo.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: `USER#${userId}`,
            SK: 'EMAIL_OAUTH#microsoft',
            provider: 'microsoft',
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token || null,
            expiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
            emailAddress: outlookAddress,
            connectedAt: new Date().toISOString(),
          },
        }));

        return ok({ connected: true, provider: 'microsoft', email: outlookAddress });
      }

      return err(400, 'INVALID_PROVIDER', 'Provider must be google or microsoft');
    }

    // POST /email/send — send an email via connected account
    if (method === 'POST' && path === '/email/send') {
      if (!userId) return err(401, 'UNAUTHORIZED', 'Not authenticated');
      const body = event.body ? JSON.parse(event.body) : {};
      const { to, subject, body: emailBody } = body;

      if (!to || !subject || !emailBody) return err(400, 'INVALID_INPUT', 'to, subject, and body are required');

      // Check for Microsoft token first, then Google
      let tokenRecord = null;
      let provider = null;

      const msResult = await dynamo.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'EMAIL_OAUTH#microsoft' },
      }));
      if (msResult.Item) {
        tokenRecord = msResult.Item;
        provider = 'microsoft';
      } else {
        const googleResult = await dynamo.send(new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: `USER#${userId}`, SK: 'EMAIL_OAUTH#google' },
        }));
        if (googleResult.Item) {
          tokenRecord = googleResult.Item;
          provider = 'google';
        }
      }

      if (!tokenRecord) return err(400, 'NOT_CONNECTED', 'No email account connected. Connect Gmail or Outlook in Settings.');

      let accessToken = tokenRecord.accessToken;

      // Check if token is expired and refresh if needed
      if (tokenRecord.expiresAt && new Date(tokenRecord.expiresAt) < new Date() && tokenRecord.refreshToken) {
        if (provider === 'google') {
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
            await dynamo.send(new PutCommand({
              TableName: TABLE_NAME,
              Item: { ...tokenRecord, accessToken, expiresAt: new Date(Date.now() + (refreshData.expires_in || 3600) * 1000).toISOString() },
            }));
          } else {
            return err(401, 'TOKEN_EXPIRED', 'Gmail token expired and could not be refreshed. Please reconnect in Settings.');
          }
        } else if (provider === 'microsoft') {
          const refreshRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: MICROSOFT_CLIENT_ID,
              client_secret: MICROSOFT_CLIENT_SECRET,
              refresh_token: tokenRecord.refreshToken,
              grant_type: 'refresh_token',
              scope: 'openid profile email Mail.Send offline_access',
            }).toString(),
          });
          const refreshData = await refreshRes.json();
          if (refreshData.access_token) {
            accessToken = refreshData.access_token;
            await dynamo.send(new PutCommand({
              TableName: TABLE_NAME,
              Item: { ...tokenRecord, accessToken, refreshToken: refreshData.refresh_token || tokenRecord.refreshToken, expiresAt: new Date(Date.now() + (refreshData.expires_in || 3600) * 1000).toISOString() },
            }));
          } else {
            return err(401, 'TOKEN_EXPIRED', 'Outlook token expired and could not be refreshed. Please reconnect in Settings.');
          }
        }
      }

      // Send email based on provider
      if (provider === 'google') {
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
        return ok({ sent: true, messageId: sendResult.id, provider: 'google' });
      } else if (provider === 'microsoft') {
        // Send via Microsoft Graph API
        const graphPayload = {
          message: {
            subject: subject,
            body: {
              contentType: 'HTML',
              content: emailBody,
            },
            toRecipients: [
              {
                emailAddress: { address: to },
              },
            ],
          },
          saveToSentItems: true,
        };

        const sendRes = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(graphPayload),
        });

        if (!sendRes.ok) {
          const sendErr = await sendRes.text();
          console.error('[email-send] Microsoft Graph error:', sendErr);
          return err(500, 'SEND_FAILED', 'Failed to send email via Outlook');
        }

        // Microsoft Graph sendMail returns 202 with no body on success
        return ok({ sent: true, messageId: null, provider: 'microsoft' });
      }

      return err(500, 'SEND_FAILED', 'Unknown provider');
    }

    // GET /email/status — check if user has a connected email
    if (method === 'GET' && path === '/email/status') {
      if (!userId) return err(401, 'UNAUTHORIZED', 'Not authenticated');

      // Check Microsoft first, then Google
      const msResult = await dynamo.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'EMAIL_OAUTH#microsoft' },
      }));
      if (msResult.Item) {
        return ok({ connected: true, provider: 'microsoft', email: msResult.Item.emailAddress });
      }

      const googleResult = await dynamo.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'EMAIL_OAUTH#google' },
      }));
      if (googleResult.Item) {
        return ok({ connected: true, provider: 'google', email: googleResult.Item.emailAddress });
      }

      return ok({ connected: false });
    }

    // DELETE /email/disconnect — remove connected email (both providers)
    if (method === 'DELETE' && path === '/email/disconnect') {
      if (!userId) return err(401, 'UNAUTHORIZED', 'Not authenticated');
      // Delete both providers if they exist
      await dynamo.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'EMAIL_OAUTH#google' },
      }));
      await dynamo.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'EMAIL_OAUTH#microsoft' },
      }));
      return ok({ disconnected: true });
    }

    // POST /email/generate-templates — AI-generate cadence email templates
    if (method === 'POST' && path === '/email/generate-templates') {
      if (!userId) return err(401, 'UNAUTHORIZED', 'Not authenticated');
      const body = event.body ? JSON.parse(event.body) : {};
      const { trade, tone, context } = body;

      const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
      const bedrock = new BedrockRuntimeClient({ region: 'us-east-1' });

      const prompt = `You are an email copywriting expert for a ${trade || 'local business'} professional. Generate 4 follow-up email templates for a lead nurturing cadence.

Tone: ${tone || 'friendly and professional'}
${context ? `Context: ${context}` : ''}

Generate exactly 4 emails for these touchpoints:
1. Day 1 — Introduction (first contact after seeing their post/inquiry)
2. Day 3 — Follow Up (gentle nudge)
3. Day 7 — Check In (add value, show expertise)
4. Day 14 — Final Touch (last outreach, leave door open)

Rules:
- Use {name} as a placeholder for the lead's name
- Keep each email under 150 words
- Be warm, personal, not salesy
- Include a clear call-to-action in each
- Make them feel like a real person wrote them
- Tailor language to the ${trade || 'local business'} industry

Return ONLY a JSON array of 4 objects with "subject" and "body" fields. The body should be plain text (no HTML tags). Example format:
[{"subject":"...", "body":"..."},{"subject":"...", "body":"..."},{"subject":"...", "body":"..."},{"subject":"...", "body":"..."}]`;

      try {
        const command = new InvokeModelCommand({
          modelId: 'amazon.nova-lite-v1:0',
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify({
            inferenceConfig: { maxTokens: 2000, temperature: 0.7 },
            messages: [{ role: 'user', content: [{ text: prompt }] }],
          }),
        });

        const response = await bedrock.send(command);
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));
        const aiText = responseBody.output.message.content[0].text.trim();

        // Parse the JSON array from AI response
        let templates;
        try {
          // Find the JSON array in the response
          const jsonMatch = aiText.match(/\[[\s\S]*\]/);
          templates = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        } catch {
          templates = null;
        }

        if (!templates || templates.length !== 4) {
          return ok({ templates: null, raw: aiText, error: 'Could not parse templates — showing raw text' });
        }

        return ok({ templates });
      } catch (e) {
        console.error('[email-generate] AI generation failed:', e);
        return err(500, 'AI_GENERATION_FAILED', 'Failed to generate templates. Please try again.');
      }
    }

    return err(404, 'NOT_FOUND', `No route for ${method} ${path}`);
  } catch (e) {
    console.error('[email-oauth-handler] Error:', e);
    return err(500, 'INTERNAL_ERROR', e.message || 'An unexpected error occurred');
  }
};
