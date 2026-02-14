/**
 * Email logging utilities
 * Server-only module for safe email address logging (PII protection)
 */

/**
 * Redact an email address for safe logging
 * 
 * Converts "user@example.com" to "u***@example.com"
 * Preserves domain for debugging while hiding the local part
 * 
 * @param email - The email address to redact
 * @returns Redacted email address safe for logging
 */
export function redactEmailForLogging(email: string | null | undefined): string {
  if (!email || typeof email !== 'string' || email.trim() === '') {
    return '[invalid]'
  }

  const trimmed = email.trim()
  const atIndex = trimmed.indexOf('@')
  
  // If no @ found, return redacted version
  if (atIndex === -1) {
    return '[invalid-format]'
  }

  const localPart = trimmed.substring(0, atIndex)
  const domain = trimmed.substring(atIndex + 1)

  // If local part is empty, return redacted
  if (localPart.length === 0) {
    return '[invalid-format]'
  }

  // Show first character of local part, then redact the rest
  // "user@example.com" -> "u***@example.com"
  const firstChar = localPart[0]
  const redactedLocal = firstChar + '***'
  
  return `${redactedLocal}@${domain}`
}

/**
 * Redact email addresses in metadata object for safe logging
 * 
 * Creates a shallow copy of metadata with known email fields redacted.
 * Known email field names: 'ownerEmail', 'recipientEmail', 'toEmail'
 * 
 * @param metadata - The metadata object to redact
 * @returns A new object with email fields redacted (original unchanged)
 */
export function redactMetadataForLogging(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== 'object') {
    return metadata
  }

  // Known email field names that should be redacted
  const emailFields = ['ownerEmail', 'recipientEmail', 'toEmail', 'email']
  
  const redacted = { ...metadata }
  for (const field of emailFields) {
    if (field in redacted && typeof redacted[field] === 'string') {
      redacted[field] = redactEmailForLogging(redacted[field] as string)
    }
  }
  
  return redacted
}
