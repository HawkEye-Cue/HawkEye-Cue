'use strict';

/**
 * Cognito Verify Auth Challenge Response trigger.
 * Checks if the user-submitted code matches the expected code.
 */
exports.handler = async (event) => {
  const expectedCode = event.request.privateChallengeParameters.code;
  const userCode = (event.request.challengeAnswer || '').trim();

  event.response.answerCorrect = userCode === expectedCode;

  return event;
};
