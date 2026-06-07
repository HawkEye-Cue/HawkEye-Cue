import type { Trade, SocialPlatform } from '../types/index.js';

// --- Trades ---

export const TRADES: Trade[] = [
  {
    id: 'roofing',
    name: 'Roofing',
    defaultKeywords: ['roof leak', 'roof repair', 'storm damage', 'shingle replacement', 'roof inspection'],
    postTypes: ['Before/After', 'Storm Prep', 'Testimonial', 'Tips', 'Emergency Response'],
  },
  {
    id: 'general-contractor',
    name: 'General Contractor',
    defaultKeywords: ['home renovation', 'remodel', 'contractor needed', 'home improvement', 'building permit'],
    postTypes: ['Before/After', 'Project Showcase', 'Tips', 'Testimonial', 'Behind the Scenes'],
  },
  {
    id: 'insurance-agent',
    name: 'Insurance Agent',
    defaultKeywords: ['insurance quote', 'home insurance', 'auto insurance', 'coverage options', 'claims help'],
    postTypes: ['Tips', 'Educational', 'Testimonial', 'Community Event', 'Policy Update'],
  },
  {
    id: 'real-estate-agent',
    name: 'Real Estate Agent',
    defaultKeywords: ['home for sale', 'buying a house', 'real estate market', 'open house', 'first time buyer'],
    postTypes: ['Listing Showcase', 'Market Update', 'Tips', 'Testimonial', 'Open House'],
  },
  {
    id: 'hvac-technician',
    name: 'HVAC Technician',
    defaultKeywords: ['AC repair', 'heating issue', 'HVAC maintenance', 'furnace problem', 'air conditioning'],
    postTypes: ['Before/After', 'Seasonal Tips', 'Emergency Response', 'Testimonial', 'Maintenance Reminder'],
  },
  {
    id: 'electrician',
    name: 'Electrician',
    defaultKeywords: ['electrical repair', 'power outage', 'wiring issue', 'electrician needed', 'panel upgrade'],
    postTypes: ['Safety Tips', 'Before/After', 'Testimonial', 'Emergency Response', 'Educational'],
  },
  {
    id: 'plumber',
    name: 'Plumber',
    defaultKeywords: ['plumbing leak', 'clogged drain', 'water heater', 'plumber needed', 'pipe burst'],
    postTypes: ['Before/After', 'Emergency Response', 'Tips', 'Testimonial', 'Seasonal Maintenance'],
  },
  {
    id: 'landscaper',
    name: 'Landscaper',
    defaultKeywords: ['lawn care', 'landscaping', 'garden design', 'tree trimming', 'yard maintenance'],
    postTypes: ['Before/After', 'Seasonal Tips', 'Project Showcase', 'Testimonial', 'Design Inspiration'],
  },
  {
    id: 'junk-removal',
    name: 'Junk Removal',
    defaultKeywords: ['junk removal', 'cleanout', 'hauling', 'declutter', 'estate cleanout'],
    postTypes: ['Before/After', 'Tips', 'Testimonial', 'Eco-Friendly', 'Community Service'],
  },
  {
    id: 'mortgage-lender',
    name: 'Mortgage Lender',
    defaultKeywords: ['mortgage rates', 'home loan', 'refinance', 'first time buyer', 'pre-approval'],
    postTypes: ['Market Update', 'Educational', 'Tips', 'Testimonial', 'Rate Alert'],
  },
  {
    id: 'pool-service',
    name: 'Pool Service',
    defaultKeywords: ['pool cleaning', 'pool repair', 'pool maintenance', 'green pool', 'pool opening'],
    postTypes: ['Before/After', 'Seasonal Tips', 'Testimonial', 'Maintenance Reminder', 'Safety Tips'],
  },
  {
    id: 'auto-repair-shop',
    name: 'Auto Repair Shop',
    defaultKeywords: ['car repair', 'brake service', 'oil change', 'check engine', 'mechanic needed'],
    postTypes: ['Before/After', 'Tips', 'Testimonial', 'Service Special', 'Educational'],
  },
  {
    id: 'auto-broker',
    name: 'Auto Broker',
    defaultKeywords: ['car buying', 'auto dealer', 'vehicle search', 'trade in', 'car financing'],
    postTypes: ['Vehicle Showcase', 'Tips', 'Testimonial', 'Market Update', 'Deal Alert'],
  },
  {
    id: 'cosmetologist',
    name: 'Cosmetologist',
    defaultKeywords: ['hair stylist', 'hair color', 'salon', 'haircut', 'beauty treatment'],
    postTypes: ['Before/After', 'Style Inspiration', 'Tips', 'Testimonial', 'Trend Alert'],
  },
  {
    id: 'esthetician',
    name: 'Esthetician',
    defaultKeywords: ['facial', 'skincare', 'esthetician', 'skin treatment', 'anti-aging'],
    postTypes: ['Before/After', 'Skincare Tips', 'Testimonial', 'Treatment Spotlight', 'Educational'],
  },
  {
    id: 'yoga-teacher',
    name: 'Yoga Teacher',
    defaultKeywords: ['yoga class', 'yoga instructor', 'meditation', 'yoga near me', 'mindfulness', 'yoga studio', 'beginner yoga'],
    postTypes: ['Class Spotlight', 'Pose of the Day', 'Wellness Tips', 'Testimonial', 'Schedule Update', 'Mindfulness Moment'],
  },
];

// --- Tier Limits ---

export interface TierLimits {
  aiGenerations: number;
  keywords: number;
  scheduledPosts: number;
}

export const TIER_LIMITS: Record<'free' | 'growth' | 'pro', TierLimits> = {
  free: { aiGenerations: 10, keywords: 5, scheduledPosts: 10 },
  growth: { aiGenerations: 100, keywords: 50, scheduledPosts: Infinity },
  pro: { aiGenerations: Infinity, keywords: Infinity, scheduledPosts: Infinity },
};

// --- Social Platforms ---

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  'facebook',
  'instagram',
  'linkedin',
  'tiktok',
];
