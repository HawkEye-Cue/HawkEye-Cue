/**
 * HawkEye-Cue — Design Templates + Smart Suggestion Scoring
 *
 * Templates are pure data: no AI calls, no API requests. Each template
 * describes a visual layout that the DesignStudio can render onto a Fabric canvas.
 *
 * Template matching scores a post against a trade's keywords and postTypes using
 * exact and partial keyword overlap — no LLM needed for suggestions.
 */

export type TemplateFormat = 'square' | 'portrait' | 'landscape' | 'story';
export type TemplateCategory =
  | 'promotion' | 'before_after' | 'announcement' | 'testimonial'
  | 'tips' | 'seasonal' | 'emergency' | 'listing' | 'appreciation' | 'brand';

export interface DesignLayer {
  type: 'text' | 'rect' | 'image';
  id: string;
  // Text
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fill?: string;
  // Rect / background
  width?: number;
  height?: number;
  backgroundColor?: string;
  // Position
  left?: number;
  top?: number;
  // Image
  src?: string;
  scaleX?: number;
  scaleY?: number;
  // Common
  textAlign?: 'left' | 'center' | 'right';
  isEditable?: boolean;
  isPlaceholder?: boolean;   // hint to replace with user photo
  isHeadline?: boolean;
  isSubtext?: boolean;
  isBrandSlot?: boolean;     // auto-filled from BrandKit
  isLogoSlot?: boolean;
  isPhoneSlot?: boolean;
}

/**
 * Visual layout family — used to guarantee the 3 auto-suggestions look GENUINELY different
 * (not just recolored). The picker takes at most one template per family.
 *   hero      — big centered/left headline, minimal elements
 *   split     — image/content split down the middle
 *   banner    — strong top/bottom bars framing the message
 *   badge     — circular/badge focal element
 *   quote     — large quotation / testimonial layout
 *   stat      — oversized number/word as the focal point
 */
export type LayoutFamily = 'hero' | 'split' | 'banner' | 'badge' | 'quote' | 'stat';

export interface DesignTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  /** Distinct visual layout family (ensures varied suggestions). */
  layoutFamily?: LayoutFamily;
  format: TemplateFormat;
  /** Canvas dimensions */
  width: number;
  height: number;
  /** Background CSS color or gradient string */
  background: string;
  /** Fabric-compatible layer stack (bottom → top) */
  layers: DesignLayer[];
  /** Trades this template fits well. Empty = universal. */
  trades: string[];
  /** Keywords that boost this template's score when found in post text. */
  keywords: string[];
  /** Thumbnail preview color (we generate a CSS gradient swatch in the UI) */
  previewColors: [string, string];
  /** Short human-readable description */
  description: string;
}

// ─── Canonical 1080-unit grid ─────────────────────────────────────────────────
// Square: 1080×1080 · Portrait: 1080×1350 · Story: 1080×1920 · Landscape: 1080×566

export const TEMPLATES: DesignTemplate[] = [

  // ── Roofing / Storm Damage ───────────────────────────────────────────────────
  {
    id: 'roof-storm-1',
    name: 'Storm Damage Alert',
    category: 'emergency',
    layoutFamily: 'hero',
    format: 'square',
    width: 1080, height: 1080,
    background: '#0f172a',
    previewColors: ['#0f172a', '#f97316'],
    trades: ['roofing', 'restoration', 'general-contractor'],
    keywords: ['storm', 'hail', 'damage', 'inspection', 'free', 'roof', 'repair'],
    description: 'Bold dark storm-damage inspection ad',
    layers: [
      { id: 'bg', type: 'rect', left: 0, top: 0, width: 1080, height: 1080, backgroundColor: '#0f172a' },
      { id: 'accent', type: 'rect', left: 0, top: 0, width: 12, height: 1080, backgroundColor: '#f97316' },
      { id: 'headline', type: 'text', text: 'FREE ROOF\nINSPECTIONS', left: 80, top: 280,
        fontFamily: 'Arial Black', fontSize: 112, fontWeight: '900', fill: '#ffffff',
        isHeadline: true, isEditable: true },
      { id: 'sub', type: 'text', text: 'Storm season is here. Get your roof\nchecked before the next one hits.',
        left: 80, top: 560, fontFamily: 'Arial', fontSize: 44, fill: '#94a3b8',
        isSubtext: true, isEditable: true },
      { id: 'cta', type: 'rect', left: 80, top: 720, width: 460, height: 80, backgroundColor: '#f97316' },
      { id: 'cta-text', type: 'text', text: 'CALL US TODAY', left: 180, top: 738,
        fontFamily: 'Arial Black', fontSize: 36, fontWeight: '900', fill: '#000000',
        isEditable: true },
      { id: 'phone', type: 'text', text: '(555) 000-0000', left: 80, top: 860,
        fontFamily: 'Arial', fontSize: 48, fill: '#f97316', isPhoneSlot: true, isBrandSlot: true, isEditable: true },
      { id: 'brand', type: 'text', text: 'Your Company Name', left: 80, top: 960,
        fontFamily: 'Arial', fontSize: 32, fill: '#64748b', isBrandSlot: true, isEditable: true },
    ],
  },

  {
    id: 'roof-inspect-1',
    name: 'Roof Inspection Promo',
    category: 'promotion',
    layoutFamily: 'split',
    format: 'square',
    width: 1080, height: 1080,
    background: '#1e3a5f',
    previewColors: ['#1e3a5f', '#fbbf24'],
    trades: ['roofing'],
    keywords: ['inspect', 'inspection', 'roof', 'leak', 'shingle', 'hail', 'free'],
    description: 'Professional roofing inspection promotion',
    layers: [
      { id: 'bg', type: 'rect', left: 0, top: 0, width: 1080, height: 1080, backgroundColor: '#1e3a5f' },
      { id: 'top-bar', type: 'rect', left: 0, top: 0, width: 1080, height: 8, backgroundColor: '#fbbf24' },
      { id: 'headline', type: 'text', text: 'IS YOUR ROOF\nREADY?', left: 80, top: 160, width: 440,
        fontFamily: 'Arial Black', fontSize: 96, fontWeight: '900', fill: '#fbbf24',
        isHeadline: true, isEditable: true },
      { id: 'photo-placeholder', type: 'rect', left: 540, top: 160, width: 480, height: 480,
        backgroundColor: '#2d4a6e', isPlaceholder: true },
      { id: 'photo-hint', type: 'text', text: '📸 Add\nYour Photo', left: 640, top: 350,
        fontFamily: 'Arial', fontSize: 36, fill: '#64748b', textAlign: 'center', isEditable: false },
      { id: 'sub', type: 'text', text: 'Get a professional inspection before\nhidden damage costs you thousands.',
        left: 80, top: 700, fontFamily: 'Arial', fontSize: 42, fill: '#e2e8f0',
        isSubtext: true, isEditable: true },
      { id: 'phone', type: 'text', text: '(555) 000-0000', left: 80, top: 900,
        fontFamily: 'Arial Black', fontSize: 56, fill: '#fbbf24',
        isPhoneSlot: true, isBrandSlot: true, isEditable: true },
    ],
  },

  // ── Insurance ────────────────────────────────────────────────────────────────
  {
    id: 'ins-rate-drop-1',
    name: 'Rate Decrease Announcement',
    category: 'announcement',
    layoutFamily: 'stat',
    format: 'square',
    width: 1080, height: 1080,
    background: '#0d1b2a',
    previewColors: ['#0d1b2a', '#22c55e'],
    trades: ['insurance-agent', 'health-insurance-agent', 'mortgage-lender'],
    keywords: ['rate', 'rates', 'dropped', 'lower', 'save', 'savings', 'affordable', 'quote', 'premium'],
    description: 'Insurance rates decreased announcement',
    layers: [
      { id: 'bg', type: 'rect', left: 0, top: 0, width: 1080, height: 1080, backgroundColor: '#0d1b2a' },
      { id: 'tag', type: 'rect', left: 80, top: 80, width: 340, height: 56, backgroundColor: '#22c55e' },
      { id: 'tag-text', type: 'text', text: 'RATE UPDATE', left: 110, top: 92,
        fontFamily: 'Arial Black', fontSize: 28, fill: '#000000' },
      { id: 'down-arrow', type: 'text', text: '↓', left: 460, top: 100,
        fontFamily: 'Arial', fontSize: 200, fill: '#22c55e' },
      { id: 'headline', type: 'text', text: 'HOMEOWNERS\nRATES HAVE\nDROPPED', left: 80, top: 220,
        fontFamily: 'Arial Black', fontSize: 108, fontWeight: '900', fill: '#ffffff',
        isHeadline: true, isEditable: true },
      { id: 'sub', type: 'text', text: 'Now may be a great time to\nreview your coverage and save.',
        left: 80, top: 680, fontFamily: 'Arial', fontSize: 44, fill: '#94a3b8',
        isSubtext: true, isEditable: true },
      { id: 'cta', type: 'text', text: 'Get a Free Quote Today →', left: 80, top: 860,
        fontFamily: 'Arial Black', fontSize: 48, fill: '#22c55e', isEditable: true },
      { id: 'brand', type: 'text', text: 'Your Name · License #000000', left: 80, top: 960,
        fontFamily: 'Arial', fontSize: 30, fill: '#475569', isBrandSlot: true, isEditable: true },
    ],
  },

  {
    id: 'ins-free-quote-1',
    name: 'Free Quote Promotion',
    category: 'promotion',
    layoutFamily: 'badge',
    format: 'square',
    width: 1080, height: 1080,
    background: '#1e1b4b',
    previewColors: ['#1e1b4b', '#818cf8'],
    trades: ['insurance-agent', 'health-insurance-agent', 'insurance-producer', 'mortgage-lender'],
    keywords: ['quote', 'free', 'insurance', 'coverage', 'protect', 'home', 'auto', 'life'],
    description: 'Free insurance quote promotional graphic',
    layers: [
      { id: 'bg', type: 'rect', left: 0, top: 0, width: 1080, height: 1080, backgroundColor: '#1e1b4b' },
      { id: 'circle', type: 'rect', left: 220, top: 80, width: 640, height: 640, backgroundColor: '#312e81' },
      { id: 'free', type: 'text', text: 'FREE', left: 280, top: 160,
        fontFamily: 'Arial Black', fontSize: 200, fontWeight: '900', fill: '#818cf8' },
      { id: 'quote', type: 'text', text: 'QUOTE', left: 250, top: 380,
        fontFamily: 'Arial Black', fontSize: 160, fontWeight: '900', fill: '#ffffff' },
      { id: 'sub', type: 'text', text: 'No obligation. Just clarity on what\nyour coverage actually costs.',
        left: 80, top: 780, fontFamily: 'Arial', fontSize: 44, fill: '#c7d2fe', textAlign: 'center',
        isSubtext: true, isEditable: true },
      { id: 'phone', type: 'text', text: '(555) 000-0000', left: 340, top: 920,
        fontFamily: 'Arial Black', fontSize: 56, fill: '#818cf8',
        isPhoneSlot: true, isBrandSlot: true, isEditable: true },
    ],
  },

  // ── Real Estate ──────────────────────────────────────────────────────────────
  {
    id: 're-just-listed-1',
    name: 'Just Listed',
    category: 'listing',
    layoutFamily: 'split',
    format: 'landscape',
    width: 1080, height: 566,
    background: '#ffffff',
    previewColors: ['#1e3a5f', '#ffffff'],
    trades: ['real-estate-agent'],
    keywords: ['listed', 'listing', 'home', 'house', 'property', 'sale', 'buying', 'sold', 'open house', 'real estate'],
    description: 'Just Listed real estate announcement',
    layers: [
      { id: 'bg', type: 'rect', left: 0, top: 0, width: 1080, height: 566, backgroundColor: '#1e3a5f' },
      { id: 'photo-area', type: 'rect', left: 0, top: 0, width: 550, height: 566, backgroundColor: '#2d4a6e', isPlaceholder: true },
      { id: 'photo-hint', type: 'text', text: '🏠 Property\nPhoto', left: 160, top: 230,
        fontFamily: 'Arial', fontSize: 32, fill: '#64748b', textAlign: 'center' },
      { id: 'tag', type: 'rect', left: 600, top: 60, width: 280, height: 60, backgroundColor: '#f97316' },
      { id: 'tag-text', type: 'text', text: 'JUST LISTED', left: 620, top: 74,
        fontFamily: 'Arial Black', fontSize: 34, fill: '#ffffff' },
      { id: 'price', type: 'text', text: '$000,000', left: 600, top: 160,
        fontFamily: 'Arial Black', fontSize: 80, fill: '#ffffff', isEditable: true, isHeadline: true },
      { id: 'address', type: 'text', text: '123 Main Street\nYourCity, ST 00000',
        left: 600, top: 280, fontFamily: 'Arial', fontSize: 36, fill: '#94a3b8', isEditable: true },
      { id: 'cta', type: 'text', text: 'Schedule a showing →', left: 600, top: 400,
        fontFamily: 'Arial Black', fontSize: 32, fill: '#f97316', isEditable: true },
      { id: 'brand', type: 'text', text: 'Your Name · Agency', left: 600, top: 490,
        fontFamily: 'Arial', fontSize: 26, fill: '#64748b', isBrandSlot: true, isEditable: true },
    ],
  },

  {
    id: 're-just-sold-1',
    name: 'Just Sold',
    category: 'announcement',
    layoutFamily: 'stat',
    format: 'square',
    width: 1080, height: 1080,
    background: '#14532d',
    previewColors: ['#14532d', '#4ade80'],
    trades: ['real-estate-agent'],
    keywords: ['sold', 'closed', 'sale', 'home', 'house', 'buyer', 'seller'],
    description: 'Just Sold real estate celebration graphic',
    layers: [
      { id: 'bg', type: 'rect', left: 0, top: 0, width: 1080, height: 1080, backgroundColor: '#14532d' },
      { id: 'sold', type: 'text', text: 'SOLD!', left: 80, top: 200,
        fontFamily: 'Arial Black', fontSize: 220, fontWeight: '900', fill: '#4ade80',
        isHeadline: true, isEditable: true },
      { id: 'sub', type: 'text', text: 'Congratulations to my amazing\nbuyers — keys in hand! 🎉',
        left: 80, top: 600, fontFamily: 'Arial', fontSize: 52, fill: '#bbf7d0',
        isSubtext: true, isEditable: true },
      { id: 'photo-hint', type: 'rect', left: 600, top: 160, width: 420, height: 420,
        backgroundColor: '#166534', isPlaceholder: true },
      { id: 'brand', type: 'text', text: 'Your Name · Agency', left: 80, top: 900,
        fontFamily: 'Arial', fontSize: 40, fill: '#4ade80', isBrandSlot: true, isEditable: true },
    ],
  },

  // ── HVAC / Seasonal ──────────────────────────────────────────────────────────
  {
    id: 'hvac-seasonal-1',
    name: 'Seasonal Maintenance Reminder',
    category: 'seasonal',
    layoutFamily: 'hero',
    format: 'square',
    width: 1080, height: 1080,
    background: '#0c1a2e',
    previewColors: ['#0c1a2e', '#38bdf8'],
    trades: ['hvac-technician', 'plumber', 'pest-control', 'pool-service'],
    keywords: ['season', 'maintenance', 'tune-up', 'check', 'service', 'ready', 'winter', 'summer', 'spring', 'fall', 'ac', 'heat', 'furnace', 'filter'],
    description: 'Seasonal maintenance promotion',
    layers: [
      { id: 'bg', type: 'rect', left: 0, top: 0, width: 1080, height: 1080, backgroundColor: '#0c1a2e' },
      { id: 'icon', type: 'text', text: '❄️', left: 440, top: 80, fontFamily: 'Arial', fontSize: 120 },
      { id: 'headline', type: 'text', text: "IS YOUR\nSYSTEM\nREADY?", left: 80, top: 240,
        fontFamily: 'Arial Black', fontSize: 120, fontWeight: '900', fill: '#38bdf8',
        isHeadline: true, isEditable: true },
      { id: 'bar', type: 'rect', left: 80, top: 680, width: 920, height: 6, backgroundColor: '#38bdf8' },
      { id: 'sub', type: 'text', text: "Schedule your seasonal tune-up\nbefore the rush begins.",
        left: 80, top: 720, fontFamily: 'Arial', fontSize: 46, fill: '#bae6fd',
        isSubtext: true, isEditable: true },
      { id: 'phone', type: 'text', text: '(555) 000-0000', left: 80, top: 880,
        fontFamily: 'Arial Black', fontSize: 56, fill: '#38bdf8',
        isPhoneSlot: true, isBrandSlot: true, isEditable: true },
      { id: 'brand', type: 'text', text: 'Your Company Name', left: 80, top: 980,
        fontFamily: 'Arial', fontSize: 36, fill: '#475569', isBrandSlot: true, isEditable: true },
    ],
  },

  // ── Before / After (universal) ───────────────────────────────────────────────
  {
    id: 'before-after-1',
    name: 'Before & After',
    category: 'before_after',
    layoutFamily: 'split',
    format: 'landscape',
    width: 1080, height: 566,
    background: '#000000',
    previewColors: ['#000000', '#f97316'],
    trades: [],          // universal
    keywords: ['before', 'after', 'transformation', 'project', 'completed', 'finished', 'done', 'result', 'showcase'],
    description: 'Before & After split layout',
    layers: [
      { id: 'bg', type: 'rect', left: 0, top: 0, width: 1080, height: 566, backgroundColor: '#000000' },
      { id: 'before-area', type: 'rect', left: 0, top: 0, width: 520, height: 566,
        backgroundColor: '#1a1a1a', isPlaceholder: true },
      { id: 'after-area', type: 'rect', left: 560, top: 0, width: 520, height: 566,
        backgroundColor: '#1c2333', isPlaceholder: true },
      { id: 'divider', type: 'rect', left: 530, top: 0, width: 20, height: 566, backgroundColor: '#f97316' },
      { id: 'before-label', type: 'text', text: 'BEFORE', left: 20, top: 20,
        fontFamily: 'Arial Black', fontSize: 40, fill: '#ffffff' },
      { id: 'after-label', type: 'text', text: 'AFTER', left: 580, top: 20,
        fontFamily: 'Arial Black', fontSize: 40, fill: '#f97316' },
      { id: 'headline', type: 'text', text: 'See The Difference', left: 200, top: 460,
        fontFamily: 'Arial Black', fontSize: 52, fill: '#ffffff',
        isHeadline: true, isEditable: true },
      { id: 'brand', type: 'text', text: 'Your Company Name', left: 750, top: 500,
        fontFamily: 'Arial', fontSize: 28, fill: '#f97316', isBrandSlot: true, isEditable: true },
    ],
  },

  // ── Testimonial (universal) ───────────────────────────────────────────────────
  {
    id: 'testimonial-1',
    name: 'Customer Testimonial',
    category: 'testimonial',
    layoutFamily: 'quote',
    format: 'square',
    width: 1080, height: 1080,
    background: '#18181b',
    previewColors: ['#18181b', '#fbbf24'],
    trades: [],          // universal
    keywords: ['testimonial', 'review', 'customer', 'client', 'recommend', 'happy', 'thank', 'five star', '5 star', 'appreciate'],
    description: 'Customer review / testimonial graphic',
    layers: [
      { id: 'bg', type: 'rect', left: 0, top: 0, width: 1080, height: 1080, backgroundColor: '#18181b' },
      { id: 'quote-mark', type: 'text', text: '"', left: 60, top: 60,
        fontFamily: 'Georgia', fontSize: 280, fill: '#fbbf24' },
      { id: 'quote', type: 'text', text: 'Add your customer quote here.\nDouble-click to edit this text.',
        left: 80, top: 300, fontFamily: 'Georgia', fontSize: 56, fill: '#f1f5f9',
        isHeadline: true, isEditable: true },
      { id: 'stars', type: 'text', text: '★★★★★', left: 80, top: 700,
        fontFamily: 'Arial', fontSize: 72, fill: '#fbbf24' },
      { id: 'customer', type: 'text', text: '— Customer Name', left: 80, top: 820,
        fontFamily: 'Arial', fontSize: 44, fill: '#94a3b8', isEditable: true },
      { id: 'brand', type: 'text', text: 'Your Company Name', left: 80, top: 940,
        fontFamily: 'Arial Black', fontSize: 40, fill: '#fbbf24', isBrandSlot: true, isEditable: true },
    ],
  },

  // ── Customer Appreciation (universal) ────────────────────────────────────────
  {
    id: 'appreciation-1',
    name: 'Thank You / Appreciation',
    category: 'appreciation',
    layoutFamily: 'badge',
    format: 'square',
    width: 1080, height: 1080,
    background: '#0f172a',
    previewColors: ['#0f172a', '#c084fc'],
    trades: [],
    keywords: ['thank', 'appreciate', 'grateful', 'community', 'support', 'milestone', 'years', 'anniversary'],
    description: 'Community appreciation / thank you graphic',
    layers: [
      { id: 'bg', type: 'rect', left: 0, top: 0, width: 1080, height: 1080, backgroundColor: '#0f172a' },
      { id: 'heart', type: 'text', text: '❤️', left: 440, top: 80, fontFamily: 'Arial', fontSize: 180 },
      { id: 'headline', type: 'text', text: 'THANK YOU', left: 80, top: 340,
        fontFamily: 'Arial Black', fontSize: 148, fontWeight: '900', fill: '#ffffff',
        isHeadline: true, isEditable: true },
      { id: 'sub', type: 'text', text: 'We are grateful for every customer\nwho has trusted us.',
        left: 80, top: 620, fontFamily: 'Arial', fontSize: 52, fill: '#c084fc',
        isSubtext: true, isEditable: true },
      { id: 'brand', type: 'text', text: 'Your Company Name', left: 80, top: 900,
        fontFamily: 'Arial', fontSize: 40, fill: '#7c3aed', isBrandSlot: true, isEditable: true },
    ],
  },

  // ── Branded header (universal) ────────────────────────────────────────────────
  {
    id: 'branded-1',
    name: 'Branded Announcement',
    category: 'brand',
    layoutFamily: 'banner',
    format: 'square',
    width: 1080, height: 1080,
    background: '#000000',
    previewColors: ['#000000', '#f97316'],
    trades: [],
    keywords: [],  // generic fallback — always in pool
    description: 'Clean branded post with headline and contact',
    layers: [
      { id: 'bg', type: 'rect', left: 0, top: 0, width: 1080, height: 1080, backgroundColor: '#000000' },
      { id: 'top-accent', type: 'rect', left: 0, top: 0, width: 1080, height: 10, backgroundColor: '#f97316' },
      { id: 'bot-accent', type: 'rect', left: 0, top: 1070, width: 1080, height: 10, backgroundColor: '#f97316' },
      { id: 'logo-slot', type: 'rect', left: 80, top: 80, width: 200, height: 200,
        backgroundColor: '#1a1a1a', isLogoSlot: true },
      { id: 'logo-hint', type: 'text', text: '+ Logo', left: 128, top: 160,
        fontFamily: 'Arial', fontSize: 28, fill: '#475569' },
      { id: 'headline', type: 'text', text: 'Your Headline Goes Here', left: 80, top: 360,
        fontFamily: 'Arial Black', fontSize: 96, fill: '#ffffff',
        isHeadline: true, isEditable: true },
      { id: 'sub', type: 'text', text: 'Add your message here. Tell your\ncustomers what you want them to know.',
        left: 80, top: 660, fontFamily: 'Arial', fontSize: 48, fill: '#94a3b8',
        isSubtext: true, isEditable: true },
      { id: 'phone', type: 'text', text: '(555) 000-0000', left: 80, top: 880,
        fontFamily: 'Arial Black', fontSize: 56, fill: '#f97316',
        isPhoneSlot: true, isBrandSlot: true, isEditable: true },
      { id: 'brand', type: 'text', text: 'Your Company Name', left: 80, top: 980,
        fontFamily: 'Arial', fontSize: 36, fill: '#64748b', isBrandSlot: true, isEditable: true },
    ],
  },

  // ── Universal polished archetypes (distinct layout families, always eligible) ──

  // HERO — big left-aligned headline on a clean two-tone field + accent underline.
  {
    id: 'u-hero-bold',
    name: 'Bold Statement',
    category: 'brand',
    layoutFamily: 'hero',
    format: 'square',
    width: 1080, height: 1080,
    background: '#111827',
    previewColors: ['#111827', '#f97316'],
    trades: [],
    keywords: [],
    description: 'Big bold headline with an accent underline — clean and modern',
    layers: [
      { id: 'bg', type: 'rect', left: 0, top: 0, width: 1080, height: 1080, backgroundColor: '#111827' },
      { id: 'panel', type: 'rect', left: 0, top: 0, width: 1080, height: 300, backgroundColor: '#0b1220' },
      { id: 'headline', type: 'text', text: 'Your Message\nGoes Here', left: 90, top: 360,
        fontFamily: 'Arial Black', fontSize: 120, fontWeight: '900', fill: '#ffffff', isHeadline: true, isEditable: true },
      { id: 'accent', type: 'rect', left: 92, top: 640, width: 300, height: 16, backgroundColor: '#f97316' },
      { id: 'sub', type: 'text', text: 'Add a short supporting line that explains the offer.',
        left: 92, top: 700, fontFamily: 'Arial', fontSize: 46, fill: '#94a3b8', isSubtext: true, isEditable: true },
      { id: 'cta-text', type: 'text', text: 'LEARN MORE', left: 92, top: 860,
        fontFamily: 'Arial Black', fontSize: 40, fontWeight: '900', fill: '#f97316', isEditable: true },
      { id: 'brand', type: 'text', text: 'Your Company Name', left: 92, top: 980,
        fontFamily: 'Arial', fontSize: 34, fill: '#64748b', isBrandSlot: true, isEditable: true },
    ],
  },

  // BANNER — centered headline framed by top & bottom color bands + a thin accent rule.
  {
    id: 'u-banner-center',
    name: 'Centered Banner',
    category: 'announcement',
    layoutFamily: 'banner',
    format: 'square',
    width: 1080, height: 1080,
    background: '#f8fafc',
    previewColors: ['#0f172a', '#f8fafc'],
    trades: [],
    keywords: [],
    description: 'Light, editorial layout with framing bands — looks premium and clean',
    layers: [
      { id: 'bg', type: 'rect', left: 0, top: 0, width: 1080, height: 1080, backgroundColor: '#f8fafc' },
      { id: 'top-band', type: 'rect', left: 0, top: 0, width: 1080, height: 150, backgroundColor: '#0f172a' },
      { id: 'bot-band', type: 'rect', left: 0, top: 930, width: 1080, height: 150, backgroundColor: '#0f172a' },
      { id: 'kicker', type: 'text', text: 'ANNOUNCEMENT', left: 0, top: 55,
        fontFamily: 'Arial', fontSize: 40, fontWeight: 'bold', fill: '#f8fafc', textAlign: 'center', width: 1080, isEditable: true },
      { id: 'headline', type: 'text', text: 'Your Headline\nGoes Here', left: 90, top: 420,
        fontFamily: 'Georgia', fontSize: 104, fontWeight: 'bold', fill: '#0f172a', textAlign: 'center', width: 900, isHeadline: true, isEditable: true },
      { id: 'accent', type: 'rect', left: 440, top: 680, width: 200, height: 8, backgroundColor: '#f97316' },
      { id: 'sub', type: 'text', text: 'A short supporting sentence for your audience.',
        left: 90, top: 730, fontFamily: 'Arial', fontSize: 44, fill: '#475569', textAlign: 'center', width: 900, isSubtext: true, isEditable: true },
      { id: 'brand', type: 'text', text: 'Your Company Name', left: 0, top: 985,
        fontFamily: 'Arial', fontSize: 36, fontWeight: 'bold', fill: '#f8fafc', textAlign: 'center', width: 1080, isBrandSlot: true, isEditable: true },
    ],
  },

  // BADGE — circular focal badge with the CTA, headline beneath. Distinct from hero/banner.
  {
    id: 'u-badge-promo',
    name: 'Badge Spotlight',
    category: 'promotion',
    layoutFamily: 'badge',
    format: 'square',
    width: 1080, height: 1080,
    background: '#0f766e',
    previewColors: ['#0f766e', '#fde68a'],
    trades: [],
    keywords: [],
    description: 'Circular badge focal point with headline — eye-catching promo style',
    layers: [
      { id: 'bg', type: 'rect', left: 0, top: 0, width: 1080, height: 1080, backgroundColor: '#0f766e' },
      { id: 'badge-ring', type: 'rect', left: 300, top: 110, width: 480, height: 480, backgroundColor: '#0b5a53' },
      { id: 'badge', type: 'rect', left: 330, top: 140, width: 420, height: 420, backgroundColor: '#fde68a' },
      { id: 'cta-text', type: 'text', text: 'SPECIAL\nOFFER', left: 330, top: 260,
        fontFamily: 'Arial Black', fontSize: 92, fontWeight: '900', fill: '#0f766e', textAlign: 'center', width: 420, isEditable: true },
      { id: 'headline', type: 'text', text: 'Your Message Here', left: 90, top: 680,
        fontFamily: 'Arial Black', fontSize: 84, fontWeight: '900', fill: '#ffffff', textAlign: 'center', width: 900, isHeadline: true, isEditable: true },
      { id: 'sub', type: 'text', text: 'Supporting detail for your offer.',
        left: 90, top: 830, fontFamily: 'Arial', fontSize: 42, fill: '#99f6e4', textAlign: 'center', width: 900, isSubtext: true, isEditable: true },
      { id: 'phone', type: 'text', text: '(555) 000-0000', left: 0, top: 960,
        fontFamily: 'Arial Black', fontSize: 48, fill: '#fde68a', textAlign: 'center', width: 1080, isPhoneSlot: true, isBrandSlot: true, isEditable: true },
    ],
  },
];

// ─── Scoring ──────────────────────────────────────────────────────────────────

/** Score a single template against the current context. Higher = more relevant. */
function scoreTemplate(
  tpl: DesignTemplate,
  postText: string,
  tradeId: string,
  tradeKeywords: string[],
): number {
  let score = 0;
  const lower = postText.toLowerCase();

  // Trade match: high bonus
  if (tpl.trades.length === 0) score += 3;         // universal template
  else if (tpl.trades.includes(tradeId)) score += 10;

  // Keyword overlap with template keywords
  for (const kw of tpl.keywords) {
    if (lower.includes(kw.toLowerCase())) score += 4;
  }

  // Keyword overlap with the user's TRADE keywords (relevance signal)
  for (const kw of tradeKeywords) {
    if (lower.includes(kw.toLowerCase())) score += 2;
  }

  return score;
}

export interface ScoredTemplate {
  template: DesignTemplate;
  score: number;
}

/**
 * Return up to `max` templates ranked by relevance.
 * Always includes at least one universal branded template as a fallback.
 */
export function suggestTemplates(opts: {
  postText: string;
  tradeId: string;
  tradeKeywords: string[];
  max?: number;
}): ScoredTemplate[] {
  const { postText, tradeId, tradeKeywords, max = 3 } = opts;

  const scored = TEMPLATES.map((tpl) => ({
    template: tpl,
    score: scoreTemplate(tpl, postText, tradeId, tradeKeywords),
  }));

  // Sort descending; break ties by putting trade-specific templates first
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aSpec = a.template.trades.includes(tradeId) ? 1 : 0;
    const bSpec = b.template.trades.includes(tradeId) ? 1 : 0;
    return bSpec - aSpec;
  });

  // ── Enforce LAYOUT-FAMILY DIVERSITY ──────────────────────────────────────────
  // The 3 auto-suggestions must look genuinely different — not three recolors of the same
  // layout. Walk the ranked list and take at most ONE template per layout family. Then, if
  // we still have fewer than `max`, backfill from the universal archetypes (each a distinct
  // family) so the user always gets `max` varied, polished designs.
  const UNIVERSAL_IDS = ['u-hero-bold', 'u-banner-center', 'u-badge-promo'];
  const picked: ScoredTemplate[] = [];
  const usedFamilies = new Set<string>();
  const usedIds = new Set<string>();

  const tryAdd = (st: ScoredTemplate) => {
    if (picked.length >= max) return;
    const fam = st.template.layoutFamily || st.template.category;
    if (usedFamilies.has(fam) || usedIds.has(st.template.id)) return;
    picked.push(st);
    usedFamilies.add(fam);
    usedIds.add(st.template.id);
  };

  // 1) Prefer relevant, scored templates (distinct families).
  for (const st of scored) {
    if (st.score <= 0) break; // ranked desc; nothing relevant beyond here
    tryAdd(st);
  }
  // 2) Backfill with universal archetypes (distinct families, polished, always eligible).
  for (const id of UNIVERSAL_IDS) {
    if (picked.length >= max) break;
    const tpl = TEMPLATES.find((t) => t.id === id);
    if (tpl) tryAdd({ template: tpl, score: 0 });
  }
  // 3) Last resort: fill any remaining slots ignoring the family constraint.
  for (const st of scored) {
    if (picked.length >= max) break;
    if (!usedIds.has(st.template.id)) { picked.push(st); usedIds.add(st.template.id); }
  }

  return picked.slice(0, max);
}
