import { z } from 'zod';

// --- Platform and Enum Schemas ---

export const socialPlatformSchema = z.enum([
  'facebook',
  'instagram',
  'linkedin',
  'tiktok',
  'nextdoor',
]);

export const toneSchema = z.enum([
  'professional',
  'casual',
  'educational',
  'urgent',
]);

export const devicePlatformSchema = z.enum(['ios', 'android']);

export const opportunityStatusSchema = z.enum([
  'new',
  'followed_up',
  'converted',
  'dismissed',
]);

export const postStatusSchema = z.enum([
  'draft',
  'scheduled',
  'published',
  'failed',
]);

// --- Password Validation ---

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/\d/, 'Password must contain at least one digit')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one symbol');

/**
 * Validates a password string and returns detailed error information.
 * Can be used on both client and server side.
 */
export function validatePassword(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one digit');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must contain at least one symbol');
  }

  return { valid: errors.length === 0, errors };
}

// --- Content Generation Request Schema ---

export const contentGenerationRequestSchema = z.object({
  tone: toneSchema,
  postType: z.string().min(1, 'Post type is required'),
  postLength: z.enum(['short', 'medium', 'long']).optional(),
  platforms: z
    .array(socialPlatformSchema)
    .min(1, 'At least one platform must be selected'),
  baseText: z.string().optional(),
  tradeName: z.string().optional(),
});

// --- Schedule Date Validation ---

export const scheduleDateSchema = z
  .string()
  .refine(
    (val) => {
      const date = new Date(val);
      return !isNaN(date.getTime());
    },
    { message: 'Must be a valid ISO date string' },
  )
  .refine(
    (val) => {
      const date = new Date(val);
      return date.getTime() > Date.now();
    },
    { message: 'Schedule date must be in the future' },
  );

// --- Keyword Schema ---

export const keywordSchema = z
  .string()
  .min(1, 'Keyword cannot be empty')
  .max(100, 'Keyword must be at most 100 characters');

export const createKeywordRequestSchema = z.object({
  keyword: keywordSchema,
  tradeId: z.string().min(1, 'Trade ID is required'),
});

// --- Opportunity Submission Schema ---

export const opportunitySubmissionSchema = z.object({
  keywordId: z.string().min(1, 'Keyword ID is required'),
  sourceContent: z.string().min(1, 'Source content is required'),
  sourcePlatform: socialPlatformSchema,
  sourceUrl: z.string().url('Source URL must be a valid URL'),
  sourceAuthor: z.string().min(1, 'Source author is required'),
});

// --- Device Registration Schema ---

export const deviceRegistrationSchema = z.object({
  platform: devicePlatformSchema,
  pushToken: z.string().min(1, 'Push token is required'),
});

// --- Notification Preferences Schema ---

export const notificationPreferencesSchema = z.object({
  opportunitiesEnabled: z.boolean(),
  scheduledPostReminders: z.boolean(),
  dailyCueReminders: z.boolean(),
  marketingEnabled: z.boolean(),
});

// --- Schedule Post Request Schema ---

export const schedulePostRequestSchema = z.object({
  contentId: z.string().min(1, 'Content ID is required'),
  content: z.string().min(1, 'Post content is required'),
  platformContent: z.record(z.string(), z.string()).optional(),
  platforms: z
    .array(socialPlatformSchema)
    .min(1, 'At least one platform must be selected'),
  scheduledAt: scheduleDateSchema,
  mediaUrls: z.array(z.string().url()).optional().default([]),
});

// --- Inferred Types ---

export type ContentGenerationRequest = z.infer<
  typeof contentGenerationRequestSchema
>;
export type CreateKeywordRequest = z.infer<typeof createKeywordRequestSchema>;
export type OpportunitySubmission = z.infer<typeof opportunitySubmissionSchema>;
export type DeviceRegistration = z.infer<typeof deviceRegistrationSchema>;
export type NotificationPreferencesInput = z.infer<
  typeof notificationPreferencesSchema
>;
export type SchedulePostRequest = z.infer<typeof schedulePostRequestSchema>;
