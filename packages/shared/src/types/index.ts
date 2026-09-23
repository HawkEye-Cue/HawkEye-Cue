// Core domain types shared between frontend, mobile, and Lambda functions

// --- Type Unions ---

export type SocialPlatform = 'facebook' | 'instagram' | 'linkedin' | 'tiktok' | 'nextdoor';

export type PostStatus = 'draft' | 'scheduled' | 'published' | 'failed';

export type OpportunityStatus = 'new' | 'followed_up' | 'converted' | 'dismissed';

export type DevicePlatform = 'ios' | 'android';

// Product edition — orthogonal to subscription tier. Controls feature visibility.
export type Edition = 'discover' | 'grow';

// Per-lead CRM push outcome.
export type PushStatus = 'not_pushed' | 'pending' | 'pushed' | 'failed';

// How a CRM destination is connected.
export type CrmConnectionMethod = 'none' | 'url' | 'api_key' | 'oauth';

// Whether a destination can be connected today or is blocked on third-party approval.
export type CrmAvailability = 'available' | 'requires_approval';

// --- Interfaces ---

export interface User {
  id: string; // Cognito sub
  email: string;
  tradeId: string | null;
  subscriptionTier: 'free' | 'nest' | 'soar' | 'summit' | 'team';
  createdAt: string;
}

export interface Trade {
  id: string;
  name: string;
  defaultKeywords: string[];
  postTypes: string[];
}

export interface GeneratedContent {
  id: string;
  userId: string;
  tradeId: string;
  content: string;
  platformContent?: Record<string, string>;
  tone: 'professional' | 'casual' | 'educational' | 'urgent';
  postType: string;
  platforms: SocialPlatform[];
  mediaUrls: string[];
  createdAt: string;
}

export interface ScheduledPost {
  id: string;
  userId: string;
  contentId: string;
  content: string;
  platforms: SocialPlatform[];
  scheduledAt: string;
  publishedAt: string | null;
  status: PostStatus;
  mediaUrls: string[];
  eventBridgeScheduleName: string | null;
}

export interface Keyword {
  id: string;
  userId: string;
  keyword: string;
  tradeId: string;
  isDefault: boolean;
  createdAt: string;
}

export interface Opportunity {
  id: string;
  userId: string;
  tradeId: string;
  keywordId: string;
  keywordText: string;
  sourceContent: string;
  sourcePlatform: SocialPlatform | 'other';
  sourceUrl: string;
  sourceAuthor: string;
  status: OpportunityStatus;
  detectedAt: string;
  leadNotes?: string | null;
  leadSource?: string | null;
  leadSourceGroup?: string | null;
  consentBasis?: string | null;
  policyType?: string | null;
  assignedTo?: string | null;
  expectedPremium?: string | number | null;
  bucket?: string | null;
  leadColor?: string | null;
  // CRM push tracking
  pushStatus?: PushStatus;
  crmRecordId?: string | null;
  lastPushError?: string | null;
  pushedAt?: string | null;
  pushedConnectionId?: string | null;
}

export interface OpportunityStats {
  total: number;
  new: number;
  followedUp: number;
  converted: number;
}

export interface DailyCue {
  id: string;
  userId: string;
  tradeId: string;
  title: string;
  description: string;
  completed: boolean;
  date: string;
}

export interface Subscription {
  tier: 'free' | 'nest' | 'soar' | 'summit' | 'team';
  aiGenerationsUsed: number;
  aiGenerationsLimit: number;
  currentPeriodEnd: string;
  stripeCustomerId: string | null;
}

export interface NotificationPreferences {
  opportunitiesEnabled: boolean;
  scheduledPostReminders: boolean;
  dailyCueReminders: boolean;
  marketingEnabled: boolean;
}

export interface DeviceRegistration {
  id: string;
  userId: string;
  platform: DevicePlatform;
  pushToken: string;
  snsEndpointArn: string;
  notificationPreferences: NotificationPreferences;
  registeredAt: string;
  lastActiveAt: string;
}

export interface PushNotificationPayload {
  type: 'new_opportunity' | 'post_published' | 'post_failed' | 'daily_cue';
  title: string;
  body: string;
  data: {
    deepLink: string;
    entityId: string;
  };
}

export interface SocialAccount {
  id: string;
  type: string; // e.g. FACEBOOK, INSTAGRAM, LINKEDIN
  name: string;
  username: string | null;
  imageUrl: string | null;
  connected: boolean;
}

// --- Network / Collaborate ---

export interface NetworkPost {
  id: string;
  userId: string;
  authorName: string;
  authorTrade: string;
  content: string;
  type: 'referral' | 'opportunity' | 'introduction' | 'question';
  tradeFilter: string; // which trade this is relevant to, or 'all'
  replies: NetworkReply[];
  createdAt: string;
}

export interface NetworkReply {
  id: string;
  userId: string;
  authorName: string;
  authorTrade: string;
  content: string;
  createdAt: string;
}

export interface NetworkContact {
  id: string;
  userId: string;
  name: string;
  trade: string;
  phone: string;
  email: string;
  notes: string;
  createdAt: string;
}

// --- CRM Push / Discover-Grow Editions ---

// A CRM destination the user can connect to, with its current availability.
export interface CrmDestinationInfo {
  type: string; // 'csv' | 'webhook' | 'hubspot' | 'zoho' | 'gohighlevel' | 'salesforce' | ...
  label: string;
  method: CrmConnectionMethod;
  availability: CrmAvailability;
  reason?: string; // shown when availability is 'requires_approval'
  supportsUpsert?: boolean;
  requiredFields?: string[];
}

// Maps a CRM destination field -> exactly one HawkEye lead field.
export type FieldMapping = Record<string, string>;

// A stored CRM connection. Credentials are NEVER returned raw — only masked/omitted.
export interface CrmConnection {
  connectionId: string;
  destinationType: string;
  connectionMethod: CrmConnectionMethod;
  availability: CrmAvailability;
  fieldMapping: FieldMapping;
  webhookUrl?: string | null;
  active: boolean;
  credentialMasked?: string; // e.g. '••••••' — never the real value
  lastValidatedAt?: string | null;
  createdAt: string;
}

// Result of a push attempt returned to the client.
export interface PushResult {
  pushStatus: PushStatus;
  crmRecordId?: string | null;
  reason?: string; // failure reason when pushStatus === 'failed'
  needsConfirmation?: boolean; // dedup / re-push confirmation required
  matchingLead?: { id: string; name: string } | null;
}
