'use strict';

/**
 * Cognito Define Auth Challenge trigger.
 * Controls the flow of custom authentication:
 * 1. First: SRP_A (password verification handled by Cognito)
 * 2. Then: CUSTOM_CHALLENGE (our 6-digit code)
 * 3. If code is correct: issue tokens
 */
exports.handler = async (event) => {
  const sessions = event.request.session;

  if (sessions.length === 0) {
    // First call — start with SRP password verification
    event.response.issueTokens = false;
    event.response.failAuthentication = false;
    event.response.challengeName = 'SRP_A';
  } else if (
    sessions.length === 1 &&
    sessions[0].challengeName === 'SRP_A' &&
    sessions[0].challengeResult === true
  ) {
    // Password verified — now issue custom challenge (MFA code)
    event.response.issueTokens = false;
    event.response.failAuthentication = false;
    event.response.challengeName = 'CUSTOM_CHALLENGE';
  } else if (
    sessions.length === 2 &&
    sessions[1].challengeName === 'CUSTOM_CHALLENGE' &&
    sessions[1].challengeResult === true
  ) {
    // MFA code verified — issue tokens
    event.response.issueTokens = true;
    event.response.failAuthentication = false;
  } else {
    // Unexpected state or failed challenge — fail auth
    event.response.issueTokens = false;
    event.response.failAuthentication = true;
  }

  return event;
};
