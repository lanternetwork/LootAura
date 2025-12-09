import { z } from 'zod'

/**
 * Schema for validating social links input
 * All fields are optional URLs
 */
export const SocialLinksSchema = z.object({
  facebook: z.string().optional().nullable(),
  instagram: z.string().optional().nullable(),
  twitter: z.string().optional().nullable(),
  tiktok: z.string().optional().nullable(),
}).passthrough() // Allow unknown keys; normalization will drop unsupported providers

export type SocialLinksInput = z.infer<typeof SocialLinksSchema>

