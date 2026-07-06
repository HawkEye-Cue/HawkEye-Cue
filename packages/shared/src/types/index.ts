// Core domain types shared between frontend, mobile, and Lambda functions

// --- Type Unions ---

export type SocialPlatform = 'facebook' | 'instagram' | 'linkedin' | 'tiktok';

export type PostStatus = 'draft' | 'scheduled' | 'published' | 'failed';

export type OpportunityStatus = 'new' | 'followed_up' | 'converted' | 'dismissed';

export type DevicePlatform = 'ios' | 'android';

// --- Interfaces ---

export interface User {
  id: string; // Cognito sub
  email: string;
  tradeId: string | null;
  subscriptionTier: 'free' | 'base' | 'growth' | 'team';
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
  sourcePlatform: SocialPlatform;
  sourceUrl: string;
  sourceAuthor: string;
  status: OpportunityStatus;
  detectedAt: string;
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
  tier: 'free' | 'base' | 'growth' | 'team';
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
