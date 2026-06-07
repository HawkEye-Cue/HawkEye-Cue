# Implementation Plan: Social Media Lead Generation Platform

## Overview

This plan implements a fully serverless multi-platform application for social media tracking and AI-assisted lead generation. The implementation follows an incremental approach: shared foundation first, then backend (Lambda + DynamoDB), then web frontend, then mobile app, then browser extension, and finally integration wiring. Each task builds on previous tasks with no orphaned code.

## Tasks

- [x] 1. Set up monorepo structure and shared package
  - [x] 1.1 Initialize monorepo with package manager workspaces
    - Create root `package.json` with workspaces: `packages/*`, `apps/*`
    - Create directory structure: `packages/shared`, `packages/lambdas`, `packages/cdk`, `apps/web`, `apps/mobile`
    - Configure root `tsconfig.json` with project references
    - Add shared dev dependencies: TypeScript, Vitest, fast-check, ESLint, Prettier
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 1.2 Implement shared types and interfaces
    - Create `packages/shared/src/types/` with all TypeScript interfaces: User, Trade, GeneratedContent, ScheduledPost, Keyword, Opportunity, OpportunityStats, DailyCue, Subscription, DeviceRegistration, NotificationPreferences, PushNotificationPayload
    - Define type unions: SocialPlatform, PostStatus, OpportunityStatus, DevicePlatform
    - Export all types from package index
    - _Requirements: 4.2, 4.3, 4.5, 5.5, 7.6, 8.3, 9.1, 11.3_

  - [x] 1.3 Implement Zod validation schemas
    - Create `packages/shared/src/validators/` with Zod schemas for all API request/response bodies
    - Implement password validation schema (≥8 chars, ≥1 uppercase, ≥1 digit)
    - Implement content generation request schema (tone, postType, platforms validation)
    - Implement schedule date validation (must be in the future)
    - Implement keyword schema (max 100 chars)
    - Implement opportunity submission schema
    - Implement device registration schema
    - Implement notification preferences schema
    - _Requirements: 1.6, 4.2, 4.3, 4.5, 5.3, 7.1, 11.3_

  - [ ]* 1.4 Write property tests for password validation
    - **Property 3: Password validation enforcement**
    - **Validates: Requirements 1.6**
    - Use fast-check to generate arbitrary strings and verify the validator accepts iff length ≥ 8, has uppercase, and has digit

  - [ ]* 1.5 Write property tests for content generation request validation
    - **Property 5: Content generation request validation**
    - **Validates: Requirements 4.2, 4.3, 4.5**
    - Use fast-check to generate combinations of tone, postType, and platforms and verify acceptance/rejection

  - [ ]* 1.6 Write property tests for schedule date validation
    - **Property 14: Schedule date validation**
    - **Validates: Requirements 7.1**
    - Use fast-check to generate date values and verify only future dates are accepted

  - [x] 1.7 Implement shared constants and utilities
    - Create `packages/shared/src/constants/` with trade list, platform enums, tier limits
    - Create `packages/shared/src/utils/` with date formatting, keyword matching, status helpers, DynamoDB key builders
    - Implement deep link URL parser utility (`socialleadgen://{screen}/{entityId}`)
    - _Requirements: 2.3, 9.1, 9.2, 11.4_

  - [ ]* 1.8 Write property test for deep link URL parsing
    - **Property 21: Deep link URL parsing resolves to correct screen**
    - **Validates: Requirements 11.4**
    - Use fast-check to generate valid deep link URLs and verify correct screen/entityId extraction

  - [x] 1.9 Implement shared API client
    - Create `packages/shared/src/api-client/` with typed fetch-based API client
    - Implement all endpoint methods matching API Gateway routes
    - Add JWT token injection via configurable auth provider
    - Works in both web (fetch) and React Native (fetch) environments
    - _Requirements: 10.5, 11.2, 11.7_

- [x] 2. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implement AWS CDK infrastructure
  - [x] 3.1 Set up CDK project and core stack
    - Create `packages/cdk/` with CDK app entry point
    - Define DynamoDB table with PK/SK composite key, GSI1, and GSI2
    - Configure pay-per-request billing mode and point-in-time recovery
    - Define S3 bucket for media uploads with CORS configuration
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6_

  - [x] 3.2 Implement Cognito user pool and app clients
    - Create Cognito User Pool with email sign-in, password policy (min 8, uppercase, digit)
    - Configure SES email for confirmation emails
    - Create app clients for web, mobile, and extension
    - Set up post-confirmation Lambda trigger
    - _Requirements: 1.1, 1.2, 1.6, 11.2_

  - [x] 3.3 Implement API Gateway and Lambda functions
    - Create HTTP API with CORS configuration
    - Add Cognito JWT authorizer
    - Define all Lambda functions with appropriate IAM roles (least privilege)
    - Configure routes for all API endpoints (trade, content, posts, keywords, opportunities, subscription, cues, devices)
    - Set up Stripe webhook route without auth
    - _Requirements: 1.2, 1.5, 4.1, 5.1, 7.1, 8.1, 9.4, 11.3_

  - [x] 3.4 Implement EventBridge Scheduler and SNS resources
    - Create SNS platform applications for iOS (APNs) and Android (FCM)
    - Configure IAM roles for EventBridge to invoke Lambda
    - Set up notification-sender Lambda with DynamoDB stream trigger
    - _Requirements: 7.3, 11.3_

  - [x] 3.5 Implement S3 + CloudFront for web frontend hosting
    - Create S3 bucket for static site hosting
    - Configure CloudFront distribution with HTTPS and cache behaviors
    - Set up Origin Access Identity for S3
    - _Requirements: 10.5_

  - [ ]* 3.6 Write CDK infrastructure tests
    - CDK snapshot tests for change detection
    - Assertion tests: DynamoDB key schema, GSIs, Lambda IAM permissions, API Gateway routes, Cognito password policy, S3 CORS, CloudFront origins
    - _Requirements: 1.6, 10.1_

- [ ] 4. Implement authentication Lambda and post-confirmation
  - [x] 4.1 Implement auth-post-confirmation Lambda
    - Create `packages/lambdas/src/auth-post-confirmation/` handler
    - On Cognito post-confirmation trigger, create DynamoDB user record with: PK=USER#{sub}, SK=PROFILE, email, tradeId=null, subscriptionTier='free', createdAt
    - Set GSI1PK=EMAIL#{email}, GSI1SK=USER
    - _Requirements: 1.1, 10.1_

  - [ ]* 4.2 Write property test for authentication round-trip
    - **Property 1: Authentication round-trip**
    - **Validates: Requirements 1.1, 1.2**
    - Mock Cognito, verify DynamoDB user creation with correct fields

  - [ ]* 4.3 Write property test for invalid credentials rejection
    - **Property 2: Invalid credentials are rejected with generic error**
    - **Validates: Requirements 1.3**
    - Verify error normalization does not reveal which field is incorrect

- [ ] 5. Implement trade handler Lambda
  - [x] 5.1 Implement trade-handler Lambda
    - Create `packages/lambdas/src/trade-handler/` with GET /trade/list and PUT /trade/select
    - GET: Query DynamoDB for all TRADE# entities, return list
    - PUT: Update user's tradeId in DynamoDB, return updated profile
    - Validate trade ID exists in trades list
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 5.2 Write property test for trade selection persistence
    - **Property 4: Trade selection persistence round-trip**
    - **Validates: Requirements 2.2, 2.4, 2.5**
    - Use fast-check to generate valid trade IDs, verify round-trip persistence

- [ ] 6. Implement keywords handler Lambda
  - [x] 6.1 Implement keywords-handler Lambda
    - Create `packages/lambdas/src/keywords-handler/` with full CRUD
    - GET /keywords: Query PK=USER#{id}, SK begins_with KEYWORD#
    - POST /keywords: Create keyword with tier limit check (free: 5, growth: 50, pro: unlimited)
    - PUT /keywords/{id}: Update keyword text
    - DELETE /keywords/{id}: Remove keyword
    - GET /keywords/defaults: Query PK=TRADE#{tradeId}, SK begins_with DEFKW#
    - _Requirements: 5.3, 5.6, 9.2, 10.3_

  - [ ]* 6.2 Write property test for keyword CRUD round-trip
    - **Property 7: Keyword CRUD round-trip**
    - **Validates: Requirements 5.3, 10.3**
    - Use fast-check to generate keyword strings, verify add/query/remove cycle

  - [ ]* 6.3 Write property test for default keywords trade-specificity
    - **Property 8: Default keywords are trade-specific**
    - **Validates: Requirements 5.6**
    - Verify defaults endpoint returns non-empty list associated with the queried trade

- [ ] 7. Implement opportunities handler Lambda
  - [x] 7.1 Implement opportunities-handler Lambda
    - Create `packages/lambdas/src/opportunities-handler/` with full CRUD + stats
    - GET /opportunities: Query GSI1 (sorted by detectedAt desc), paginated
    - POST /opportunities: Create opportunity with keyword/trade associations, deduplicate by sourceUrl
    - PUT /opportunities/{id}/status: Update status (new → followed_up → converted / dismissed)
    - DELETE /opportunities/{id}: Remove opportunity
    - GET /opportunities/stats: Aggregate counts by status
    - _Requirements: 5.2, 5.5, 8.1, 8.2, 8.3, 8.4, 8.5, 10.4_

  - [ ]* 7.2 Write property test for opportunity creation associations
    - **Property 9: Opportunity creation preserves associations**
    - **Validates: Requirements 5.2, 5.5**

  - [ ]* 7.3 Write property test for opportunity statistics
    - **Property 10: Opportunity statistics correctly count by status**
    - **Validates: Requirements 3.2, 8.4**

  - [ ]* 7.4 Write property test for opportunity recency sorting
    - **Property 11: Opportunities are sorted by recency**
    - **Validates: Requirements 8.1**

  - [ ]* 7.5 Write property test for opportunity status update
    - **Property 12: Opportunity status update persists**
    - **Validates: Requirements 8.3**

  - [ ]* 7.6 Write property test for opportunity deletion
    - **Property 13: Opportunity deletion removes record**
    - **Validates: Requirements 8.5**

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Implement content handler Lambda
  - [x] 9.1 Implement content-handler Lambda
    - Create `packages/lambdas/src/content-handler/` with generate, history, upload-url, delete
    - POST /content/generate: Check tier limits, call OpenAI API with trade/tone/postType context, store result in DynamoDB
    - GET /content/history: Query PK=USER#{id}, SK begins_with CONTENT#
    - POST /content/upload-url: Generate S3 presigned URL for media upload
    - DELETE /content/{id}: Remove content record
    - Implement retry with exponential backoff for OpenAI calls (3 attempts)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 9.2, 10.2_

  - [ ]* 9.2 Write property test for content persistence round-trip
    - **Property 6: Generated content persistence round-trip**
    - **Validates: Requirements 4.6, 10.2**

  - [ ]* 9.3 Write property test for subscription limit enforcement
    - **Property 17: Subscription limit enforcement**
    - **Validates: Requirements 9.2, 9.3**
    - Verify free tier users at limit (10/month) get 403, users below limit get accepted

- [ ] 10. Implement posts handler and publisher Lambdas
  - [x] 10.1 Implement posts-handler Lambda
    - Create `packages/lambdas/src/posts-handler/` with schedule, list, update, delete, publish-now
    - POST /posts/schedule: Validate future date, store post in DynamoDB, create EventBridge one-time schedule
    - GET /posts: Query user's posts with optional date range filter (GSI1)
    - PUT /posts/{id}: Update post content/time, update EventBridge schedule if time changed
    - DELETE /posts/{id}: Remove post from DynamoDB, delete EventBridge schedule
    - POST /posts/{id}/publish: Immediate publish via Ayrshare API
    - Check tier limits for scheduled posts (free: 10 active)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 9.2, 10.6_

  - [x] 10.2 Implement post-publisher Lambda (EventBridge triggered)
    - Create `packages/lambdas/src/post-publisher/` handler
    - Triggered by EventBridge Scheduler at scheduled time
    - Get post details from DynamoDB, call Ayrshare API to publish
    - Update post status to 'published' or 'failed' in DynamoDB
    - Implement retry with exponential backoff for Ayrshare calls
    - _Requirements: 7.3_

  - [ ]* 10.3 Write property test for scheduled post edit persistence
    - **Property 15: Scheduled post edit persistence**
    - **Validates: Requirements 7.4, 10.6**

  - [ ]* 10.4 Write property test for scheduled post deletion
    - **Property 16: Scheduled post deletion**
    - **Validates: Requirements 7.5**

- [ ] 11. Implement subscription and Stripe webhook Lambdas
  - [x] 11.1 Implement subscription-handler Lambda
    - Create `packages/lambdas/src/subscription-handler/` with plan info, checkout, cancel
    - GET /subscription: Return current tier, usage counters, period end from DynamoDB
    - POST /subscription/checkout: Create Stripe checkout session, return URL
    - POST /subscription/cancel: Cancel Stripe subscription, maintain access until period end
    - _Requirements: 9.1, 9.4, 9.5, 9.6_

  - [x] 11.2 Implement stripe-webhook Lambda
    - Create `packages/lambdas/src/stripe-webhook/` handler
    - Verify Stripe webhook signature
    - Handle events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted
    - Update user's subscription tier and period end in DynamoDB
    - _Requirements: 9.4, 9.6_

  - [ ]* 11.3 Write property test for subscription cancellation access
    - **Property 18: Subscription cancellation maintains access**
    - **Validates: Requirements 9.6**
    - Verify tier remains active before currentPeriodEnd, reverts to free after

- [ ] 12. Implement daily cues and devices Lambdas
  - [x] 12.1 Implement daily-cues-handler Lambda
    - Create `packages/lambdas/src/daily-cues-handler/` with get and complete
    - GET /cues: Query PK=USER#{id}, SK begins_with CUE#{today's date}
    - PUT /cues/{id}/complete: Update cue completed status in DynamoDB
    - _Requirements: 3.1, 3.3_

  - [x] 12.2 Implement devices-handler Lambda
    - Create `packages/lambdas/src/devices-handler/` with register, unregister, list, preferences
    - POST /devices/register: Store device token, create SNS platform endpoint
    - DELETE /devices/{deviceId}: Remove device record, delete SNS endpoint
    - GET /devices: List user's registered devices
    - PUT /devices/{deviceId}/preferences: Update notification preferences
    - _Requirements: 11.3_

  - [x] 12.3 Implement notification-sender Lambda
    - Create `packages/lambdas/src/notification-sender/` handler
    - Triggered when new opportunity is created (DynamoDB stream or direct invoke)
    - Query user's device tokens from DynamoDB
    - Publish push notification via SNS for each registered device
    - Include deep link URL in notification payload
    - Handle disabled endpoints (remove stale device records)
    - _Requirements: 11.3, 11.4_

  - [ ]* 12.4 Write property test for push notification delivery
    - **Property 20: Push notification delivery for new opportunities**
    - **Validates: Requirements 11.3**
    - Mock SNS, verify publish called for each device with correct payload and deep link

  - [ ]* 12.5 Write property test for dashboard day filtering
    - **Property 19: Dashboard filters posts to current day**
    - **Validates: Requirements 3.6**
    - Generate posts with various dates, verify only today's posts returned

- [x] 13. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Implement React web frontend - core structure and auth
  - [x] 14.1 Set up React web app with Vite and routing
    - Create `apps/web/` with Vite + React + TypeScript
    - Install dependencies: React Router v7, TanStack Query, AWS Amplify Auth, Tailwind CSS
    - Configure Amplify with Cognito User Pool settings
    - Set up React Router with route definitions for all pages
    - Create AppShell layout with TopBar and BottomNav components
    - _Requirements: 1.2, 10.5_

  - [x] 14.2 Implement authentication pages and AuthGuard
    - Create LoginPage with Cognito-powered login (via Amplify)
    - Create RegisterPage with password policy enforcement (visual feedback)
    - Create ConfirmPage for email verification code entry
    - Implement AuthGuard component for route protection using Cognito session state
    - Implement AuthContext with token management and auto-refresh
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 14.3 Implement trade selection flow
    - Create TradeSelector component with dropdown of all trades
    - Show trade selection prompt when user has no trade selected
    - Persist selection via API and update TradeContext
    - Allow trade change from Settings page
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 15. Implement React web frontend - main features
  - [x] 15.1 Implement Dashboard page
    - Create DashboardPage with trade-specific daily cues list
    - Implement DailyCuesList with completion toggle (persists to API)
    - Implement LeadSummaryCard showing active lead count and quick stats
    - Implement AIPostSuggestion component with generated content preview
    - Implement UpcomingPostsList showing today's scheduled posts
    - Wire navigation from lead summary to Opportunities page
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 15.2 Implement Content Creator page
    - Create ContentCreatorPage with AI generation interface
    - Implement ToneSelector (Professional/Casual/Educational/Urgent toggle)
    - Implement PostTypeSelector with trade-specific post types
    - Implement PlatformSelector (multi-select: Facebook, Instagram, LinkedIn, TikTok)
    - Implement ContentPreview with edit capability
    - Implement MediaUploader using S3 presigned URLs
    - Wire to content generation API with loading states
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 15.3 Implement Calendar page
    - Create CalendarPage with monthly/weekly/daily view toggle
    - Implement CalendarGrid with post indicators (color-coded by status)
    - Implement PostCard for individual posts in calendar
    - Implement ScheduleModal with date/time picker
    - Wire to posts API for CRUD operations
    - _Requirements: 7.1, 7.2, 7.4, 7.5, 7.6_

  - [x] 15.4 Implement Opportunities page
    - Create OpportunitiesPage with paginated opportunity list
    - Implement OpportunityCard showing source content, platform, keyword match
    - Implement OpportunityStats bar (total, new, followed-up, converted)
    - Implement StatusFilter (new/followed_up/converted)
    - Wire status update and delete actions to API
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 15.5 Implement Keywords and Settings pages
    - Create KeywordsPage with keyword list, add/edit/remove functionality
    - Implement DefaultSuggestions showing trade-specific keyword suggestions
    - Create SettingsPage with account info, trade selector, plan display
    - Implement PlanCard showing current tier, usage, and billing info
    - Implement UpgradePrompt shown when tier limits are reached
    - _Requirements: 5.3, 5.6, 9.2, 9.3, 9.5_

- [x] 16. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 17. Implement React Native mobile app
  - [x] 17.1 Set up Expo project and navigation
    - Create `apps/mobile/` with Expo managed workflow
    - Configure app.config.ts with app name, bundle IDs, permissions
    - Install dependencies: React Navigation v6, TanStack Query, AWS Amplify, expo-notifications, expo-secure-store, expo-image-picker, expo-local-authentication
    - Implement RootNavigator with conditional AuthStack vs MainTabs
    - Implement AuthStack (LoginScreen → RegisterScreen → ConfirmScreen)
    - Implement MainTabs bottom tab navigator (Home, Create, Calendar, Opportunities, More)
    - Implement MoreStack nested navigator (Settings, Keywords, Account, Subscription)
    - _Requirements: 11.1, 11.7_

  - [x] 17.2 Implement mobile authentication screens
    - Create LoginScreen with Cognito login via Amplify
    - Implement biometric unlock option using expo-local-authentication
    - Implement secure token storage using expo-secure-store
    - Create RegisterScreen with password policy enforcement
    - Create ConfirmScreen for email verification
    - _Requirements: 11.2, 11.8_

  - [x] 17.3 Implement push notification handling
    - Create PushNotificationHandler service
    - Register for push notifications on app launch (expo-notifications)
    - Send device token to POST /devices/register API
    - Handle foreground notifications (in-app banner)
    - Handle background notification taps (deep link navigation)
    - Implement DeepLinkHandler for URL parsing and screen navigation
    - _Requirements: 11.3, 11.4_

  - [x] 17.4 Implement offline support and sync
    - Configure TanStack Query with persistQueryClient and AsyncStorage adapter
    - Implement offline mutation queue (AsyncStorage-based)
    - Implement network listener (@react-native-community/netinfo) for reconnect detection
    - Implement FIFO queue replay on reconnect with retry logic
    - Create OfflineIndicator banner component
    - Implement optimistic updates for status changes
    - _Requirements: 11.5, 11.6_

  - [ ]* 17.5 Write property test for offline mutation queue replay
    - **Property 22: Offline mutation queue replays in order on reconnect**
    - **Validates: Requirements 11.6**
    - Generate sequences of mutations, verify FIFO replay order and cleanup

  - [x] 17.6 Implement mobile main screens
    - Create DashboardScreen with daily cues, lead summary, AI suggestion
    - Create ContentCreatorScreen with camera/gallery access (expo-image-picker)
    - Create CalendarScreen with scheduled posts view
    - Create OpportunitiesScreen with pull-to-refresh and infinite scroll
    - Create OpportunityDetailScreen with action buttons
    - Create KeywordsScreen with swipe-to-delete
    - Create SettingsScreen with trade selection, notification preferences
    - Create SubscriptionScreen with plan display and Stripe checkout (WebView)
    - _Requirements: 11.7, 11.8_

- [ ] 18. Implement Chrome browser extension
  - [x] 18.1 Implement extension background service worker
    - Update `browser-extension/background.js` to communicate with API Gateway
    - Implement Cognito token storage and refresh in extension context
    - Implement keyword sync (GET /keywords on interval and on login)
    - Implement opportunity submission (POST /opportunities)
    - Implement badge update with new match count
    - Implement offline queue in chrome.storage.local (max 100 items)
    - _Requirements: 6.1, 6.3, 6.5, 6.6_

  - [x] 18.2 Implement extension content script
    - Update `browser-extension/content.js` for keyword detection on social media pages
    - Implement page scanning for configured keywords (Facebook, Instagram, LinkedIn, TikTok)
    - Implement keyword highlighting with CSS overlay
    - Implement click handler on highlights to submit opportunity
    - Implement notification display on keyword match detection
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 18.3 Implement extension popup UI
    - Update `browser-extension/popup.html` and `popup.js`
    - Show login form (authenticates with Cognito, stores tokens)
    - Display keyword count and scan status
    - Show recent matches with links
    - Add manual scan trigger button
    - _Requirements: 6.1, 6.5_

- [x] 19. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 20. Integration wiring and end-to-end flows
  - [x] 20.1 Wire web frontend to live API
    - Configure API client with API Gateway URL and Cognito auth provider
    - Verify all TanStack Query hooks connect to correct endpoints
    - Implement error handling UI (toast notifications for API errors)
    - Implement loading states and skeleton loaders
    - _Requirements: 10.5, 1.5_

  - [x] 20.2 Wire mobile app to live API
    - Configure shared API client with API Gateway URL
    - Verify Amplify auth configuration matches Cognito app client
    - Test push notification registration flow end-to-end
    - Verify offline queue sync on reconnect
    - _Requirements: 11.2, 11.5, 11.6_

  - [x] 20.3 Wire browser extension to live API
    - Configure extension with API Gateway URL
    - Verify keyword sync pulls from user's keyword list
    - Verify opportunity submission creates records in DynamoDB
    - Test offline queue and retry behavior
    - _Requirements: 6.5, 6.6_

  - [ ]* 20.4 Write integration tests for key flows
    - Test auth flow: register → confirm → login → get profile
    - Test content flow: generate → list history → schedule → publish
    - Test opportunity flow: extension submit → list → update status → stats
    - Test subscription flow: checkout → webhook → tier update → limit enforcement
    - Test push notification flow: register device → create opportunity → receive notification
    - _Requirements: 1.1, 1.2, 4.1, 7.3, 8.1, 9.4, 11.3_

- [ ] 21. Seed data and final polish
  - [x] 21.1 Create seed data for trades and default keywords
    - Write DynamoDB seed script for all 15 trades with metadata
    - Write seed data for default keywords per trade (TRADE#{id}/DEFKW#{keyword})
    - Write seed data for trade-specific post types
    - _Requirements: 2.3, 5.6_

  - [x] 21.2 Implement subscription tier enforcement across all handlers
    - Add tier limit checks to content-handler (AI generations: free=10, growth=100, pro=unlimited)
    - Add tier limit checks to keywords-handler (free=5, growth=50, pro=unlimited)
    - Add tier limit checks to posts-handler (free=10 active scheduled posts)
    - Implement usage counter increment/reset logic in DynamoDB
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 22. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at logical breakpoints
- Property tests validate universal correctness properties from the design document (22 properties total)
- The shared package (`packages/shared`) is consumed by web, mobile, and Lambda code
- All Lambda handlers use Zod for input validation and return consistent error responses
- TypeScript is used throughout: Lambda (Node.js 20), React web (Vite), React Native (Expo)
- fast-check is the property-based testing library; Vitest is the test runner
