// @social-lead-gen/shared
// Shared types, validators, constants, utilities, and API client

export * from './types/index.js';
export { 
  socialPlatformSchema,
  toneSchema,
  devicePlatformSchema,
  opportunityStatusSchema,
  postStatusSchema,
  passwordSchema,
  validatePassword,
  contentGenerationRequestSchema,
  scheduleDateSchema,
  keywordSchema,
  createKeywordRequestSchema,
  opportunitySubmissionSchema,
  deviceRegistrationSchema,
  notificationPreferencesSchema,
  schedulePostRequestSchema,
  type ContentGenerationRequest,
  type CreateKeywordRequest,
  type OpportunitySubmission,
  type NotificationPreferencesInput,
  type SchedulePostRequest,
} from './validators/index.js';
export * from './constants/index.js';
export * from './utils/index.js';
export {
  computePostingConsistency,
  type PostingConsistency,
  type ConsistencyEvent,
} from './utils/postingConsistency.js';
export {
  normalizeFacebookGroupUrl,
  isValidFacebookGroupUrl,
  type FacebookGroupUrlResult,
} from './utils/facebookGroupUrl.js';
export {
  activityKey,
  recordPost,
  postsToday,
  postsInWindow,
  shouldRemind,
  setPaused as setFlockPaused,
  pauseKey,
  evaluateGroupRules,
  loadActivity,
  saveActivity,
  clearActivity,
  loadPause,
  savePause,
  clearPause,
  pacingKey,
  loadPacing,
  savePacing,
  type PostingWorkflow,
  type PostingActivityEvent,
  type PacingState,
  type PacingOpts,
  type PauseState,
  type RuleEvalInput,
  type RuleEvalResult,
} from './utils/flockSafety.js';
export * from './api-client/index.js';
export * from './crm/index.js';
export { isFlockEvent, type FlockClassifiable } from './flocks.js';
