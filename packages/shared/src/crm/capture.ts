// Discover capture required-field validation — pure logic.
// (Requirement 4.7)

// Required social-origin fields when capturing a lead in the Discover edition.
export const DISCOVER_REQUIRED_FIELDS = ['sourcePlatform', 'sourceUrl', 'leadSource', 'consentBasis'] as const;

export interface CaptureValidationResult {
  valid: boolean;
  missing: string[];
}

/**
 * Validate a candidate lead for Discover capture.
 * Accepted iff all required social-origin fields are present and non-empty.
 * When rejected, every missing field is reported.
 * (Requirement 4.7)
 */
export function validateDiscoverCapture(lead: Record<string, any>): CaptureValidationResult {
  const missing = DISCOVER_REQUIRED_FIELDS.filter((f) => {
    const v = lead[f];
    return v == null || String(v).trim() === '';
  });
  return { valid: missing.length === 0, missing };
}
