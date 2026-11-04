/**
 * Wingman edit-intent router — decides HOW to apply an "Ask Wingman to Edit" request.
 *
 * Product rule: "For simple edits, modify canvas elements directly. For actual photo
 * transformations, use an image-editing model. Do not regenerate the entire design for minor
 * changes." So we classify each instruction into one of:
 *
 *   • 'canvas' — a deterministic change to existing editable layers (text size, color,
 *     background, position, adding the brand logo). Applied INSTANTLY, at ZERO AI cost, and
 *     keeps text/logos as exact editable layers.
 *   • 'photo'  — a change to the actual photograph's pixels (remove/add/replace objects,
 *     remove background, relighting). Sent to the AI image editor (metered, paid plans).
 *   • 'unknown' — we couldn't tell. We do NOT silently spend AI credits on a guess; the UI asks
 *     the user to rephrase or confirm sending it to the photo editor.
 *
 * This is intentionally simple keyword/pattern matching (no LLM) so it is instant, free,
 * predictable, and testable. Canvas ops are returned as structured actions the editor applies.
 */

export type CanvasAction =
  | { kind: 'resizeText'; target: 'headline' | 'all'; factor: number }
  | { kind: 'setBackground'; color: string }
  | { kind: 'setTextColor'; target: 'headline' | 'all'; color: string }
  | { kind: 'moveText'; target: 'phone' | 'headline'; to: 'top' | 'bottom' }
  | { kind: 'addLogo' }
  | { kind: 'applyBrand' };

export type EditIntent =
  | { route: 'canvas'; actions: CanvasAction[]; summary: string }
  | { route: 'photo'; instruction: string; summary: string }
  | { route: 'unknown'; summary: string };

// Named colors a non-designer is likely to say. Hex values tuned for the premium palette.
const COLORS: Record<string, string> = {
  black: '#000000', white: '#ffffff', charcoal: '#18181b', gray: '#6b7280', grey: '#6b7280',
  red: '#dc2626', orange: '#f97316', amber: '#f59e0b', yellow: '#facc15', gold: '#d4a017',
  green: '#16a34a', teal: '#0d9488', blue: '#2563eb', navy: '#1e3a5f', purple: '#7c3aed',
  pink: '#db2777', brown: '#78350f',
};

function findColor(s: string): string | null {
  const hex = s.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i);
  if (hex) return hex[0].toLowerCase();
  for (const [name, val] of Object.entries(COLORS)) {
    if (new RegExp(`\\b${name}\\b`).test(s)) return val;
  }
  return null;
}

// Words that signal a change to the PHOTO's pixels (needs the image model).
const PHOTO_VERBS = /\b(remove|erase|delete|get rid of|take out|clean up|replace|swap|add (?:a|an|some|more)\b|insert|put (?:a|an)\b|change the (?:sky|weather|season|lighting|light)|brighten the (?:sky|photo|image|picture)|darken the (?:sky|photo|image|picture)|relight|make it (?:sunny|night|daytime|snowy)|blur the background|remove the background|background removal|cut out|isolate)\b/;

// Photo-domain nouns: a "remove/replace" aimed at these is clearly a photo edit.
const PHOTO_NOUNS = /\b(person|people|man|woman|kid|child|car|truck|trash|garbage|bin|cans?|sign|pole|wire|wires|tree|branch|shadow|reflection|crack|stain|clutter|object|background|sky|grass|lawn|driveway|house|roof|fence|window|door|cloud|clouds|weather)\b/;

const TEXT_TARGET_HEADLINE = /\b(headline|title|heading|main text|big text)\b/;

export function classifyEditIntent(raw: string): EditIntent {
  const s = String(raw || '').toLowerCase().trim();
  if (!s) return { route: 'unknown', summary: 'Tell Wingman what to change.' };

  const actions: CanvasAction[] = [];

  // ── Logo / branding (canvas — exact asset, never AI-painted) ──
  if (/\b(add|put|place|insert|show)\b.*\blogo\b/.test(s) || /\blogo\b.*\b(add|on|in the corner)\b/.test(s)) {
    actions.push({ kind: 'addLogo' });
  }
  if (/\b(apply|use|add)\b.*\b(my )?brand(ing| kit)?\b/.test(s)) {
    actions.push({ kind: 'applyBrand' });
  }

  // ── Text size ──
  const bigger = /\b(bigger|larger|increase|enlarge|make .* (big|large))\b/.test(s);
  const smaller = /\b(smaller|shrink|decrease|reduce|make .* small)\b/.test(s);
  const mentionsText = /\b(text|headline|title|heading|font|words|phone|number)\b/.test(s);
  if ((bigger || smaller) && mentionsText) {
    actions.push({
      kind: 'resizeText',
      target: TEXT_TARGET_HEADLINE.test(s) ? 'headline' : 'all',
      factor: bigger ? 1.2 : 0.83,
    });
  }

  // ── Background color (only when it's clearly the design background, not the photo) ──
  const color = findColor(s);
  const isBgColor = /\bbackground\b/.test(s) && !!color && !/\b(remove|erase|blur|cut out|isolate)\b/.test(s);
  if (isBgColor && color) actions.push({ kind: 'setBackground', color });

  // ── Text color ──
  if (!isBgColor && color && /\b(text|headline|title|font|words)\b/.test(s) && /\b(make|change|turn|set|color)\b/.test(s)) {
    actions.push({ kind: 'setTextColor', target: TEXT_TARGET_HEADLINE.test(s) ? 'headline' : 'all', color });
  }

  // ── Move text ──
  const moveTo = /\b(bottom|lower)\b/.test(s) ? 'bottom' : /\b(top|upper)\b/.test(s) ? 'top' : null;
  if (moveTo && /\b(move|put|place|position)\b/.test(s)) {
    if (/\b(phone|number|contact)\b/.test(s)) actions.push({ kind: 'moveText', target: 'phone', to: moveTo });
    else if (TEXT_TARGET_HEADLINE.test(s)) actions.push({ kind: 'moveText', target: 'headline', to: moveTo });
  }

  // A photo edit wins if the request is clearly about the photograph's pixels. We only route
  // to the photo model when there is no canvas action that already fully satisfies it — e.g.
  // "change the background to black" is a canvas fill, but "remove the background" is photo.
  const photoIntent = PHOTO_VERBS.test(s) && (PHOTO_NOUNS.test(s) || /\bbackground\b/.test(s) || /\b(sky|lighting|light|weather)\b/.test(s));

  if (photoIntent && actions.length === 0) {
    return { route: 'photo', instruction: String(raw).trim(), summary: 'Editing your photo with AI…' };
  }

  if (actions.length > 0) {
    return { route: 'canvas', actions, summary: describe(actions) };
  }

  // "Make this look more professional" etc. — too vague to act on deterministically, and we
  // won't burn AI credits on a guess. Ask the user.
  return { route: 'unknown', summary: 'Try something specific, like "make the headline bigger" or "remove the car".' };
}

function describe(actions: CanvasAction[]): string {
  const parts = actions.map((a) => {
    switch (a.kind) {
      case 'resizeText': return `${a.factor > 1 ? 'Enlarged' : 'Shrank'} ${a.target === 'headline' ? 'the headline' : 'the text'}`;
      case 'setBackground': return 'Changed the background color';
      case 'setTextColor': return `Recolored ${a.target === 'headline' ? 'the headline' : 'the text'}`;
      case 'moveText': return `Moved the ${a.target} to the ${a.to}`;
      case 'addLogo': return 'Added your logo';
      case 'applyBrand': return 'Applied your brand';
    }
  });
  return parts.join(' · ');
}
