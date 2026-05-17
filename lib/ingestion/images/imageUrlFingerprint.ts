import { createHash } from 'node:crypto'

/** Non-PII stable fingerprint for image URL observability (never log raw URLs). */
export function imageUrlFingerprint(url: string): string {
  return createHash('sha256').update(url.trim()).digest('hex').slice(0, 16)
}

export function imageUrlFingerprints(urls: string[]): string[] {
  return urls.map(imageUrlFingerprint)
}
