/**
 * Validates OAuth callback URLs for Universal Links/App Links.
 * Ensures strict security: only https://lootaura.com/auth/callback is allowed.
 */

export interface ValidationResult {
  isValid: boolean;
  hasCodeParam: boolean;
  origin: string | null;
  pathname: string | null;
}

/**
 * Validates an OAuth callback URL.
 * 
 * Requirements:
 * - Must be https://lootaura.com/auth/callback (exact path match)
 * - Rejects non-https, other hosts, other paths
 * - Allows query string (but doesn't log it)
 * 
 * @param url - The URL to validate
 * @returns Validation result with security-safe information
 */
export function validateAuthCallbackUrl(url: string | null): ValidationResult {
  const result: ValidationResult = {
    isValid: false,
    hasCodeParam: false,
    origin: null,
    pathname: null,
  };

  if (!url) {
    return result;
  }

  try {
    const parsedUrl = new URL(url);

    // Extract origin and pathname for logging (safe to log)
    result.origin = parsedUrl.origin;
    result.pathname = parsedUrl.pathname;

    // Strict validation: must be https://lootaura.com/auth/callback
    if (parsedUrl.protocol !== 'https:') {
      return result;
    }

    if (parsedUrl.hostname !== 'lootaura.com') {
      return result;
    }

    // Exact path match: /auth/callback (no trailing path segments)
    if (parsedUrl.pathname !== '/auth/callback') {
      return result;
    }

    // Check for code param (safe to check, but don't log the value)
    result.hasCodeParam = parsedUrl.searchParams.has('code');

    // All checks passed
    result.isValid = true;
    return result;
  } catch (e) {
    // URL parsing failed - invalid
    return result;
  }
}
