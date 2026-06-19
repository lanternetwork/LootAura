import { sanitizeHtml } from '@/lib/sanitize'
import type { SaleDraftPayload } from '@/lib/validation/saleDraft'

/** Matches `SaleDraftPayloadSchema` formData.description max. */
export const SALE_PERSISTABLE_DESCRIPTION_MAX_LENGTH = 5000

/** Matches `SaleDraftItemSchema` and items API max. */
export const ITEM_PERSISTABLE_DESCRIPTION_MAX_LENGTH = 2000

/**
 * Strip HTML and normalize user-controlled descriptions before DB persistence.
 * Returns null for missing, non-string, or whitespace-only input after sanitization.
 */
export function sanitizePersistableDescription(
  value: string | null | undefined,
  maxLength: number
): string | null {
  if (value == null || typeof value !== 'string') return null
  const sanitized = sanitizeHtml(value, { stripHtml: true, maxLength }).trim()
  return sanitized.length > 0 ? sanitized : null
}

/** Sanitize sale + item descriptions on a validated draft payload before autosave. */
export function sanitizeSaleDraftPayloadDescriptions(payload: SaleDraftPayload): SaleDraftPayload {
  const formData = { ...payload.formData }
  if (typeof formData.description === 'string') {
    formData.description =
      sanitizePersistableDescription(formData.description, SALE_PERSISTABLE_DESCRIPTION_MAX_LENGTH) ?? ''
  }

  const items = payload.items.map((item) => {
    if (typeof item.description !== 'string') return item
    return {
      ...item,
      description:
        sanitizePersistableDescription(item.description, ITEM_PERSISTABLE_DESCRIPTION_MAX_LENGTH) ?? '',
    }
  })

  return { ...payload, formData, items }
}
