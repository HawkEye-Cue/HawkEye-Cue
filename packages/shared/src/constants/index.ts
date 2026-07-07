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
  {
    id: 'painter',
    name: 'Painter',
    defaultKeywords: ['house painting', 'interior painting', 'exterior painting', 'painter needed', 'paint job'],
    postTypes: ['Before/After', 'Color Inspiration', 'Tips', 'Testimonial', 'Project Showcase'],
  },
  {
    id: 'flooring-installer',
    name: 'Flooring Installer',
    defaultKeywords: ['flooring', 'hardwood floors', 'tile installation', 'carpet replacement', 'vinyl plank'],
    postTypes: ['Before/After', 'Material Showcase', 'Tips', 'Testimonial', 'Project Spotlight'],
  },
  {
    id: 'fence-company',
    name: 'Fence Company',
    defaultKeywords: ['fence installation', 'fence repair', 'privacy fence', 'wood fence', 'fence contractor'],
    postTypes: ['Before/After', 'Material Showcase', 'Tips', 'Testimonial', 'Design Ideas'],
  },
  {
    id: 'deck-patio-builder',
    name: 'Deck & Patio Builder',
    defaultKeywords: ['deck building', 'patio construction', 'outdoor living', 'deck repair', 'pergola'],
    postTypes: ['Before/After', 'Design Inspiration', 'Tips', 'Testimonial', 'Seasonal Prep'],
  },
  {
    id: 'window-door-installer',
    name: 'Window & Door Installer',
    defaultKeywords: ['window replacement', 'door installation', 'energy efficient windows', 'new windows', 'storm door'],
    postTypes: ['Before/After', 'Energy Savings Tips', 'Testimonial', 'Product Showcase', 'Educational'],
  },
  {
    id: 'garage-door-company',
    name: 'Garage Door Company',
    defaultKeywords: ['garage door repair', 'garage door installation', 'garage door opener', 'broken spring', 'garage door service'],
    postTypes: ['Before/After', 'Emergency Response', 'Tips', 'Testimonial', 'Product Showcase'],
  },
  {
    id: 'restoration',
    name: 'Restoration',
    defaultKeywords: ['water damage', 'fire damage', 'mold remediation', 'flood cleanup', 'restoration services'],
    postTypes: ['Before/After', 'Emergency Response', 'Tips', 'Testimonial', 'Educational'],
  },
  {
    id: 'pest-control',
    name: 'Pest Control',
    defaultKeywords: ['pest control', 'termites', 'exterminator', 'bug problem', 'rodent control'],
    postTypes: ['Tips', 'Seasonal Alert', 'Testimonial', 'Educational', 'Prevention Guide'],
  },
  {
    id: 'pressure-washer',
    name: 'Pressure Washer',
    defaultKeywords: ['pressure washing', 'power washing', 'driveway cleaning', 'deck cleaning', 'house wash'],
    postTypes: ['Before/After', 'Tips', 'Testimonial', 'Seasonal Special', 'Satisfying Results'],
  },
  {
    id: 'gutter-service',
    name: 'Gutter Installation & Cleaning',
    defaultKeywords: ['gutter cleaning', 'gutter installation', 'gutter guards', 'clogged gutters', 'gutter repair'],
    postTypes: ['Before/After', 'Seasonal Tips', 'Testimonial', 'Maintenance Reminder', 'Emergency Response'],
  },
  {
    id: 'pool-builder',
    name: 'Pool Builder & Maintenance',
    defaultKeywords: ['pool construction', 'pool builder', 'pool renovation', 'inground pool', 'pool design'],
    postTypes: ['Before/After', 'Design Inspiration', 'Tips', 'Testimonial', 'Project Showcase'],
  },
  {
    id: 'home-inspector',
    name: 'Home Inspector',
    defaultKeywords: ['home inspection', 'property inspection', 'buyer inspection', 'inspector needed', 'pre-listing inspection'],
    postTypes: ['Tips', 'Educational', 'Testimonial', 'Common Issues', 'Checklist'],
  },
  {
    id: 'handyman',
    name: 'Handyman',
    defaultKeywords: ['handyman', 'home repair', 'fix it', 'odd jobs', 'honey do list'],
    postTypes: ['Before/After', 'Tips', 'Testimonial', 'Service Spotlight', 'Quick Fix'],
  },
  {
    id: 'appliance-repair',
    name: 'Appliance Repair',
    defaultKeywords: ['appliance repair', 'washer repair', 'dryer repair', 'refrigerator repair', 'dishwasher broken'],
    postTypes: ['Tips', 'Emergency Response', 'Testimonial', 'Educational', 'Maintenance Reminder'],
  },
  {
    id: 'chimney-services',
    name: 'Chimney Services',
    defaultKeywords: ['chimney sweep', 'chimney repair', 'chimney inspection', 'fireplace service', 'chimney cleaning'],
    postTypes: ['Before/After', 'Seasonal Tips', 'Testimonial', 'Safety Alert', 'Educational'],
  },
  {
    id: 'septic-company',
    name: 'Septic Company',
    defaultKeywords: ['septic pumping', 'septic repair', 'septic tank', 'drain field', 'septic inspection'],
    postTypes: ['Tips', 'Maintenance Reminder', 'Testimonial', 'Educational', 'Emergency Response'],
  },
  {
    id: 'excavation-contractor',
    name: 'Excavation Contractor',
    defaultKeywords: ['excavation', 'grading', 'land clearing', 'foundation dig', 'trenching'],
    postTypes: ['Project Showcase', 'Before/After', 'Tips', 'Testimonial', 'Equipment Spotlight'],
  },
  {
    id: 'insulation-contractor',
    name: 'Insulation Contractor',
    defaultKeywords: ['insulation', 'spray foam', 'attic insulation', 'energy efficiency', 'insulation contractor'],
    postTypes: ['Before/After', 'Energy Savings', 'Tips', 'Testimonial', 'Educational'],
  },
  {
    id: 'collision-center',
    name: 'Collision Center',
    defaultKeywords: ['auto body', 'collision repair', 'car accident', 'dent repair', 'paint job'],
    postTypes: ['Before/After', 'Tips', 'Testimonial', 'Process Spotlight', 'Insurance Guide'],
  },
  {
    id: 'tint-shop',
    name: 'Tint Shop',
    defaultKeywords: ['window tint', 'car tint', 'ceramic tint', 'tint shop', 'UV protection'],
    postTypes: ['Before/After', 'Product Showcase', 'Tips', 'Testimonial', 'Deal Alert'],
  },
  {
    id: 'wrap-shop',
    name: 'Wrap Shop',
    defaultKeywords: ['vehicle wrap', 'car wrap', 'vinyl wrap', 'color change', 'commercial wrap'],
    postTypes: ['Before/After', 'Design Showcase', 'Tips', 'Testimonial', 'Color Inspiration'],
  },
  {
    id: 'mobile-mechanic',
    name: 'Mobile Mechanic',
    defaultKeywords: ['mobile mechanic', 'on-site repair', 'car won\'t start', 'mobile auto repair', 'roadside service'],
    postTypes: ['Tips', 'Testimonial', 'Emergency Response', 'Service Spotlight', 'Educational'],
  },
  {
    id: 'tire-shop',
    name: 'Tire Shop',
    defaultKeywords: ['tire replacement', 'flat tire', 'tire rotation', 'new tires', 'tire shop'],
    postTypes: ['Deal Alert', 'Safety Tips', 'Testimonial', 'Seasonal Reminder', 'Product Showcase'],
  },
  {
    id: 'towing-company',
    name: 'Towing Company',
    defaultKeywords: ['tow truck', 'towing service', 'roadside assistance', 'car breakdown', 'vehicle towing'],
    postTypes: ['Emergency Response', 'Tips', 'Testimonial', 'Service Area', 'Safety Tips'],
  },
  {
    id: 'welder',
    name: 'Welder',
    defaultKeywords: ['welding', 'metal fabrication', 'welder needed', 'custom welding', 'structural welding'],
    postTypes: ['Project Showcase', 'Before/After', 'Tips', 'Testimonial', 'Custom Work'],
  },
  {
    id: 'cabinet-maker',
    name: 'Cabinet Maker',
    defaultKeywords: ['custom cabinets', 'cabinet maker', 'kitchen cabinets', 'cabinet refacing', 'built-ins'],
    postTypes: ['Before/After', 'Design Showcase', 'Tips', 'Testimonial', 'Material Spotlight'],
  },
  {
    id: 'countertop-installer',
    name: 'Countertop Installer',
    defaultKeywords: ['countertop installation', 'granite', 'quartz countertops', 'marble', 'countertop replacement'],
    postTypes: ['Before/After', 'Material Showcase', 'Tips', 'Testimonial', 'Design Inspiration'],
  },
  {
    id: 'drywall-contractor',
    name: 'Drywall Contractor',
    defaultKeywords: ['drywall repair', 'drywall installation', 'texture', 'sheetrock', 'drywall patch'],
    postTypes: ['Before/After', 'Tips', 'Testimonial', 'Process Spotlight', 'Project Showcase'],
  },
  {
    id: 'masonry',
    name: 'Masonry',
    defaultKeywords: ['masonry', 'brick work', 'stone wall', 'block laying', 'concrete work'],
    postTypes: ['Before/After', 'Project Showcase', 'Tips', 'Testimonial', 'Design Inspiration'],
  },
  {
    id: 'stucco-contractor',
    name: 'Stucco Contractor',
    defaultKeywords: ['stucco repair', 'stucco installation', 'exterior stucco', 'stucco crack', 'stucco contractor'],
    postTypes: ['Before/After', 'Tips', 'Testimonial', 'Color Showcase', 'Maintenance Guide'],
  },
  {
    id: 'epoxy-flooring',
    name: 'Epoxy Flooring',
    defaultKeywords: ['epoxy floor', 'garage floor coating', 'epoxy coating', 'metallic epoxy', 'floor coating'],
    postTypes: ['Before/After', 'Design Showcase', 'Tips', 'Testimonial', 'Satisfying Results'],
  },
  {
    id: 'commercial-cleaning',
    name: 'Commercial Cleaning',
    defaultKeywords: ['commercial cleaning', 'office cleaning', 'janitorial service', 'cleaning company', 'business cleaning'],
    postTypes: ['Before/After', 'Tips', 'Testimonial', 'Service Spotlight', 'Eco-Friendly'],
  },
  {
    id: 'janitorial',
    name: 'Janitorial Company',
    defaultKeywords: ['janitorial', 'floor waxing', 'building maintenance', 'janitor service', 'nightly cleaning'],
    postTypes: ['Before/After', 'Tips', 'Testimonial', 'Service Spotlight', 'Eco-Friendly'],
  },
  {
    id: 'snow-removal',
    name: 'Snow Removal',
    defaultKeywords: ['snow removal', 'snow plow', 'ice management', 'parking lot clearing', 'driveway snow'],
    postTypes: ['Emergency Response', 'Seasonal Prep', 'Tips', 'Testimonial', 'Before/After'],
  },
  {
    id: 'arborist',
    name: 'Arborist',
    defaultKeywords: ['tree service', 'tree removal', 'tree trimming', 'arborist', 'stump grinding'],
    postTypes: ['Before/After', 'Safety Tips', 'Testimonial', 'Emergency Response', 'Educational'],
  },
  {
    id: 'equipment-rental',
    name: 'Equipment Rental',
    defaultKeywords: ['equipment rental', 'tool rental', 'heavy equipment', 'rent a excavator', 'construction rental'],
    postTypes: ['Equipment Spotlight', 'Tips', 'Testimonial', 'Deal Alert', 'How-To'],
  },
  {
    id: 'farm-ranch-services',
    name: 'Farm & Ranch Services',
    defaultKeywords: ['farm service', 'ranch fencing', 'livestock', 'agricultural', 'land management'],
    postTypes: ['Project Showcase', 'Seasonal Tips', 'Testimonial', 'Educational', 'Equipment Spotlight'],
  },
  {
    id: 'horse-trailer-services',
    name: 'Horse Trailer Services',
    defaultKeywords: ['horse trailer repair', 'trailer maintenance', 'horse trailer customization', 'livestock trailer', 'trailer inspection'],
    postTypes: ['Before/After', 'Service Spotlight', 'Tips', 'Testimonial', 'Custom Build'],
  },
  {
    id: 'health-insurance-agent',
    name: 'Health Insurance Agent',
    defaultKeywords: ['health insurance', 'open enrollment', 'affordable coverage', 'Medicare', 'health plan options'],
    postTypes: ['Educational', 'Tips', 'Testimonial', 'Enrollment Reminder', 'Plan Comparison'],
  },
  {
    id: 'insurance-producer',
    name: 'Insurance Producer',
    defaultKeywords: ['insurance producer', 'policy quote', 'commercial insurance', 'liability coverage', 'insurance broker'],
    postTypes: ['Educational', 'Tips', 'Testimonial', 'Market Update', 'Coverage Spotlight'],
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
  'nextdoor',
];
