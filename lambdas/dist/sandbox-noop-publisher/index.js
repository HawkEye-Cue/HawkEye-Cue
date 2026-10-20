'use strict';

// HawkEye-Cue — SANDBOX-ONLY no-op post publisher.
//
// This Lambda exists SOLELY so the sandbox posts-handler can create a valid
// EventBridge Scheduler target when a scheduled post is saved, WITHOUT ever publishing
// to Facebook or any social platform. When a sandbox schedule fires, EventBridge
// invokes this function, which simply logs and returns. It:
//   - has NO social publishing code,
//   - is granted NO secrets (no Bundle.social / Ayrshare / OpenAI),
//   - is granted NO DynamoDB or other resource access,
//   - makes NO network calls.
//
// It is the deliberate, isolated stand-in for the real SocialLeadGen-PostPublisher so
// that sandbox scheduling/calendar persistence can be tested safely.
exports.handler = async function handler(event) {
  // Redact: only log the shape, never credentials (there are none here anyway).
  const postId = event && event.postId ? String(event.postId) : 'unknown';
  console.log(JSON.stringify({
    msg: 'sandbox-noop-publisher invoked — no social publishing performed',
    postId,
    note: 'This is the sandbox no-op publisher. It never posts to any platform.',
  }));
  return { ok: true, published: false, sandbox: true };
};
