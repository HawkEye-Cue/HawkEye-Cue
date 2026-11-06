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
  /** corner radius in px (rects only). radius >= half the shorter side makes a pill / circle. */
  radius?: number;
  /** true = the caption never overwrites this text (e.g. a fixed focal word like SOLD! / FREE QUOTE) */
  keepText?: boolean;
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
  /** typographic / decorative polish (all optional) */
  opacity?: number;
  /** letter spacing in 1/1000 em (Fabric charSpacing) */
  charSpacing?: number;
  fontStyle?: 'normal' | 'italic';
  /** headline treatment: render the composed text in capitals */
  uppercase?: boolean;
  /** small label above a headline, filled from the user's trade name (never invented) */
  isKicker?: boolean;
  /** topic emoji icon, chosen from the trade / caption */
  isIcon?: boolean;
  /** layer is dropped unless the Brand Kit / caption provides this (so no empty frames remain) */
  requires?: 'company' | 'phone' | 'contact' | 'kicker';
  /** decorative element shown only when the caption gives no supporting line (fills a sparse design) */
  sparseOnly?: boolean;
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
export type LayoutFamily =
  | 'hero' | 'split' | 'banner' | 'badge' | 'quote' | 'stat'
  | 'poster' | 'editorial' | 'colorblock' | 'spotlight' | 'frame' | 'stripe';

export interface DesignTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  /** Keyword hits required before this template is offered (default 1). Templates whose copy is
   *  about one specific thing (before/after, testimonial) need 2 so a stray word can't trigger them. */
  minKeywordHits?: number;
  /** A universal creative DIRECTION (never contains topic-specific claims). */
  direction?: boolean;
  /** Superseded layout kept only so saved designs / photo uploads can still open it. */
  legacy?: boolean;
  /** Takes the trade's color palette when the user has not chosen a Brand Kit color. */
  tradeAccent?: boolean;
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
      { id: 'cta', type: 'rect', left: 80, top: 720, width: 460, height: 80, radius: 40, backgroundColor: '#f97316' },
      { id: 'cta-text', type: 'text', text: 'CALL US TODAY', left: 104, top: 742, width: 412, textAlign: 'center',
        fontFamily: 'Arial Black', fontSize: 34, fontWeight: '900', fill: '#000000',
        isEditable: true },
      { id: 'phone', type: 'text', text: '', left: 80, top: 860,
        fontFamily: 'Arial', fontSize: 48, fill: '#f97316', isPhoneSlot: true, isBrandSlot: true, isEditable: true },
      { id: 'brand', type: 'text', text: '', left: 80, top: 960,
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
      { id: 'photo-hint', type: 'text', text: '\u{1F3E0}', left: 650, top: 285, width: 260, textAlign: 'center',
        fontFamily: 'Arial', fontSize: 190, fill: '#94a3b8' },
      { id: 'sub', type: 'text', text: 'Get a professional inspection before\nhidden damage costs you thousands.',
        left: 80, top: 700, fontFamily: 'Arial', fontSize: 42, fill: '#e2e8f0',
        isSubtext: true, isEditable: true },
      { id: 'phone', type: 'text', text: '', left: 80, top: 900,
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
      { id: 'kicker', type: 'text', text: '', left: 80, top: 96, width: 800, fontFamily: 'Arial Black', fontSize: 28, fontWeight: '900', fill: '#22c55e', charSpacing: 260, isKicker: true, isEditable: true },
      { id: 'headline', type: 'text', text: 'HEADLINE', left: 80, top: 220, width: 760,
        fontFamily: 'Arial Black', fontSize: 108, fontWeight: '900', fill: '#ffffff',
        isHeadline: true, isEditable: true },
      { id: 'sub', type: 'text', text: 'Now may be a great time to\nreview your coverage and save.',
        left: 80, top: 680, fontFamily: 'Arial', fontSize: 44, fill: '#94a3b8',
        isSubtext: true, isEditable: true },
      { id: 'cta', type: 'text', text: 'Get a Free Quote Today →', left: 80, top: 860,
        fontFamily: 'Arial Black', fontSize: 48, fill: '#22c55e', isEditable: true },
      { id: 'brand', type: 'text', text: '', left: 80, top: 960,
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
    keywords: ['free quote', 'free estimate', 'free', 'quote', 'estimate'],
    minKeywordHits: 3,
    description: 'Free insurance quote promotional graphic',
    layers: [
      { id: 'bg', type: 'rect', left: 0, top: 0, width: 1080, height: 1080, backgroundColor: '#1e1b4b' },
      { id: 'circle', type: 'rect', left: 220, top: 80, width: 640, height: 640, radius: 48, backgroundColor: '#312e81' },
      { id: 'free', type: 'text', text: 'FREE', left: 280, top: 160,
        fontFamily: 'Arial Black', fontSize: 200, fontWeight: '900', fill: '#818cf8' },
      { id: 'quote', type: 'text', text: 'QUOTE', left: 250, top: 380,
        fontFamily: 'Arial Black', fontSize: 160, fontWeight: '900', fill: '#ffffff' },
      { id: 'sub', type: 'text', text: 'No obligation. Just clarity on what\nyour coverage actually costs.',
        left: 80, top: 780, fontFamily: 'Arial', fontSize: 44, fill: '#c7d2fe', textAlign: 'center',
        isSubtext: true, isEditable: true },
      { id: 'phone', type: 'text', text: '', left: 240, top: 920, width: 600, textAlign: 'center',
        fontFamily: 'Arial Black', fontSize: 52, fill: '#818cf8',
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
    keywords: ['just listed', 'new listing', 'listed', 'listing', 'open house'],
    description: 'Just Listed real estate announcement',
    layers: [
      { id: 'bg', type: 'rect', left: 0, top: 0, width: 1080, height: 566, backgroundColor: '#1e3a5f' },
      { id: 'photo-area', type: 'rect', left: 0, top: 0, width: 550, height: 566, backgroundColor: '#2d4a6e', isPlaceholder: true },
      { id: 'photo-hint', type: 'text', text: '\u{1F3E1}', left: 140, top: 150, width: 270, textAlign: 'center',
        fontFamily: 'Arial', fontSize: 190, fill: '#94a3b8' },
      { id: 'tag', type: 'rect', left: 600, top: 40, width: 270, height: 56, radius: 28, backgroundColor: '#f97316' },
      { id: 'tag-text', type: 'text', text: 'JUST LISTED', left: 600, top: 54, width: 270, textAlign: 'center',
        fontFamily: 'Arial Black', fontSize: 28, fontWeight: '900', fill: '#ffffff' },
      { id: 'headline', type: 'text', text: 'Your New\nHome Awaits', left: 600, top: 118, width: 440,
        fontFamily: 'Arial Black', fontSize: 60, fontWeight: '900', fill: '#ffffff', isHeadline: true, isEditable: true },
      { id: 'sub', type: 'text', text: 'Tour this beautiful home\nand make it yours.', left: 600, top: 290, width: 440,
        fontFamily: 'Arial', fontSize: 30, fill: '#cbd5e1', isSubtext: true, isEditable: true },
      { id: 'cta-link', type: 'text', text: 'SCHEDULE A SHOWING', left: 600, top: 446, width: 440,
        fontFamily: 'Arial Black', fontSize: 28, fontWeight: '900', fill: '#f97316', isEditable: true },
      { id: 'brand', type: 'text', text: '', left: 600, top: 505, width: 440,
        fontFamily: 'Arial', fontSize: 24, fill: '#94a3b8', isBrandSlot: true, isEditable: true },
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
    keywords: ['just sold', 'sold', 'closed on'],
    description: 'Just Sold real estate celebration graphic',
    layers: [
      { id: 'bg', type: 'rect', left: 0, top: 0, width: 1080, height: 1080, backgroundColor: '#14532d' },
      { id: 'sold', type: 'text', text: 'SOLD!', left: 80, top: 250, width: 500, keepText: true,
        fontFamily: 'Arial Black', fontSize: 140, fontWeight: '900', fill: '#4ade80',
        isHeadline: true, isEditable: true },
      { id: 'sub', type: 'text', text: 'Congratulations to my amazing\nbuyers — keys in hand! 🎉',
        left: 80, top: 600, fontFamily: 'Arial', fontSize: 52, fill: '#bbf7d0',
        isSubtext: true, isEditable: true },
      { id: 'photo-hint', type: 'rect', left: 600, top: 160, width: 420, height: 420,
        backgroundColor: '#166534', isPlaceholder: true },
      { id: 'photo-hint-icon', type: 'text', text: '\u{1F511}', left: 640, top: 270, width: 340, textAlign: 'center',
        fontFamily: 'Arial', fontSize: 170, fill: '#bbf7d0' },
      { id: 'brand', type: 'text', text: '', left: 80, top: 900,
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
      { id: 'phone', type: 'text', text: '', left: 80, top: 880,
        fontFamily: 'Arial Black', fontSize: 56, fill: '#38bdf8',
        isPhoneSlot: true, isBrandSlot: true, isEditable: true },
      { id: 'brand', type: 'text', text: '', left: 80, top: 980,
        fontFamily: 'Arial', fontSize: 36, fill: '#475569', isBrandSlot: true, isEditable: true },
    ],
  },

  // ── Before / After (universal) ───────────────────────────────────────────────
  {
    id: 'before-after-1',
    name: 'Before & After',
    category: 'before_after', minKeywordHits: 2,
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
      { id: 'headline', type: 'text', text: 'See The Difference', left: 40, top: 466, width: 560,
        fontFamily: 'Arial Black', fontSize: 52, fill: '#ffffff',
        isHeadline: true, isEditable: true },
      { id: 'brand', type: 'text', text: '', left: 620, top: 496, width: 420, textAlign: 'right',
        fontFamily: 'Arial', fontSize: 28, fill: '#f97316', isBrandSlot: true, isEditable: true },
    ],
  },

  // ── Testimonial (universal) ───────────────────────────────────────────────────
  {
    id: 'testimonial-1',
    name: 'Customer Testimonial',
    category: 'testimonial', minKeywordHits: 2,
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
      { id: 'quote', type: 'text', text: 'Quote',
        left: 80, top: 300, fontFamily: 'Georgia', fontSize: 56, fill: '#f1f5f9',
        isHeadline: true, isEditable: true },
      { id: 'brand', type: 'text', text: '', left: 80, top: 940,
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
      { id: 'kicker-rule', type: 'rect', left: 80, top: 820, width: 90, height: 6, backgroundColor: '#c084fc', requires: 'kicker' },
      { id: 'kicker', type: 'text', text: '', left: 80, top: 846, width: 640, fontFamily: 'Arial', fontSize: 28, fontWeight: 'bold', fill: '#c084fc', charSpacing: 300, isKicker: true, isEditable: true },
      { id: 'brand', type: 'text', text: '', left: 80, top: 930,
        fontFamily: 'Arial', fontSize: 40, fill: '#7c3aed', isBrandSlot: true, isEditable: true },
    ],
  },

  // ── Branded header (universal) ────────────────────────────────────────────────
  {
    id: 'branded-1',
    name: 'Branded Announcement',
    legacy: true,
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
      { id: 'phone', type: 'text', text: '', left: 80, top: 880,
        fontFamily: 'Arial Black', fontSize: 56, fill: '#f97316',
        isPhoneSlot: true, isBrandSlot: true, isEditable: true },
      { id: 'brand', type: 'text', text: '', left: 80, top: 980,
        fontFamily: 'Arial', fontSize: 36, fill: '#64748b', isBrandSlot: true, isEditable: true },
    ],
  },

  // ══ Universal creative DIRECTIONS ═════════════════════════════════════════════════
  // Six genuinely different art directions (headline treatment, layout, typography, accent
  // shapes and palette all differ). None contains topic copy: every word on the finished
  // graphic comes from the caption, the user's trade name, or their Brand Kit. Empty Brand
  // Kit slots render nothing, and decorative frames tied to them (`requires`) are dropped,
  // so each direction looks complete with or without business details.

  // 1 · POSTER — dark, huge uppercase headline, glow + edge bar, pill CTA.
  {
    id: 'u-poster',
    name: 'Bold Poster',
    category: 'brand', direction: true, tradeAccent: true,
    layoutFamily: 'poster',
    format: 'square',
    width: 1080, height: 1080,
    background: '#0b1220',
    previewColors: ['#0b1220', '#f97316'],
    trades: [],
    keywords: [],
    description: 'Dark poster with a huge uppercase headline and pill call-to-action',
    layers: [
      { id: 'bg', type: 'rect', left: 0, top: 0, width: 1080, height: 1080, backgroundColor: '#0b1220' },
      { id: 'edge', type: 'rect', left: 1024, top: 0, width: 56, height: 1080, backgroundColor: '#f97316' },
      { id: 'kicker-bar', type: 'rect', left: 80, top: 92, width: 56, height: 8, backgroundColor: '#f97316' },
      { id: 'kicker', type: 'text', text: '', left: 80, top: 118, width: 800, fontFamily: 'Arial Black', fontSize: 28, fontWeight: '900',
        fill: '#f97316', charSpacing: 260, isKicker: true, isEditable: true },
      { id: 'headline', type: 'text', text: 'HEADLINE', left: 80, top: 210, width: 880, fontFamily: 'Arial Black', fontSize: 120, fontWeight: '900',
        fill: '#ffffff', uppercase: true, isHeadline: true, isEditable: true },
      { id: 'sub', type: 'text', text: '', left: 80, top: 640, width: 820, fontFamily: 'Arial', fontSize: 42, fill: '#cbd5e1',
        isSubtext: true, isEditable: true },
      { id: 'sparse-disc', type: 'rect', left: 690, top: 600, width: 270, height: 270, radius: 135, backgroundColor: '#f97316', opacity: 0.18, sparseOnly: true },
      { id: 'sparse-icon', type: 'text', text: '\u2B50', left: 690, top: 655, width: 270, textAlign: 'center', fontFamily: 'Arial', fontSize: 140, isIcon: true, sparseOnly: true },
      { id: 'cta', type: 'rect', left: 80, top: 800, width: 520, height: 88, radius: 44, backgroundColor: '#f97316' },
      { id: 'cta-text', type: 'text', text: 'LEARN MORE', left: 104, top: 825, width: 472, textAlign: 'center', fontFamily: 'Arial Black',
        fontSize: 34, fontWeight: '900', fill: '#0b1220', isEditable: true },
      { id: 'rule', type: 'rect', left: 80, top: 930, width: 864, height: 2, backgroundColor: '#ffffff', opacity: 0.18, requires: 'contact' },
      { id: 'brand', type: 'text', text: '', left: 80, top: 960, width: 520, fontFamily: 'Arial Black', fontSize: 36, fontWeight: '900',
        fill: '#ffffff', isBrandSlot: true, isEditable: true },
      { id: 'phone', type: 'text', text: '', left: 560, top: 960, width: 384, textAlign: 'right', fontFamily: 'Arial Black', fontSize: 36,
        fontWeight: '900', fill: '#f97316', isPhoneSlot: true, isBrandSlot: true, isEditable: true },
    ],
  },

  // 2 · EDITORIAL — warm paper, serif headline, vertical accent rule, dark footer band.
  {
    id: 'u-editorial',
    name: 'Editorial',
    category: 'brand', direction: true, tradeAccent: true,
    layoutFamily: 'editorial',
    format: 'square',
    width: 1080, height: 1080,
    background: '#f6f0e4',
    previewColors: ['#f6f0e4', '#b45309'],
    trades: [],
    keywords: [],
    description: 'Warm paper-white magazine layout with a serif headline',
    layers: [
      { id: 'bg', type: 'rect', left: 0, top: 0, width: 1080, height: 1080, backgroundColor: '#f6f0e4' },
      { id: 'bar', type: 'rect', left: 80, top: 90, width: 12, height: 780, backgroundColor: '#b45309' },
      { id: 'kicker', type: 'text', text: '', left: 130, top: 96, width: 800, fontFamily: 'Arial', fontSize: 28, fontWeight: 'bold',
        fill: '#b45309', charSpacing: 320, isKicker: true, isEditable: true },
      { id: 'headline', type: 'text', text: 'Headline', left: 130, top: 170, width: 820, fontFamily: 'Georgia', fontSize: 104, fontWeight: 'bold',
        fill: '#1c1917', isHeadline: true, isEditable: true },
      { id: 'rule', type: 'rect', left: 130, top: 640, width: 140, height: 6, backgroundColor: '#b45309' },
      { id: 'sub', type: 'text', text: '', left: 130, top: 676, width: 820, fontFamily: 'Arial', fontSize: 40, fill: '#44403c',
        isSubtext: true, isEditable: true },
      { id: 'sparse-disc', type: 'rect', left: 720, top: 640, width: 240, height: 240, radius: 120, backgroundColor: '#b45309', opacity: 0.14, sparseOnly: true },
      { id: 'sparse-icon', type: 'text', text: '\u2B50', left: 720, top: 692, width: 240, textAlign: 'center', fontFamily: 'Arial', fontSize: 120, isIcon: true, sparseOnly: true },
      { id: 'cta-text', type: 'text', text: 'LEARN MORE', left: 130, top: 830, width: 820, fontFamily: 'Arial Black', fontSize: 32,
        fontWeight: '900', fill: '#b45309', charSpacing: 120, isEditable: true },
      { id: 'footer', type: 'rect', left: 0, top: 936, width: 1080, height: 144, backgroundColor: '#1c1917', requires: 'contact' },
      { id: 'foot-accent', type: 'rect', left: 0, top: 1062, width: 1080, height: 18, backgroundColor: '#b45309' },
      { id: 'brand', type: 'text', text: '', left: 80, top: 976, width: 540, fontFamily: 'Arial Black', fontSize: 36, fontWeight: '900',
        fill: '#f6f0e4', isBrandSlot: true, isEditable: true },
      { id: 'phone', type: 'text', text: '', left: 600, top: 978, width: 400, textAlign: 'right', fontFamily: 'Arial', fontSize: 34,
        fontWeight: 'bold', fill: '#fcd34d', isPhoneSlot: true, isBrandSlot: true, isEditable: true },
    ],
  },

  // 3 · COLOR BLOCK — bold color column with a big topic icon; text on clean white.
  {
    id: 'u-colorblock',
    name: 'Color Block',
    category: 'brand', direction: true,
    layoutFamily: 'colorblock',
    format: 'square',
    width: 1080, height: 1080,
    background: '#ffffff',
    previewColors: ['#4f46e5', '#ffffff'],
    trades: [],
    keywords: [],
    description: 'Bold color column with a topic icon beside the message',
    layers: [
      { id: 'bg', type: 'rect', left: 0, top: 0, width: 1080, height: 1080, backgroundColor: '#ffffff' },
      { id: 'panel', type: 'rect', left: 0, top: 0, width: 400, height: 1080, backgroundColor: '#4f46e5' },
      { id: 'ring', type: 'rect', left: 60, top: 300, width: 280, height: 280, radius: 140, backgroundColor: '#ffffff', opacity: 0.16 },
      { id: 'ring2', type: 'rect', left: 100, top: 340, width: 200, height: 200, radius: 100, backgroundColor: '#ffffff', opacity: 0.2 },
      { id: 'icon', type: 'text', text: '\u2B50', left: 0, top: 368, width: 400, textAlign: 'center', fontFamily: 'Arial', fontSize: 120, isIcon: true },
      { id: 'kicker-rule', type: 'rect', left: 40, top: 930, width: 60, height: 5, backgroundColor: '#ffffff', requires: 'kicker' },
      { id: 'kicker', type: 'text', text: '', left: 40, top: 950, width: 320, fontFamily: 'Arial', fontSize: 24, fontWeight: 'bold',
        fill: '#ffffff', charSpacing: 240, isKicker: true, isEditable: true },
      { id: 'headline', type: 'text', text: 'Headline', left: 460, top: 150, width: 560, fontFamily: 'Arial Black', fontSize: 92, fontWeight: '900',
        fill: '#0f172a', isHeadline: true, isEditable: true },
      { id: 'rule', type: 'rect', left: 460, top: 600, width: 120, height: 8, backgroundColor: '#4f46e5' },
      { id: 'sub', type: 'text', text: '', left: 460, top: 636, width: 560, fontFamily: 'Arial', fontSize: 38, fill: '#475569',
        isSubtext: true, isEditable: true },
      { id: 'cta', type: 'rect', left: 460, top: 800, width: 500, height: 84, radius: 14, backgroundColor: '#0f172a' },
      { id: 'cta-text', type: 'text', text: 'LEARN MORE', left: 484, top: 823, width: 452, textAlign: 'center', fontFamily: 'Arial Black',
        fontSize: 32, fontWeight: '900', fill: '#ffffff', isEditable: true },
      { id: 'brand', type: 'text', text: '', left: 460, top: 930, width: 560, fontFamily: 'Arial Black', fontSize: 34, fontWeight: '900',
        fill: '#0f172a', isBrandSlot: true, isEditable: true },
      { id: 'phone', type: 'text', text: '', left: 460, top: 978, width: 560, fontFamily: 'Arial', fontSize: 34, fontWeight: 'bold',
        fill: '#4f46e5', isPhoneSlot: true, isBrandSlot: true, isEditable: true },
    ],
  },

  // 4 · SPOTLIGHT — centered icon disc with a halo, centered type stack, pill CTA.
  {
    id: 'u-spotlight',
    name: 'Spotlight',
    category: 'brand', direction: true,
    layoutFamily: 'spotlight',
    format: 'square',
    width: 1080, height: 1080,
    background: '#0f2a2e',
    previewColors: ['#0f2a2e', '#2dd4bf'],
    trades: [],
    keywords: [],
    description: 'Centered icon disc with a soft halo and a clean type stack',
    layers: [
      { id: 'bg', type: 'rect', left: 0, top: 0, width: 1080, height: 1080, backgroundColor: '#0f2a2e' },
      { id: 'halo', type: 'rect', left: 310, top: 20, width: 460, height: 460, radius: 230, backgroundColor: '#2dd4bf', opacity: 0.14 },
      { id: 'disc', type: 'rect', left: 370, top: 80, width: 340, height: 340, radius: 170, backgroundColor: '#2dd4bf' },
      { id: 'icon', type: 'text', text: '\u2B50', left: 370, top: 140, width: 340, textAlign: 'center', fontFamily: 'Arial', fontSize: 170, isIcon: true },
      { id: 'kicker', type: 'text', text: '', left: 90, top: 450, width: 900, textAlign: 'center', fontFamily: 'Arial', fontSize: 28,
        fontWeight: 'bold', fill: '#2dd4bf', charSpacing: 300, isKicker: true, isEditable: true },
      { id: 'headline', type: 'text', text: 'Headline', left: 90, top: 500, width: 900, textAlign: 'center', fontFamily: 'Arial Black',
        fontSize: 84, fontWeight: '900', fill: '#ffffff', isHeadline: true, isEditable: true },
      { id: 'sub', type: 'text', text: '', left: 110, top: 726, width: 860, textAlign: 'center', fontFamily: 'Arial', fontSize: 40,
        fill: '#b6e3df', isSubtext: true, isEditable: true },
      { id: 'cta', type: 'rect', left: 310, top: 866, width: 460, height: 72, radius: 36, backgroundColor: '#2dd4bf' },
      { id: 'cta-text', type: 'text', text: 'LEARN MORE', left: 334, top: 884, width: 412, textAlign: 'center', fontFamily: 'Arial Black',
        fontSize: 30, fontWeight: '900', fill: '#0f2a2e', isEditable: true },
      { id: 'brand', type: 'text', text: '', left: 90, top: 962, width: 900, textAlign: 'center', fontFamily: 'Arial Black', fontSize: 30,
        fontWeight: '900', fill: '#ffffff', isBrandSlot: true, isEditable: true },
      { id: 'phone', type: 'text', text: '', left: 90, top: 1004, width: 900, textAlign: 'center', fontFamily: 'Arial', fontSize: 30,
        fontWeight: 'bold', fill: '#2dd4bf', isPhoneSlot: true, isBrandSlot: true, isEditable: true },
    ],
  },

  // 5 · FRAME — navy with a fine gold frame and corner studs, centered italic serif.
  {
    id: 'u-frame',
    name: 'Gold Frame',
    category: 'brand', direction: true,
    layoutFamily: 'frame',
    format: 'square',
    width: 1080, height: 1080,
    background: '#0e2238',
    previewColors: ['#0e2238', '#d4a64a'],
    trades: [],
    keywords: [],
    description: 'Elegant framed layout with a centered italic serif headline',
    layers: [
      { id: 'bg', type: 'rect', left: 0, top: 0, width: 1080, height: 1080, backgroundColor: '#0e2238' },
      { id: 'f-top', type: 'rect', left: 48, top: 48, width: 984, height: 4, backgroundColor: '#d4a64a' },
      { id: 'f-bot', type: 'rect', left: 48, top: 1028, width: 984, height: 4, backgroundColor: '#d4a64a' },
      { id: 'f-left', type: 'rect', left: 48, top: 48, width: 4, height: 984, backgroundColor: '#d4a64a' },
      { id: 'f-right', type: 'rect', left: 1028, top: 48, width: 4, height: 984, backgroundColor: '#d4a64a' },
      { id: 'c1', type: 'rect', left: 36, top: 36, width: 28, height: 28, backgroundColor: '#d4a64a' },
      { id: 'c2', type: 'rect', left: 1016, top: 36, width: 28, height: 28, backgroundColor: '#d4a64a' },
      { id: 'c3', type: 'rect', left: 36, top: 1016, width: 28, height: 28, backgroundColor: '#d4a64a' },
      { id: 'c4', type: 'rect', left: 1016, top: 1016, width: 28, height: 28, backgroundColor: '#d4a64a' },
      { id: 'icon', type: 'text', text: '\u2B50', left: 340, top: 110, width: 400, textAlign: 'center', fontFamily: 'Arial', fontSize: 96, isIcon: true },
      { id: 'kicker', type: 'text', text: '', left: 140, top: 240, width: 800, textAlign: 'center', fontFamily: 'Arial', fontSize: 26,
        fontWeight: 'bold', fill: '#d4a64a', charSpacing: 400, isKicker: true, isEditable: true },
      { id: 'headline', type: 'text', text: 'Headline', left: 140, top: 300, width: 800, textAlign: 'center', fontFamily: 'Georgia',
        fontSize: 96, fontWeight: 'bold', fontStyle: 'italic', fill: '#ffffff', isHeadline: true, isEditable: true },
      { id: 'orn-l', type: 'rect', left: 380, top: 700, width: 120, height: 3, backgroundColor: '#d4a64a' },
      { id: 'orn-m', type: 'rect', left: 531, top: 692, width: 18, height: 18, backgroundColor: '#d4a64a' },
      { id: 'orn-r', type: 'rect', left: 580, top: 700, width: 120, height: 3, backgroundColor: '#d4a64a' },
      { id: 'sub', type: 'text', text: '', left: 190, top: 740, width: 700, textAlign: 'center', fontFamily: 'Arial', fontSize: 36,
        fill: '#cbd5e1', isSubtext: true, isEditable: true },
      { id: 'cta-text', type: 'text', text: 'LEARN MORE', left: 140, top: 870, width: 800, textAlign: 'center', fontFamily: 'Arial Black',
        fontSize: 30, fontWeight: '900', fill: '#d4a64a', charSpacing: 160, isEditable: true },
      { id: 'brand', type: 'text', text: '', left: 140, top: 930, width: 800, textAlign: 'center', fontFamily: 'Arial', fontSize: 30,
        fontWeight: 'bold', fill: '#ffffff', isBrandSlot: true, isEditable: true },
      { id: 'phone', type: 'text', text: '', left: 140, top: 972, width: 800, textAlign: 'center', fontFamily: 'Arial', fontSize: 30,
        fontWeight: 'bold', fill: '#d4a64a', isPhoneSlot: true, isBrandSlot: true, isEditable: true },
    ],
  },

  // 6 · STRIPE — a full-width color slab holds a giant uppercase headline; dark info strip below.
  {
    id: 'u-stripe',
    name: 'Color Slab',
    category: 'brand', direction: true, tradeAccent: true,
    layoutFamily: 'stripe',
    format: 'square',
    width: 1080, height: 1080,
    background: '#111827',
    previewColors: ['#facc15', '#111827'],
    trades: [],
    keywords: [],
    description: 'Full-width color slab with a giant headline and a dark info strip',
    layers: [
      { id: 'bg', type: 'rect', left: 0, top: 0, width: 1080, height: 1080, backgroundColor: '#111827' },
      { id: 'panel', type: 'rect', left: 0, top: 0, width: 1080, height: 640, backgroundColor: '#facc15' },
      { id: 'tab', type: 'rect', left: 80, top: 640, width: 420, height: 60, backgroundColor: '#facc15', requires: 'kicker' },
      { id: 'kicker', type: 'text', text: '', left: 96, top: 656, width: 388, textAlign: 'center', fontFamily: 'Arial Black', fontSize: 24,
        fontWeight: '900', fill: '#111827', charSpacing: 120, isKicker: true, isEditable: true },
      { id: 'headline', type: 'text', text: 'HEADLINE', left: 80, top: 90, width: 920, fontFamily: 'Arial Black', fontSize: 132, fontWeight: '900',
        fill: '#111827', uppercase: true, isHeadline: true, isEditable: true },
      { id: 'sub', type: 'text', text: '', left: 80, top: 740, width: 920, fontFamily: 'Arial', fontSize: 42, fill: '#e5e7eb',
        isSubtext: true, isEditable: true },
      { id: 'cta', type: 'rect', left: 80, top: 880, width: 420, height: 80, radius: 10, backgroundColor: '#facc15' },
      { id: 'cta-text', type: 'text', text: 'LEARN MORE', left: 100, top: 902, width: 380, textAlign: 'center', fontFamily: 'Arial Black',
        fontSize: 32, fontWeight: '900', fill: '#111827', isEditable: true },
      { id: 'brand', type: 'text', text: '', left: 540, top: 884, width: 460, textAlign: 'right', fontFamily: 'Arial Black', fontSize: 34,
        fontWeight: '900', fill: '#ffffff', isBrandSlot: true, isEditable: true },
      { id: 'phone', type: 'text', text: '', left: 540, top: 930, width: 460, textAlign: 'right', fontFamily: 'Arial', fontSize: 34,
        fontWeight: 'bold', fill: '#facc15', isPhoneSlot: true, isBrandSlot: true, isEditable: true },
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
  score += keywordHits(lower, tpl.keywords) * 4;

  // Keyword overlap with the user's TRADE keywords (relevance signal)
  score += keywordHits(lower, tradeKeywords) * 2;

  // The plain branded layout is a last-resort fallback, never a first pick.
  if (tpl.id === 'branded-1') score = 1;

  return score;
}

/** Escape a keyword for use in a RegExp. */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Count keywords present in `lower` using WORD boundaries (prefix match for longer words so
 * "inspect" matches "inspection"; whole-word for short ones so "ac" never matches "back").
 */
export function keywordHits(lower: string, keywords: string[]): number {
  let hits = 0;
  for (const raw of keywords) {
    const kw = raw.toLowerCase().trim();
    if (!kw) continue;
    const re = kw.length <= 3 ? new RegExp(`(^|[^a-z0-9])${escapeRe(kw)}($|[^a-z0-9])`) : new RegExp(`(^|[^a-z0-9])${escapeRe(kw)}`);
    if (re.test(lower)) hits++;
  }
  return hits;
}

/**
 * Is this template RELEVANT to the post? Templates whose copy is about something specific
 * (a free quote, before/after, a testimonial, a storm alert…) are only offered when the post
 * actually talks about it, so a roofing post never gets an insurance "FREE QUOTE" design and an
 * HVAC post never gets a "Customer Name" testimonial. Generic layouts (no keywords) are always
 * eligible as fallbacks. A trade-specific template for a DIFFERENT trade needs 2+ keyword hits.
 */
function isEligible(tpl: DesignTemplate, postText: string, tradeId: string): boolean {
  if (tpl.keywords.length === 0) return true; // generic layout
  const hits = keywordHits(postText.toLowerCase(), tpl.keywords);
  if (hits < (tpl.minKeywordHits ?? 1)) return false;
  if (tpl.trades.length === 0 || tpl.trades.includes(tradeId)) return true;
  return hits >= 2;
}

export interface ScoredTemplate {
  template: DesignTemplate;
  score: number;
}

/** Directions on a LIGHT background. Every set of three contains exactly one, alternating
 *  between them by topic so no single light design dominates. */
const LIGHT_DIRECTIONS = ['u-editorial', 'u-colorblock'];
/** Dark directions, in rotation order. */
const DARK_DIRECTIONS = ['u-poster', 'u-spotlight', 'u-frame', 'u-stripe'];
/** Directions that read too much like a given topic layout family to sit beside it. */
const LOOKS_LIKE: Record<string, string[]> = {
  hero: ['poster'],         // big dark left-aligned headline
  stat: ['poster', 'stripe'],
  badge: ['spotlight'],     // centred focal shape
};

/** The first few meaningful words: stable while the user types the rest of the caption. */
function cleanTopic(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3).slice(0, 4).join(' ');
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

/**
 * Return up to `max` templates (default 3):
 *   1. at most ONE topic-specific design (the best relevant match), then
 *   2. universal creative DIRECTIONS: exactly one light design plus dark ones, never a direction
 *      in the same layout family as (or visually close to) the topic design.
 * The pick is deterministic per trade + topic, so the cards never flicker while the user types.
 */
export function suggestTemplates(opts: {
  postText: string;
  tradeId: string;
  tradeKeywords: string[];
  max?: number;
}): ScoredTemplate[] {
  const { postText, tradeId, tradeKeywords, max = 3 } = opts;

  const scored = TEMPLATES
    .filter((tpl) => !tpl.direction && !tpl.legacy && isEligible(tpl, postText, tradeId))
    .map((tpl) => ({ template: tpl, score: scoreTemplate(tpl, postText, tradeId, tradeKeywords) }))
    .filter((s) => s.score > 0);
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.template.trades.includes(tradeId) ? 1 : 0) - (a.template.trades.includes(tradeId) ? 1 : 0);
  });

  const picked: ScoredTemplate[] = [];
  const blocked = new Set<string>();
  if (scored[0] && max > 1) {
    picked.push(scored[0]);
    const fam = scored[0].template.layoutFamily || scored[0].template.category;
    blocked.add(fam);
    for (const f of LOOKS_LIKE[fam] || []) blocked.add(f);
  }

  const seed = hashStr(`${tradeId}|${picked[0]?.template.id ?? ''}|${cleanTopic(postText)}`);
  const byId = (id: string) => TEMPLATES.find((t) => t.id === id)!;
  const ok = (t: DesignTemplate) => !blocked.has(t.layoutFamily || '');

  const lights = LIGHT_DIRECTIONS.map(byId).filter(ok);
  const light = lights.length ? lights[hashStr(`light|${cleanTopic(postText)}|${tradeId}`) % lights.length] : null;
  const darkAll = DARK_DIRECTIONS.map(byId).filter(ok);
  const start = darkAll.length ? (seed >>> 3) % darkAll.length : 0;
  const darks = [...darkAll.slice(start), ...darkAll.slice(0, start)];

  const slots = max - picked.length;
  const dirPicks: DesignTemplate[] = [];
  if (light && slots > 0) dirPicks.push(light);
  for (const d of darks) { if (dirPicks.length >= slots) break; dirPicks.push(d); }
  // Visual rhythm: dark, light, dark when there is no topic design; otherwise topic, dark, light.
  if (picked.length === 0 && dirPicks.length === 3) dirPicks.splice(0, 2, dirPicks[1], dirPicks[0]);
  else if (dirPicks.length === 2) dirPicks.reverse();

  for (const d of dirPicks) picked.push({ template: d, score: 0 });
  return picked.slice(0, max);
}
